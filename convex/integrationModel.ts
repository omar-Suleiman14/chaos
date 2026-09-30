import { defineTable } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const learnIntegrationScopes = ["lessons:read", "lessons:create", "lessons:update", "sources:read", "folders:read", "folders:update", "curricula:read", "curricula:map", "community:read", "community:save", "progress:read", "progress:write"] as const;
export const legacyIntegrationScopes = ["items:read", "drafts:create", "drafts:update", "summaries:read", "definitions:read", "webhooks:manage"] as const;
export type LegacyIntegrationScope = (typeof legacyIntegrationScopes)[number];
export const integrationScopes = [...legacyIntegrationScopes, ...learnIntegrationScopes] as const;
export type IntegrationScope = (typeof integrationScopes)[number];

export async function activeIntegrationToken(ctx: MutationCtx | QueryCtx, tokenId: Id<"integrationTokens">, now: number) {
  if (!Number.isFinite(now)) return null;
  const token = await ctx.db.get("integrationTokens", tokenId);
  if (!token || token.revokedAt || (token.expiresAt !== undefined && token.expiresAt <= now)) return null;
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", token.ownerId)).first();
  return owner?.isBanned || owner?.suspendedUntil ? null : token;
}

export const scopeValidator = v.union(
  v.literal("items:read"), v.literal("drafts:create"), v.literal("drafts:update"),
  v.literal("summaries:read"), v.literal("definitions:read"), v.literal("webhooks:manage"),
  ...learnIntegrationScopes.map((scope) => v.literal(scope)),
);

/** Idempotency keys are remembered for 24 hours; after that the key is free again. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** After rotation the previous token keeps working this long. */
export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
/** Recent activity rows kept per connection. */
export const ACTIVITY_KEEP = 50;

/** Structured, validated provenance of imported content (docs/integration-api-v1.md, "Source"). */
export const externalSourceValidator = v.object({
  type: v.string(),
  id: v.optional(v.string()),
  url: v.optional(v.string()),
  title: v.optional(v.string()),
  fetchedAt: v.optional(v.number()),
});

/**
 * The stored result for this connection and key, or null when there is none or
 * it is older than the retention window. An expired row is removed so the key
 * starts fresh. Shared by every endpoint that takes an Idempotency-Key.
 */
export async function findIdempotent(ctx: MutationCtx, tokenId: Id<"integrationTokens">, key: string) {
  const prior = await ctx.db
    .query("integrationIdempotency")
    .withIndex("by_tokenId_and_key", (q) => q.eq("tokenId", tokenId).eq("key", key))
    .unique();
  if (!prior) return null;
  if (prior.createdAt <= Date.now() - IDEMPOTENCY_TTL_MS) {
    await ctx.db.delete("integrationIdempotency", prior._id);
    return null;
  }
  return prior;
}

/** Record one line of connection activity and trim the history to ACTIVITY_KEEP rows. */
export async function logConnectionActivity(ctx: MutationCtx, tokenId: Id<"integrationTokens">, action: string, itemRef?: string) {
  await ctx.db.insert("integrationActivity", { tokenId, at: Date.now(), action, itemRef });
  const rows = await ctx.db
    .query("integrationActivity")
    .withIndex("by_tokenId_and_at", (q) => q.eq("tokenId", tokenId))
    .order("desc")
    .take(ACTIVITY_KEEP + 10);
  for (const row of rows.slice(ACTIVITY_KEEP)) await ctx.db.delete("integrationActivity", row._id);
}

export const integrationTables = {
  /** Connection tokens. Only the SHA-256 hash of the secret is stored. */
  integrationTokens: defineTable({
    ownerId: v.string(),
    label: v.string(),
    tokenHash: v.string(),
    /** First characters of the secret, for recognising a token in the UI. */
    tokenHint: v.string(),
    scopes: v.array(scopeValidator),
    access: v.union(v.literal("all"), v.literal("selected")),
    /** Item references ("form_<id>" / "quiz_<id>") shared when access is "selected". */
    itemRefs: v.array(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** Set by rotation: the old token's hash keeps working until previousTokenExpiresAt. */
    previousTokenHash: v.optional(v.string()),
    previousTokenExpiresAt: v.optional(v.number()),
    rotatedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_previousTokenHash", ["previousTokenHash"])
    .index("by_ownerId", ["ownerId"]),

  /** Drafts created through a connection remain reachable by that connection. */
  integrationCreatedItems: defineTable({
    tokenId: v.id("integrationTokens"),
    itemRef: v.string(),
    createdAt: v.number(),
    /** Validated external reference sent with the draft; returned to this connection and shown to the owner only. */
    source: v.optional(externalSourceValidator),
  }).index("by_tokenId_and_itemRef", ["tokenId", "itemRef"]),

  /** Recent write activity per connection, shown to the owner. At most ACTIVITY_KEEP rows per connection. */
  integrationActivity: defineTable({
    tokenId: v.id("integrationTokens"),
    at: v.number(),
    /** "draft.created", "draft.updated", "token.rotated", "webhook.created", ... */
    action: v.string(),
    itemRef: v.optional(v.string()),
  }).index("by_tokenId_and_at", ["tokenId", "at"]),

  /** Stored results for Idempotency-Key replays. Kept for IDEMPOTENCY_TTL_MS. */
  integrationIdempotency: defineTable({
    tokenId: v.id("integrationTokens"),
    key: v.string(),
    requestHash: v.string(),
    status: v.number(),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_tokenId_and_key", ["tokenId", "key"])
    .index("by_createdAt", ["createdAt"]),
};
