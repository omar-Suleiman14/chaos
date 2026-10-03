import { describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures } from "../fixtures";
import { themeFromPreset } from "@/components/forms/formThemes";
import { sha256Hex } from "@/convex/serverUtils";

type T = ReturnType<typeof createTestConvex>;

async function settle(t: T) {
  vi.advanceTimersByTime(1_000);
  await t.finishInProgressScheduledFunctions();
}

const token = (n: number) => n.toString(16).padStart(2, "0").repeat(16);

async function publishedQuiz(t: T) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { quizMode: true });
  const initial = await owner.query(api.forms.getFormForEditor, { formId });
  const definition = {
    ...initial!.draft,
    fields: [
      { id: "capital", type: "choice" as const, label: "Capital of France?", required: true,
        options: [{ id: "paris", label: "Paris" }, { id: "rome", label: "Rome" }, { id: "oslo", label: "Oslo" }],
        quiz: { correctOptionIds: ["paris"], points: 2 } },
      { id: "primes", type: "multi_choice" as const, label: "Pick the primes", required: true,
        options: [{ id: "p2", label: "2" }, { id: "p3", label: "3" }, { id: "p4", label: "4" }],
        quiz: { correctOptionIds: ["p2", "p3"], points: 3 } },
      { id: "sky", type: "choice" as const, label: "Is the sky blue?", required: true,
        options: [{ id: "yes", label: "True" }, { id: "no", label: "False" }],
        quiz: { correctOptionIds: ["yes"], points: 1 } },
      { id: "name", type: "text" as const, label: "Your name", required: true },
    ],
  };
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  return { owner, formId };
}

async function gameWithPlayers(t: T, names: string[], options: { autoAdvance?: boolean; breakSec?: number; startWhenPlayers?: number } = {}) {
  const { owner, formId } = await publishedQuiz(t);
  const gameId = await owner.mutation(api.live.createGame, { formId, ...options });
  const view = await owner.query(api.live.hostView, { gameId });
  const pin = view!.pin;
  const players = [];
  for (const [i, nickname] of names.entries()) {
    const tok = token(i + 1);
    const joined = await t.mutation(api.live.joinGame, { pin, nickname, token: tok });
    expect(joined.status).toBe("joined");
    players.push({ nickname, token: tok });
  }
  return { owner, formId, gameId, pin, players };
}

describe("live games: create, join, start", () => {
  it("uses readable answers by default and permits only the host to configure a waiting room", async () => {
    const t = createTestConvex();
    const { owner, formId } = await publishedQuiz(t);
    const gameId = await owner.mutation(api.live.createGame, { formId, timeLimitSec: 45 });
    const lobby = await owner.query(api.live.hostView, { gameId });
    expect(lobby!.settings).toMatchObject({ timeLimitSec: 45, showAnswerLabels: true });
    await t.mutation(api.live.joinGame, { pin: lobby!.pin, nickname: "Sam", token: token(1) });
    expect(await t.query(api.live.playerView, { gameId, token: token(1) })).toMatchObject({ showAnswerLabels: true });
    const stranger = t.withIdentity(otherCreatorIdentity);
    await stranger.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(stranger.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: false })).rejects.toThrow(/LIVE_NOT_FOUND/);
    await expect(t.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: false })).rejects.toThrow(/authenticated/);
    await owner.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: false, theme: themeFromPreset("terracotta"), timeLimitSec: 30 });
    expect(await t.query(api.live.playerView, { gameId, token: token(1) })).toMatchObject({ showAnswerLabels: false, theme: { preset: "terracotta" } });
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await expect(owner.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: true })).rejects.toThrow(/LIVE_STARTED/);
    await expect(owner.mutation(api.live.setTimeLimit, { gameId, seconds: 5 })).rejects.toThrow(/LIVE_STARTED/);
    const running = await owner.query(api.live.hostView, { gameId });
    expect(running!.questionEndsAt! - running!.questionStartedAt!).toBe(30_000);
    await expect(owner.mutation(api.live.createGame, { formId, timeLimitSec: Number.NaN })).rejects.toThrow(/LIVE_INVALID/);
    await expect(owner.mutation(api.live.createGame, { formId, timeLimitSec: 241 })).rejects.toThrow(/LIVE_INVALID/);
  });

  it("snapshots the published theme for host and players without exposing answer keys", async () => {
    const t = createTestConvex();
    const { owner, formId, gameId, players } = await gameWithPlayers(t, ["Sam"]);
    const source = await owner.query(api.forms.getFormForEditor, { formId });
    const host = await owner.query(api.live.hostView, { gameId });
    const player = await t.query(api.live.playerView, { gameId, token: players[0].token });
    expect(host!.theme).toEqual(source!.draft.theme);
    expect(host!.appearance).toBe("apple");
    expect(player).toMatchObject({ state: "lobby", theme: source!.draft.theme, appearance: "apple" });
    expect(JSON.stringify(player)).not.toContain("correctOptionIds");
    await t.run(async (ctx) => {
      const form = await ctx.db.get("forms", formId);
      await ctx.db.patch("forms", formId, { draft: { ...form!.draft, theme: themeFromPreset("neon") } });
    });
    expect((await owner.query(api.live.hostView, { gameId }))!.theme).toEqual(host!.theme);
  });

  it("lets an authorised host choose a session theme while refusing another creator", async () => {
    const t = createTestConvex();
    const { owner, formId } = await publishedQuiz(t);
    const theme = themeFromPreset("velvet");
    const gameId = await owner.mutation(api.live.createGame, { formId, theme });
    expect((await owner.query(api.live.hostView, { gameId }))!.theme).toEqual(theme);
    expect((await owner.query(api.live.hostView, { gameId }))!.appearance).toBe("theme");
    await t.mutation(api.live.joinGame, {pin:(await owner.query(api.live.hostView,{gameId}))!.pin,nickname:"Theme tester",token:token(19)});
    expect(await t.query(api.live.playerView,{gameId,token:token(19)})).toMatchObject({appearance:"theme",theme});
    await owner.mutation(api.live.setGameSettings,{gameId,appearance:"apple"});
    expect(await t.query(api.live.playerView,{gameId,token:token(19)})).toMatchObject({appearance:"apple"});
    const stranger = t.withIdentity(otherCreatorIdentity);
    await stranger.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(stranger.mutation(api.live.createGame, { formId, theme })).rejects.toThrow();
    await expect(stranger.mutation(api.live.setGameSettings,{gameId,appearance:"apple"})).rejects.toThrow();
  });

  it("keeps rooms created before themes readable", async () => {
    const t = createTestConvex();
    const { owner, gameId, players } = await gameWithPlayers(t, ["Sam"]);
    await t.run(async (ctx) => { await ctx.db.patch("liveGames", gameId, { theme: undefined, appearance: undefined }); });
    expect((await owner.query(api.live.hostView, { gameId }))!.theme).toBeNull();
    expect((await owner.query(api.live.hostView, { gameId }))!.appearance).toBe("theme");
    expect(await t.query(api.live.playerView, { gameId, token: players[0].token })).toMatchObject({ state: "lobby", theme: null, appearance: "apple" });
  });

  it("creates a game with a 6-digit PIN, lets players join and the host start", async () => {
    const t = createTestConvex();
    const { owner, gameId, pin, players } = await gameWithPlayers(t, ["Sam", "Lina"]);
    expect(pin).toMatch(/^[1-9]\d{5}$/);
    const lobby = await owner.query(api.live.hostView, { gameId });
    expect(lobby).toMatchObject({ state: "lobby", playerCount: 2, questionCount: 3, skippedQuestions: 1 });
    expect(lobby!.players.map((p) => p.nickname).sort()).toEqual(["Lina", "Sam"]);

    // Rejoining with the same token is the same player, whatever nickname is typed.
    const again = await t.mutation(api.live.joinGame, { pin, nickname: "Other", token: players[0].token });
    expect(again).toMatchObject({ status: "joined", nickname: "Sam" });
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "sam", token: token(9) })).rejects.toThrow(/NICKNAME_TAKEN/);
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "fuck3r", token: token(9) })).rejects.toThrow(/NICKNAME_BLOCKED/);
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "x".repeat(21), token: token(9) })).rejects.toThrow(/NICKNAME_TOO_LONG/);
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "<b>hi</b>", token: token(9) })).rejects.toThrow(/NICKNAME_CHARACTERS/);
    expect(await t.mutation(api.live.joinGame, { pin: "999999", nickname: "Zed", token: token(9) })).toEqual({ status: "not_found" });

    expect((await t.query(api.live.playerView, { gameId, token: players[0].token })).state).toBe("lobby");
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    // A second press of the same step does nothing.
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    const started = await owner.query(api.live.hostView, { gameId });
    expect(started).toMatchObject({ state: "question", questionIndex: 0 });
    expect(started!.questionEndsAt! - started!.questionStartedAt!).toBe(20_000);
  });

  it("keeps PINs unique among active games and frees them when a game ends", async () => {
    const t = createTestConvex();
    const { owner, formId } = await publishedQuiz(t);
    const values = [0.1, 0.1, 0.1, 0.5];
    let call = 0;
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array) array[0] = Math.floor((values[Math.min(call++, values.length - 1)]) * 0xffffffff);
      else if (array instanceof Uint8Array) for (let i = 0; i < array.length; i++) array[i] = (i * 7) % 256;
      return array;
    });
    try {
      const first = await owner.mutation(api.live.createGame, { formId });
      const second = await owner.mutation(api.live.createGame, { formId });
      const a = (await owner.query(api.live.hostView, { gameId: first }))!.pin;
      const b = (await owner.query(api.live.hostView, { gameId: second }))!.pin;
      expect(a).not.toBe(b);
      await owner.mutation(api.live.endGameNow, { gameId: first });
      values.splice(0, values.length, 0.1);
      call = 0;
      const third = await owner.mutation(api.live.createGame, { formId });
      expect((await owner.query(api.live.hostView, { gameId: third }))!.pin).toBe(a);
    } finally {
      spy.mockRestore();
    }
  });

  it("ends games left idle for three hours", async () => {
    const t = createTestConvex();
    const { owner, gameId, pin } = await gameWithPlayers(t, ["Sam"]);
    vi.setSystemTime(Date.now() + 3 * 3_600_000 + 1000);
    await t.mutation(internal.live.expireIdle, {});
    expect((await owner.query(api.live.hostView, { gameId }))).toMatchObject({ state: "ended", endedReason: "idle" });
    expect(await t.mutation(api.live.joinGame, { pin, nickname: "Late", token: token(40) })).toEqual({ status: "not_found" });
  });
});

describe("live games: answers and scoring", () => {
  it("rejects late answers using the server clock", async () => {
    const t = createTestConvex();
    const { owner, gameId, players } = await gameWithPlayers(t, ["Sam", "Lina"], { autoAdvance: false });
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    vi.setSystemTime(Date.now() + 20_001);
    await expect(t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] })).rejects.toThrow(/LIVE_TOO_LATE/);
    // The scheduled time-up reveal closes the question.
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await owner.query(api.live.hostView, { gameId }))!.state).toBe("reveal");
    await expect(t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] })).rejects.toThrow(/LIVE_CLOSED/);
  });

  it("scores by speed, adds streak bonuses and reveals when everyone has answered", async () => {
    const t = createTestConvex();
    const { owner, gameId, players } = await gameWithPlayers(t, ["Sam", "Lina"]);
    const [sam, lina] = players;
    const step = (from: "lobby" | "question" | "reveal" | "leaderboard", questionIndex: number) => owner.mutation(api.live.advance, { gameId, from, questionIndex });

    await step("lobby", -1);
    // Question 1: Sam right at 5 s of 20 s, Lina wrong.
    vi.setSystemTime(Date.now() + 5000);
    expect(await t.mutation(api.live.submitAnswer, { gameId, token: sam.token, questionIndex: 0, optionIds: ["paris"] })).toEqual({ status: "received" });
    expect(await t.mutation(api.live.submitAnswer, { gameId, token: sam.token, questionIndex: 0, optionIds: ["rome"] })).toEqual({ status: "already" });
    await t.mutation(api.live.submitAnswer, { gameId, token: lina.token, questionIndex: 0, optionIds: ["rome"] });
    await settle(t);
    const reveal = await owner.query(api.live.hostView, { gameId });
    expect(reveal!.state).toBe("reveal");
    expect(reveal!.distribution).toEqual({ paris: 1, rome: 1, oslo: 0 });
    expect(reveal!.question!.correct).toEqual(["paris"]);
    const samView = await t.query(api.live.playerView, { gameId, token: sam.token });
    expect(samView).toMatchObject({ state: "reveal", correct: true, points: 875, score: 875, rank: 1 });
    expect(await t.query(api.live.playerView, { gameId, token: lina.token })).toMatchObject({ correct: false, points: 0, rank: 2 });

    // Question 2 (checkboxes) and 3: Sam answers instantly and correctly; the third correct in a row earns +100.
    await step("reveal", 0);
    await step("leaderboard", 0);
    await t.mutation(api.live.submitAnswer, { gameId, token: sam.token, questionIndex: 1, optionIds: ["p3", "p2"] });
    await expect(t.mutation(api.live.submitAnswer, { gameId, token: lina.token, questionIndex: 1, optionIds: ["nope"] })).rejects.toThrow(/LIVE_BAD_ANSWER/);
    await step("question", 1);
    expect(await t.query(api.live.playerView, { gameId, token: sam.token })).toMatchObject({ correct: true, points: 1000, bonus: 0, score: 1875 });
    await step("reveal", 1);
    await step("leaderboard", 1);
    await t.mutation(api.live.submitAnswer, { gameId, token: sam.token, questionIndex: 2, optionIds: ["yes"] });
    await step("question", 2);
    expect(await t.query(api.live.playerView, { gameId, token: sam.token })).toMatchObject({ correct: true, points: 1100, bonus: 100, streak: 3, score: 2975 });
    await step("reveal", 2);
    await step("leaderboard", 2);
    const ended = await t.query(api.live.playerView, { gameId, token: sam.token });
    expect(ended).toMatchObject({ state: "ended", rank: 1, score: 2975 });
    if (ended.state === "ended") expect(ended.podium.map((p) => p.nickname)).toEqual(["Sam", "Lina"]);
  });

  it("never sends the answer key to players or the host screen before the reveal", async () => {
    const t = createTestConvex();
    const { owner, gameId, players } = await gameWithPlayers(t, ["Sam", "Lina"]);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] });
    const view = await t.query(api.live.playerView, { gameId, token: players[0].token });
    expect(view.state).toBe("question");
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/"correct"/);
    expect(text).not.toMatch(/score|rank|points/);
    expect(view).toMatchObject({ answered: true, myAnswer: ["paris"] });
    expect((await owner.query(api.live.hostView, { gameId }))!.question!.correct).toBeNull();
    expect((await owner.query(api.live.hostView, { gameId }))!.distribution).toBeNull();
  });
});

describe("live games: safety", () => {
  it("stops kicked players from answering or rejoining", async () => {
    const t = createTestConvex();
    const { owner, gameId, pin, players } = await gameWithPlayers(t, ["Sam", "Lina"]);
    const lobby = await owner.query(api.live.hostView, { gameId });
    const sam = lobby!.players.find((p) => p.nickname === "Sam")!;
    await owner.mutation(api.live.kickPlayer, { gameId, playerId: sam._id });
    expect((await t.query(api.live.playerView, { gameId, token: players[0].token })).state).toBe("kicked");
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "Sam", token: players[0].token })).rejects.toThrow(/LIVE_KICKED/);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await expect(t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] })).rejects.toThrow(/LIVE_KICKED/);
    expect((await owner.query(api.live.hostView, { gameId }))!.playerCount).toBe(1);
  });

  it("gives Personal hosts the 500-player maximum", async () => {
    const t = createTestConvex();
    const { owner, formId } = await publishedQuiz(t);
    // New accounts start on a Pro trial; this host is on Free.
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!;
      await ctx.db.patch("users", user._id, { plan: "free", planExpiresAt: undefined, isElevated: false });
    });
    const gameId = await owner.mutation(api.live.createGame, { formId });
    const pin = (await owner.query(api.live.hostView, { gameId }))!.pin;
    expect((await owner.query(api.live.hostView, { gameId }))!.settings.maxPlayers).toBe(500);
    await t.run(async (ctx) => {
      for (let i = 0; i < 500; i++) {
        await ctx.db.insert("livePlayers", { gameId, nickname: `P${i}`, nicknameKey: `p${i}`, tokenHash: `h${i}`, score: 0, streak: 0, correctCount: 0, kicked: false, joinedAt: 0 });
      }
    });
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "Late", token: token(200) })).rejects.toThrow(/LIVE_FULL/);
  });

  it("refuses host-only functions to anyone but the host", async () => {
    const t = createTestConvex();
    const { gameId, formId } = await gameWithPlayers(t, ["Sam"]);
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await other.query(api.live.hostView, { gameId })).toBeNull();
    expect(await t.query(api.live.hostView, { gameId })).toBeNull();
    await expect(other.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 })).rejects.toThrow(/LIVE_NOT_FOUND/);
    await expect(other.mutation(api.live.endGameNow, { gameId })).rejects.toThrow(/LIVE_NOT_FOUND/);
    await expect(other.mutation(api.live.setTimeLimit, { gameId, seconds: 30 })).rejects.toThrow(/LIVE_NOT_FOUND/);
    await expect(t.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 })).rejects.toThrow(/Not authenticated/);
    await expect(other.mutation(api.live.createGame, { formId })).rejects.toThrow(/FORM_NOT_FOUND/);
  });
});

describe("live games: bounded completion and active memberships", () => {
  it("counts and scores active players even after 700 high-scoring kicked memberships", async () => {
    const t = createTestConvex();
    const { owner, gameId, pin, players } = await gameWithPlayers(t, ["Sam", "Lina"]);
    await t.run(async (ctx) => {
      const game = (await ctx.db.get("liveGames", gameId))!;
      await ctx.db.patch("liveGames", gameId, { settings: { ...game.settings, maxPlayers: 2 } });
      for (let i = 0; i < 700; i++) await ctx.db.insert("livePlayers", {
        gameId, nickname: `Removed${i}`, nicknameKey: `removed${i}`, tokenHash: `removed${i}`,
        score: 99_999, streak: 0, correctCount: 0, kicked: true, joinedAt: 0,
      });
    });
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "Late", token: token(99) })).rejects.toThrow(/LIVE_FULL/);
    expect((await owner.query(api.live.hostView, { gameId }))!.players.map((p) => p.nickname).sort()).toEqual(["Lina", "Sam"]);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] });
    const lina = (await owner.query(api.live.hostView, { gameId }))!.players.find((p) => p.nickname === "Lina")!;
    await owner.mutation(api.live.kickPlayer, { gameId, playerId: lina._id });
    await owner.mutation(api.live.kickPlayer, { gameId, playerId: lina._id }); // idempotent, no double decrement
    await settle(t);
    expect(await t.query(api.live.playerView, { gameId, token: players[0].token })).toMatchObject({ state: "reveal", correct: true, score: 1000, rank: 1 });
    expect((await owner.query(api.live.hostView, { gameId }))!.distribution).toEqual({ paris: 1, rome: 0, oslo: 0 });
  });

  it("handles 500 answers with two scheduled jobs, keeps counters per question and excludes kicked answers", async () => {
    const t = createTestConvex();
    const { owner, gameId } = await gameWithPlayers(t, []);
    const tokens = Array.from({ length: 500 }, (_, i) => (i + 1).toString(16).padStart(32, "0"));
    const hashes = await Promise.all(tokens.map(sha256Hex));
    await t.run(async (ctx) => {
      for (let i = 0; i < tokens.length; i++) await ctx.db.insert("livePlayers", {
        gameId, nickname: `P${i}`, nicknameKey: `p${i}`, tokenHash: hashes[i],
        score: 0, streak: 0, correctCount: 0, kicked: false, joinedAt: 0,
      });
    });
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    for (const tok of tokens) await t.mutation(api.live.submitAnswer, { gameId, token: tok, questionIndex: 0, optionIds: ["paris"] });
    const host = (await owner.query(api.live.hostView, { gameId }))!;
    expect(host).toMatchObject({ state: "question", playerCount: 500, answeredCount: 500, distribution: null });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.state.kind === "pending" && /^live:(timeUp|checkAllAnswered)$/.test(job.name))).toHaveLength(2);
    await owner.mutation(api.live.kickPlayer, { gameId, playerId: host.players[0]._id });
    expect((await owner.query(api.live.hostView, { gameId }))!.answeredCount).toBe(499);
    await settle(t);
    const revealed = (await owner.query(api.live.hostView, { gameId }))!;
    expect(revealed).toMatchObject({ state: "reveal", playerCount: 499, distribution: { paris: 499, rome: 0, oslo: 0 } });
    expect(revealed.players.every((p) => p.score === 1000)).toBe(true);
    const scored = await t.run(async (ctx) => await ctx.db.query("livePlayers").withIndex("by_gameId_and_kicked_and_score", (q) => q.eq("gameId", gameId).eq("kicked", false)).collect());
    expect(scored).toHaveLength(499);
    expect(scored.every((p) => p.score === 1000 && p.rank === 1)).toBe(true);
    await owner.mutation(api.live.advance, { gameId, from: "reveal", questionIndex: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "leaderboard", questionIndex: 0 });
    expect((await owner.query(api.live.hostView, { gameId }))!.answeredCount).toBe(0);
  });
});

describe("live games: results", () => {
  it("saves each player's answers as a normal response of the form", async () => {
    const t = createTestConvex();
    const { owner, formId, gameId, players } = await gameWithPlayers(t, ["Sam", "Lina", "Idle"]);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token: players[0].token, questionIndex: 0, optionIds: ["paris"] });
    await t.mutation(api.live.submitAnswer, { gameId, token: players[1].token, questionIndex: 0, optionIds: ["oslo"] });
    await owner.mutation(api.live.endGameNow, { gameId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const host = await owner.query(api.live.hostView, { gameId });
    expect(host).toMatchObject({ state: "ended", resultsStatus: "saved", savedResponses: 2 });
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    expect(form!.responseCount).toBe(2);
    const list = await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(list.page).toHaveLength(2);
    const detail = await owner.query(api.formResults.getResponse, { responseId: list.page.find((r) => r.quizScore === 2)!._id as Id<"formResponses"> });
    expect(detail).toMatchObject({ respondent: "Sam", quizScore: 2, quizMaxScore: 6, tags: ["live"], live: { gameId } });
    const stored = await t.run(async (ctx) => await ctx.db.query("formResponses").collect());
    expect(stored.every((r) => r.source === "live" && r.live?.gameId === gameId)).toBe(true);
  });

  it("hosts an old quiz and saves attempts to it", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const quizId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("quizzes", { title: "Old", slug: "old", creatorId: creatorIdentity.subject, creatorUsername: "creator", isPublished: true, createdAt: 0, updatedAt: 0 });
      const snapshot = [];
      for (const q of [questionFixtures.mcq, questionFixtures.trueFalse, questionFixtures.written]) {
        const qid = await ctx.db.insert("questions", { ...q, quizId: id });
        const { order, ...rest } = q;
        snapshot.push({ ...rest, order, _id: qid });
      }
      await ctx.db.patch("quizzes", id, { publishedSnapshot: { title: "Old", questions: snapshot } });
      return id;
    });
    const gameId = await owner.mutation(api.live.createGame, { quizId });
    const view = await owner.query(api.live.hostView, { gameId });
    expect(view).toMatchObject({ questionCount: 2, skippedQuestions: 1 });
    await t.mutation(api.live.joinGame, { pin: view!.pin, nickname: "Sam", token: token(1) });
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token: token(1), questionIndex: 0, optionIds: ["1"] }); // "4"
    await owner.mutation(api.live.advance, { gameId, from: "reveal", questionIndex: 0 }).catch(() => {});
    await settle(t);
    expect(await t.query(api.live.playerView, { gameId, token: token(1) })).toMatchObject({ correct: true });
    await owner.mutation(api.live.endGameNow, { gameId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const sessions = await t.run(async (ctx) => await ctx.db.query("quizSessions").collect());
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ playerName: "Sam", status: "completed", score: 10, totalPoints: 20, source: "live", liveGameId: gameId });
    expect(sessions[0].answers[0]).toMatchObject({ answer: "4", isCorrect: true, pointsEarned: 10 });
  });
});

describe("live games: autoplay and start countdown", () => {
  const state = async (owner: ReturnType<T["withIdentity"]>, gameId: Id<"liveGames">) => (await owner.query(api.live.hostView, { gameId }))!;

  it("moves from answer to leaderboard to the next question on its own, and pauses and resumes", async () => {
    const t = createTestConvex();
    const { owner, gameId } = await gameWithPlayers(t, ["Sam"], { breakSec: 3 });
    expect((await state(owner, gameId)).settings).toMatchObject({ autoAdvance: true, breakSec: 3 });
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    vi.advanceTimersByTime(20_000);
    await t.finishInProgressScheduledFunctions();
    const reveal = await state(owner, gameId);
    expect(reveal).toMatchObject({ state: "reveal", questionIndex: 0 });
    expect(reveal.phaseEndsAt).toBe(Date.now() + 3_000);
    vi.advanceTimersByTime(3_000);
    await t.finishInProgressScheduledFunctions();
    expect(await state(owner, gameId)).toMatchObject({ state: "leaderboard", questionIndex: 0 });
    // Paused: the scheduled step does nothing.
    await owner.mutation(api.live.setAutoplay, { gameId, autoAdvance: false });
    expect((await state(owner, gameId)).phaseEndsAt).toBeNull();
    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();
    expect(await state(owner, gameId)).toMatchObject({ state: "leaderboard", questionIndex: 0 });
    // Resumed: counts down again from now.
    await owner.mutation(api.live.setAutoplay, { gameId, autoAdvance: true });
    vi.advanceTimersByTime(3_000);
    await t.finishInProgressScheduledFunctions();
    expect(await state(owner, gameId)).toMatchObject({ state: "question", questionIndex: 1 });
    await expect(owner.mutation(api.live.setAutoplay, { gameId, breakSec: 1 })).rejects.toThrow(/LIVE_INVALID/);
  });

  it("does not step twice when the host presses Next before autoplay", async () => {
    const t = createTestConvex();
    const { owner, gameId } = await gameWithPlayers(t, ["Sam"]);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "reveal", questionIndex: 0 });
    vi.advanceTimersByTime(5_000);
    await t.finishInProgressScheduledFunctions();
    // The reveal's job is stale; only the leaderboard's own job moved on.
    expect(await state(owner, gameId)).toMatchObject({ state: "question", questionIndex: 1 });
  });

  it("counts down and starts once the chosen number of players join, and the host can cancel", async () => {
    const t = createTestConvex();
    const { owner, gameId, pin } = await gameWithPlayers(t, ["Sam"], { startWhenPlayers: 2 });
    expect((await state(owner, gameId)).startsAt).toBeNull();
    await t.mutation(api.live.joinGame, { pin, nickname: "Lina", token: token(9) });
    const counting = await state(owner, gameId);
    expect(counting.startsAt).toBe(Date.now() + 5_000);
    expect(await t.query(api.live.playerView, { gameId, token: token(9) })).toMatchObject({ state: "lobby", startsAt: counting.startsAt });
    await owner.mutation(api.live.setCountdown, { gameId, running: false });
    vi.advanceTimersByTime(5_000);
    await t.finishInProgressScheduledFunctions();
    expect(await state(owner, gameId)).toMatchObject({ state: "lobby", startsAt: null });
    await owner.mutation(api.live.setCountdown, { gameId, running: true });
    vi.advanceTimersByTime(5_000);
    await t.finishInProgressScheduledFunctions();
    expect(await state(owner, gameId)).toMatchObject({ state: "question", questionIndex: 0, startsAt: null });
    await expect(owner.mutation(api.live.createGame, { formId: (await state(owner, gameId)).formId!, startWhenPlayers: -1 })).rejects.toThrow(/LIVE_INVALID/);
  });
});
