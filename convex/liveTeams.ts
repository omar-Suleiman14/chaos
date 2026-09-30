import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { LIVE_TEAM_LIMITS } from "./liveTeamModel";
import { creatorRestricted, hasPro, requireActiveUser } from "./authz";
import { FREE_PLAYER_LIMIT, PRO_PLAYER_LIMIT } from "./liveLogic";
import { sha256Hex } from "./serverUtils";

type Ctx = MutationCtx | QueryCtx;

async function gameFor(ctx: Ctx, gameId: Id<"liveGames">) {
  const game = await ctx.db.get("liveGames", gameId);
  if (!game || await creatorRestricted(ctx, game.hostId)) throw new Error("LIVE_UNAVAILABLE");
  return game;
}
async function hostFor(ctx: Ctx, gameId: Id<"liveGames">) {
  const { identity, user } = await requireActiveUser(ctx);
  const game = await gameFor(ctx, gameId);
  if (game.hostId !== identity.subject) throw new Error("LIVE_NOT_HOST");
  return { game, limit: Math.min(game.settings.maxPlayers, hasPro(user, Date.now()) ? PRO_PLAYER_LIMIT : FREE_PLAYER_LIMIT, LIVE_TEAM_LIMITS.players) };
}
function lobby(game: Doc<"liveGames">) {
  if (game.state !== "lobby" || game.startsAt !== undefined) throw new Error("LIVE_TEAMS_FROZEN");
}
async function playerFor(ctx: Ctx, gameId: Id<"liveGames">, token: string) {
  if (!/^[a-f0-9]{32,128}$/.test(token)) throw new Error("LIVE_PLAYER_UNAUTHORIZED");
  const hash = await sha256Hex(token);
  const player = await ctx.db.query("livePlayers").withIndex("by_gameId_and_tokenHash", q => q.eq("gameId", gameId).eq("tokenHash", hash)).unique();
  if (!player || player.kicked) throw new Error("LIVE_PLAYER_UNAUTHORIZED");
  return player;
}
async function membership(ctx: Ctx, gameId: Id<"liveGames">, playerId: Id<"livePlayers">) {
  return ctx.db.query("liveTeamMembers").withIndex("by_gameId_and_playerId", q => q.eq("gameId", gameId).eq("playerId", playerId)).unique();
}

export const create = mutation({
  args: { gameId: v.id("liveGames"), name: v.string(), maxMembers: v.number() },
  handler: async (ctx, args) => {
    const { game, limit } = await hostFor(ctx, args.gameId); lobby(game);
    const name = args.name.trim().normalize("NFKC");
    if (!name || name.length > LIVE_TEAM_LIMITS.nameLength || /[\u0000-\u001f\u007f]/.test(name) || !Number.isInteger(args.maxMembers) || args.maxMembers < 1 || args.maxMembers > limit) throw new Error("LIVE_TEAM_INVALID");
    const teams = await ctx.db.query("liveTeams").withIndex("by_gameId", q => q.eq("gameId", game._id)).take(21);
    const nameKey = name.toLowerCase();
    if (teams.some(t => t.nameKey === nameKey)) throw new Error("LIVE_TEAM_DUPLICATE");
    if (teams.length >= LIVE_TEAM_LIMITS.teams) throw new Error("LIVE_TEAM_LIMIT");
    return ctx.db.insert("liveTeams", { gameId: game._id, name, nameKey, maxMembers: args.maxMembers });
  },
});

async function assignPlayer(ctx: MutationCtx, game: Doc<"liveGames">, playerId: Id<"livePlayers">, teamId: Id<"liveTeams">) {
  lobby(game);
  const team = await ctx.db.get("liveTeams", teamId);
  const player = await ctx.db.get("livePlayers", playerId);
  if (!team || team.gameId !== game._id || !player || player.gameId !== game._id || player.kicked) throw new Error("LIVE_TEAM_INVALID_MEMBER");
  const existing = await membership(ctx, game._id, playerId);
  if (existing?.teamId === teamId) return existing._id;
  const members = await ctx.db.query("liveTeamMembers").withIndex("by_gameId_and_playerId", q => q.eq("gameId", game._id)).take(501);
  if (!existing && members.length >= LIVE_TEAM_LIMITS.players) throw new Error("LIVE_TEAM_PLAYER_LIMIT");
  let active = 0;
  for (const member of members) if (member.teamId === teamId) {
    const p = await ctx.db.get("livePlayers", member.playerId);
    if (p && !p.kicked && p.gameId === game._id) active++;
  }
  if (active >= team.maxMembers) throw new Error("LIVE_TEAM_FULL");
  if (existing) { await ctx.db.patch("liveTeamMembers", existing._id, { teamId }); return existing._id; }
  return ctx.db.insert("liveTeamMembers", { gameId: game._id, teamId, playerId });
}
export const assign = mutation({
  args: { gameId: v.id("liveGames"), playerId: v.id("livePlayers"), teamId: v.id("liveTeams") },
  handler: async (ctx, args) => assignPlayer(ctx, (await hostFor(ctx, args.gameId)).game, args.playerId, args.teamId),
});
/** Existing membership is a reconnect, including during play. A token cannot select another player. */
export const join = mutation({
  args: { gameId: v.id("liveGames"), token: v.string(), teamId: v.id("liveTeams") },
  handler: async (ctx, args) => {
    const game = await gameFor(ctx, args.gameId);
    const player = await playerFor(ctx, game._id, args.token);
    const existing = await membership(ctx, game._id, player._id);
    if (existing?.teamId === args.teamId) return { membershipId: existing._id, playerId: player._id, teamId: existing.teamId };
    return { membershipId: await assignPlayer(ctx, game, player._id, args.teamId), playerId: player._id, teamId: args.teamId };
  },
});
/** Authenticated host or token-authenticated player only; never returns tokens, questions or answers. */
export const standings = query({
  args: { gameId: v.id("liveGames"), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const game = await gameFor(ctx, args.gameId);
    if (args.token !== undefined) await playerFor(ctx, game._id, args.token);
    else await hostFor(ctx, game._id);
    const teams = await ctx.db.query("liveTeams").withIndex("by_gameId", q => q.eq("gameId", game._id)).take(21);
    const members = await ctx.db.query("liveTeamMembers").withIndex("by_gameId_and_playerId", q => q.eq("gameId", game._id)).take(501);
    if (teams.length > 20 || members.length > 500) throw new Error("LIVE_TEAM_LIMIT");
    const totals = new Map(teams.map(t => [t._id, { teamId: t._id, name: t.name, score: 0, members: 0 }]));
    for (const member of members) {
      const p = await ctx.db.get("livePlayers", member.playerId);
      const total = totals.get(member.teamId);
      if (total && p && !p.kicked && p.gameId === game._id) { total.score += p.score; total.members++; }
    }
    const rows = [...totals.values()].sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.teamId < b.teamId ? -1 : 1));
    let rank = 0;
    return rows.map((row, i) => { if (i === 0 || row.score !== rows[i - 1].score) rank = i + 1; return { ...row, rank }; });
  },
});
