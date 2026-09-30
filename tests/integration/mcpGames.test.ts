import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildThemePatch } from "@/lib/mcp/themes";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const userId = creatorIdentity.subject;
const otherId = otherCreatorIdentity.subject;
const input = { title: "Game draft", questions: [{ type: "single_choice", label: "Largest planet?", options: ["Earth", "Jupiter"], correctAnswers: ["Jupiter"] }], theme: buildThemePatch({ preset: "Midnight" }).patch };
type T = ReturnType<typeof createTestConvex>;

async function setup() {
  const t = createTestConvex();
  for (const identity of [creatorIdentity, otherCreatorIdentity]) {
    await t.mutation(internal.mcp.begin, { userId: identity.subject, profile: { name: "Creator", email: identity.email } });
  }
  return t;
}

async function draft(t: T) { return t.mutation(internal.mcp.createGameDraft, { userId, input }); }
async function hosted(t: T) {
  const created = await draft(t);
  await t.mutation(internal.mcp.publishForm, { userId, id: created.id });
  const game = await t.mutation(internal.mcp.hostGame, { userId, id: created.id });
  return { created, game, gameId: game.id.slice(5) as Id<"liveGames"> };
}

function safe(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const key of ["correct", "correctAnswers", "correctOptionIds", "legacyCorrect", "token", "tokenHash", "nickname", "answers", "receipt"]) {
    expect(serialized).not.toMatch(new RegExp(`"${key}"\\s*:`));
  }
  expect(serialized).not.toContain("private-player");
}

describe("MCP games: trusted transport, shared live rules", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("routes all game tools through the secret-protected MCP transport and ignores tool-supplied identity", async () => {
    const t = await setup();
    const secret = "mcp-games-test-secret-at-least-32-characters";
    const oauthOwner = "user_McpGamesOwner";
    const oauthOther = "user_McpGamesOther";
    for (const account of [oauthOwner, oauthOther]) {
      await t.mutation(internal.mcp.begin, { userId: account, profile: { name: "OAuth creator", email: `${account}@example.com` } });
    }
    vi.stubEnv("CHAOS_MCP_SECRET", secret);
    const send = async (tool: string, data: Record<string, unknown>, account = oauthOwner, key = secret) => {
      return t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId: account, tool, input: data }) });
    };
    expect((await send("list_games", {}, oauthOwner, "bad-secret")).status).toBe(401);
    const createResponse = await send("create_game_draft", { form: input, userId: oauthOther });
    expect(createResponse.status).toBe(200);
    const { result: created } = await createResponse.json();
    expect(created).toMatchObject({ status: "draft", shareUrl: null });
    expect((await send("host_game", { id: created.id })).status).toBe(400);
    expect((await send("publish_form", { id: created.id })).status).toBe(200);
    const hostResponse = await send("host_game", { id: created.id, timeLimitSec: 45, showAnswerLabels: true });
    expect(hostResponse.status).toBe(200);
    const { result: game } = await hostResponse.json();
    expect(game).toMatchObject({ state: "lobby", settings: { timeLimitSec: 45, showAnswerLabels: true } }); safe(game);
    for (const [tool, data] of [
      ["host_game", { id: created.id, language: "fr" }],
      ["host_game", { id: created.id, timeLimitSec: "60" }],
      ["host_game", { id: created.id, showAnswerLabels: "false" }],
      ["set_game_settings", { id: game.id, timeLimitSec: null }],
      ["set_game_settings", { id: game.id, showAnswerLabels: 0 }],
      ["list_games", { limit: "20" }],
      ["list_games", { cursor: 123 }],
      ["advance_game", { id: game.id, from: "ended", questionIndex: 0 }],
      ["advance_game", { id: game.id, from: "lobby" }],
      ["advance_game", { id: game.id, from: "lobby", questionIndex: "-1" }],
    ] as const) {
      const invalidResponse = await send(tool, data);
      expect(invalidResponse.status).toBe(400);
      expect((await invalidResponse.json()).error.code).toBe("VALIDATION_FAILED");
    }
    const readResponse = await send("get_game", { id: game.id });
    expect(readResponse.status).toBe(200); safe(await readResponse.json());
    expect((await send("get_game", { id: game.id, userId: oauthOwner }, oauthOther)).status).toBe(404);
    const listResponse = await send("list_games", { limit: 1 });
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).result.games).toHaveLength(1);
    const settingsResponse = await send("set_game_settings", { id: game.id, timeLimitSec: 60, showAnswerLabels: false });
    expect(settingsResponse.status).toBe(200);
    expect((await settingsResponse.json()).result.settings).toMatchObject({ timeLimitSec: 60, showAnswerLabels: false });
    const advanceResponse = await send("advance_game", { id: game.id, from: "lobby", questionIndex: -1 });
    expect(advanceResponse.status).toBe(400);
    expect((await advanceResponse.json()).error.code).toBe("LIVE_NO_PLAYERS");
    const endResponse = await send("end_game", { id: game.id });
    expect(endResponse.status).toBe(200);
    expect((await endResponse.json()).result.state).toBe("ended");
  });

  it("creates a private ordinary quiz draft with the selected theme and no lobby", async () => {
    const t = await setup();
    const created = await draft(t);
    expect(created).toMatchObject({ kind: "form", status: "draft", quizMode: true, shareUrl: null, readyToPublish: true, theme: { preset: "midnight" } });
    expect(await t.run((ctx) => ctx.db.query("liveGames").take(1))).toEqual([]);
    const row = (await t.run((ctx) => ctx.db.query("forms").first()))!;
    expect(row.ownerId).toBe(userId);
    expect(row.publishedVersion).toBeUndefined();
    expect(row.draft.quiz?.enabled).toBe(true);
    expect(row.draft.fields[0].quiz?.correctOptionIds).toHaveLength(1);
  });

  it("validates game questions again on the backend and hosts an owned published classic quiz", async () => {
    const t = await setup();
    await expect(t.mutation(internal.mcp.createGameDraft, { userId, input: { ...input, questions: [{ ...input.questions[0], correctAnswers: [] }] } })).rejects.toThrow(/VALIDATION_FAILED/);
    await expect(t.mutation(internal.mcp.createGameDraft, { userId, input: { ...input, theme: { pageColor: "url(private)" } } })).rejects.toThrow(/VALIDATION_FAILED/);
    const quizId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("quizzes", { title: "Classic quiz", creatorId: userId, creatorUsername: "casey", slug: "classic-quiz", isPublished: true, createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.insert("questions", { quizId: id, type: "mcq", questionText: "Two plus two?", options: ["3", "4"], correctAnswer: "4", points: 1, order: 0 });
      return id;
    });
    await expect(t.mutation(internal.mcp.hostGame, { userId: otherId, id: `quiz_${quizId}` })).rejects.toThrow(/NOT_FOUND/);
    const room = await t.mutation(internal.mcp.hostGame, { userId, id: `quiz_${quizId}` });
    expect(room).toMatchObject({ state: "lobby", sourceId: `quiz_${quizId}`, questionCount: 1, settings: { showAnswerLabels: true } });
    safe(room);
  });

  it("refuses drafts, closed forms and published quizzes without eligible graded choices", async () => {
    const t = await setup();
    const created = await draft(t);
    await expect(t.mutation(internal.mcp.hostGame, { userId, id: created.id })).rejects.toThrow(/LIVE_NOT_PUBLISHED/);
    await t.mutation(internal.mcp.publishForm, { userId, id: created.id });
    await t.mutation(internal.mcp.setFormStatus, { userId, id: created.id, action: "close" });
    await expect(t.mutation(internal.mcp.hostGame, { userId, id: created.id })).rejects.toThrow(/LIVE_NOT_PUBLISHED/);
    await t.mutation(internal.mcp.setFormStatus, { userId, id: created.id, action: "reopen" });
    await t.run(async (ctx) => {
      const version = (await ctx.db.query("formVersions").first())!;
      await ctx.db.patch("formVersions", version._id, { definition: { ...version.definition, fields: version.definition.fields.map(({ quiz: _quiz, ...field }) => field) } });
    });
    await expect(t.mutation(internal.mcp.hostGame, { userId, id: created.id })).rejects.toThrow(/LIVE_NO_QUESTIONS/);
    expect(await t.run((ctx) => ctx.db.query("liveGames").take(1))).toEqual([]);
  });

  it("denies another user every game read/write and hosting, even as a source editor", async () => {
    const t = await setup();
    const { created, game } = await hosted(t);
    const formId = created.id.slice(5) as Id<"forms">;
    await t.run((ctx) => ctx.db.insert("formCollaborators", { formId, userId: otherId, email: otherCreatorIdentity.email, role: "editor", invitedBy: userId, createdAt: Date.now() }));
    expect((await t.query(internal.mcp.listGames, { userId: otherId })).games).toEqual([]);
    for (const op of [
      t.query(internal.mcp.getGame, { userId: otherId, id: game.id }),
      t.mutation(internal.mcp.hostGame, { userId: otherId, id: created.id }),
      t.mutation(internal.mcp.setGameSettings, { userId: otherId, id: game.id, timeLimitSec: 30 }),
      t.mutation(internal.mcp.advanceGame, { userId: otherId, id: game.id, from: "lobby", questionIndex: -1 }),
      t.mutation(internal.mcp.endGame, { userId: otherId, id: game.id }),
    ]) await expect(op).rejects.toThrow(/NOT_FOUND/);
    expect((await t.query(internal.mcp.getGame, { userId, id: game.id })).state).toBe("lobby");
  });

  it("snapshots the published version, allows lobby-only settings and guards retried steps", async () => {
    const t = await setup();
    const { created, game, gameId } = await hosted(t);
    await t.mutation(internal.mcp.updateForm, { userId, id: created.id, input: { title: "Unpublished change", theme: buildThemePatch({ preset: "Paper" }).patch } });
    const themed = await t.mutation(internal.mcp.setGameSettings, { userId, id: game.id, theme: buildThemePatch({ preset: "Terracotta" }).patch, timeLimitSec: 30, showAnswerLabels: false });
    expect(themed).toMatchObject({ title: "Game draft", theme: { preset: "terracotta" }, settings: { timeLimitSec: 30, showAnswerLabels: false }, state: "lobby" });
    await expect(t.mutation(internal.mcp.setGameSettings, { userId, id: game.id, timeLimitSec: 4 })).rejects.toThrow(/VALIDATION_FAILED/);
    await expect(t.mutation(internal.mcp.advanceGame, { userId, id: game.id, from: "lobby", questionIndex: -1 })).rejects.toThrow(/LIVE_NO_PLAYERS/);
    const token = "abcd".repeat(8);
    await t.mutation(api.live.joinGame, { pin: game.pin, nickname: "private-player", token });
    const first = await t.mutation(internal.mcp.advanceGame, { userId, id: game.id, from: "lobby", questionIndex: -1 });
    expect(first).toMatchObject({ state: "question", questionIndex: 0 }); safe(first);
    const duplicate = await t.mutation(internal.mcp.advanceGame, { userId, id: game.id, from: "lobby", questionIndex: -1 });
    expect(duplicate.state).toBe("question");
    await expect(t.mutation(internal.mcp.setGameSettings, { userId, id: game.id, showAnswerLabels: true })).rejects.toThrow(/LIVE_/);
    // Autoplay can be paused and retimed mid-game.
    const paused = await t.mutation(internal.mcp.setGameSettings, { userId, id: game.id, autoAdvance: false, breakSec: 8 });
    expect(paused.settings).toMatchObject({ autoAdvance: false, breakSec: 8, showAnswerLabels: false });
    expect((await t.query(api.live.playerView, { gameId, token }))!.state).toBe("question");
    const reveal = await t.mutation(internal.mcp.advanceGame, { userId, id: game.id, from: "question", questionIndex: 0 });
    expect(reveal.state).toBe("reveal"); safe(reveal);
    safe(await t.query(internal.mcp.getGame, { userId, id: game.id }));
    const ended = await t.mutation(internal.mcp.endGame, { userId, id: game.id });
    expect(ended).toMatchObject({ state: "ended", joinUrl: null, resultsStatus: "saving" }); safe(ended);
    expect((await t.mutation(internal.mcp.endGame, { userId, id: game.id })).endedAt).toBe(ended.endedAt);
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(internal.mcp.getGame, { userId, id: game.id })).resultsStatus).toBe("saved");
  });

  it("host overrides apply only to the room, and list pagination never reads participants", async () => {
    const t = await setup();
    const created = await draft(t);
    await t.mutation(internal.mcp.publishForm, { userId, id: created.id });
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.mcp.hostGame, { userId, id: created.id, theme: buildThemePatch({ preset: "Paper" }).patch, timeLimitSec: 60, showAnswerLabels: true });
      vi.advanceTimersByTime(1);
    }
    const first = await t.query(internal.mcp.listGames, { userId, limit: 2 });
    expect(first.games).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy(); safe(first);
    const last = await t.query(internal.mcp.listGames, { userId, limit: 2, cursor: first.nextCursor! });
    expect(last.games).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
    expect(first.games[0]).toMatchObject({ theme: { preset: "paper" }, settings: { timeLimitSec: 60, showAnswerLabels: true } });
    const source = await t.query(internal.mcp.getForm, { userId, id: created.id });
    if (source.kind !== "form" || !("theme" in source)) throw new Error("Expected a form with a theme.");
    expect(source.theme).toMatchObject({ preset: "midnight" });
  });

  it("rechecks Pro and read-only restrictions inside the wrappers", async () => {
    const t = await setup();
    const { game } = await hosted(t);
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first())!;
      await ctx.db.patch("users", user._id, { isBanned: true });
    });
    await expect(t.mutation(internal.mcp.endGame, { userId, id: game.id })).rejects.toThrow(/ACCOUNT_RESTRICTED/);
    expect((await t.query(internal.mcp.getGame, { userId, id: game.id })).state).toBe("lobby");
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first())!;
      await ctx.db.patch("users", user._id, { plan: "free", planExpiresAt: undefined });
    });
    await expect(t.query(internal.mcp.getGame, { userId, id: game.id })).rejects.toThrow(/PRO_REQUIRED/);
    await expect(t.mutation(internal.mcp.createGameDraft, { userId, input })).rejects.toThrow(/PRO_REQUIRED/);
  });
});
