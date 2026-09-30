import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { sha256Hex } from "@/convex/serverUtils";
import { creatorIdentity, otherCreatorIdentity, questionFixtures } from "../fixtures";
import { createTestConvex } from "./setup";

const token = "ab".repeat(32);
const otherToken = "cd".repeat(32);

async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const quizId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("quizzes", {
      title: "Release fixture", slug: "release-fixture", creatorId: creatorIdentity.subject,
      creatorUsername: "creator", isPublished: true, createdAt: Date.now(), updatedAt: Date.now(),
    });
    for (const q of [questionFixtures.mcq, questionFixtures.multiSelect]) {
      await ctx.db.insert("questions", { ...q, quizId: id });
    }
    return id;
  });
  const gameId = await owner.mutation(api.live.createGame, { quizId, autoAdvance: false });
  const secondId = await owner.mutation(api.live.createGame, { quizId, autoAdvance: false });
  const pin = (await owner.query(api.live.hostView, { gameId }))!.pin;
  await t.mutation(api.live.joinGame, { pin, nickname: "Participant", token });
  await t.mutation(api.live.joinGame, { pin, nickname: "Second", token: otherToken });
  const playerId = (await owner.query(api.live.hostView, { gameId }))!.players.find((p) => p.nickname === "Participant")!._id;
  return { t, owner, other, quizId, gameId, secondId, pin, playerId };
}

describe("live release boundary checks", () => {
  it("scopes participant access to the joined game and honors removal", async () => {
    const { t, owner, gameId, secondId, pin, playerId } = await setup();
    for (const credential of ["", "00".repeat(32), await sha256Hex(token)]) {
      expect(await t.query(api.live.playerView, { gameId, token: credential })).toEqual({ state: "unknown" });
    }
    expect(await t.query(api.live.playerView, { gameId: secondId, token })).toEqual({ state: "unknown" });
    const secondPin = (await owner.query(api.live.hostView, { gameId: secondId }))!.pin;
    await t.mutation(api.live.joinGame, { pin: secondPin, nickname: "Second room", token: otherToken });
    await owner.mutation(api.live.advance, { gameId: secondId, from: "lobby", questionIndex: -1 });
    await expect(t.mutation(api.live.submitAnswer, { gameId: secondId, token, questionIndex: 0, optionIds: ["1"] })).rejects.toThrow(/LIVE_NOT_JOINED/);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await expect(t.mutation(api.live.submitAnswer, { gameId, token: await sha256Hex(token), questionIndex: 0, optionIds: ["1"] })).rejects.toThrow(/LIVE_NOT_JOINED/);
    await owner.mutation(api.live.kickPlayer, { gameId, playerId });
    expect(await t.query(api.live.playerView, { gameId, token })).toEqual({ state: "kicked" });
    await expect(t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["1"] })).rejects.toThrow(/LIVE_KICKED/);
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "Replacement", token })).rejects.toThrow(/LIVE_KICKED/);
    await owner.mutation(api.live.endGameNow, { gameId });
    expect(await t.query(api.live.playerView, { gameId, token: "00".repeat(32) })).toEqual({ state: "missing" });
  });

  it("requires the host for every web control and checks player membership", async () => {
    const { t, owner, other, quizId, gameId, secondId, playerId } = await setup();
    const before = await t.run((ctx) => ctx.db.get("liveGames", gameId));
    for (const caller of [t, other]) {
      expect(await caller.query(api.live.hostView, { gameId })).toBeNull();
      await expect(caller.mutation(api.live.createGame, { quizId })).rejects.toThrow();
      await expect(caller.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: false })).rejects.toThrow();
      await expect(caller.mutation(api.live.setTimeLimit, { gameId, seconds: 30 })).rejects.toThrow();
      await expect(caller.mutation(api.live.setCountdown, { gameId, running: true })).rejects.toThrow();
      await expect(caller.mutation(api.live.setAutoplay, { gameId, autoAdvance: true })).rejects.toThrow();
      await expect(caller.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 })).rejects.toThrow();
      await expect(caller.mutation(api.live.endGameNow, { gameId })).rejects.toThrow();
      await expect(caller.mutation(api.live.kickPlayer, { gameId, playerId })).rejects.toThrow();
    }
    await expect(owner.mutation(api.live.kickPlayer, { gameId: secondId, playerId })).rejects.toThrow(/LIVE_NOT_FOUND/);
    expect(await t.run((ctx) => ctx.db.get("liveGames", gameId))).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get("livePlayers", playerId)))!.kicked).toBe(false);
  });

  it("keeps MCP reads and controls in the verified account's games", async () => {
    const { t, owner, quizId, gameId, playerId } = await setup();
    const userId = otherCreatorIdentity.subject;
    const id = `game_${gameId}`;
    await expect(t.query(internal.mcp.getGame, { userId, id })).rejects.toThrow(/NOT_FOUND/);
    expect((await t.query(internal.mcp.listGames, { userId })).games).toEqual([]);
    await expect(t.mutation(internal.mcp.hostGame, { userId, id: `quiz_${quizId}` })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(internal.mcp.setGameSettings, { userId, id, autoAdvance: true })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(internal.mcp.advanceGame, { userId, id, from: "lobby", questionIndex: -1 })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(internal.mcp.endGame, { userId, id })).rejects.toThrow(/NOT_FOUND/);
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["1"] });
    expect(await t.query(api.live.playerView, { gameId, token: otherToken })).toMatchObject({ state: "question", answered: false, myAnswer: null });
    expect((await owner.query(api.live.hostView, { gameId }))!.question!.correct).toBeNull();
    const participant = JSON.stringify(await t.query(api.live.playerView, { gameId, token }));
    expect(participant).not.toMatch(/"(?:correct|score|rank|points|legacyCorrect|tokenHash)"\s*:/);
    for (const value of [
      await owner.query(api.live.hostView, { gameId }),
      await t.query(internal.mcp.getGame, { userId: creatorIdentity.subject, id }),
      await t.query(internal.mcp.listGames, { userId: creatorIdentity.subject }),
    ]) {
      const encoded = JSON.stringify(value);
      expect(encoded).not.toContain(token);
      expect(encoded).not.toContain(await sha256Hex(token));
      expect(encoded).not.toMatch(/"(?:tokenHash|legacyCorrect|legacyCorrectList|correctOptionIds|answers)"\s*:/);
    }
    expect((await t.run((ctx) => ctx.db.get("livePlayers", playerId)))!.score).toBe(0);
  });

  it("does not overwrite accepted answers and awards no marks for an extra multi-choice option", async () => {
    const { t, owner, gameId, playerId } = await setup();
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await expect(t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 1, optionIds: ["1"] })).rejects.toThrow(/LIVE_CLOSED/);
    await expect(t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["1", "2"] })).rejects.toThrow(/LIVE_BAD_ANSWER/);
    await t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["0"] });
    expect(await t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["1"] })).toEqual({ status: "already" });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 0 });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject({ correct: false, score: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "reveal", questionIndex: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "leaderboard", questionIndex: 0 });
    await t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 1, optionIds: ["0", "1", "2", "3"] });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 1 });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject({ correct: false, score: 0, streak: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 1 });
    expect((await t.run((ctx) => ctx.db.get("livePlayers", playerId)))!.score).toBe(0);
  });

  it("applies correct scores once and persists the server grade to a live attempt", async () => {
    const { t, owner, gameId } = await setup();
    await owner.mutation(api.live.advance, { gameId, from: "lobby", questionIndex: -1 });
    await t.mutation(api.live.submitAnswer, { gameId, token, questionIndex: 0, optionIds: ["1"] });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 0 });
    await owner.mutation(api.live.advance, { gameId, from: "question", questionIndex: 0 });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject({ correct: true, score: 1000 });
    await owner.mutation(api.live.endGameNow, { gameId });
    await t.mutation(internal.live.saveResults, { gameId, cursor: null });
    const attempts = await t.run((ctx) => ctx.db.query("quizSessions").take(10));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ source: "live", liveGameId: gameId, score: 10, totalPoints: 20 });
    expect(attempts[0].answers).toEqual([expect.objectContaining({ answer: "4", isCorrect: true, pointsEarned: 10 })]);
  });

  it("rejects non-finite and out-of-range host settings without partial writes", async () => {
    const { t, owner, gameId } = await setup();
    const before = await t.run((ctx) => ctx.db.get("liveGames", gameId));
    for (const seconds of [Number.NaN, Infinity, -Infinity, 4, 241, 5.5]) {
      await expect(owner.mutation(api.live.setTimeLimit, { gameId, seconds })).rejects.toThrow(/LIVE_INVALID/);
    }
    for (const breakSec of [Number.NaN, Infinity, 2, 61, 3.5]) {
      await expect(owner.mutation(api.live.setAutoplay, { gameId, autoAdvance: true, breakSec })).rejects.toThrow(/LIVE_INVALID/);
    }
    for (const startWhenPlayers of [Number.NaN, Infinity, -1, 501, 1.5]) {
      await expect(owner.mutation(api.live.setGameSettings, { gameId, showAnswerLabels: false, startWhenPlayers })).rejects.toThrow(/LIVE_INVALID/);
    }
    await expect(t.mutation(internal.mcp.setGameSettings, {
      userId: creatorIdentity.subject, id: `game_${gameId}`, autoAdvance: true, startWhenPlayers: 501,
    })).rejects.toThrow(/LIVE_INVALID/);
    expect(await t.run((ctx) => ctx.db.get("liveGames", gameId))).toEqual(before);
  });
});
