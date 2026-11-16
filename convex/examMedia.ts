import { v } from "convex/values";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import { env, httpAction, internalQuery, query } from "./_generated/server";
import { authorizedAttempt } from "./examAnswers";
import { r2Config, signR2Request } from "../lib/r2/privateR2";

const PATH = "/learn/exam-images/content";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization" };

export const contentUrl = query({
  args: { attemptId: v.id("examAttempts"), mediaId: v.id("questionBankMedia") },
  handler: async (ctx, { attemptId, mediaId }) => {
    const { snapshot } = await authorizedAttempt(ctx, attemptId);
    if (!snapshot.questions.some(q => q.caseStudy?.media.some(m => m.mediaId === mediaId)))
      throw new Error("NOT_FOUND: Exam image not found.");
    const url = new URL(PATH, env.CONVEX_SITE_URL);
    url.searchParams.set("attemptId", attemptId); url.searchParams.set("mediaId", mediaId);
    return url.toString();
  },
});
export const getReady = internalQuery({
  args: { attemptId: v.string(), mediaId: v.string() },
  handler: async (ctx, args) => {
    const attemptId = ctx.db.normalizeId("examAttempts", args.attemptId);
    const mediaId = ctx.db.normalizeId("questionBankMedia", args.mediaId);
    if (!attemptId || !mediaId) return null;
    try {
      const { snapshot } = await authorizedAttempt(ctx, attemptId);
      const frozen = snapshot.questions.flatMap(q => q.caseStudy?.media ?? [])
        .find(m => m.mediaId === mediaId);
      const row = await ctx.db.get("questionBankMedia", mediaId);
      if (!frozen || !row || row.ownerId !== snapshot.ownerId || row.status !== "ready" ||
          row.etag !== frozen.etag || row.mimeType !== frozen.mimeType || row.bytes !== frozen.bytes) return null;
      return { key: "question-images/" + mediaId, etag: frozen.etag,
        mimeType: frozen.mimeType, bytes: frozen.bytes };
    } catch { return null; }
  },
});
const readyRef = makeFunctionReference<"query", { attemptId: string; mediaId: string },
  { key: string; etag: string; mimeType: string; bytes: number } | null>("examMedia:getReady");
export const content = httpAction(async (ctx, request) => {
  const url = new URL(request.url), attemptId = url.searchParams.get("attemptId"), mediaId = url.searchParams.get("mediaId");
  if (!attemptId || !mediaId || attemptId.length > 200 || mediaId.length > 200)
    return new Response("Not found", { status: 404, headers });
  const row = await ctx.runQuery(readyRef, { attemptId, mediaId });
  if (!row) return new Response("Not found", { status: 404, headers });
  try {
    const signed = await signR2Request(r2Config(env), "GET", row.key, { expiresSeconds: 20 });
    const upstream = await fetch(signed.url, { headers: { "If-Match": row.etag }, cache: "no-store", redirect: "error" });
    if (!upstream.ok || !upstream.body || upstream.headers.get("etag") !== row.etag)
      return new Response("Not found", { status: 404, headers });
    return new Response(upstream.body, { headers: { ...headers, "Content-Type": row.mimeType,
      "Content-Disposition": "inline", "Content-Length": String(row.bytes) } });
  } catch { return new Response("Media unavailable", { status: 503, headers }); }
});
export function registerExamMediaRoutes(http: HttpRouter) {
  http.route({ path: PATH, method: "GET", handler: content });
  http.route({ path: PATH, method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers })) });
}
