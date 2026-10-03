import { actorForAccount } from "./authIdentity";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import { ConvexError, v } from "convex/values";
import { httpAction, internalQuery, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { observeHttp } from "../lib/backendTelemetry";
import type { Doc, Id } from "./_generated/dataModel";
import { activeIntegrationToken, findIdempotent } from "./integrationModel";
import { sha256Hex } from "./serverUtils";
import { assembleForActor, contextSelection } from "./learnContext";
import { studyTarget, readStudyProgress, startStudySession, completeStudyBlocks } from "./learnProgressServices";

type Ctx = QueryCtx | MutationCtx;
type Result = { status: number; body: unknown; headers?: Record<string, string> };
const resultValidator = v.object({ status: v.number(), body: v.any(), headers: v.optional(v.record(v.string(), v.string())) });
const fail = (status: number, code: string, message: string): Result => ({ status, body: { error: { code, message } } });
function caught(error: unknown): Result {
  if (error instanceof ConvexError) return { status: 409, body: { error: error.data } };
  return fail(400, "VALIDATION_FAILED", error instanceof Error ? error.message : "Invalid request");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Issuer is deployment configuration, never supplied by a client. Fail closed if absent. */
async function trustedActor(ctx: Ctx, subject: string) {
  return actorForAccount(ctx, subject);
}
async function selected(ctx: Ctx, token: Doc<"integrationTokens">, ref: string) {
  return token.itemRefs.includes(ref) || !!await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", ref)).unique();
}
async function authorize(ctx: Ctx, tokenId: Id<"integrationTokens">, lessonId: Id<"lessons">, scope: string) {
  const token = await activeIntegrationToken(ctx, tokenId, Date.now());
  if (!token) return fail(401, "TOKEN_REVOKED", "Connection revoked or expired");
  if (!token.scopes.some(value => value === scope)) return fail(403, "INSUFFICIENT_SCOPE", `Requires ${scope}`);
  const lesson = await ctx.db.get("lessons", lessonId);
  if (!lesson || lesson.ownerId !== token.ownerId || !await selected(ctx, token, `lesson_${lessonId}`)) return fail(404, "NOT_FOUND", "Lesson is not selected for this connection");
  return token;
}
const base = { tokenId: v.id("integrationTokens"), ...studyTarget.fields };
export const getProgress = internalQuery({ args: base, returns: resultValidator, handler: async (ctx, args): Promise<Result> => {
  const token = await authorize(ctx, args.tokenId, args.lessonId, "progress:read"); if ("status" in token) return token;
  try {
    const state = await readStudyProgress(ctx, await trustedActor(ctx, token.ownerId), args);
    return { status: 200, body: { progress: state ? { sessionSeq: state.sessionSeq, writeSeq: state.writeSeq, completedBlockIds: state.completedBlocks, updatedAt: state.updatedAt } : null } };
  } catch (error) { return caught(error); }
} });
const writeOperation = v.union(v.object({ action: v.literal("start") }), v.object({ action: v.literal("complete"), sessionSeq: v.number(), writeSeq: v.number(), blockIds: v.array(v.string()) }));
export const writeProgress = internalMutation({ args: { ...base, idempotencyKey: v.string(), operation: writeOperation }, returns: resultValidator, handler: async (ctx, args): Promise<Result> => {
  const token = await authorize(ctx, args.tokenId, args.lessonId, "progress:write"); if ("status" in token) return token;
  if (!/^[\x21-\x7e]{1,200}$/.test(args.idempotencyKey)) return fail(400, "VALIDATION_FAILED", "Invalid Idempotency-Key");
  try {
    const actor = await trustedActor(ctx, token.ownerId);
    // Revalidate the target before every replay, including stale draft revisions.
    await readStudyProgress(ctx, actor, args);
    const key = `v2:progress:${args.idempotencyKey}`;
    const requestHash = await sha256Hex(canonical({ lessonId: args.lessonId, versionId: args.versionId ?? null, revision: args.revision ?? null, operation: args.operation }));
    const prior = await findIdempotent(ctx, token._id, key);
    if (prior) {
      if (prior.requestHash !== requestHash) return fail(422, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different request");
      return { status: prior.status, body: JSON.parse(prior.body), headers: { "Idempotent-Replayed": "true" } };
    }
    const target = { lessonId: args.lessonId, versionId: args.versionId, revision: args.revision };
    const body = args.operation.action === "start" ? { sessionSeq: await startStudySession(ctx, actor, target), writeSeq: 0 } : await completeStudyBlocks(ctx, actor, { ...target, ...args.operation });
    await ctx.db.insert("integrationIdempotency", { tokenId: token._id, key, requestHash, status: 200, body: JSON.stringify(body), createdAt: Date.now() });
    return { status: 200, body };
  } catch (error) { return caught(error); }
} });
export const getContext = internalQuery({ args: { tokenId: v.id("integrationTokens"), ...contextSelection.fields }, returns: resultValidator, handler: async (ctx, args): Promise<Result> => {
  const token = await authorize(ctx, args.tokenId, args.lessonId, "tutor:context"); if ("status" in token) return token;
  if (args.includeCurriculum && !token.scopes.includes("curricula:read")) return fail(403, "INSUFFICIENT_SCOPE", "Curriculum inclusion requires curricula:read");
  if (args.includeMyProgress && !token.scopes.includes("progress:read")) return fail(403, "INSUFFICIENT_SCOPE", "Progress inclusion requires progress:read");
  if (args.sourceIds.length && !token.scopes.includes("sources:read")) return fail(403, "INSUFFICIENT_SCOPE", "Sources require sources:read");
  for (const id of args.sourceIds) if (!await selected(ctx, token, `source_${id}`)) return fail(404, "NOT_FOUND", "Source is not selected");
  try { return { status: 200, body: await assembleForActor(ctx, await trustedActor(ctx, token.ownerId), args) }; }
  catch (error) { return caught(error); }
} });

function respond(result: Result) { return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Chaos-Api-Version": "2", ...result.headers } }); }
async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); if (!reader) throw new Error("Send a JSON body");
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 60_000) { await reader.cancel(); throw new Error("Body exceeds 60000 bytes"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Send a JSON object");
  return body as Record<string, unknown>;
}
// These typed references require no edits to generated bindings or the parent router.
const authenticate = makeFunctionReference<"mutation">("integrations:authenticate");
const progressRead = makeFunctionReference<"query">("learnStudyIntegrations:getProgress");
const progressWrite = makeFunctionReference<"mutation">("learnStudyIntegrations:writeProgress");
const contextRead = makeFunctionReference<"query">("learnStudyIntegrations:getContext");
export const studyIntegrationHandler = httpAction(async (ctx, request) => observeHttp(ctx, "integration-api", async () => {
  const url = new URL(request.url), isContext = url.pathname === "/api/integrations/v2/context/assemble";
  const progressRef = /^\/api\/integrations\/v2\/progress\/(lesson_[^/]+)$/.exec(url.pathname)?.[1];
  if (!(isContext && request.method === "POST") && !(progressRef && ["GET", "POST"].includes(request.method))) return respond(fail(404, "NOT_FOUND", "Unknown endpoint"));
  if (request.headers.has("Chaos-Api-Version") && request.headers.get("Chaos-Api-Version") !== "2") return respond(fail(400, "UNSUPPORTED_VERSION", "Use API version 2"));
  const bearer = /^Bearer (chaos_[a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!bearer) return respond(fail(401, "UNAUTHORIZED", "Send a connection bearer token"));
  const scope = isContext ? "tutor:context" : request.method === "GET" ? "progress:read" : "progress:write";
  const auth = await ctx.runMutation(authenticate, { tokenHash: await sha256Hex(bearer[1]), scope, rateClass: request.method === "GET" || isContext ? "read" : "write", operation: `v2.${scope}`, itemRef: progressRef });
  if (!auth.ok) return respond(fail(auth.status, auth.code, auth.message));
  try {
    if (isContext) {
      if (url.search) throw new Error("Context accepts no query parameters");
      const body = await boundedJson(request);
      if (Object.keys(body).some(k => !Object.hasOwn(contextSelection.fields, k))) throw new Error("Unknown context field");
      return respond(await ctx.runQuery(contextRead, { ...body, tokenId: auth.tokenId }));
    }
    const lessonId = progressRef!.slice(7);
    if (request.method === "GET") {
      if ([...url.searchParams.keys()].some(k => !["versionId", "revision"].includes(k)) || ["versionId", "revision"].some(k => url.searchParams.getAll(k).length > 1)) throw new Error("Unknown or duplicate parameter");
      return respond(await ctx.runQuery(progressRead, { tokenId: auth.tokenId, lessonId, versionId: url.searchParams.get("versionId") ?? undefined, revision: url.searchParams.has("revision") ? Number(url.searchParams.get("revision")) : undefined }));
    }
    if (url.search) throw new Error("Progress writes accept no query parameters");
    const body = await boundedJson(request);
    if (Object.keys(body).some(k => !["versionId", "revision", "operation"].includes(k))) throw new Error("Unknown progress field");
    return respond(await ctx.runMutation(progressWrite, { ...body, lessonId, tokenId: auth.tokenId, idempotencyKey: request.headers.get("Idempotency-Key") ?? "" }));
  } catch (error) { return respond(caught(error)); }
}));
export function registerLearnStudyIntegrationRoutes(http: HttpRouter) {
  for (const method of ["GET", "POST"] as const) http.route({ pathPrefix: "/api/integrations/v2/progress/", method, handler: studyIntegrationHandler });
  http.route({ pathPrefix: "/api/integrations/v2/context/", method: "POST", handler: studyIntegrationHandler });
}
