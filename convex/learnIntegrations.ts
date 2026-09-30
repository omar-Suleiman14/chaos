import { observeHttp } from "../lib/backendTelemetry";
import type { HttpRouter } from "convex/server";
import { v, ConvexError, type Infer, type GenericValidator } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { activeIntegrationToken, externalSourceValidator, findIdempotent, logConnectionActivity, type IntegrationScope } from "./integrationModel";
import { requireActiveUser } from "./authz";
import { LEARN_WRITE_LIMITS, LEARN_LIMITS, lessonDocument, lessonMeta, type LessonDocument } from "./learnModel";
import { assertDocument } from "./learnValidation";
import { createLessonForActor, saveLessonDraftForActor, editLessonBlocksForActor, lessonBlockOperation, readLessonForActor, summarizeLesson } from "./lessons";
import { errorCode, sha256Hex } from "./serverUtils";

const PREFIX = "/api/integrations/v2/";
const MAX_BODY_BYTES = 350_000;
type Ctx = QueryCtx | MutationCtx;
type Token = Doc<"integrationTokens">;
export type LearnApiResult = { status: number; body: unknown; headers?: Record<string, string> };
const resultValidator = v.object({ status: v.number(), body: v.any(), headers: v.optional(v.record(v.string(), v.string())) });
const ok = (body: unknown, status = 200): LearnApiResult => ({ status, body });
const fail = (status: number, code: string, message: string): LearnApiResult => ({ status, body: { error: { code, message } } });
const missing = () => fail(404, "NOT_FOUND", "This asset does not exist or is not selected for this connection.");
const base = { tokenId: v.id("integrationTokens"), now: v.number() };
const IMPLEMENTED_SCOPES = ["lessons:read", "lessons:create", "lessons:update", "sources:read", "folders:read", "folders:update", "curricula:read", "curricula:map", "community:read", "community:save", "community:fork", "progress:read", "progress:write", "tutor:context"] as const;

/** Native owner selection, separate from bearer API access. Non-lesson grants are preserved. */
export const setLessonSelection = mutation({
  args: { tokenId: v.id("integrationTokens"), lessonIds: v.array(v.id("lessons")) },
  returns: v.object({ lessonRefs: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await activeIntegrationToken(ctx, args.tokenId, Date.now());
    if (!token || token.ownerId !== identity.subject) throw new Error("NOT_FOUND: Active connection not found or unauthorized.");
    if (!token.scopes.some(scope => scope === "lessons:read" || scope === "lessons:update")) throw new Error("INSUFFICIENT_SCOPE: Select lessons only for a connection with lessons:read or lessons:update.");
    if (args.lessonIds.length > 500) throw new Error("VALIDATION_FAILED: Select at most 500 lessons.");
    const lessonIds = [...new Set(args.lessonIds)];
    for (const id of lessonIds) {
      const lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.ownerId !== identity.subject) throw new Error("NOT_FOUND: Selected lesson not found or unauthorized.");
    }
    const lessonRefs = lessonIds.map(id => `lesson_${id}`);
    const itemRefs = [...token.itemRefs.filter(ref => !ref.startsWith("lesson_")), ...lessonRefs];
    if (itemRefs.length > 500) throw new Error("VALIDATION_FAILED: Share at most 500 assets with one connection.");
    await ctx.db.patch("integrationTokens", token._id, { itemRefs });
    await logConnectionActivity(ctx, token._id, "lesson.selection_updated");
    return { lessonRefs };
  },
});

async function authorize(ctx: Ctx, tokenId: Id<"integrationTokens">, now: number, scope?: IntegrationScope): Promise<Token | LearnApiResult> {
  const token = await activeIntegrationToken(ctx, tokenId, now);
  if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked or has expired.");
  if (scope && !token.scopes.includes(scope)) return fail(403, "INSUFFICIENT_SCOPE", `This connection needs ${scope}.`);
  return token;
}

/** Explicit owner selection grants metadata references, never file bytes. */
export const setSourceSelection = mutation({
  args: { tokenId: v.id("integrationTokens"), sourceIds: v.array(v.id("learnSources")) },
  returns: v.object({ sourceRefs: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await activeIntegrationToken(ctx, args.tokenId, Date.now());
    if (!token || token.ownerId !== identity.subject) throw new Error("NOT_FOUND: Active connection not found or unauthorized.");
    if (!token.scopes.includes("sources:read")) throw new Error("INSUFFICIENT_SCOPE: Source selection requires sources:read.");
    if (args.sourceIds.length > 500) throw new Error("VALIDATION_FAILED: Select at most 500 sources.");
    const sourceRefs = [];
    for (const id of new Set(args.sourceIds)) {
      const source = await ctx.db.get("learnSources", id);
      if (!source || source.ownerId !== identity.subject || source.status !== "active") throw new Error("NOT_FOUND: Source not found or unauthorized.");
      sourceRefs.push(`source_${id}`);
    }
    const itemRefs = [...token.itemRefs.filter(ref => !ref.startsWith("source_")), ...sourceRefs];
    if (itemRefs.length > 500) throw new Error("VALIDATION_FAILED: Share at most 500 assets.");
    await ctx.db.patch("integrationTokens", token._id, { itemRefs });
    await logConnectionActivity(ctx, token._id, "source.selection_updated");
    return { sourceRefs };
  },
});

export const getSource = internalQuery({ args: { ...base, ref: v.string() }, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, args.now, "sources:read");
  if ("status" in token) return token;
  if (!args.ref.startsWith("source_") || !(await selected(ctx, token, args.ref))) return missing();
  const id = ctx.db.normalizeId("learnSources", args.ref.slice(7));
  const source = id ? await ctx.db.get("learnSources", id) : null;
  if (!source || source.ownerId !== token.ownerId || source.status !== "active") return missing();
  return ok({ source: { sourceId: source._id, metadata: source.metadata, metadataVisibility: source.metadataVisibility, contentVisibility: source.contentVisibility, createdAt: source.createdAt }, contentAccess: "not_granted" });
} });

/** Learn never inherits the v1 all-forms-and-quizzes grant. */
async function selected(ctx: Ctx, token: Token, ref: string) {
  return token.itemRefs.includes(ref) || !!(await ctx.db.query("integrationCreatedItems")
    .withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", ref)).unique());
}
async function accessibleLesson(ctx: Ctx, token: Token, ref: string) {
  if (!ref.startsWith("lesson_") || !(await selected(ctx, token, ref))) return null;
  const id = ctx.db.normalizeId("lessons", ref.slice(7));
  const lesson = id ? await ctx.db.get("lessons", id) : null;
  return lesson?.ownerId === token.ownerId ? lesson : null;
}

/** Validate JSON against the same strict shape as the native Convex contract, including IDs. */
function matches(ctx: Ctx, value: unknown, shape: GenericValidator, depth = 0): boolean {
  if (depth > 30) return false;
  switch (shape.kind) {
    case "string": return typeof value === "string";
    case "float64": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "literal": return value === shape.value;
    case "id": return typeof value === "string" && ctx.db.normalizeId(shape.tableName as TableNames, value) !== null;
    case "array": return Array.isArray(value) && value.length <= 8192 && value.every(x => matches(ctx, x, shape.element, depth + 1));
    case "union": return shape.members.some((s: GenericValidator) => matches(ctx, value, s, depth + 1));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const fields = value as Record<string, unknown>;
      return Object.keys(fields).every(k => Object.hasOwn(shape.fields, k)) && Object.entries(shape.fields as Record<string, GenericValidator>).every(([k, s]) =>
        fields[k] === undefined ? s.isOptional === "optional" : matches(ctx, fields[k], s, depth + 1));
    }
    default: return false;
  }
}
const createBody = v.object({ kind: v.literal("lesson"), metadata: lessonMeta, document: v.optional(lessonDocument), source: v.optional(externalSourceValidator) });
const updateBody = v.object({ document: lessonDocument, metadata: v.optional(lessonMeta) });
const blocksBody = v.object({ operations: v.array(lessonBlockOperation) });

/** References in imported drafts have independent ownership, selection and scope requirements. */
async function referenceProblem(ctx: Ctx, token: Token, document: LessonDocument): Promise<LearnApiResult | null> {
  if (document.blocks.length > LEARN_LIMITS.blocks || document.blocks.some(block => block.citations.length > 20 || block.conceptIds.length > 20)) return fail(400, "VALIDATION_FAILED", "The document exceeds block or citation limits.");
  const sources = new Set<Id<"learnSources">>();
  for (const block of document.blocks) {
    for (const c of block.citations) sources.add(c.sourceId);
    if (block.type === "source" || block.type === "image") sources.add(block.sourceId);
    if (block.type === "quiz") {
      const ref = `${block.asset.kind}_${block.asset.id}`;
      if (!token.scopes.includes("items:read")) return fail(403, "INSUFFICIENT_SCOPE", "Assessment references need items:read.");
      if (!(await selected(ctx, token, ref))) return missing();
      const asset = block.asset.kind === "form" ? await ctx.db.get("forms", block.asset.id) : await ctx.db.get("quizzes", block.asset.id);
      if (!asset || ("ownerId" in asset ? asset.ownerId : asset.creatorId) !== token.ownerId || ("isBanned" in asset && asset.isBanned)) return missing();
    }
  }
  if (sources.size > LEARN_LIMITS.sources) return fail(400, "VALIDATION_FAILED", "Too many referenced sources.");
  if (sources.size && !token.scopes.includes("sources:read")) return fail(403, "INSUFFICIENT_SCOPE", "Source references need sources:read.");
  for (const id of sources) {
    if (!(await selected(ctx, token, `source_${id}`))) return missing();
    const source = await ctx.db.get("learnSources", id);
    if (!source || source.ownerId !== token.ownerId || source.status !== "active") return missing();
  }
  return null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, x]) => x !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
async function requestDigest(operation: string, ref: string, revision: string, body: unknown) {
  return sha256Hex(canonical({ apiVersion: "2", operation, ref, revision, body }));
}
function validKey(key: string) { return /^[\x21-\x7e]{1,200}$/.test(key); }
async function replay(ctx: MutationCtx, token: Token, key: string, hash: string): Promise<LearnApiResult | null> {
  // A namespace prevents v1 keys and results from colliding with v2.
  const prior = await findIdempotent(ctx, token._id, `v2:${key}`);
  if (!prior) return null;
  if (prior.requestHash !== hash) return fail(422, "IDEMPOTENCY_KEY_REUSED", "Use a new key for a different request.");
  const body = JSON.parse(prior.body) as { item?: { itemRef?: string } };
  if (body.item?.itemRef && !(await accessibleLesson(ctx, token, body.item.itemRef))) return missing();
  return { status: prior.status === 201 ? 200 : prior.status, body, headers: { "Idempotent-Replayed": "true" } };
}
async function remember(ctx: MutationCtx, token: Token, key: string, hash: string, result: LearnApiResult) {
  await ctx.db.insert("integrationIdempotency", { tokenId: token._id, key: `v2:${key}`, requestHash: hash, status: result.status, body: JSON.stringify(result.body), createdAt: Date.now() });
}
async function itemView(ctx: Ctx, token: Token, lesson: Doc<"lessons">) {
  const link = await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", `lesson_${lesson._id}`)).unique();
  return { ...summarizeLesson(lesson), itemRef: `lesson_${lesson._id}`, kind: "lesson", source: link?.source ?? null, connectionId: token._id };
}
function caught(error: unknown): LearnApiResult {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data && error.data.code === "REVISION_CONFLICT")
    return fail(409, "REVISION_CONFLICT", "This lesson changed. Reload it before retrying.");
  const { code, message } = errorCode(error);
  return fail(code === "NOT_FOUND" ? 404 : 400, code === "ERROR" || code === "VALIDATION" ? "VALIDATION_FAILED" : code, message);
}

export const capabilities = internalQuery({ args: base, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, args.now);
  if ("status" in token) return token;
  return ok({ apiVersion: "2", supportedVersions: ["1", "2"], supportedKinds: ["lesson", "source", "folder", "curriculum"], scopes: token.scopes.filter(scope => IMPLEMENTED_SCOPES.some(implemented => implemented === scope)),
    availableScopes: IMPLEMENTED_SCOPES, operations: ["lesson.read", "lesson.definition", "lesson.outline", "lesson.draft_create", "lesson.draft_update", "lesson.blocks_update", "lesson.unlink", "source.metadata", "folder.list", "folder.create", "folder.move", "folder.members", "curriculum.browse", "curriculum.map", "community.search", "community.save", "community.fork", "progress.read", "progress.write", "context.assemble"],
    lessonSchemaVersion: 1, writeLimits: LEARN_WRITE_LIMITS, limits: { maxBlocks: LEARN_LIMITS.blocks, documentBytes: LEARN_LIMITS.documentBytes, maxSources: LEARN_LIMITS.sources, maxTextCharacters: LEARN_LIMITS.text, maxTitleCharacters: LEARN_LIMITS.title, maxTags: LEARN_LIMITS.tags, maxSourceFileBytes: LEARN_LIMITS.fileBytes, maxFolderDepth: LEARN_LIMITS.folderDepth, maxSelectedAssets: 500, maxReadBlocks: 100 },
    selection: "explicit", connection: { id: token._id, label: token.label } });
} });

export const getLesson = internalQuery({ args: { ...base, ref: v.string(), view: v.optional(v.union(v.literal("definition"), v.literal("outline"))), offset: v.optional(v.number()), limit: v.optional(v.number()) }, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, args.now, "lessons:read");
  if ("status" in token) return token;
  const lesson = await accessibleLesson(ctx, token, args.ref);
  if (!lesson) return missing();
  if (!args.view) return ok({ item: await itemView(ctx, token, lesson) });
  try {
    const definition = await readLessonForActor(ctx, token.ownerId, { lessonId: lesson._id, view: args.view === "outline" ? "outline" : "draft", outlineFrom: "draft", offset: args.offset, limit: args.limit });
    return ok({ item: await itemView(ctx, token, lesson), ...definition });
  } catch (e) { return caught(e); }
} });

export const createDraft = internalMutation({ args: { tokenId: base.tokenId, idempotencyKey: v.string(), body: v.any() }, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, Date.now(), "lessons:create");
  if ("status" in token) return token;
  if (!validKey(args.idempotencyKey) || !matches(ctx, args.body, createBody)) return fail(400, "VALIDATION_FAILED", "Send a valid lesson draft and Idempotency-Key; unknown fields are rejected.");
  const body = args.body as Infer<typeof createBody>;
  const document = body.document ?? { schemaVersion: 1 as const, blocks: [] };
  try { assertDocument(document); } catch (e) { return caught(e); }
  const problem = await referenceProblem(ctx, token, document);
  if (problem) return problem;
  const hash = await requestDigest("create", "", "", body);
  const prior = await replay(ctx, token, args.idempotencyKey, hash);
  if (prior) return prior;
  let lessonId: Id<"lessons">;
  try { lessonId = await createLessonForActor(ctx, token.ownerId, { metadata: body.metadata, document }); }
  catch (e) { return caught(e); }
  const itemRef = `lesson_${lessonId}`;
  await ctx.db.patch("lessons", lessonId, { externalOrigin: { connectionId: token._id, source: body.source, createdAt: Date.now() } });
  await ctx.db.insert("integrationCreatedItems", { tokenId: token._id, itemRef, source: body.source, createdAt: Date.now() });
  await logConnectionActivity(ctx, token._id, "lesson.draft_created", itemRef);
  const lesson = (await ctx.db.get("lessons", lessonId))!;
  const result = ok({ item: await itemView(ctx, token, lesson) }, 201);
  await remember(ctx, token, args.idempotencyKey, hash, result);
  return result;
} });

export const updateDraft = internalMutation({ args: { tokenId: base.tokenId, ref: v.string(), ifMatch: v.string(), idempotencyKey: v.string(), body: v.any(), blocks: v.optional(v.boolean()) }, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, Date.now(), "lessons:update");
  if ("status" in token) return token;
  const lesson = await accessibleLesson(ctx, token, args.ref);
  if (!lesson) return missing();
  if (lesson.status !== "active" || lesson.communityState !== "ok") return fail(409, "NOT_A_DRAFT", "Restore the lesson to an active state in Chaos first.");
  if (!validKey(args.idempotencyKey) || !matches(ctx, args.body, args.blocks ? blocksBody : updateBody)) return fail(400, "VALIDATION_FAILED", "Invalid body or Idempotency-Key; unknown fields are rejected.");
  const revisionText = args.ifMatch.replace(/^"(\d+)"$/, "$1");
  if (!/^\d+$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText))) return fail(400, "VALIDATION_FAILED", "If-Match must contain the lesson revision.");
  const hash = await requestDigest(args.blocks ? "blocks" : "update", args.ref, revisionText, args.body);
  // Current refs are rechecked even on a replay; a removed source grant cannot be bypassed.
  const body = args.body as Infer<typeof updateBody> & Infer<typeof blocksBody>;
  if (args.blocks && (!body.operations.length || body.operations.length > 100)) return fail(400, "VALIDATION_FAILED", "Send 1–100 block operations.");
  if (!args.blocks) { try { assertDocument(body.document); } catch (e) { return caught(e); } }
  const documents = args.blocks ? [lesson.draft, { schemaVersion: 1 as const, blocks: body.operations.flatMap(op => op.action === "append" ? op.blocks : op.action === "update" ? [op.block] : []) }] : [body.document];
  for (const document of documents) { const problem = await referenceProblem(ctx, token, document); if (problem) return problem; }
  const prior = await replay(ctx, token, args.idempotencyKey, hash);
  if (prior) return prior;
  try {
    if (args.blocks) await editLessonBlocksForActor(ctx, token.ownerId, { lessonId: lesson._id, expectedRevision: Number(revisionText), operations: body.operations });
    else await saveLessonDraftForActor(ctx, token.ownerId, { lessonId: lesson._id, expectedRevision: Number(revisionText), document: body.document, metadata: body.metadata });
  } catch (e) { return caught(e); }
  await logConnectionActivity(ctx, token._id, "lesson.draft_updated", args.ref);
  const result = ok({ item: await itemView(ctx, token, (await ctx.db.get("lessons", lesson._id))!) });
  await remember(ctx, token, args.idempotencyKey, hash, result);
  return result;
} });

/** Unlink removes the connection's grants/provenance, never the lesson or its versions. */
export const unlinkLesson = internalMutation({ args: { tokenId: base.tokenId, ref: v.string() }, returns: resultValidator, handler: async (ctx, args): Promise<LearnApiResult> => {
  const token = await authorize(ctx, args.tokenId, Date.now(), "lessons:update");
  if ("status" in token) return token;
  if (!(await accessibleLesson(ctx, token, args.ref))) return missing();
  const link = await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", args.ref)).unique();
  if (link) await ctx.db.delete("integrationCreatedItems", link._id);
  if (token.itemRefs.includes(args.ref)) await ctx.db.patch("integrationTokens", token._id, { itemRefs: token.itemRefs.filter(ref => ref !== args.ref) });
  await logConnectionActivity(ctx, token._id, "lesson.unlinked", args.ref);
  return ok({ unlinked: true, itemRef: args.ref });
} });

function respond(result: LearnApiResult) {
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Chaos-Api-Version": "2", ...result.headers } });
}
async function jsonBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new Error("VALIDATION_FAILED: Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("VALIDATION_FAILED: Send a JSON body.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("VALIDATION_FAILED: Request body is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("VALIDATION_FAILED: Send valid JSON."); }
}

export const learnIntegrationHandler = httpAction(async (ctx, request) => observeHttp(ctx, "integration-api", async () => {
  const url = new URL(request.url), method = request.method;
  if (request.headers.has("Chaos-Api-Version") && request.headers.get("Chaos-Api-Version")?.trim() !== "2") return respond(fail(400, "UNSUPPORTED_VERSION", "Use Chaos API version 2."));
  let segments: string[];
  try { segments = url.pathname.slice(PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent); }
  catch { return respond(missing()); }
  const [resource, ref, sub, ...extra] = segments;
  let scope: IntegrationScope | undefined;
  if (method === "GET" && ["capabilities", "connection"].includes(resource) && !ref) scope = undefined;
  else if (method === "GET" && ["lessons", "items"].includes(resource) && ref && (!sub || ["definition", "outline"].includes(sub)) && !extra.length) scope = "lessons:read";
  else if (method === "GET" && resource === "sources" && ref && !sub && !extra.length) scope = "sources:read";
  else if (method === "POST" && resource === "drafts" && !ref) scope = "lessons:create";
  else if (method === "PATCH" && ["lessons", "items"].includes(resource) && ref && (!sub || sub === "blocks") && !extra.length) scope = "lessons:update";
  else if (method === "DELETE" && ["lessons", "items"].includes(resource) && ref && sub === "link" && !extra.length) scope = "lessons:update";
  else return respond(missing());
  const bearer = /^Bearer (chaos_[a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!bearer) return respond(fail(401, "UNAUTHORIZED", "Send Authorization: Bearer <connection token>."));
  const auth = await ctx.runMutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(bearer[1]), scope, rateClass: method === "GET" ? "read" : "write", operation: `v2.${resource}.${method.toLowerCase()}`, itemRef: ref });
  const headers: Record<string, string> = {};
  if (auth.rate) Object.assign(headers, { "RateLimit-Limit": String(auth.rate.limit), "RateLimit-Remaining": String(auth.rate.remaining), "RateLimit-Reset": String(auth.rate.reset), "RateLimit-Policy": auth.rate.policy });
  if (!auth.ok) return respond({ ...fail(auth.status, auth.code, auth.message), headers: { ...headers, ...(auth.retryAfter ? { "Retry-After": String(auth.retryAfter) } : {}) } });
  if (auth.previousTokenExpiresAt !== null) headers["Chaos-Token-Expires"] = new Date(auth.previousTokenExpiresAt).toISOString();
  let result: LearnApiResult;
  try {
    if (method === "GET" && !ref) result = await ctx.runQuery(internal.learnIntegrations.capabilities, { tokenId: auth.tokenId, now: Date.now() });
    else if (method === "GET" && resource === "sources") {
      result = url.search ? fail(400, "VALIDATION_FAILED", "Source metadata does not accept query parameters.") : await ctx.runQuery(internal.learnIntegrations.getSource, { tokenId: auth.tokenId, now: Date.now(), ref });
    } else if (method === "GET") {
      if ([...url.searchParams.keys()].some(k => !["offset", "limit"].includes(k)) || ["offset", "limit"].some(k => url.searchParams.getAll(k).length > 1)) result = fail(400, "VALIDATION_FAILED", "Unknown or duplicate query parameter.");
      else result = await ctx.runQuery(internal.learnIntegrations.getLesson, { tokenId: auth.tokenId, now: Date.now(), ref, view: sub as "definition" | "outline" | undefined, offset: url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined, limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined });
    } else if (method === "DELETE") result = await ctx.runMutation(internal.learnIntegrations.unlinkLesson, { tokenId: auth.tokenId, ref });
    else {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const revision = request.headers.get("If-Match");
      if (!validKey(key)) result = fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a printable Idempotency-Key of 1–200 characters.");
      else if (method === "PATCH" && revision === null) result = fail(428, "REVISION_REQUIRED", "Send If-Match with the current lesson revision.");
      else {
        const body = await jsonBody(request);
        result = method === "POST" ? await ctx.runMutation(internal.learnIntegrations.createDraft, { tokenId: auth.tokenId, idempotencyKey: key, body }) : await ctx.runMutation(internal.learnIntegrations.updateDraft, { tokenId: auth.tokenId, ref, ifMatch: revision!, idempotencyKey: key, body, blocks: sub === "blocks" });
      }
    }
  } catch (e) { result = caught(e); }
  return respond({ ...result, headers: { ...headers, ...result.headers } });
}));

/** Parent mounts this independently of the unchanged v1 handler. */
export function registerLearnIntegrationRoutes(http: HttpRouter) {
  for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) http.route({ pathPrefix: PREFIX, method, handler: learnIntegrationHandler });
}
