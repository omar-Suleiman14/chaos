import { v } from "convex/values";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import {
  action, env, httpAction, internalMutation, internalQuery, mutation, type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { creatorRestricted, getFormIfRole, requireFormRole } from "./authz";
import { consumeRate } from "./serverUtils";
import { scheduleState } from "./formSchedule";
import { releasedFieldIds } from "./formRelease";
import type { FormDefinition } from "./formLogic";
import { r2Config, signR2Request, validMediaSignature } from "../lib/r2/privateR2";

export const FORM_IMAGE_PATH = "/forms/images/content";
export const FORM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_SECONDS = 60;
const PENDING_MS = 15 * 60_000;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const mediaIdArg = { mediaId: v.id("formImageMedia") };
const pendingInfo = v.object({ key: v.string(), mimeType: v.string(), bytes: v.number() });
const readyInfo = v.object({ key: v.string(), mimeType: v.string(), bytes: v.number(), etag: v.string() });
const keyFor = (id: Id<"formImageMedia">) => "form-images/" + id;
const cors = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

function publicUrl(id: Id<"formImageMedia">) {
  const url = new URL(FORM_IMAGE_PATH, env.CONVEX_SITE_URL);
  url.searchParams.set("mediaId", id);
  return url.toString();
}

/** A creator/editor may reserve one image for one specific form, never another owner's. */
export const reserveUpload = mutation({
  args: { formId: v.id("forms"), mimeType: v.string(), bytes: v.number() },
  returns: v.id("formImageMedia"),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "editor");
    if (form.status === "archived" || form.isBanned ||
      await creatorRestricted(ctx, form.ownerId))
      throw new Error("FORM_NOT_FOUND: This form is not available for uploading");
    if (!allowedTypes.has(args.mimeType) || !Number.isSafeInteger(args.bytes) ||
      args.bytes < 1 || args.bytes > FORM_IMAGE_MAX_BYTES)
      throw new Error("INVALID_IMAGE: PNG, JPEG or WebP, up to 5 MiB");
    await consumeRate(ctx, "form-images:reserve:" + identity.subject, 40, 60 * 60_000);
    const now = Date.now();
    return ctx.db.insert("formImageMedia", {
      formId: form._id, ownerId: form.ownerId, mimeType: args.mimeType,
      bytes: args.bytes, status: "pending", createdAt: now, expiresAt: now + PENDING_MS,
    });
  },
});

async function pending(ctx: QueryCtx, mediaId: Id<"formImageMedia">) {
  const row = await ctx.db.get("formImageMedia", mediaId);
  if (!row || row.status !== "pending" || row.expiresAt <= Date.now()) return null;
  const access = await getFormIfRole(ctx, row.formId, "editor");
  if (!access || access.form.ownerId !== row.ownerId || access.form.status === "archived" ||
    access.form.isBanned || await creatorRestricted(ctx, row.ownerId)) return null;
  return row;
}

export const getPending = internalQuery({
  args: mediaIdArg, returns: v.union(v.null(), pendingInfo),
  handler: async (ctx, { mediaId }) => {
    const row = await pending(ctx, mediaId);
    return row ? { key: keyFor(mediaId), mimeType: row.mimeType, bytes: row.bytes } : null;
  },
});
const pendingRef = makeFunctionReference<
  "query", { mediaId: Id<"formImageMedia"> },
  { key: string; mimeType: string; bytes: number } | null
>("formImageMedia:getPending");

export const getUploadTarget = action({
  args: mediaIdArg,
  returns: v.object({ url: v.string(), headers: v.object({
    "Content-Type": v.string(), "If-None-Match": v.literal("*"),
  }), expiresAt: v.number() }),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.runQuery(pendingRef, { mediaId });
    if (!row) throw new Error("NOT_FOUND: Reservation expired or unauthorized");
    const signed = await signR2Request(r2Config(env), "PUT", row.key, {
      contentType: row.mimeType, expiresSeconds: UPLOAD_URL_SECONDS,
    });
    return { url: signed.url,
      headers: { "Content-Type": row.mimeType, "If-None-Match": "*" as const },
      expiresAt: Date.now() + UPLOAD_URL_SECONDS * 1000 };
  },
});

export const markReady = internalMutation({
  args: { ...mediaIdArg, etag: v.string() },
  returns: v.null(),
  handler: async (ctx, { mediaId, etag }) => {
    const row = await ctx.db.get("formImageMedia", mediaId);
    if (!row || row.status !== "pending" || row.expiresAt <= Date.now() ||
      !/^"[A-Za-z0-9-]{16,128}"$/.test(etag))
      throw new Error("NOT_FOUND: Reservation expired");
    const { form } = await requireFormRole(ctx, row.formId, "editor");
    if (form.ownerId !== row.ownerId || form.isBanned ||
      await creatorRestricted(ctx, row.ownerId))
      throw new Error("NOT_FOUND: Form access withdrawn");
    await ctx.db.patch("formImageMedia", mediaId, { status: "ready", etag });
    return null;
  },
});
const readyRef = makeFunctionReference<
  "mutation", { mediaId: Id<"formImageMedia">; etag: string }, null
>("formImageMedia:markReady");

/** The R2 object is untrusted until HEAD + a conditional signature read succeed. */
export const completeUpload = action({
  args: mediaIdArg, returns: v.string(),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.runQuery(pendingRef, { mediaId });
    if (!row) throw new Error("NOT_FOUND: Reservation expired or unauthorized");
    const config = r2Config(env);
    const head = await signR2Request(config, "HEAD", row.key, { expiresSeconds: 20 });
    const response = await fetch(head.url, { method: "HEAD", cache: "no-store", redirect: "error" });
    const etag = response.headers.get("etag") ?? "";
    const size = Number(response.headers.get("content-length"));
    const kind = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!response.ok || size !== row.bytes || !Number.isSafeInteger(size) ||
      kind !== row.mimeType || !/^"[A-Za-z0-9-]{16,128}"$/.test(etag))
      throw new Error("R2 object does not match the reserved image");
    const read = await signR2Request(config, "GET", row.key, { expiresSeconds: 20 });
    const sample = await fetch(read.url, {
      headers: { Range: "bytes=0-31", "If-Match": etag },
      cache: "no-store", redirect: "error",
    });
    if (sample.status !== 206 ||
      !validMediaSignature(row.mimeType, new Uint8Array(await sample.arrayBuffer())))
      throw new Error("Image signature does not match MIME type");
    await ctx.runMutation(readyRef, { mediaId, etag });
    return publicUrl(mediaId);
  },
});

function referencedInQuestion(def: FormDefinition, id: Id<"formImageMedia">, now: number) {
  const url = publicUrl(id);
  const released = releasedFieldIds(def, now);
  return def.fields.some(field => released.has(field.id) && (
    field.image?.url === url ||
    field.options?.some(choice => choice.image?.url === url) ||
    field.rows?.some(row => row.image?.url === url)
  ));
}

function referencedInExplanation(def: FormDefinition, id: Id<"formImageMedia">, now: number) {
  const url = publicUrl(id);
  const released = releasedFieldIds(def, now);
  return def.quiz?.enabled && def.quiz.showAnswers !== false &&
    def.fields.some(field => released.has(field.id) && field.quiz?.explanationImage?.url === url);
}

/**
 * Publicly accessible published question/choice images only. Closed, code-protected,
 * sign-in-only, held, and unpublished content fails closed.
 * Review images additionally require the completed response's id and receipt proof.
 */
export const getReady = internalQuery({
  args: { id: v.string(), responseId: v.optional(v.string()), receiptCode: v.optional(v.string()) },
  returns: v.union(v.null(), readyInfo),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("formImageMedia", args.id);
    if (!id) return null;
    const row = await ctx.db.get("formImageMedia", id);
    if (!row || row.status !== "ready" || !row.etag) return null;
    const form = await ctx.db.get("forms", row.formId);
    if (!form || form.ownerId !== row.ownerId || form.isBanned ||
      await creatorRestricted(ctx, row.ownerId)) return null;

    // A receipt must be bound to this specific response and its immutable version.
    if (args.responseId && args.receiptCode) {
      const responseId = ctx.db.normalizeId("formResponses", args.responseId);
      const response = responseId ? await ctx.db.get("formResponses", responseId) : null;
      if (response?.formId === row.formId && response.status === "completed" &&
        response.receiptCode === args.receiptCode) {
        const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q =>
          q.eq("formId", row.formId).eq("version", response.version)).unique();
        if (version && referencedInExplanation(version.definition as FormDefinition, id, Date.now()))
          return { key: keyFor(id), mimeType: row.mimeType, bytes: row.bytes, etag: row.etag };
      }
      return null;
    }

    if (form.status !== "live" || form.settings.access !== "public" ||
      scheduleState(form.settings, Date.now()) !== "open" ||
      form.publishedVersion === undefined) return null;
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q =>
      q.eq("formId", row.formId).eq("version", form.publishedVersion!)).unique();
    if (!version || !referencedInQuestion(version.definition as FormDefinition, id, Date.now())) return null;
    return { key: keyFor(id), mimeType: row.mimeType, bytes: row.bytes, etag: row.etag };
  },
});
const getReadyRef = makeFunctionReference<
  "query", { id: string; responseId?: string; receiptCode?: string },
  { key: string; mimeType: string; bytes: number; etag: string } | null
>("formImageMedia:getReady");

export const content = httpAction(async (ctx, request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
  const params = new URL(request.url).searchParams;
  const id = params.get("mediaId");
  if (!id || id.length > 200) return new Response("Not found", { status: 404, headers: cors });
  const row = await ctx.runQuery(getReadyRef, {
    id, responseId: params.get("responseId") ?? undefined,
    receiptCode: params.get("receiptCode") ?? undefined,
  });
  if (!row) return new Response("Not found", { status: 404, headers: cors });
  try {
    const signed = await signR2Request(r2Config(env), "GET", row.key, { expiresSeconds: 20 });
    const upstream = await fetch(signed.url, {
      headers: { "If-Match": row.etag }, redirect: "error", cache: "no-store",
    });
    if (!upstream.ok || !upstream.body || upstream.headers.get("etag") !== row.etag)
      return new Response("Not found", { status: 404, headers: cors });
    return new Response(upstream.body, { headers: {
      ...cors, "Content-Type": row.mimeType, "Content-Length": String(row.bytes),
      "Content-Disposition": "inline",
    } });
  } catch {
    return new Response("Image unavailable", { status: 503, headers: cors });
  }
});

export const remove = mutation({
  args: mediaIdArg, returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.db.get("formImageMedia", mediaId);
    if (!row) throw new Error("NOT_FOUND: Image missing");
    const { form } = await requireFormRole(ctx, row.formId, "editor");
    if (form.ownerId !== row.ownerId) throw new Error("NOT_FOUND: Image missing");
    await ctx.db.patch("formImageMedia", mediaId, { status: "removed" });
    return null;
  },
});

export function registerFormImageMediaRoutes(http: HttpRouter) {
  http.route({ path: FORM_IMAGE_PATH, method: "GET", handler: content });
  http.route({ path: FORM_IMAGE_PATH, method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: cors })) });
}
