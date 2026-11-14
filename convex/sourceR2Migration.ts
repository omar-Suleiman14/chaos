import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, env, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { consumeRate } from "./serverUtils";
import { LEARN_LIMITS } from "./learnModel";
import { validSignature } from "./learnSources";
import { r2Config, signR2Request } from "../lib/r2/privateR2";

/** Deterministic, non-guessable Convex source id; never return the R2 bucket URL. */
export const sourceR2Key = (sourceId: Id<"learnSources">) => "learn-sources/" + sourceId;
const sourceArgs = { sourceId: v.id("learnSources") };
const etagPattern = /^"[A-Za-z0-9-]{16,128}"$/;

/** A one-source migration is explicitly owner initiated. Nothing migrates on read. */
export const candidate = internalQuery({
  args: sourceArgs,
  handler: async (ctx, { sourceId }) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", sourceId);
    if (!source || source.ownerId !== identity.subject || source.status === "removed" ||
      !source.storageId || !source.sha256 || !source.contentType || !source.size ||
      source.size > LEARN_LIMITS.fileBytes)
      throw new Error("NOT_FOUND: No owned Convex source eligible for migration");
    return { storageId: source.storageId, sha256: source.sha256, bytes: source.size,
      contentType: source.contentType, ready: Boolean(source.r2) };
  },
});
const candidateRef = makeFunctionReference<"query", { sourceId: Id<"learnSources"> },
  { storageId: Id<"_storage">; sha256: string; bytes: number; contentType: string; ready: boolean }>("sourceR2Migration:candidate");

/** R2 is activated transactionally only if the original Convex source is unchanged. */
export const activate = internalMutation({
  args: { ...sourceArgs, storageId: v.id("_storage"), sha256: v.string(),
    etag: v.string(), bytes: v.number(), contentType: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", args.sourceId);
    if (!source || source.ownerId !== identity.subject || source.status === "removed" ||
      source.storageId !== args.storageId || source.sha256 !== args.sha256 ||
      source.size !== args.bytes || source.contentType !== args.contentType ||
      !etagPattern.test(args.etag))
      throw new Error("NOT_FOUND: Source changed during migration");
    if (source.r2) {
      if (source.r2.etag !== args.etag || source.r2.sha256 !== args.sha256)
        throw new Error("R2 source already has a different verified version");
      return null;
    }
    await ctx.db.patch("learnSources", source._id, { r2: {
      etag: args.etag, bytes: args.bytes, contentType: args.contentType,
      sha256: args.sha256, migratedAt: Date.now(),
    } });
    return null;
  },
});
const activateRef = makeFunctionReference<"mutation", {
  sourceId: Id<"learnSources">; storageId: Id<"_storage">; sha256: string;
  etag: string; bytes: number; contentType: string;
}, null>("sourceR2Migration:activate");

function digestHex(bytes: ArrayBuffer) {
  return crypto.subtle.digest("SHA-256", bytes).then(hash =>
    Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join(""));
}

/** Server-to-server copy, using create-only PUT and full-byte SHA-256 verification.
 * A rerun after interruption verifies the existing object instead of overwriting it. */
export const migrate = action({
  args: sourceArgs,
  returns: v.object({ migrated: v.boolean() }),
  handler: async (ctx, { sourceId }) => {
    const selected = await ctx.runQuery(candidateRef, { sourceId });
    if (selected.ready) return { migrated: false };
    // This action is opt-in and rate-limited; individual files remain <=25 MiB.
    const blob = await ctx.storage.get(selected.storageId);
    if (!blob || blob.size !== selected.bytes || (blob.type && blob.type !== selected.contentType))
      throw new Error("Legacy source bytes are missing or changed");
    const bytes = await blob.arrayBuffer();
    if (await digestHex(bytes) !== selected.sha256 ||
      !await validSignature(new Blob([bytes], { type: selected.contentType }), selected.contentType))
      throw new Error("Legacy source hash or file signature mismatch");
    const config = r2Config(env), key = sourceR2Key(sourceId);
    const put = await signR2Request(config, "PUT", key, {
      contentType: selected.contentType, expiresSeconds: 30,
    });
    const saved = await fetch(put.url, { method: "PUT", headers: put.headers,
      body: bytes, cache: "no-store", redirect: "error" });
    if (!saved.ok && saved.status !== 412 && saved.status !== 409)
      throw new Error("Private R2 copy failed");
    const head = await signR2Request(config, "HEAD", key, { expiresSeconds: 30 });
    const response = await fetch(head.url, { method: "HEAD", cache: "no-store", redirect: "error" });
    const etag = response.headers.get("etag") ?? "";
    if (!response.ok || !etagPattern.test(etag) ||
      Number(response.headers.get("content-length")) !== selected.bytes ||
      (response.headers.get("content-type") ?? "").split(";")[0] !== selected.contentType)
      throw new Error("R2 source verification failed");
    const get = await signR2Request(config, "GET", key, { expiresSeconds: 30 });
    const verified = await fetch(get.url, { headers: { "If-Match": etag },
      cache: "no-store", redirect: "error" });
    if (!verified.ok || verified.headers.get("etag") !== etag ||
      Number(verified.headers.get("content-length")) !== selected.bytes ||
      await digestHex(await verified.arrayBuffer()) !== selected.sha256)
      throw new Error("R2 bytes differ from legacy source");
    await ctx.runMutation(activateRef, { sourceId, storageId: selected.storageId,
      sha256: selected.sha256, bytes: selected.bytes,
      contentType: selected.contentType, etag });
    return { migrated: true };
  },
});

/** Rollback flips the read selector only; it deliberately never deletes bytes. */
export const rollback = mutation({
  args: sourceArgs,
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", sourceId);
    if (!source || source.ownerId !== identity.subject || !source.storageId)
      throw new Error("NOT_FOUND: Source cannot be rolled back");
    if (source.r2) await ctx.db.patch("learnSources", sourceId, { r2: undefined });
    return null;
  },
});
