import { defineTable } from "convex/server";
import { v } from "convex/values";

export const LIVE_TEAM_LIMITS = { teams: 20, players: 500, nameLength: 60 } as const;
/** Parent integration: spread liveTeamTables into schema.ts. No scoring columns. */
export const liveTeamTables = {
  liveTeams: defineTable({ gameId: v.id("liveGames"), name: v.string(), nameKey: v.string(), maxMembers: v.number() })
    .index("by_gameId", ["gameId"]),
  liveTeamMembers: defineTable({ gameId: v.id("liveGames"), teamId: v.id("liveTeams"), playerId: v.id("livePlayers") })
    .index("by_gameId_and_playerId", ["gameId", "playerId"]),
};
