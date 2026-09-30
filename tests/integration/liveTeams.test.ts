import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { sha256Hex } from "../../convex/serverUtils";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");
const create = makeFunctionReference<"mutation">("liveTeams:create");
const assign = makeFunctionReference<"mutation">("liveTeams:assign");
const join = makeFunctionReference<"mutation">("liveTeams:join");
const standings = makeFunctionReference<"query">("liveTeams:standings");
async function fixture() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(creatorIdentity);
  const ids = await t.run(async ctx => {
    const gameId = await ctx.db.insert("liveGames", { hostId: creatorIdentity.subject, title: "Teams", pin: "123456", state: "lobby", questionIndex: -1, questions: [], skippedQuestions: 0, settings: { timeLimitSec: 20, maxPlayers: 100, language: "en" }, lastActivityAt: 0, createdAt: 0 });
    const players = [];
    for (let i = 1; i <= 3; i++) {
      const token = String(i).repeat(32);
      const playerId = await ctx.db.insert("livePlayers", { gameId, nickname: `P${i}`, nicknameKey: `p${i}`, tokenHash: await sha256Hex(token), score: 0, streak: 0, correctCount: 0, kicked: false, joinedAt: 0 });
      players.push({ playerId, token });
    }
    return { gameId, players };
  });
  return { t, owner, ...ids };
}
describe("Live teams", () => {
  it("rejects cross-game players and teams and freezes every running phase", async () => {
    const { t, owner, gameId, players } = await fixture();
    const teamId = await owner.mutation(create, { gameId, name: "A", maxMembers: 2 });
    const otherGameId = await t.run(async ctx => {
      const game = await ctx.db.get("liveGames", gameId);
      const { _id, _creationTime, ...data } = game!;
      void _id; void _creationTime;
      return ctx.db.insert("liveGames", { ...data, pin: "654321" });
    });
    const otherTeam = await owner.mutation(create, { gameId: otherGameId, name: "Other", maxMembers: 2 });
    await expect(owner.mutation(assign, { gameId: otherGameId, teamId: otherTeam, playerId: players[0].playerId })).rejects.toThrow("INVALID_MEMBER");
    await expect(t.mutation(join, { gameId, teamId: otherTeam, token: players[0].token })).rejects.toThrow("INVALID_MEMBER");
    for (const state of ["question", "reveal", "leaderboard", "ended"] as const) {
      await t.run(ctx => ctx.db.patch("liveGames", gameId, { state }));
      await expect(owner.mutation(create, { gameId, name: "New", maxMembers: 1 })).rejects.toThrow("FROZEN");
      await expect(t.mutation(join, { gameId, teamId, token: players[0].token })).rejects.toThrow("FROZEN");
    }
  });
  it("requires host authorization and enforces plan capacity, names and 20 teams", async () => {
    const { t, owner, gameId } = await fixture();
    await expect(t.withIdentity(otherCreatorIdentity).mutation(create, { gameId, name: "A", maxMembers: 2 })).rejects.toThrow("LIVE_NOT_HOST");
    await expect(t.mutation(create, { gameId, name: "A", maxMembers: 2 })).rejects.toThrow("authenticated");
    await expect(owner.mutation(create, { gameId, name: "A", maxMembers: 101 })).rejects.toThrow("INVALID");
    await owner.mutation(create, { gameId, name: "A", maxMembers: 2 });
    await expect(owner.mutation(create, { gameId, name: " a ", maxMembers: 2 })).rejects.toThrow("DUPLICATE");
    for (let i = 1; i < 20; i++) await owner.mutation(create, { gameId, name: `T${i}`, maxMembers: 1 });
    await expect(owner.mutation(create, { gameId, name: "Overflow", maxMembers: 1 })).rejects.toThrow("LIMIT");
  });
  it("authenticates player tokens, enforces team size and preserves membership on reconnect", async () => {
    const { t, owner, gameId, players } = await fixture();
    const teamId = await owner.mutation(create, { gameId, name: "A", maxMembers: 1 });
    await expect(t.mutation(join, { gameId, teamId, token: "f".repeat(32) })).rejects.toThrow("UNAUTHORIZED");
    const first = await t.mutation(join, { gameId, teamId, token: players[0].token });
    expect(await t.mutation(join, { gameId, teamId, token: players[0].token })).toEqual(first);
    await expect(owner.mutation(assign, { gameId, teamId, playerId: players[1].playerId })).rejects.toThrow("FULL");
    await t.run(ctx => ctx.db.patch("liveGames", gameId, { state: "question" }));
    expect(await t.mutation(join, { gameId, teamId, token: players[0].token })).toEqual(first);
    await expect(t.mutation(join, { gameId, teamId, token: players[1].token })).rejects.toThrow("FROZEN");
    await expect(owner.mutation(assign, { gameId, teamId, playerId: players[0].playerId })).rejects.toThrow("FROZEN");
  });
  it("sums authoritative scores, ranks ties equally, excludes kicked players and leaks no answers", async () => {
    const { t, owner, gameId, players } = await fixture();
    const b = await owner.mutation(create, { gameId, name: "Beta", maxMembers: 2 });
    const a = await owner.mutation(create, { gameId, name: "Alpha", maxMembers: 2 });
    await owner.mutation(assign, { gameId, teamId: a, playerId: players[0].playerId });
    await owner.mutation(assign, { gameId, teamId: b, playerId: players[1].playerId });
    await owner.mutation(assign, { gameId, teamId: b, playerId: players[2].playerId });
    await t.run(async ctx => { for (const p of players) await ctx.db.patch("livePlayers", p.playerId, { score: 10 }); await ctx.db.patch("livePlayers", players[2].playerId, { kicked: true }); });
    const rows = await t.query(standings, { gameId, token: players[0].token });
    expect(rows.map((r: { name: string; score: number; rank: number }) => [r.name, r.score, r.rank])).toEqual([["Alpha", 10, 1], ["Beta", 10, 1]]);
    expect(JSON.stringify(rows)).not.toMatch(/tokenHash|correct|questions|answer/);
    await expect(t.query(standings, { gameId })).rejects.toThrow("authenticated");
    await expect(t.query(standings, { gameId, token: players[2].token })).rejects.toThrow("UNAUTHORIZED");
  });
  it("freezes countdown assignments and respects restricted creators", async () => {
    const { t, owner, gameId, players } = await fixture();
    const teamId = await owner.mutation(create, { gameId, name: "A", maxMembers: 2 });
    await t.run(ctx => ctx.db.patch("liveGames", gameId, { startsAt: 100 }));
    await expect(owner.mutation(assign, { gameId, teamId, playerId: players[0].playerId })).rejects.toThrow("FROZEN");
    await owner.mutation(makeFunctionReference<"mutation">("quizFunctions:getOrCreateUser"), {});
    await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).first(); await ctx.db.patch("users", user!._id, { isBanned: true }); });
    await expect(t.mutation(join, { gameId, teamId, token: players[0].token })).rejects.toThrow("UNAVAILABLE");
  });
});
