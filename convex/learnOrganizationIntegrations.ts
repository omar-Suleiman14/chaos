import { makeFunctionReference, type HttpRouter } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { observeHttp } from "../lib/backendTelemetry";
import type { Id, TableNames } from "./_generated/dataModel";
import { activeIntegrationToken, findIdempotent, type IntegrationScope } from "./integrationModel";
import { createFolderForActor, listFolderForActor, moveFolderForActor, listMembersFolderForActor, addMemberFolderForActor, assetOwned, owned } from "./folderServices";
import { folderAsset } from "./folderModel";
import { createLessonMappingForActor } from "./curricula";
import { sha256Hex } from "./serverUtils";
import { canonicalJson } from "./canonicalJson";

type Ctx = QueryCtx | MutationCtx;
type Result = { status: number; body: unknown; headers?: Record<string, string> };
const result = v.object({ status: v.number(), body: v.any(), headers: v.optional(v.record(v.string(), v.string())) });
const fail = (status: number, code: string): Result => ({ status, body: { error: { code } } });
const ok = (body: unknown): Result => ({ status: 200, body });
async function authorize(ctx: Ctx, tokenId: Id<"integrationTokens">, scope: IntegrationScope, now: number) {
  const token = await activeIntegrationToken(ctx, tokenId, now);
  if (!token) throw new Error("TOKEN_REVOKED");
  if (!token.scopes.includes(scope)) throw new Error("INSUFFICIENT_SCOPE");
  return token;
}
function error(e: unknown): Result {
  const code = e instanceof Error ? e.message : "VALIDATION_FAILED";
  return fail(code === "TOKEN_REVOKED" ? 401 : code === "INSUFFICIENT_SCOPE" ? 403 : code.includes("NOT_FOUND") ? 404 : 400, code);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error("VALIDATION_FAILED");
  return value as Record<string, unknown>;
}
function id<T extends TableNames>(ctx: Ctx, table: T, value: unknown): Id<T> {
  if (typeof value !== "string") throw new Error("VALIDATION_FAILED");
  const normalized = ctx.db.normalizeId(table, value);
  if (!normalized) throw new Error("VALIDATION_FAILED");
  return normalized;
}
function nullableFolder(ctx: Ctx, value: unknown) { return value === null ? null : id(ctx, "folders", value); }
async function selected(ctx: Ctx, token: Awaited<ReturnType<typeof authorize>>, ref: string) {
  if (!token.itemRefs.includes(ref) && !(await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", ref)).unique())) throw new Error("NOT_FOUND");
}
function parseAsset(ctx: Ctx, value: unknown): Infer<typeof folderAsset> {
  const x = object(value, ["kind", "id"]);
  switch (x.kind) {
    case "form": return { kind: x.kind, id: id(ctx, "forms", x.id) };
    case "lesson": return { kind: x.kind, id: id(ctx, "lessons", x.id) };
    case "source": return { kind: x.kind, id: id(ctx, "learnSources", x.id) };
    case "collection": return { kind: x.kind, id: id(ctx, "learnCollections", x.id) };
    default: throw new Error("VALIDATION_FAILED");
  }
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== "string" || x.length > 200)) throw new Error("VALIDATION_FAILED");
  return value as string[];
}
const reads = v.union(v.literal("folders"), v.literal("contents"), v.literal("institutions"), v.literal("programs"), v.literal("versions"), v.literal("nodes"), v.literal("mappings"));
export const read = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number(), resource: reads, params: v.any() }, returns: result,
  handler: async (ctx, args): Promise<Result> => {
    try {
      const token = await authorize(ctx, args.tokenId, ["folders", "contents"].includes(args.resource) ? "folders:read" : "curricula:read", args.now);
      const fields = { folders: ["parentId"], contents: ["folderId"], institutions: [], programs: ["institutionId"], versions: ["programId"], nodes: ["versionId"], mappings: ["lessonId"] };
      const p = object(args.params, [...fields[args.resource], "cursor", "limit"]);
      const limit = p.limit === undefined ? 25 : Number(p.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (p.cursor !== undefined && typeof p.cursor !== "string")) throw new Error("VALIDATION_FAILED");
      const paginationOpts = { numItems: limit, cursor: typeof p.cursor === "string" ? p.cursor : null, maximumRowsRead: 200, maximumBytesRead: 500000 };
      switch (args.resource) {
        case "folders": return ok(await listFolderForActor(ctx, token.ownerId, { parentId: p.parentId === undefined ? null : nullableFolder(ctx, p.parentId), paginationOpts }));
        case "contents": {
          const page = await listMembersFolderForActor(ctx, token.ownerId, { folderId: id(ctx, "folders", p.folderId), paginationOpts });
          const permitted = [];
          for (const member of page.page) {
            try { await selected(ctx, token, `${member.asset.kind}_${member.asset.id}`); await assetOwned(ctx, member.asset, token.ownerId); permitted.push(member); } catch { /* Revoked/unselected memberships remain private. */ }
          }
          return ok({ ...page, page: permitted });
        }
        case "institutions": return ok(await ctx.db.query("curriculumInstitutions").withIndex("by_key").paginate(paginationOpts));
        case "programs": return ok(await ctx.db.query("curriculumPrograms").withIndex("by_institutionId_and_key", q => q.eq("institutionId", id(ctx, "curriculumInstitutions", p.institutionId))).paginate(paginationOpts));
        case "versions": return ok(await ctx.db.query("curriculumVersions").withIndex("by_programId_and_key", q => q.eq("programId", id(ctx, "curriculumPrograms", p.programId))).paginate(paginationOpts));
        case "nodes": return ok(await ctx.db.query("curriculumNodes").withIndex("by_versionId_and_key", q => q.eq("versionId", id(ctx, "curriculumVersions", p.versionId))).paginate(paginationOpts));
        case "mappings": {
          const lessonId = id(ctx, "lessons", p.lessonId);
          await selected(ctx, token, `lesson_${lessonId}`);
          if ((await ctx.db.get("lessons", lessonId))?.ownerId !== token.ownerId) throw new Error("NOT_FOUND");
          return ok(await ctx.db.query("lessonCurriculumMappings").withIndex("by_lessonId_and_nodeId", q => q.eq("lessonId", lessonId)).paginate(paginationOpts));
        }
      }
    } catch (e) { return error(e); }
  },
});
const writes = v.union(v.literal("create"), v.literal("move"), v.literal("member"), v.literal("mapping"));
export const write = internalMutation({
  args: { tokenId: v.id("integrationTokens"), operation: writes, idempotencyKey: v.string(), body: v.any() }, returns: result,
  handler: async (ctx, args): Promise<Result> => {
    try {
      const token = await authorize(ctx, args.tokenId, args.operation === "mapping" ? "curricula:map" : "folders:update", Date.now());
      if (!/^[\x21-\x7e]{1,160}$/.test(args.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
      const p = object(args.body, args.operation === "create" ? ["name", "parentId"] : args.operation === "move" ? ["folderId", "parentId"] : args.operation === "member" ? ["folderId", "asset"] : ["lessonId", "versionId", "nodeId", "conceptKeys", "blockIds"]);
      // Authorization precedes replay, including referenced assets/containers.
      if (args.operation === "create" || args.operation === "move") {
        const parentId = nullableFolder(ctx, p.parentId);
        if (parentId) await owned(ctx, parentId, token.ownerId);
      }
      if (args.operation === "move" || args.operation === "member") await owned(ctx, id(ctx, "folders", p.folderId), token.ownerId);
      if (args.operation === "member") { const asset = parseAsset(ctx, p.asset); await selected(ctx, token, `${asset.kind}_${asset.id}`); await assetOwned(ctx, asset, token.ownerId); }
      if (args.operation === "mapping") {
        const lessonId = id(ctx, "lessons", p.lessonId); await selected(ctx, token, `lesson_${lessonId}`);
        if ((await ctx.db.get("lessons", lessonId))?.ownerId !== token.ownerId) throw new Error("NOT_FOUND");
      }
      const key = `v2:organization:${args.idempotencyKey}`;
      const hash = await sha256Hex(canonicalJson({ operation: args.operation, body: p }, "organization"));
      const prior = await findIdempotent(ctx, token._id, key);
      if (prior) {
        if (prior.requestHash !== hash) return fail(422, "IDEMPOTENCY_KEY_REUSED");
        const body = JSON.parse(prior.body) as { folderId?: string; memberId?: string; mappingId?: string };
        if (body.folderId) await owned(ctx, id(ctx, "folders", body.folderId), token.ownerId);
        if (body.memberId && !(await ctx.db.get("folderMembers", id(ctx, "folderMembers", body.memberId)))) throw new Error("NOT_FOUND");
        if (body.mappingId && !(await ctx.db.get("lessonCurriculumMappings", id(ctx, "lessonCurriculumMappings", body.mappingId)))) throw new Error("NOT_FOUND");
        return { status: 200, body, headers: { "Idempotent-Replayed": "true" } };
      }
      let body: unknown;
      switch (args.operation) {
        case "create": {
          if (typeof p.name !== "string") throw new Error("VALIDATION_FAILED");
          body = { folderId: await createFolderForActor(ctx, token.ownerId, { name: p.name, parentId: nullableFolder(ctx, p.parentId) }) }; break;
        }
        case "move": { const folderId = id(ctx, "folders", p.folderId); await moveFolderForActor(ctx, token.ownerId, { folderId, parentId: nullableFolder(ctx, p.parentId) }); body = { folderId }; break; }
        case "member": body = { memberId: await addMemberFolderForActor(ctx, token.ownerId, { folderId: id(ctx, "folders", p.folderId), asset: parseAsset(ctx, p.asset) }) }; break;
        case "mapping": body = { mappingId: await createLessonMappingForActor(ctx, token.ownerId, { lessonId: id(ctx, "lessons", p.lessonId), versionId: id(ctx, "curriculumVersions", p.versionId), nodeId: id(ctx, "curriculumNodes", p.nodeId), conceptKeys: strings(p.conceptKeys), blockIds: strings(p.blockIds) }) }; break;
      }
      await ctx.db.insert("integrationIdempotency", { tokenId: token._id, key, requestHash: hash, status: 200, body: JSON.stringify(body), createdAt: Date.now() });
      return ok(body);
    } catch (e) { return error(e); }
  },
});

const readRef = makeFunctionReference<"query">("learnOrganizationIntegrations:read");
const writeRef = makeFunctionReference<"mutation">("learnOrganizationIntegrations:write");
const response = (r: Result) => new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Chaos-Api-Version": "2", ...r.headers } });
/**
 * Mount handoff (104/105): call registerOrganizationIntegrationRoutes(http) in http.ts,
 * or delegate folders/curricula to this helper before the existing v2 route parser.
 * Do not do both. No schema change/codegen is needed for routing; regenerate normal
 * Convex bindings before deployment. Capability advertising remains parent-owned.
 * GET folders [?parentId=<id>&cursor=&limit=], folders/contents ?folderId=<id>.
 * POST folders {name,parentId}, folders/move {folderId,parentId},
 * folders/members {folderId,asset:{kind,id}}. parentId is explicitly null for root.
 * GET curricula/institutions, programs ?institutionId, versions ?programId,
 * nodes ?versionId, mappings ?lessonId, each accepting cursor/limit (1..100).
 * POST curricula/mappings {lessonId,versionId,nodeId,conceptKeys,blockIds}.
 * Writes require Idempotency-Key; no publish, delete, file bytes or admin writes.
 * Folder scopes grant the owned hierarchy. Memberships and mappings additionally
 * require explicit selected or connection-created assets; legacy access=all does
 * not expand these grants. Contents list references only selected owned assets.
 */
export async function handleOrganizationIntegration(ctx: ActionCtx, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/integrations\/v2\//, "").split("/");
  const [root, sub, extra] = path;
  const resource = root === "folders" ? (sub === "contents" ? "contents" : !sub ? "folders" : undefined) : root === "curricula" && ["institutions", "programs", "versions", "nodes", "mappings"].includes(sub) ? sub : undefined;
  const operation = root === "folders" ? (!sub ? "create" : sub === "move" ? "move" : sub === "members" ? "member" : undefined) : root === "curricula" && sub === "mappings" ? "mapping" : undefined;
  const reading = request.method === "GET";
  if (extra !== undefined || (reading ? !resource : request.method !== "POST" || !operation)) return response(fail(404, "NOT_FOUND"));
  if (request.headers.has("Chaos-Api-Version") && request.headers.get("Chaos-Api-Version") !== "2") return response(fail(400, "UNSUPPORTED_VERSION"));
  const bearer = /^Bearer (chaos_[a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!bearer) return response(fail(401, "UNAUTHORIZED"));
  const scope = root === "folders" ? reading ? "folders:read" : "folders:update" : reading ? "curricula:read" : "curricula:map";
  const auth = await ctx.runMutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(bearer[1]), scope, rateClass: reading ? "read" : "write", operation: `v2.organization.${resource ?? operation}` });
  if (!auth.ok) return response({ ...fail(auth.status, auth.code), headers: auth.retryAfter ? { "Retry-After": String(auth.retryAfter) } : undefined });
  try {
    if (reading) {
      const params: Record<string, string> = {};
      for (const [key, value] of url.searchParams) { if (Object.hasOwn(params, key)) throw new Error("VALIDATION_FAILED"); params[key] = value; }
      return response(await ctx.runQuery(readRef, { tokenId: auth.tokenId, now: Date.now(), resource, params }));
    }
    if (url.search) throw new Error("VALIDATION_FAILED");
    const reader = request.body?.getReader(); if (!reader) throw new Error("VALIDATION_FAILED");
    let text = "", size = 0; const decoder = new TextDecoder();
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 32000) { await reader.cancel(); throw new Error("VALIDATION_FAILED"); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
    return response(await ctx.runMutation(writeRef, { tokenId: auth.tokenId, operation, idempotencyKey: request.headers.get("Idempotency-Key") ?? "", body: JSON.parse(text) }));
  } catch (e) { return response(error(e)); }
}
export const organizationIntegrationHandler = httpAction((ctx, request) => observeHttp(ctx, "integration-api", () => handleOrganizationIntegration(ctx, request)));
/** Only mount these when parent does not delegate. Convex chooses the longest matching prefix. */
export function registerOrganizationIntegrationRoutes(http: HttpRouter) {
  for (const method of ["GET", "POST"] as const) {
    for (const root of ["folders", "curricula"] as const) {
      http.route({ path: `/api/integrations/v2/${root}`, method, handler: organizationIntegrationHandler });
      http.route({ pathPrefix: `/api/integrations/v2/${root}/`, method, handler: organizationIntegrationHandler });
    }
  }
}
