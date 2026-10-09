import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
/** Short, unambiguous random code (share ids, receipt codes). */
export function randomCode(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Fixed-window counter. Throws RATE_LIMITED when `limit` is exceeded within
 * the window. Callers use distinct keys per resource (form, token, action).
 */
async function currentRateWindow(ctx: QueryCtx | MutationCtx, key: string, windowMs: number) {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const existing = await ctx.db
    .query("rateWindows")
    .withIndex("by_key_and_windowStart", (q) => q.eq("key", key).eq("windowStart", windowStart))
    .unique();
  return { now, windowStart, existing };
}

function rateLimited(windowStart: number, windowMs: number, now: number): never {
  const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
  throw new Error(`RATE_LIMITED: Too many requests. Try again in ${retryAfter} seconds.`);
}

/** Throws RATE_LIMITED when `key` has used its budget in the current window, without spending any. */
export async function assertRateAvailable(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<void> {
  const { now, windowStart, existing } = await currentRateWindow(ctx, key, windowMs);
  if (existing && existing.count >= limit) rateLimited(windowStart, windowMs, now);
}


export async function consumeRate(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<void> {
  const { now, windowStart, existing } = await currentRateWindow(ctx, key, windowMs);
  if (existing) {
    if (existing.count >= limit) rateLimited(windowStart, windowMs, now);
    await ctx.db.patch("rateWindows", existing._id, { count: existing.count + 1 });
  } else {
    await ctx.db.insert("rateWindows", { key, windowStart, count: 1 });
  }
}

export async function displayName(ctx: QueryCtx | MutationCtx, userId: string): Promise<string> {
  const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first();
  return user?.name || user?.username || "Someone";
}

export async function logActivity(ctx: MutationCtx, formId: Id<"forms">, actorId: string, action: string, detail?: string) {
  await ctx.db.insert("formActivity", {
    formId,
    actorId,
    actorName: actorId === "integration" ? "Connected app" : actorId === "system" ? "Chaos" : await displayName(ctx, actorId),
    action,
    detail,
    at: Date.now(),
  });
}

/** Insert a notification once per dedupe key. */
export async function notify(
  ctx: MutationCtx,
  ownerId: string,
  kind: Doc<"notifications">["kind"],
  message: string,
  dedupeKey: string,
  formId?: Id<"forms">
) {
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_ownerId_and_dedupeKey", (q) => q.eq("ownerId", ownerId).eq("dedupeKey", dedupeKey))
    .first();
  if (existing) return;
  await ctx.db.insert("notifications", { ownerId, formId, kind, message, dedupeKey, createdAt: Date.now() });
}

/** Extract "CODE: message" from an Error for consistent client handling. */
export function errorCode(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/([A-Z][A-Z_]+): ([\s\S]*)/);
  return match ? { code: match[1], message: match[2].trim() } : { code: "ERROR", message: raw };
}
