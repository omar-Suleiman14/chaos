import { makeFunctionReference, type HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { observeHttp } from "../lib/backendTelemetry";
import { internal } from "./_generated/api";
import { sha256Hex } from "./serverUtils";
const response = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Chaos-Api-Version": "2" } });
export const handler = httpAction(async (ctx, request) => observeHttp(ctx, "integration-api", async () => {
  const url = new URL(request.url), op = url.pathname.slice("/api/integrations/v2/community/".length);
  const read = request.method === "GET" && ["search", "directory"].includes(op);
  if (!read && !(request.method === "POST" && ["save", "fork"].includes(op))) return response(404, { error: { code: "NOT_FOUND" } });
  const bearer = /^Bearer (chaos_[a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!bearer) return response(401, { error: { code: "UNAUTHORIZED" } });
  const auth = await ctx.runMutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(bearer[1]), scope: read ? "community:read" : op === "save" ? "community:save" : "community:fork", rateClass: read ? "read" : "write", operation: `v2.community.${op}` });
  if (!auth.ok) return response(auth.status, { error: { code: auth.code } });
  try {
    if (read) {
      if (op === "directory") {
        const allowed = ["kind", "text", "creatorMatch", "institutionId", "versionId", "limit", "cursor"];
        if ([...url.searchParams.keys()].some(k => !allowed.includes(k) || url.searchParams.getAll(k).length > 1)) throw new Error("VALIDATION_FAILED");
        const optional = Object.fromEntries(["creatorMatch", "institutionId", "versionId"].filter(k => url.searchParams.has(k)).map(k => [k, url.searchParams.get(k)]));
        const result = await ctx.runQuery(makeFunctionReference<"query">("learnCommunityIntegrations:directoryForToken"), { tokenId: auth.tokenId, kind: url.searchParams.get("kind"), text: url.searchParams.get("text") ?? "", ...optional, paginationOpts: { numItems: Number(url.searchParams.get("limit") ?? 20), cursor: url.searchParams.get("cursor") } });
        return response(200, result);
      }
      if ([...url.searchParams.keys()].some(k => !["text", "limit", "cursor"].includes(k)) || [...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length > 1)) throw new Error("VALIDATION_FAILED");
      const result = await ctx.runQuery(makeFunctionReference<"query">("learnCommunityIntegrations:searchPublic"), { tokenId: auth.tokenId, text: url.searchParams.get("text") ?? "", paginationOpts: { numItems: Number(url.searchParams.get("limit") ?? 20), cursor: url.searchParams.get("cursor") } });
      return response(200, result);
    }
    if (url.search) throw new Error("VALIDATION_FAILED");
    const reader = request.body?.getReader(); if (!reader) throw new Error("VALIDATION_FAILED");
    let size = 0, text = ""; const decoder = new TextDecoder();
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 4000) { await reader.cancel(); throw new Error("VALIDATION_FAILED"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !(op === "save" ? ["lessonId", "saved"] : ["lessonId", "versionId"]).includes(k))) throw new Error("VALIDATION_FAILED");
    const result = await ctx.runMutation(makeFunctionReference<"mutation">(op === "save" ? "learnCommunityIntegrations:savePublic" : "learnCommunityIntegrations:forkPublic"), { ...body, tokenId: auth.tokenId, ...(op === "fork" ? { idempotencyKey: request.headers.get("Idempotency-Key") ?? "" } : {}) });
    return response(op === "fork" ? 201 : 200, result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "VALIDATION_FAILED";
    const code = message.split(":")[0];
    return response(code === "TOKEN_REVOKED" ? 401 : code === "INSUFFICIENT_SCOPE" ? 403 : code === "NOT_FOUND" ? 404 : code === "IDEMPOTENCY_CONFLICT" ? 409 : 400, { error: { code: ["TOKEN_REVOKED", "INSUFFICIENT_SCOPE", "NOT_FOUND", "IDEMPOTENCY_CONFLICT"].includes(code) ? code : "VALIDATION_FAILED" } });
  }
}));
export function registerCommunityIntegrationRoutes(http: HttpRouter) {
  for (const method of ["GET", "POST"] as const) http.route({ pathPrefix: "/api/integrations/v2/community/", method, handler });
}
