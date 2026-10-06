import { defineTable } from "convex/server";
import { v } from "convex/values";

export const teamRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
export const inviteRole = v.union(v.literal("admin"), v.literal("member"));
export const teamAsset = v.union(
  v.object({ kind: v.literal("form"), id: v.id("forms") }),
  v.object({ kind: v.literal("lesson"), id: v.id("lessons") }),
  v.object({ kind: v.literal("course"), id: v.id("learnCollections") }),
  v.object({ kind: v.literal("folder"), id: v.id("folders") }),
);
export const businessTables = {
  businessTeams: defineTable({ name: v.string(), ownerId: v.string(), createdAt: v.number() }),
  businessMembers: defineTable({ teamId: v.id("businessTeams"), userId: v.string(), role: teamRole, joinedAt: v.number() })
    .index("by_user", ["userId"]).index("by_team_user", ["teamId", "userId"]),
  businessInvites: defineTable({ teamId: v.id("businessTeams"), email: v.optional(v.string()), tokenHash: v.string(), role: inviteRole, invitedBy: v.string(), expiresAt: v.number(), createdAt: v.number() })
    .index("by_hash", ["tokenHash"]).index("by_email", ["email"]).index("by_team", ["teamId"]).index("by_expiresAt", ["expiresAt"]),
  businessShares: defineTable({ teamId: v.id("businessTeams"), asset: teamAsset, ownerId: v.string(), sharedBy: v.string(), createdAt: v.number() })
    .index("by_team_asset", ["teamId", "asset"]).index("by_asset", ["asset"]).index("by_team_kind", ["teamId", "asset.kind"]),
  businessActivity: defineTable({ teamId: v.id("businessTeams"), actorId: v.string(), action: v.string(), detail: v.string(), createdAt: v.number() }).index("by_team", ["teamId"]),
};
