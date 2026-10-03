import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { parseMultiAnswer } from "./grading";
import { consumeCreation } from "./plans";
import { v } from "convex/values";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ownsRecord, requireActiveUser } from "./authz";
import { checkDefinition, MINIMUM_GROUP_SIZE, publicSummary } from "./formLogic";
import type { Aggregates, FormDefinition } from "./formLogic";
import { createFormRecord, replaceDraft } from "./forms";
import {
  API_FORM_FIELD_TYPES, API_QUIZ_FIELD_TYPES, API_VERSION, fromFormDefinition, fromQuizQuestions,
  parseDraftBody, suppressBuckets, toFormDefinition, toQuizQuestions,
} from "./integrationContract";
import type { DraftBody, QuizType } from "./integrationContract";
import {
  activeIntegrationToken, findIdempotent, integrationScopes, logConnectionActivity, ROTATION_GRACE_MS, scopeValidator,
} from "./integrationModel";
import type { IntegrationScope } from "./integrationModel";
import { displayName, errorCode, randomHex, sha256Hex } from "./serverUtils";
import { disableConnectionWebhooks } from "./webhooks";

type Ctx = QueryCtx | MutationCtx;
type Token = Doc<"integrationTokens">;

/** Result envelope shared with convex/http.ts. */
export type ApiResult = { status: number; body: unknown; headers?: Record<string, string> };
const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const fail = (status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): ApiResult => ({
  status,
  body: { error: details === undefined ? { code, message } : { code, message, details } },
  headers,
});
const notFound = () => fail(404, "NOT_FOUND", "This item does not exist or is not shared with this connection.");

/** Per-connection defaults; operators override them with globalConfig or env (see apiRateLimits). */
export const DEFAULT_API_RATE = { read: 300, write: 60 } as const;
export type RateClass = keyof typeof DEFAULT_API_RATE;
const RATE_WINDOW_MS = 60_000;
const MAX_TOKENS = 20;

function newSecret() {
  const secret = randomHex(32);
  return { token: `chaos_${secret}`, hint: `chaos_${secret.slice(0, 6)}…` };
}

// ── Owner-facing connection management ──────────────────────────────────────

async function itemTitle(ctx: Ctx, ownerId: string, ref: string): Promise<string | null> {
  const item = await loadItem(ctx, ref);
  if (!item || itemOwner(item) !== ownerId) return null;
  return item.doc.title;
}

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const tokens = await ctx.db.query("integrationTokens").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).take(100);
    const now = Date.now();
    const out = [];
    for (const t of tokens) {
      const items = [];
      for (const ref of t.itemRefs) items.push({ ref, title: await itemTitle(ctx, identity.subject, ref) });
      const activity = t.revokedAt ? [] : await ctx.db
        .query("integrationActivity")
        .withIndex("by_tokenId_and_at", (q) => q.eq("tokenId", t._id))
        .order("desc")
        .take(10);
      out.push({
        _id: t._id, label: t.label, tokenHint: t.tokenHint, scopes: t.scopes, access: t.access, items,
        createdAt: t.createdAt, expiresAt: t.expiresAt ?? null, lastUsedAt: t.lastUsedAt ?? null, revokedAt: t.revokedAt ?? null,
        rotatedAt: t.rotatedAt ?? null,
        reviewLessonUpdates: t.reviewLessonUpdates ?? false,
        // The old token after a rotation; null once its grace period is over.
        previousTokenExpiresAt: t.previousTokenExpiresAt !== undefined && t.previousTokenExpiresAt > now ? t.previousTokenExpiresAt : null,
        activity: activity.map((a) => ({ at: a.at, action: a.action, itemRef: a.itemRef ?? null })),
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner's forms and quizzes, for choosing what a connection may reach. */
export const listShareableItems = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const forms = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).order("desc").take(300);
    const quizzes = await ctx.db.query("quizzes").withIndex("by_creator", (q) => q.eq("creatorId", identity.subject)).take(300);
    return [
      ...forms.map((f) => ({ ref: `form_${f._id}`, kind: "form" as const, title: f.title, updatedAt: f.updatedAt })),
      ...quizzes.map((q) => ({ ref: `quiz_${q._id}`, kind: "quiz" as const, title: q.title, updatedAt: q.updatedAt })),
    ].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

async function validRefs(ctx: Ctx, ownerId: string, refs: string[]): Promise<string[]> {
  if (refs.length > 500) throw new Error("TOO_MANY_ITEMS: Share at most 500 items with one connection.");
  const out: string[] = [];
  for (const ref of new Set(refs)) {
    if ((await itemTitle(ctx, ownerId, ref)) === null) throw new Error("INVALID_ITEM: One of the selected items is not yours.");
    out.push(ref);
  }
  return out;
}

function validScopes(scopes: IntegrationScope[]): IntegrationScope[] {
  const unique = [...new Set(scopes)];
  if (!unique.length) throw new Error("INVALID_SCOPES: Choose at least one permission.");
  return integrationScopes.filter((s) => unique.includes(s));
}

export const createConnection = mutation({
  args: {
    label: v.string(),
    scopes: v.array(scopeValidator),
    access: v.union(v.literal("all"), v.literal("selected")),
    itemRefs: v.array(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  returns: v.object({ tokenId: v.id("integrationTokens"), token: v.string() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const label = args.label.trim();
    if (!label || label.length > 80) throw new Error("INVALID_LABEL: Name the connection (up to 80 characters).");
    const existing = await ctx.db.query("integrationTokens").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).take(MAX_TOKENS + 50);
    if (existing.filter((t) => !t.revokedAt).length >= MAX_TOKENS) throw new Error(`TOKEN_LIMIT: Keep at most ${MAX_TOKENS} active connections.`);
    if (args.expiresInDays !== undefined && (!Number.isInteger(args.expiresInDays) || args.expiresInDays < 1 || args.expiresInDays > 3650)) {
      throw new Error("INVALID_EXPIRY: Expiry must be 1–3650 days.");
    }
    const { token, hint } = newSecret();
    const now = Date.now();
    const tokenId = await ctx.db.insert("integrationTokens", {
      ownerId: identity.subject,
      label,
      tokenHash: await sha256Hex(token),
      tokenHint: hint,
      scopes: validScopes(args.scopes),
      access: args.access,
      itemRefs: args.access === "selected" ? await validRefs(ctx, identity.subject, args.itemRefs) : [],
      createdAt: now,
      expiresAt: args.expiresInDays ? now + args.expiresInDays * 86_400_000 : undefined,
    });
    // The secret is returned once and never stored.
    return { tokenId, token };
  },
});

export const updateConnection = mutation({
  args: {
    tokenId: v.id("integrationTokens"),
    label: v.optional(v.string()),
    scopes: v.optional(v.array(scopeValidator)),
    access: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    itemRefs: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await ctx.db.get("integrationTokens", args.tokenId);
    if (!token || !ownsRecord(token, identity)) throw new Error("NOT_FOUND: Connection not found.");
    if (token.revokedAt) throw new Error("REVOKED: This connection was revoked.");
    const access = args.access ?? token.access;
    await ctx.db.patch("integrationTokens", token._id, {
      label: args.label !== undefined ? args.label.trim().slice(0, 80) || token.label : token.label,
      scopes: args.scopes ? validScopes(args.scopes) : token.scopes,
      access,
      itemRefs: access === "all" ? [] : args.itemRefs ? await validRefs(ctx, identity.subject, args.itemRefs) : token.itemRefs,
    });
    return null;
  },
});

export const revokeConnection = mutation({
  args: { tokenId: v.id("integrationTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await ctx.db.get("integrationTokens", args.tokenId);
    if (!token || !ownsRecord(token, identity)) throw new Error("NOT_FOUND: Connection not found.");
    if (!token.revokedAt) await ctx.db.patch("integrationTokens", token._id, { revokedAt: Date.now() });
    await disableConnectionWebhooks(ctx, token._id);
    return null;
  },
});

/**
 * Replace a connection's token. The token the caller presented (or, from the
 * dashboard, the current one) keeps working for ROTATION_GRACE_MS so a running
 * integration can switch over; everything else about the connection stays.
 * Rotating with the old token during its grace period keeps that old token and
 * replaces only the current one, so a retried rotation never locks a client out.
 */
async function rotateToken(ctx: MutationCtx, token: Token, presentedHash?: string) {
  const { token: secret, hint } = newSecret();
  const now = Date.now();
  const viaPrevious = presentedHash !== undefined && presentedHash === token.previousTokenHash && (token.previousTokenExpiresAt ?? 0) > now;
  const previousTokenExpiresAt = viaPrevious ? token.previousTokenExpiresAt! : now + ROTATION_GRACE_MS;
  await ctx.db.patch("integrationTokens", token._id, {
    tokenHash: await sha256Hex(secret),
    tokenHint: hint,
    previousTokenHash: viaPrevious ? token.previousTokenHash : token.tokenHash,
    previousTokenExpiresAt,
    rotatedAt: now,
  });
  await logConnectionActivity(ctx, token._id, "token.rotated");
  return { token: secret, previousTokenExpiresAt };
}

export const rotateConnection = mutation({
  args: { tokenId: v.id("integrationTokens") },
  returns: v.object({ token: v.string(), previousTokenExpiresAt: v.number() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await ctx.db.get("integrationTokens", args.tokenId);
    if (!token || !ownsRecord(token, identity)) throw new Error("NOT_FOUND: Connection not found.");
    if (token.revokedAt) throw new Error("REVOKED: This connection was revoked.");
    if (token.expiresAt !== undefined && token.expiresAt <= Date.now()) throw new Error("EXPIRED: This connection has expired. Create a new one.");
    // The new secret is returned once and never stored.
    return await rotateToken(ctx, token);
  },
});

/** Stop the old token now instead of waiting for the grace period to end. */
export const endRotationGrace = mutation({
  args: { tokenId: v.id("integrationTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await ctx.db.get("integrationTokens", args.tokenId);
    if (!token || !ownsRecord(token, identity)) throw new Error("NOT_FOUND: Connection not found.");
    if (token.previousTokenHash !== undefined) {
      await ctx.db.patch("integrationTokens", token._id, { previousTokenHash: undefined, previousTokenExpiresAt: undefined });
      await logConnectionActivity(ctx, token._id, "token.previous_revoked");
    }
    return null;
  },
});

// ── Items ───────────────────────────────────────────────────────────────────

type Item =
  | { kind: "form"; ref: string; doc: Doc<"forms"> }
  | { kind: "quiz"; ref: string; doc: Doc<"quizzes"> };

async function loadItem(ctx: Ctx, ref: string): Promise<Item | null> {
  const match = /^(form|quiz)_([A-Za-z0-9]+)$/.exec(ref);
  if (!match) return null;
  if (match[1] === "form") {
    const id = ctx.db.normalizeId("forms", match[2]);
    const doc = id ? await ctx.db.get("forms", id) : null;
    return doc ? { kind: "form", ref, doc } : null;
  }
  const id = ctx.db.normalizeId("quizzes", match[2]);
  const doc = id ? await ctx.db.get("quizzes", id) : null;
  return doc ? { kind: "quiz", ref, doc } : null;
}

function itemOwner(item: Item): string {
  return item.kind === "form" ? item.doc.ownerId : item.doc.creatorId;
}

async function createdRow(ctx: Ctx, token: Token, ref: string) {
  return await ctx.db
    .query("integrationCreatedItems")
    .withIndex("by_tokenId_and_itemRef", (q) => q.eq("tokenId", token._id).eq("itemRef", ref))
    .first();
}

async function createdByToken(ctx: Ctx, token: Token, ref: string): Promise<boolean> {
  return !!(await createdRow(ctx, token, ref));
}

async function accessibleItem(ctx: Ctx, token: Token, ref: string): Promise<Item | null> {
  const item = await loadItem(ctx, ref);
  if (!item || itemOwner(item) !== token.ownerId) return null;
  if (item.kind === "quiz" && item.doc.isBanned) return null;
  if (token.access === "all" || token.itemRefs.includes(ref) || (await createdByToken(ctx, token, ref))) return item;
  return null;
}

function appUrl(path: string | null): string | null {
  const base = env.CHAOS_APP_URL?.replace(/\/+$/, "");
  return base && path ? `${base}${path}` : null;
}

function quizStatus(q: Doc<"quizzes">) {
  if (q.isPublished) return "live" as const;
  return q.publishedAt !== undefined || q.publishedSnapshot ? ("closed" as const) : ("draft" as const);
}

async function itemView(ctx: Ctx, token: Token, item: Item) {
  const row = await createdRow(ctx, token, item.ref);
  const created = !!row;
  // Only the connection that sent the source gets it back, for reconciliation.
  const source = row?.source ?? null;
  if (item.kind === "form") {
    const f = item.doc;
    const editPath = `/dashboard/forms/${f._id}`;
    const sharePath = f.publishedVersion !== undefined ? `/f/${f.shareId}` : null;
    const resultsPath = `/dashboard/forms/${f._id}/responses`;
    return {
      id: item.ref, kind: "form" as const, title: f.title, status: f.status, revision: String(f.draftRevision), updatedAt: f.updatedAt,
      hasUnpublishedChanges: f.publishedRevision !== undefined && f.draftRevision > f.publishedRevision,
      editPath, sharePath, resultsPath, editUrl: appUrl(editPath), shareUrl: appUrl(sharePath), resultsUrl: appUrl(resultsPath),
      createdByThisConnection: created, source,
    };
  }
  const q = item.doc;
  const editPath = `/dashboard/editor?id=${q._id}`;
  const sharePath = q.isPublished || q.publishedSnapshot ? `/${q.creatorUsername}/${q.slug}` : null;
  const resultsPath = `/dashboard/results?id=${q._id}`;
  return {
    id: item.ref, kind: "quiz" as const, title: q.title, status: quizStatus(q), revision: String(q.updatedAt), updatedAt: q.updatedAt,
    hasUnpublishedChanges: q.publishedAt !== undefined && q.updatedAt > q.publishedAt,
    editPath, sharePath, resultsPath, editUrl: appUrl(editPath), shareUrl: appUrl(sharePath), resultsUrl: appUrl(resultsPath),
    createdByThisConnection: created, source,
  };
}

// ── API: authentication ─────────────────────────────────────────────────────

/**
 * Authenticates a request, applies the per-token rate limit and records use.
 * Called by the HTTP router before every operation.
 */
function configuredRate(fromConfig: number | undefined, fromEnv: string | undefined, fallback: number): number {
  for (const value of [fromConfig, fromEnv === undefined ? undefined : Number(fromEnv)]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100_000) return value;
  }
  return fallback;
}

/**
 * Per-connection limits per minute. Operators change them without a deploy:
 * globalConfig.integration{Read,Write}RatePerMinute first, then the
 * CHAOS_API_{READ,WRITE}_RATE_PER_MINUTE environment variables, then defaults.
 */
async function apiRateLimits(ctx: Ctx): Promise<Record<RateClass, number>> {
  const config = await ctx.db.query("globalConfig").first();
  return {
    read: configuredRate(config?.integrationReadRatePerMinute, env.CHAOS_API_READ_RATE_PER_MINUTE, DEFAULT_API_RATE.read),
    write: configuredRate(config?.integrationWriteRatePerMinute, env.CHAOS_API_WRITE_RATE_PER_MINUTE, DEFAULT_API_RATE.write),
  };
}

/** Current per-connection limits, shown on the Connections page. */
export const apiLimits = query({
  args: {},
  returns: v.object({ read: v.number(), write: v.number() }),
  handler: async (ctx) => await apiRateLimits(ctx),
});

const rateValidator = v.object({ limit: v.number(), remaining: v.number(), reset: v.number(), policy: v.string() });
type RateState = { limit: number; remaining: number; reset: number; policy: string };

/** Fixed one-minute window per connection and class, counted in one indexed row. */
async function consumeApiRate(ctx: MutationCtx, tokenId: Id<"integrationTokens">, cls: RateClass, limit: number): Promise<{ allowed: boolean; rate: RateState }> {
  const now = Date.now();
  const windowStart = now - (now % RATE_WINDOW_MS);
  const key = `api:${cls}:${tokenId}`;
  const row = await ctx.db.query("rateWindows").withIndex("by_key_and_windowStart", (q) => q.eq("key", key).eq("windowStart", windowStart)).unique();
  const used = row?.count ?? 0;
  const reset = Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000));
  const policy = `${limit};w=${RATE_WINDOW_MS / 1000}`;
  if (used >= limit) return { allowed: false, rate: { limit, remaining: 0, reset, policy } };
  if (row) await ctx.db.patch("rateWindows", row._id, { count: used + 1 });
  else await ctx.db.insert("rateWindows", { key, windowStart, count: 1 });
  return { allowed: true, rate: { limit, remaining: limit - used - 1, reset, policy } };
}

async function findToken(ctx: Ctx, tokenHash: string): Promise<{ token: Token; previousExpiresAt: number | null } | null> {
  const current = await ctx.db.query("integrationTokens").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
  if (current) return { token: current, previousExpiresAt: null };
  const previous = await ctx.db.query("integrationTokens").withIndex("by_previousTokenHash", (q) => q.eq("previousTokenHash", tokenHash)).first();
  if (previous?.previousTokenExpiresAt !== undefined && previous.previousTokenExpiresAt > Date.now()) {
    return { token: previous, previousExpiresAt: previous.previousTokenExpiresAt };
  }
  return null;
}

/**
 * Authenticates a request, applies the per-connection rate limit for the
 * request's class and records use. Called by the HTTP router before every
 * operation. `operation` names the endpoint for the owner's activity list.
 */
export const authenticate = internalMutation({
  args: {
    tokenHash: v.string(),
    scope: v.optional(scopeValidator),
    rateClass: v.optional(v.union(v.literal("read"), v.literal("write"))),
    operation: v.optional(v.string()),
    itemRef: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), tokenId: v.id("integrationTokens"), rate: rateValidator, previousTokenExpiresAt: v.union(v.number(), v.null()) }),
    v.object({ ok: v.literal(false), status: v.number(), code: v.string(), message: v.string(), retryAfter: v.optional(v.number()), rate: v.optional(rateValidator) }),
  ),
  handler: async (ctx, args) => {
    const found = await findToken(ctx, args.tokenHash);
    if (!found) return { ok: false as const, status: 401, code: "UNAUTHORIZED", message: "The connection token is not recognised." };
    const { token } = found;
    if (token.revokedAt || (token.expiresAt !== undefined && token.expiresAt <= Date.now())) {
      return { ok: false as const, status: 401, code: "TOKEN_REVOKED", message: "This connection was revoked or has expired. Reconnect from Chaos." };
    }
    const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", token.ownerId)).first();
    if (owner?.isBanned || owner?.suspendedUntil) return { ok: false as const, status: 401, code: "TOKEN_REVOKED", message: "This connection is no longer active." };
    if (args.scope && !token.scopes.includes(args.scope)) {
      return { ok: false as const, status: 403, code: "INSUFFICIENT_SCOPE", message: `This connection does not have the ${args.scope} permission.` };
    }
    const cls = args.rateClass ?? "read";
    const { allowed, rate } = await consumeApiRate(ctx, token._id, cls, (await apiRateLimits(ctx))[cls]);
    if (!allowed) {
      return { ok: false as const, status: 429, code: "RATE_LIMITED", message: `Too many ${cls} requests. Try again in ${rate.reset} seconds.`, retryAfter: rate.reset, rate };
    }
    const now = Date.now();
    if (!token.lastUsedAt || now - token.lastUsedAt > 60_000) {
      await ctx.db.patch("integrationTokens", token._id, { lastUsedAt: now });
      // Reads are sampled (at most one line a minute); writes log their own outcome.
      if (cls === "read" && args.operation) await logConnectionActivity(ctx, token._id, args.operation, args.itemRef);
    }
    return { ok: true as const, tokenId: token._id, rate, previousTokenExpiresAt: found.previousExpiresAt };
  },
});

/** POST /connection/rotate. Safe to retry without an Idempotency-Key (see rotateToken). */
export const apiRotate = internalMutation({
  args: { tokenId: v.id("integrationTokens"), tokenHash: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, Date.now());
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    const presented = await findToken(ctx, args.tokenHash);
    if (!presented || presented.token._id !== token._id) return fail(401, "UNAUTHORIZED", "The connection token is not recognised.");
    const rotated = await rotateToken(ctx, token, args.tokenHash);
    return ok({ token: rotated.token, previousTokenExpiresAt: rotated.previousTokenExpiresAt });
  },
});

async function activeToken(ctx: Ctx, tokenId: Id<"integrationTokens">, now: number): Promise<Token | null> {
  return await activeIntegrationToken(ctx, tokenId, now);
}

// ── API: reads ──────────────────────────────────────────────────────────────

export const capabilities = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    return ok({
      apiVersion: API_VERSION,
      supportedVersions: [API_VERSION],
      scopes: token.scopes,
      supportedKinds: ["form", "quiz"],
      fieldTypes: { form: API_FORM_FIELD_TYPES, quiz: API_QUIZ_FIELD_TYPES },
      limits: { maxFields: 200, minimumGroupSize: MINIMUM_GROUP_SIZE },
      workspace: { id: (await sha256Hex(`workspace:${token.ownerId}`)).slice(0, 16), name: await displayName(ctx, token.ownerId) },
      connection: { id: token._id, label: token.label, access: token.access, createdAt: token.createdAt, expiresAt: token.expiresAt ?? null },
    });
  },
});

const PAGE_SIZE = 50;

export const listItems = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number(), kind: v.optional(v.string()), cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("items:read")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the items:read permission.");
    if (args.kind !== undefined && args.kind !== "form" && args.kind !== "quiz") return fail(400, "VALIDATION_FAILED", "kind must be form or quiz.");
    const offset = args.cursor ? Number(args.cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) return fail(400, "VALIDATION_FAILED", "Invalid cursor.");
    let items: Item[] = [];
    if (token.access === "all") {
      if (args.kind !== "quiz") {
        const forms = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", token.ownerId)).order("desc").take(1000);
        items.push(...forms.map((doc) => ({ kind: "form" as const, ref: `form_${doc._id}`, doc })));
      }
      if (args.kind !== "form") {
        const quizzes = await ctx.db.query("quizzes").withIndex("by_creator", (q) => q.eq("creatorId", token.ownerId)).take(1000);
        items.push(...quizzes.filter((doc) => !doc.isBanned).map((doc) => ({ kind: "quiz" as const, ref: `quiz_${doc._id}`, doc })));
      }
    } else {
      const created = await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", (q) => q.eq("tokenId", token._id)).take(1000);
      const refs = new Set([...token.itemRefs, ...created.map((c) => c.itemRef)]);
      for (const ref of refs) {
        const item = await accessibleItem(ctx, token, ref);
        if (item && (!args.kind || item.kind === args.kind)) items.push(item);
      }
    }
    items = items.sort((a, b) => b.doc.updatedAt - a.doc.updatedAt);
    const page = items.slice(offset, offset + PAGE_SIZE);
    const views = [];
    for (const item of page) views.push(await itemView(ctx, token, item));
    return ok({ items: views, nextCursor: offset + PAGE_SIZE < items.length ? String(offset + PAGE_SIZE) : null });
  },
});

export const getItem = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number(), ref: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("items:read")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the items:read permission.");
    const item = await accessibleItem(ctx, token, args.ref);
    return item ? ok(await itemView(ctx, token, item)) : notFound();
  },
});

async function publishedFormDefinition(ctx: Ctx, form: Doc<"forms">): Promise<FormDefinition> {
  if (form.publishedVersion !== undefined) {
    const row = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!))
      .unique();
    if (row) return row.definition as FormDefinition;
  }
  return form.draft as FormDefinition;
}

async function quizQuestionsForReporting(ctx: Ctx, quiz: Doc<"quizzes">) {
  if (quiz.publishedSnapshot) return quiz.publishedSnapshot.questions;
  const rows = await ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).take(1000);
  return rows.filter((r) => r.deletedAt === undefined).sort((a, b) => a.order - b.order);
}

const QUIZ_SUMMARY_SAMPLE = 5000;

export const getSummary = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number(), ref: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("summaries:read")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the summaries:read permission.");
    const item = await accessibleItem(ctx, token, args.ref);
    if (!item) return notFound();
    const min = MINIMUM_GROUP_SIZE;
    if (item.kind === "form") {
      const form = item.doc;
      const def = await publishedFormDefinition(ctx, form);
      const agg = await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", form._id)).unique();
      const summary = publicSummary(def, (agg?.counts ?? {}) as Aggregates, form.responseCount, min);
      return ok({
        itemId: item.ref, kind: "form", status: form.status,
        responseCount: summary.suppressed ? null : form.responseCount,
        suppressed: summary.suppressed, minimumGroupSize: min,
        completedCount: summary.suppressed ? null : form.responseCount,
        averageScorePercent: null,
        questions: summary.questions,
        updatedAt: form.lastResponseAt ?? form.updatedAt,
      });
    }
    const quiz = item.doc;
    const sessions = await ctx.db.query("quizSessions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).take(QUIZ_SUMMARY_SAMPLE);
    const completed = sessions.filter((s) => s.status === "completed" || (s.status === undefined && s.completedAt !== undefined));
    const suppressed = completed.length < min;
    const questions = await quizQuestionsForReporting(ctx, quiz);
    const results = [];
    if (!suppressed) {
      for (const question of questions) {
        const answers = completed.flatMap((s) => s.answers.filter((a) => a.questionId === question._id));
        const answered = answers.filter((a) => a.answer.trim()).length;
        let distribution = null;
        if (question.type !== "written" && answered >= min) {
          const counts = new Map<string, number>();
          const labels = question.options ?? [];
          for (const a of answers) {
            const picks = question.type === "multi_select" ? parseMultiAnswer(a.answer) : [a.answer.trim()];
            for (const p of picks) {
              const label = labels.find((l) => l.toLowerCase() === p.toLowerCase());
              if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
            }
          }
          distribution = suppressBuckets(labels.map((l) => ({ option: l, count: counts.get(l) ?? 0 })), min);
        }
        results.push({ fieldId: question._id, label: question.questionText, type: question.type, answeredCount: answered >= min ? answered : null, distribution });
      }
    }
    const percents = completed.filter((s) => s.totalPoints > 0).map((s) => (s.score / s.totalPoints) * 100);
    return ok({
      itemId: item.ref, kind: "quiz", status: quizStatus(quiz),
      responseCount: suppressed ? null : sessions.length,
      suppressed, minimumGroupSize: min,
      completedCount: suppressed ? null : completed.length,
      averageScorePercent: suppressed || !percents.length ? null : Math.round((percents.reduce((s, n) => s + n, 0) / percents.length) * 10) / 10,
      questions: results,
      updatedAt: Math.max(quiz.updatedAt, ...completed.map((s) => s.completedAt ?? 0)),
    });
  },
});

export const getDefinition = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number(), ref: v.string() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("definitions:read")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the definitions:read permission.");
    const item = await accessibleItem(ctx, token, args.ref);
    if (!item) return notFound();
    if (item.kind === "form") {
      const def = await publishedFormDefinition(ctx, item.doc);
      const { fields, dropped } = fromFormDefinition(def);
      return ok({ kind: "form", title: def.title, description: def.description, fields, compatibility: { dropped } });
    }
    const quiz = item.doc;
    const questions = await quizQuestionsForReporting(ctx, quiz);
    // Tokens only ever reach their owner's items, so answer keys are the owner's own.
    const { fields, dropped } = fromQuizQuestions(questions as Parameters<typeof fromQuizQuestions>[0], true);
    return ok({
      kind: "quiz",
      title: quiz.publishedSnapshot?.title ?? quiz.title,
      description: quiz.publishedSnapshot?.description ?? quiz.description ?? "",
      fields,
      compatibility: { dropped },
    });
  },
});

// ── API: writes ─────────────────────────────────────────────────────────────

/**
 * A stored result for this key (within the 24-hour retention window), replayed
 * with its original body and `Idempotent-Replayed: true`. The same key with a
 * different request is refused with 422.
 */
async function replay(ctx: MutationCtx, token: Token, key: string, requestHash: string): Promise<ApiResult | null> {
  const prior = await findIdempotent(ctx, token._id, key);
  if (!prior) return null;
  if (prior.requestHash !== requestHash) {
    return fail(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request. Use a new key for a new request.");
  }
  return { status: prior.status === 201 ? 200 : prior.status, body: JSON.parse(prior.body), headers: { "Idempotent-Replayed": "true" } };
}

async function remember(ctx: MutationCtx, token: Token, key: string, requestHash: string, result: ApiResult) {
  // Only successful results are replayed; failures can be retried with the same key.
  if (result.status >= 300) return;
  await ctx.db.insert("integrationIdempotency", { tokenId: token._id, key, requestHash, status: result.status, body: JSON.stringify(result.body), createdAt: Date.now() });
}

async function defaultPoints(ctx: MutationCtx, ownerId: string) {
  const teacher = await ctx.db.query("teacherSettings").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).first();
  const config = await ctx.db.query("globalConfig").first();
  return teacher?.defaultPointsPerQuestion ?? config?.defaultPointsPerQuestion ?? 10;
}

async function uniqueQuizSlug(ctx: MutationCtx, username: string, title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "quiz";
  for (let i = 0; i < 100; i++) {
    const slug = i ? `${base}-${i}` : base;
    const clash = await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", username).eq("slug", slug)).first();
    if (!clash) return slug;
  }
  return `${base}-${randomHex(3)}`;
}

async function createQuizDraft(ctx: MutationCtx, token: Token, body: DraftBody): Promise<{ quizId: Id<"quizzes">; warnings: string[] }> {
  const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", token.ownerId)).first();
  const username = user?.username || token.ownerId;
  const { questions, warnings } = toQuizQuestions(body, await defaultPoints(ctx, token.ownerId));
  const now = Date.now();
  await consumeCreation(ctx, token.ownerId);
  const quizId = await authorDb(ctx).insert("quizzes", {
    title: body.title,
    description: body.description || undefined,
    slug: await uniqueQuizSlug(ctx, username, body.title),
    creatorId: token.ownerId,
    creatorUsername: username,
    isPublished: false,
    tags: body.sourceLabel ? [`from:${body.sourceLabel.slice(0, 60)}`] : body.source ? [`from:${body.source.type}`] : undefined,
    timePerQuestion: 60,
    coverColor: "#22c55e",
    isElevated: user?.isElevated ?? false,
    createdAt: now,
    updatedAt: now,
  });
  for (const [order, q] of questions.entries()) await ctx.db.insert("questions", { quizId, ...q, order });
  return { quizId, warnings };
}

export const createDraft = internalMutation({
  args: { tokenId: v.id("integrationTokens"), idempotencyKey: v.string(), requestHash: v.string(), body: v.any() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, Date.now());
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("drafts:create")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the drafts:create permission.");
    const prior = await replay(ctx, token, args.idempotencyKey, args.requestHash);
    if (prior) return prior;
    const parsed = parseDraftBody(args.body);
    if ("errors" in parsed) return fail(400, "VALIDATION_FAILED", "The draft is invalid.", parsed.errors);
    const body = parsed.body;
    const sourceLabel = `${token.label}${body.sourceLabel ? `: ${body.sourceLabel}` : ""}`;
    let ref: string;
    let warnings: string[];
    try {
      if (body.kind === "form") {
        const { definition, warnings: w } = toFormDefinition(body);
        const formId = await createFormRecord(ctx, token.ownerId, definition, {
          source: { kind: "integration", label: sourceLabel, connectionId: token._id, ...(body.source && { external: body.source }) },
        });
        ref = `form_${formId}`;
        warnings = [...w, ...checkDefinition(definition).errors.map((e) => `Before publishing: ${e}`)];
      } else {
        const created = await createQuizDraft(ctx, token, body);
        ref = `quiz_${created.quizId}`;
        warnings = created.warnings;
      }
    } catch (error) {
      const { message } = errorCode(error);
      return fail(400, "VALIDATION_FAILED", message);
    }
    await ctx.db.insert("integrationCreatedItems", { tokenId: token._id, itemRef: ref, createdAt: Date.now(), source: body.source });
    await logConnectionActivity(ctx, token._id, "draft.created", ref);
    const item = (await loadItem(ctx, ref))!;
    const result = ok({ item: await itemView(ctx, token, item), warnings: [...(body.sourceWarnings ?? []), ...warnings] }, 201);
    await remember(ctx, token, args.idempotencyKey, args.requestHash, result);
    return result;
  },
});

export const updateDraft = internalMutation({
  args: { tokenId: v.id("integrationTokens"), ref: v.string(), ifMatch: v.string(), idempotencyKey: v.string(), requestHash: v.string(), body: v.any() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, Date.now());
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("drafts:update")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the drafts:update permission.");
    const prior = await replay(ctx, token, args.idempotencyKey, args.requestHash);
    if (prior) return prior;
    const item = await accessibleItem(ctx, token, args.ref);
    if (!item) return notFound();
    const current = await itemView(ctx, token, item);
    if (current.revision !== args.ifMatch.replace(/^W\//, "").replace(/"/g, "")) {
      return fail(409, "REVISION_CONFLICT", "This item changed in Chaos since you last loaded it.", { item: current });
    }
    const parsed = parseDraftBody(args.body, item.kind);
    if ("errors" in parsed) return fail(400, "VALIDATION_FAILED", "The draft is invalid.", parsed.errors);
    let warnings: string[];
    try {
      if (item.kind === "form") {
        if (item.doc.status === "archived") return fail(409, "NOT_A_DRAFT", "This form is archived.");
        const { definition, warnings: w } = toFormDefinition(parsed.body, item.doc.draft as FormDefinition);
        await replaceDraft(ctx, item.doc, definition, "integration");
        warnings = [
          ...w,
          ...(item.doc.publishedVersion !== undefined ? ["The live form is unchanged until you publish the draft in Chaos."] : []),
          ...checkDefinition(definition).errors.map((e) => `Before publishing: ${e}`),
        ];
      } else {
        const quiz = item.doc;
        const attempt = await ctx.db.query("quizSessions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).first();
        if (quiz.isPublished || quiz.publishedSnapshot || attempt) {
          return fail(409, "NOT_A_DRAFT", "This quiz has been published or has attempts; edit it in Chaos instead.");
        }
        const { questions, warnings: w } = toQuizQuestions(parsed.body, await defaultPoints(ctx, token.ownerId));
        const existing = await ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).take(1000);
        for (const q of existing) if (q.deletedAt === undefined) await ctx.db.patch("questions", q._id, { deletedAt: Date.now() });
        for (const [order, q] of questions.entries()) await ctx.db.insert("questions", { quizId: quiz._id, ...q, order });
        await authorDb(ctx).patch("quizzes", quiz._id, { title: parsed.body.title, description: parsed.body.description || undefined, updatedAt: Math.max(Date.now(), quiz.updatedAt + 1) });
        warnings = w;
      }
    } catch (error) {
      return fail(400, "VALIDATION_FAILED", errorCode(error).message);
    }
    await logConnectionActivity(ctx, token._id, "draft.updated", args.ref);
    const fresh = (await loadItem(ctx, args.ref))!;
    const result = ok({ item: await itemView(ctx, token, fresh), warnings: [...(parsed.body.sourceWarnings ?? []), ...warnings] });
    await remember(ctx, token, args.idempotencyKey, args.requestHash, result);
    return result;
  },
});

export type { QuizType };
