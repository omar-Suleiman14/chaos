import { v } from "convex/values";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import {
  action, env, httpAction, internalMutation, internalQuery, mutation, query,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { getAuthIdentity } from "./authIdentity";
import { consumeRate } from "./serverUtils";
import { canReadCourseAttachedLesson, hasApprovedCourseAccess } from "./courseMembership";
import { r2Config, signR2Request, validMediaSignature } from "../lib/r2/privateR2";

export const COURSE_MEDIA_CONTENT_PATH = "/learn/course-media/content";
export const COURSE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const RESERVATION_LIFETIME_MS = 15 * 60_000;
const UPLOAD_URL_SECONDS = 60;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const mediaIdArg = { mediaId: v.id("courseMediaObjects") };
const signedMedia = v.object({
  key: v.string(), mimeType: v.string(), bytes: v.number(), etag: v.string(),
});
const uploadInfo = v.object({ key: v.string(), mimeType: v.string(), bytes: v.number() });
const mimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const keyFor = (mediaId: Id<"courseMediaObjects">) => "course-media/" + mediaId;

/** Doctor only, with an explicit course+lesson+immutable lesson-version binding. */
export const reserveUpload = mutation({
  args: {
    courseId: v.id("learnCollections"), lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"), mimeType: v.string(), bytes: v.number(),
  },
  returns: v.id("courseMediaObjects"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    if (!mimeTypes.has(args.mimeType) || !Number.isSafeInteger(args.bytes) ||
      args.bytes < 1 || args.bytes > COURSE_MEDIA_MAX_BYTES)
      throw new Error("Invalid course media size or MIME type");
    const [course, lesson, version] = await Promise.all([
      ctx.db.get("learnCollections", args.courseId),
      ctx.db.get("lessons", args.lessonId),
      ctx.db.get("lessonVersions", args.versionId),
    ]);
    if (!course || course.ownerId !== identity.subject || course.archived ||
      !lesson || lesson.ownerId !== identity.subject || lesson.status !== "active" ||
      !version || version.lessonId !== lesson._id ||
      !(course.lessonIds ?? course.items.filter(item => item.kind === "lesson").map(item => item.id)).includes(lesson._id))
      throw new Error("NOT_FOUND: Course lesson/version not found or unauthorized");
    await consumeRate(ctx, "course-media:reserve:" + identity.subject, 40, 60 * 60_000);
    const now = Date.now();
    return ctx.db.insert("courseMediaObjects", {
      courseId: course._id, lessonId: lesson._id, versionId: version._id,
      ownerId: identity.subject, mimeType: args.mimeType, bytes: args.bytes,
      status: "pending", createdAt: now, expiresAt: now + RESERVATION_LIFETIME_MS,
    });
  },
});

async function pendingByOwner(ctx: QueryCtx, mediaId: Id<"courseMediaObjects">) {
  const identity = await getAuthIdentity(ctx);
  if (!identity || await creatorRestricted(ctx, identity.subject)) return null;
  const row = await ctx.db.get("courseMediaObjects", mediaId);
  if (!row || row.ownerId !== identity.subject || row.status !== "pending" ||
    row.expiresAt <= Date.now()) return null;
  const [course, lesson] = await Promise.all([
    ctx.db.get("learnCollections", row.courseId),
    ctx.db.get("lessons", row.lessonId),
  ]);
  if (!course || course.ownerId !== identity.subject || course.archived ||
    !lesson || lesson.ownerId !== identity.subject || lesson.status !== "active")
    return null;
  return row;
}

/** Only trusted actions see the storage key; the browser receives an upload capability. */
export const getPending = internalQuery({
  args: mediaIdArg, returns: v.union(v.null(), uploadInfo),
  handler: async (ctx, { mediaId }) => {
    const row = await pendingByOwner(ctx, mediaId);
    return row ? { key: keyFor(row._id), mimeType: row.mimeType, bytes: row.bytes } : null;
  },
});

const getPendingRef = makeFunctionReference<
  "query", { mediaId: Id<"courseMediaObjects"> },
  { key: string; mimeType: string; bytes: number } | null
>("courseMedia:getPending");

export const getUploadTarget = action({
  args: mediaIdArg,
  returns: v.object({ url: v.string(), headers: v.object({
    "Content-Type": v.string(), "If-None-Match": v.literal("*"),
  }), expiresAt: v.number() }),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.runQuery(getPendingRef, { mediaId });
    if (!row) throw new Error("NOT_FOUND: Upload reservation expired or unauthorized");
    const signed = await signR2Request(r2Config(env), "PUT", row.key, {
      contentType: row.mimeType, expiresSeconds: UPLOAD_URL_SECONDS,
    });
    return {
      url: signed.url,
      headers: { "Content-Type": row.mimeType, "If-None-Match": "*" as const },
      expiresAt: Date.now() + UPLOAD_URL_SECONDS * 1000,
    };
  },
});

/** Internal only, called after the server checked the private bucket object. */
export const markReady = internalMutation({
  args: { ...mediaIdArg, etag: v.string() },
  returns: v.null(),
  handler: async (ctx, { mediaId, etag }) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.get("courseMediaObjects", mediaId);
    if (!row || row.ownerId !== identity.subject || row.status !== "pending" ||
      row.expiresAt <= Date.now() || !/^"[A-Za-z0-9-]{16,128}"$/.test(etag))
      throw new Error("NOT_FOUND: Upload cannot be finalized");
    await ctx.db.patch("courseMediaObjects", mediaId, { status: "ready", etag });
    return null;
  },
});
const markReadyRef = makeFunctionReference<
  "mutation", { mediaId: Id<"courseMediaObjects">; etag: string }, null
>("courseMedia:markReady");

/** R2, not the browser, attests to the bytes and ETag before publication. */
export const completeUpload = action({
  args: mediaIdArg, returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.runQuery(getPendingRef, { mediaId });
    if (!row) throw new Error("NOT_FOUND: Upload reservation expired or unauthorized");
    const config = r2Config(env);
    const head = await signR2Request(config, "HEAD", row.key, { expiresSeconds: 20 });
    const response = await fetch(head.url, { method: "HEAD", cache: "no-store", redirect: "error" });
    const etag = response.headers.get("etag") ?? "";
    const size = Number(response.headers.get("content-length"));
    const kind = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !Number.isSafeInteger(size) || size !== row.bytes ||
      kind !== row.mimeType || !/^"[A-Za-z0-9-]{16,128}"$/.test(etag))
      throw new Error("R2 object does not match the reserved upload");
    const read = await signR2Request(config, "GET", row.key, { expiresSeconds: 20 });
    const sample = await fetch(read.url, {
      headers: { "Range": "bytes=0-31", "If-Match": etag },
      cache: "no-store", redirect: "error",
    });
    if (sample.status !== 206 || !validMediaSignature(row.mimeType, new Uint8Array(await sample.arrayBuffer())))
      throw new Error("R2 object signature is invalid");
    await ctx.runMutation(markReadyRef, { mediaId, etag });
    return null;
  },
});

async function canRead(ctx: QueryCtx, row: Doc<"courseMediaObjects">) {
  if (row.status !== "ready" || !row.etag) return false;
  const identity = await getAuthIdentity(ctx);
  if (!identity || await creatorRestricted(ctx, row.ownerId) ||
    await creatorRestricted(ctx, identity.subject)) return false;
  if (identity.subject === row.ownerId) return true;
  const course = await ctx.db.get("learnCollections", row.courseId);
  if (!course || course.ownerId !== row.ownerId || course.archived ||
    course.communityState === "hidden" || course.communityState === "removed" ||
    !course.publishedVersionId) return false;
  const published = await ctx.db.get("collectionVersions", course.publishedVersionId);
  if (!published || published.collectionId !== course._id ||
    !published.items.some(item =>
      item.kind === "lesson" && item.id === row.lessonId && item.versionId === row.versionId))
    return false;
  return await hasApprovedCourseAccess(ctx, course._id, identity.subject) &&
    await canReadCourseAttachedLesson(ctx, row.ownerId, row.lessonId, identity.subject);
}

export const getContentUrl = query({
  args: mediaIdArg, returns: v.union(v.null(), v.string()),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.db.get("courseMediaObjects", mediaId);
    if (!row || !(await canRead(ctx, row))) return null;
    const url = new URL(COURSE_MEDIA_CONTENT_PATH, env.CONVEX_SITE_URL);
    url.searchParams.set("mediaId", mediaId);
    return url.toString();
  },
});

export const getReady = internalQuery({
  args: { id: v.string() }, returns: v.union(v.null(), signedMedia),
  handler: async (ctx, { id }) => {
    const mediaId = ctx.db.normalizeId("courseMediaObjects", id);
    if (!mediaId) return null;
    const row = await ctx.db.get("courseMediaObjects", mediaId);
    return row && (await canRead(ctx, row))
      ? { key: keyFor(mediaId), mimeType: row.mimeType, bytes: row.bytes, etag: row.etag! }
      : null;
  },
});
const getReadyRef = makeFunctionReference<
  "query", { id: string },
  { key: string; mimeType: string; bytes: number; etag: string } | null
>("courseMedia:getReady");

/** Re-authorize every read. Never redirect a client to a presigned R2 GET. */
export const content = httpAction(async (ctx, request) => {
  const id = new URL(request.url).searchParams.get("mediaId");
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
  if (!id || id.length > 200) return new Response("Not found", { status: 404, headers: cors });
  const row = await ctx.runQuery(getReadyRef, { id });
  if (!row) return new Response("Not found", { status: 404, headers: cors });
  try {
    const signed = await signR2Request(r2Config(env), "GET", row.key, { expiresSeconds: 20 });
    const upstream = await fetch(signed.url, {
      headers: { "If-Match": row.etag }, cache: "no-store", redirect: "error",
    });
    if (!upstream.ok || !upstream.body || upstream.headers.get("etag") !== row.etag)
      return new Response("Not found", { status: 404, headers: cors });
    return new Response(upstream.body, {
      headers: {
        ...cors, "Content-Type": row.mimeType,
        "Content-Disposition": row.mimeType === "application/pdf" ? "attachment" : "inline",
        "Content-Length": String(row.bytes),
      },
    });
  } catch {
    return new Response("Media unavailable", { status: 503, headers: cors });
  }
});

export const preflight = httpAction(async (_ctx, request) => {
  const method = request.headers.get("Access-Control-Request-Method");
  const headers = (request.headers.get("Access-Control-Request-Headers") ?? "")
    .toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return method === "GET" && headers.every(h => h === "authorization")
    ? new Response(null, { status: 204, headers: cors })
    : new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
});

export const remove = mutation({
  args: mediaIdArg, returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.get("courseMediaObjects", mediaId);
    if (!row || row.ownerId !== identity.subject) throw new Error("NOT_FOUND: Media not found");
    if (row.status !== "removed") await ctx.db.patch("courseMediaObjects", mediaId, { status: "removed" });
    return null;
  },
});

export function registerCourseMediaRoutes(http: HttpRouter) {
  http.route({ path: COURSE_MEDIA_CONTENT_PATH, method: "GET", handler: content });
  http.route({ path: COURSE_MEDIA_CONTENT_PATH, method: "OPTIONS", handler: preflight });
}
