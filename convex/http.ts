import { observeHttp } from "../lib/backendTelemetry";
import { parseCreatedWith } from "../lib/aiClients";
import { httpRouter, makeFunctionReference } from "convex/server";
import { registerLearnIntegrationRoutes } from "./learnIntegrations";
import { registerLearnStudyIntegrationRoutes } from "./learnStudyIntegrations";
import { registerCommunityIntegrationRoutes } from "./learnCommunityHttp";
import { registerOrganizationIntegrationRoutes } from "./learnOrganizationIntegrations";
import { registerSourceRoutes } from "./learnSources";
import { ConvexError } from "convex/values";
import { env, httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ApiResult } from "./integrations";
import type { IntegrationScope } from "./integrationModel";
import { API_VERSION } from "./integrationContract";
import { errorCode, sha256Hex } from "./serverUtils";
import { UPLOAD_PATH, uploadRejection } from "./respond";

const PREFIX = "/api/integrations/";
const MAX_BODY_BYTES = 256 * 1024;

function respond(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(result.headers ?? {}) },
  });
}

function error(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): Response {
  return respond({ status, body: { error: details === undefined ? { code, message } : { code, message, details } }, headers });
}

async function readJson(request: Request): Promise<{ value: unknown; text: string } | Response> {
  const bytes = await readBoundedBody(request, (size) => size > MAX_BODY_BYTES);
  if (bytes === null) return error(400, "VALIDATION_FAILED", "The body is larger than 256 KiB.");
  const text = new TextDecoder().decode(bytes);
  try {
    return { value: JSON.parse(text), text };
  } catch {
    return error(400, "VALIDATION_FAILED", "The body is not valid JSON.");
  }
}

async function readBoundedBody(request: Request, tooLarge: (size: number) => boolean): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && tooLarge(declared)) {
    await request.body?.cancel();
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (tooLarge(size)) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** JSON with sorted object keys, so a retry that reorders keys or whitespace is the same request. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function idempotencyKey(request: Request): string | Response {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!key) return error(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header with this request.");
  if (key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) return error(400, "VALIDATION_FAILED", "Idempotency-Key must be 1–200 printable characters.");
  return key;
}

type RateState = { limit: number; remaining: number; reset: number; policy: string };

/** Per-request state: headers added to whatever response the route returns. */
type RequestState = { headers: Record<string, string>; tokenHash?: string };

function rateHeaders(rate: RateState): Record<string, string> {
  return {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(rate.reset),
    "RateLimit-Policy": rate.policy,
  };
}

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

async function authenticate(ctx: ActionCtx, request: Request, state: RequestState, scope?: IntegrationScope, operation?: string, itemRef?: string) {
  const match = /^Bearer (chaos_[a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) return error(401, "UNAUTHORIZED", "Send Authorization: Bearer <connection token>.");
  state.tokenHash = await sha256Hex(match[1]);
  const result = await ctx.runMutation(internal.integrations.authenticate, {
    tokenHash: state.tokenHash, scope, rateClass: WRITE_METHODS.has(request.method.toUpperCase()) ? "write" : "read", operation, itemRef,
  });
  if (result.rate) Object.assign(state.headers, rateHeaders(result.rate));
  if (!result.ok) {
    return error(result.status, result.code, result.message, undefined, result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined);
  }
  if (result.previousTokenExpiresAt !== null) {
    // The caller used a rotated token that still works during its grace period.
    state.headers["Chaos-Token-Expires"] = new Date(result.previousTokenExpiresAt).toISOString();
  }
  return result.tokenId;
}

const handle = httpAction(async (ctx, request) => observeHttp(ctx, "integration-api", async () => {
  const state: RequestState = { headers: {} };
  const response = await route(ctx, request, state);
  for (const [name, value] of Object.entries(state.headers)) response.headers.set(name, value);
  return response;
}));

async function route(ctx: ActionCtx, request: Request, state: RequestState): Promise<Response> {
  const url = new URL(request.url);
  const version = request.headers.get("Chaos-Api-Version");
  if (version !== null && version.trim() !== API_VERSION) return error(400, "UNSUPPORTED_VERSION", `API version ${version} is not supported. Supported: ${API_VERSION}.`);
  let segments: string[];
  try {
    segments = url.pathname.slice(PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    // Malformed percent-encoding ("%E0%A4%A") is a bad address, not a server error.
    return error(404, "NOT_FOUND", "Unknown endpoint.");
  }
  if (segments[0] !== `v${API_VERSION}`) return error(400, "UNSUPPORTED_VERSION", `Use ${PREFIX}v${API_VERSION}.`);
  const [resource, id, sub, ...extra] = segments.slice(1);
  const method = request.method.toUpperCase();
  if (extra.length) return error(404, "NOT_FOUND", "Unknown endpoint.");

  if (method === "GET" && (resource === "capabilities" || resource === "connection") && !id) {
    const tokenId = await authenticate(ctx, request, state, undefined, "connection.read");
    if (tokenId instanceof Response) return tokenId;
    return respond(await ctx.runQuery(internal.integrations.capabilities, { tokenId, now: Date.now() }));
  }

  if (method === "POST" && resource === "connection" && id === "rotate" && !sub) {
    // Any valid token may replace itself; no scope is needed to rotate.
    const tokenId = await authenticate(ctx, request, state);
    if (tokenId instanceof Response) return tokenId;
    return respond(await ctx.runMutation(internal.integrations.apiRotate, { tokenId, tokenHash: state.tokenHash! }));
  }

  if (resource === "items") {
    if (method === "GET" && !id) {
      const tokenId = await authenticate(ctx, request, state, "items:read", "items.list");
      if (tokenId instanceof Response) return tokenId;
      return respond(await ctx.runQuery(internal.integrations.listItems, {
        tokenId, now: Date.now(), kind: url.searchParams.get("kind") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined,
      }));
    }
    if (method === "GET" && id && !sub) {
      const tokenId = await authenticate(ctx, request, state, "items:read", "item.read", id);
      if (tokenId instanceof Response) return tokenId;
      return respond(await ctx.runQuery(internal.integrations.getItem, { tokenId, now: Date.now(), ref: id }));
    }
    if (method === "GET" && id && sub === "summary") {
      const tokenId = await authenticate(ctx, request, state, "summaries:read", "summary.read", id);
      if (tokenId instanceof Response) return tokenId;
      return respond(await ctx.runQuery(internal.integrations.getSummary, { tokenId, now: Date.now(), ref: id }));
    }
    if (method === "GET" && id && sub === "definition") {
      const tokenId = await authenticate(ctx, request, state, "definitions:read", "definition.read", id);
      if (tokenId instanceof Response) return tokenId;
      return respond(await ctx.runQuery(internal.integrations.getDefinition, { tokenId, now: Date.now(), ref: id }));
    }
    if (method === "PATCH" && id && !sub) {
      const tokenId = await authenticate(ctx, request, state, "drafts:update");
      if (tokenId instanceof Response) return tokenId;
      const key = idempotencyKey(request);
      if (key instanceof Response) return key;
      const ifMatch = request.headers.get("If-Match")?.trim();
      if (!ifMatch) return error(400, "VALIDATION_FAILED", "Send If-Match with the revision you edited.");
      const body = await readJson(request);
      if (body instanceof Response) return body;
      const requestHash = await sha256Hex(`PATCH ${id}\n${ifMatch}\n${canonicalJson(body.value)}`);
      return respond(await ctx.runMutation(internal.integrations.updateDraft, { tokenId, ref: id, ifMatch, idempotencyKey: key, requestHash, body: body.value }));
    }
  }

  if (resource === "webhooks") {
    const tokenId = await authenticate(ctx, request, state, "webhooks:manage", "webhooks.read");
    if (tokenId instanceof Response) return tokenId;
    if (method === "GET" && !id) return respond(await ctx.runQuery(internal.webhooks.apiListWebhooks, { tokenId, now: Date.now() }));
    if (method === "POST" && !id) {
      const key = idempotencyKey(request);
      if (key instanceof Response) return key;
      const body = await readJson(request);
      if (body instanceof Response) return body;
      const requestHash = await sha256Hex(`POST webhooks\n${canonicalJson(body.value)}`);
      return respond(await ctx.runMutation(internal.webhooks.apiCreateWebhook, { tokenId, idempotencyKey: key, requestHash, body: body.value }));
    }
    if (method === "DELETE" && id && !sub) return respond(await ctx.runMutation(internal.webhooks.apiWebhookAction, { tokenId, id, action: "delete" }));
    if (method === "POST" && id && (sub === "rotate" || sub === "test")) {
      return respond(await ctx.runMutation(internal.webhooks.apiWebhookAction, { tokenId, id, action: sub }));
    }
    return error(404, "NOT_FOUND", "Unknown endpoint.");
  }

  if (resource === "drafts" && !id && method === "POST") {
    const tokenId = await authenticate(ctx, request, state, "drafts:create");
    if (tokenId instanceof Response) return tokenId;
    const key = idempotencyKey(request);
    if (key instanceof Response) return key;
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const requestHash = await sha256Hex(`POST\n${canonicalJson(body.value)}`);
    return respond(await ctx.runMutation(internal.integrations.createDraft, { tokenId, idempotencyKey: key, requestHash, body: body.value }));
  }

  return error(404, "NOT_FOUND", "Unknown endpoint.");
}

// ── ChatGPT app (MCP) backend ────────────────────────────────────────────────
// Called only by the Next.js /mcp route after it verified the Clerk OAuth token.
// The shared secret proves the caller is that route; userId is the verified user.

async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const MCP_STATUS: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403, READ_ONLY: 403, APPROVAL_REQUIRED: 403, ACCOUNT_RESTRICTED: 403, ACCOUNT_REQUIRED: 403,
  RATE_LIMITED: 429, DRAFT_CONFLICT: 409, FORM_ARCHIVED: 409, INVALID_STATUS: 409, CONTENT_HELD: 409,
  MONTHLY_CREATION_LIMIT: 402, PRO_REQUIRED: 402,
};

const mcpHandler = httpAction(async (ctx, request) => observeHttp(ctx, "mcp", async () => {
  const secret = env.CHAOS_MCP_SECRET;
  const presented = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ?? "";
  if (!secret || secret.length < 32 || !(await sameSecret(presented, secret))) return error(401, "UNAUTHORIZED", "Unknown caller.");
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const b = body.value as { userId?: unknown; profile?: unknown; tool?: unknown; input?: unknown };
  if (typeof b?.userId !== "string" || !(/^(?:user_[A-Za-z0-9]+|oidc_[a-f0-9]{64})$/).test(b.userId) || typeof b.tool !== "string") {
    return error(400, "VALIDATION_FAILED", "userId and tool are required.");
  }
  const userId = await ctx.runQuery(internal.authIdentity.resolveTransportActor, { externalActorId: b.userId });
  const input = (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : undefined);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  const p = b.profile as { name?: unknown; email?: unknown; imageUrl?: unknown } | undefined;
  const profile = p && typeof p.email === "string" ? { name: str(p.name) ?? "", email: p.email, imageUrl: str(p.imageUrl) } : undefined;
  const createdWith = parseCreatedWith((body.value as { client?: unknown }).client);
  const stamp = async (created: unknown) => {
    const lessonId = (created as { lessonId?: unknown } | null)?.lessonId;
    if (createdWith && typeof lessonId === "string") await ctx.runMutation(internal.mcpLearn.stampCreatedWith, { userId, lessonId: lessonId as Id<"lessons">, createdWith });
  };
  try {
    await ctx.runMutation(internal.mcp.begin, { userId, profile });
    const id = str(input.id) ?? "";
    // Game arguments are optional, but malformed values must not silently
    // become defaults. Account identity always comes from the trusted envelope.
    const gameNumber = (key: string) => {
      const value = input[key];
      if (value === undefined) return undefined;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`VALIDATION_FAILED: ${key} must be a number.`);
      return value;
    };
    const gameBoolean = (key: string) => {
      const value = input[key];
      if (value === undefined) return undefined;
      if (typeof value !== "boolean") throw new Error(`VALIDATION_FAILED: ${key} must be true or false.`);
      return value;
    };
    const gameSettings = () => ({
      theme: input.theme, timeLimitSec: gameNumber("timeLimitSec"), showAnswerLabels: gameBoolean("showAnswerLabels"),
      autoAdvance: gameBoolean("autoAdvance"), breakSec: gameNumber("breakSec"), startWhenPlayers: gameNumber("startWhenPlayers"),
    });
    let result: unknown;
    switch (b.tool) {
      case "get_documentation_capabilities": result = await ctx.runQuery(makeFunctionReference<"query">("docs:mcpCapabilities"), { userId }); break;
      case "list_documentation": result = await ctx.runQuery(makeFunctionReference<"query">("docs:mcpList"), { ...input, userId }); break;
      case "save_documentation": result = await ctx.runMutation(makeFunctionReference<"mutation">("docs:mcpSave"), { ...input, userId }); break;
      case "set_form_branching": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpAdvancedForms:setBranching"), { ...input, userId }); break;
      case "get_form_advanced_analytics": result = await ctx.runQuery(makeFunctionReference<"query">("mcpFormManagement:analytics"), { ...input, userId }); break;
      case "export_form_responses": result = await ctx.runAction(makeFunctionReference<"action">("mcpFormManagement:exportArtifact"), { ...input, userId }); break;
      case "list_form_collaborators": result = await ctx.runQuery(makeFunctionReference<"query">("mcpFormManagement:collaborators"), { ...input, userId }); break;
      case "change_form_collaborator": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFormManagement:changeCollaborator"), { ...input, userId }); break;
      case "upsert_form_file_question": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpAdvancedForms:upsertFileQuestion"), { ...input, userId }); break;
      case "get_form_response_controls": result = await ctx.runQuery(makeFunctionReference<"query">("mcpAdvancedForms:getResponseControls"), { ...input, userId }); break;
      case "set_form_response_controls": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpAdvancedForms:setResponseControls"), { ...input, userId }); break;
      case "search_learn_directory": result = await ctx.runQuery(makeFunctionReference<"query">("learnCommunityIntegrations:directory"), { ...input, userId }); break;
      case "save_lesson": result = await ctx.runMutation(makeFunctionReference<"mutation">("learnCommunityIntegrations:saveLesson"), { ...input, userId }); break;
      case "fork_quiz": result = await ctx.runMutation(makeFunctionReference<"mutation">("quizForks:mcpFork"), { ...input, userId }); break;
      case "get_quiz_fork_lineage": result = await ctx.runQuery(makeFunctionReference<"query">("quizForks:mcpLineage"), { ...input, userId }); break;
      case "attach_lesson_quiz": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpAssessments:attach"), { ...input, userId }); break;
      case "get_lesson_quizzes": result = await ctx.runQuery(makeFunctionReference<"query">("mcpAssessments:list"), { ...input, userId }); break;
      case "create_lesson_live_game": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpAssessments:createLive"), { ...input, userId }); break;
      case "get_learn_capabilities": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getCapabilities"), { ...input, userId }); break;
      case "list_lesson_versions": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:listLessonVersions"), { ...input, userId }); break;
      case "get_lesson_version": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getLessonVersion"), { ...input, userId }); break;
      case "create_course": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:create"), { ...input, userId }); break;
      case "get_course": result = await ctx.runQuery(makeFunctionReference<"query">("mcpCourses:read"), { ...input, userId }); break;
      case "update_course": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:update"), { ...input, userId }); break;
      case "set_course_outline": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:setOutline"), { ...input, userId }); break;
      case "add_course_lesson": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:addLesson"), { ...input, userId }); await stamp(result); break;
      case "publish_course": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:publish"), { ...input, userId }); break;
      case "list_courses": result = await ctx.runQuery(makeFunctionReference<"query">("mcpCourses:list"), { ...input, userId }); break;
      case "set_course_archived": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:setArchived"), { ...input, userId }); break;
      case "unpublish_course": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpCourses:unpublish"), { ...input, userId }); break;
      case "list_flashcard_sets": result = await ctx.runQuery(makeFunctionReference<"query">("mcpFlashcards:list"), { ...input, userId }); break;
      case "get_flashcard_set": result = await ctx.runQuery(makeFunctionReference<"query">("mcpFlashcards:get"), { ...input, userId }); break;
      case "create_flashcard_set": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:create"), { ...input, userId }); break;
      case "save_flashcard_set": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:save"), { ...input, userId }); break;
      case "publish_flashcard_set": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:publish"), { ...input, userId }); break;
      case "set_flashcard_set_lifecycle": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:lifecycle"), { ...input, userId }); break;
      case "attach_lesson_flashcards": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:attach"), { ...input, userId }); break;
      case "detach_lesson_flashcards": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpFlashcards:detach"), { ...input, userId }); break;
      case "get_lesson_flashcards": result = await ctx.runQuery(makeFunctionReference<"query">("mcpFlashcards:listAttached"), { ...input, userId }); break;
      case "create_folder": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpOrganization:createFolder"), { ...input, userId }); break;
      case "list_folders": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listFolders"), { ...input, userId }); break;
      case "move_folder": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpOrganization:moveFolder"), { ...input, userId }); break;
      case "list_folder_contents": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listFolderContents"), { ...input, userId }); break;
      case "add_folder_member": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpOrganization:addFolderMember"), { ...input, userId }); break;
      case "list_curriculum_institutions": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listInstitutions"), { ...input, userId }); break;
      case "list_curriculum_programs": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listPrograms"), { ...input, userId }); break;
      case "list_curriculum_versions": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listVersions"), { ...input, userId }); break;
      case "list_curriculum_nodes": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listNodes"), { ...input, userId }); break;
      case "list_lesson_curriculum_mappings": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:listLessonMappings"), { ...input, userId }); break;
      case "search_curriculum_modules": result = await ctx.runQuery(makeFunctionReference<"query">("mcpOrganization:searchModules"), { ...input, userId }); break;
      case "create_lesson_curriculum_mapping": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpOrganization:createLessonMapping"), { ...input, userId }); break;
      case "search_lessons": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:listLessons"), { ...input, userId }); break;
      case "get_lesson_outline": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getLessonOutline"), { ...input, userId }); break;
      case "get_lesson_sources": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getLessonSources"), { ...input, userId }); break;
      case "add_lesson_blocks": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:addBlocks"), { ...input, userId }); break;
      case "update_lesson_blocks": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:updateBlocks"), { ...input, userId }); break;
      case "move_lesson_blocks": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:moveBlocks"), { ...input, userId }); break;
      case "delete_lesson_blocks": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:deleteBlocks"), { ...input, userId }); break;
      case "list_lessons": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:listLessons"), { ...input, userId }); break;
      case "get_lesson": result = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getLesson"), { ...input, userId }); break;
      case "create_lesson": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:createLesson"), { ...input, userId }); await stamp(result); break;
      case "save_lesson_draft": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:saveLesson"), { ...input, userId }); break;
      case "edit_lesson_blocks": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:editBlocks"), { ...input, userId }); break;
      case "publish_lesson": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:publishLesson"), { ...input, userId }); break;
      case "restore_lesson_version": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:restoreLesson"), { ...input, userId }); break;
      case "set_lesson_lifecycle": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:lifecycle"), { ...input, userId }); break;
      case "fork_lesson": result = await ctx.runMutation(makeFunctionReference<"mutation">("mcpLearn:forkLesson"), { ...input, userId }); break;
      case "get_learn_source_metadata": {
        const source = await ctx.runQuery(makeFunctionReference<"query">("mcpLearn:getSourceMetadata"), { ...input, userId });
        result = { available: source !== null, source }; break;
      }
      case "search_forms": {
        const status = str(input.status);
        const allowed = ["live", "draft", "closed", "archived", "any"] as const;
        result = await ctx.runQuery(internal.mcp.searchForms, {
          userId, query: str(input.query), limit: num(input.limit),
          status: allowed.find((s) => s === status),
        });
        break;
      }
      // Auth, Pro and rate limit already ran in begin(); the theme list itself is built by the Next.js route.
      case "list_themes": result = {}; break;
      case "get_form": result = await ctx.runQuery(internal.mcp.getForm, { userId, id }); break;
      case "get_results": result = await ctx.runQuery(internal.mcp.getResults, { userId, id }); break;
      case "list_responses": result = await ctx.runQuery(internal.mcp.listResponses, { userId, id, limit: num(input.limit), cursor: str(input.cursor) }); break;
      case "create_form": result = await ctx.runMutation(internal.mcp.createForm, { userId, input: input.form ?? input }); break;
      case "update_form": result = await ctx.runMutation(internal.mcp.updateForm, { userId, id, expectedRevision: num(input.expectedRevision), input: input.changes ?? {} }); break;
      case "publish_form": result = await ctx.runMutation(internal.mcp.publishForm, { userId, id }); break;
      case "create_game_draft": result = await ctx.runMutation(internal.mcp.createGameDraft, { userId, input: input.form ?? input }); break;
      case "list_games": {
        if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length > 2000)) return error(400, "VALIDATION_FAILED", "cursor must be text of at most 2000 characters.");
        result = await ctx.runQuery(internal.mcp.listGames, { userId, limit: gameNumber("limit"), cursor: str(input.cursor) });
        break;
      }
      case "get_game": result = await ctx.runQuery(internal.mcp.getGame, { userId, id }); break;
      case "host_game": {
        const language = input.language;
        if (language !== undefined && language !== "en" && language !== "ar") return error(400, "VALIDATION_FAILED", "language must be en or ar.");
        result = await ctx.runMutation(internal.mcp.hostGame, { userId, id, language, ...gameSettings() });
        break;
      }
      case "set_game_settings": result = await ctx.runMutation(internal.mcp.setGameSettings, { userId, id, ...gameSettings() }); break;
      case "advance_game": {
        const from = input.from;
        const questionIndex = gameNumber("questionIndex");
        if (from !== "lobby" && from !== "question" && from !== "reveal" && from !== "leaderboard") return error(400, "VALIDATION_FAILED", "from must be lobby, question, reveal or leaderboard.");
        if (questionIndex === undefined) return error(400, "VALIDATION_FAILED", "questionIndex is required; use the value from get_game.");
        result = await ctx.runMutation(internal.mcp.advanceGame, { userId, id, from, questionIndex });
        break;
      }
      case "end_game": result = await ctx.runMutation(internal.mcp.endGame, { userId, id }); break;
      case "set_form_status": {
        const action = str(input.action);
        if (action !== "close" && action !== "reopen" && action !== "archive" && action !== "restore") return error(400, "VALIDATION_FAILED", "action must be close, reopen, archive or restore.");
        result = await ctx.runMutation(internal.mcp.setFormStatus, { userId, id, action });
        break;
      }
      default: return error(404, "NOT_FOUND", "Unknown tool.");
    }
    return respond({ status: 200, body: { result } });
  } catch (caught) {
    if (["list_lesson_curriculum_mappings", "search_curriculum_modules"].includes(b.tool) && caught instanceof Error) {
      if (/ArgumentValidationError|Validator error|VALIDATION_FAILED/.test(caught.message)) return error(400, "VALIDATION_FAILED", "Invalid curriculum tool arguments.");
      if (/Lesson not found or unauthorized|Version not found/.test(caught.message)) return error(404, "NOT_FOUND", "Lesson or curriculum version not found or unauthorized.");
    }
    if (b.tool === "search_learn_directory" && caught instanceof Error && /ArgumentValidationError|Validator error|Page size|Search text|Filter does not apply|creatorMatch applies|Discovery does not support/.test(caught.message)) return error(400, "VALIDATION_FAILED", "Invalid directory search arguments.");
    if (/flashcard|^(list_courses|set_course_archived|unpublish_course)$/.test(b.tool)) {
      if (caught instanceof ConvexError && (caught.data as { code?: unknown } | null)?.code === "REVISION_CONFLICT") return error(409, "REVISION_CONFLICT", "The flashcard set changed; reload it with get_flashcard_set before editing.", { currentRevision: (caught.data as { currentRevision?: unknown }).currentRevision });
      if (caught instanceof Error && /ArgumentValidationError|Validator error/.test(caught.message)) return error(400, "VALIDATION_FAILED", "Invalid tool arguments; use IDs returned by Chaos tools.");
    }
    if (caught instanceof ConvexError && caught.data && typeof caught.data === "object" && !Array.isArray(caught.data)) {
      const data = caught.data as Record<string, unknown>;
      if (data.code === "SETTINGS_CONFLICT" || data.code === "MEMBERSHIP_CONFLICT" || data.code === "DRAFT_CONFLICT") {
        return error(409, data.code, "The asset changed; reload its current state before editing.", typeof data.currentRevision === "number" ? { currentRevision: data.currentRevision } : undefined);
      }
    }
    const learnTool = ["search_lessons", "get_lesson_outline", "get_lesson_sources", "add_lesson_blocks", "update_lesson_blocks", "move_lesson_blocks", "delete_lesson_blocks", "list_lessons", "get_lesson", "create_lesson", "save_lesson_draft", "edit_lesson_blocks", "publish_lesson", "restore_lesson_version", "set_lesson_lifecycle", "fork_lesson", "get_learn_source_metadata"].includes(b.tool);
    if (learnTool) {
      if (caught instanceof ConvexError && caught.data && typeof caught.data === "object" && !Array.isArray(caught.data)) {
        const data = caught.data as Record<string, unknown>;
        if (data.code === "REVISION_CONFLICT") return error(409, "REVISION_CONFLICT", "The lesson changed; reload before editing.", { currentRevision: data.currentRevision });
        if (data.code === "VALIDATION") return error(400, "VALIDATION_FAILED", "Invalid lesson document.", { problems: data.problems });
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/Lesson not found or unauthorized|Version not accessible|Destination block not found|Block not found/.test(message)) return error(404, "NOT_FOUND", "Lesson or block not found or unauthorized.");
      if (/Only (the )?owner/.test(message)) return error(403, "FORBIDDEN", "Only the owner may perform this action.");
      if (/Resolve moderation or archive state/.test(message)) return error(409, "INVALID_STATUS", "Resolve moderation or archive state before publishing.");
      if (/ArgumentValidationError|Validator error|Invalid lesson metadata|Version does not belong/.test(message)) return error(400, "VALIDATION_FAILED", "Invalid Learn tool arguments.");
    }
    const { code, message } = errorCode(caught);
    const status = MCP_STATUS[code] ?? (code === "ERROR" ? 500 : 400);
    if (status === 500) console.error("mcp tool failed", b.tool, caught);
    return error(status, code, status === 500 ? "Something went wrong in Chaos. Try again." : message);
  }
}));

// The single-use ticket is the credential, so any origin (including embeds) may upload.
const UPLOAD_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function uploadError(status: number, code: string, message: string): Response {
  return error(status, code, message, undefined, UPLOAD_CORS);
}

/** Respondent file upload: checks the ticket, stores the body, then records it in one step. */
const uploadHandler = httpAction(async (ctx, request) => observeHttp(ctx, "submissions", async () => {
  const url = new URL(request.url);
  const token = url.searchParams.get("ticket") ?? "";
  const name = url.searchParams.get("name") ?? "upload";
  const contentType = (request.headers.get("Content-Type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  const early = uploadRejection(contentType, Number.isFinite(declared) && declared > 0 ? declared : 1);
  if (early) {
    const { code, message } = errorCode(new Error(early));
    return uploadError(code === "UPLOAD_TOO_LARGE" ? 413 : 415, code, message);
  }
  if (!(await ctx.runQuery(internal.respond.checkUploadTicket, { token, now: Date.now() }))) {
    return uploadError(403, "UPLOAD_TICKET_INVALID", "This upload link expired. Try again.");
  }
  const bytes = await readBoundedBody(request, (size) => uploadRejection(contentType, size)?.startsWith("UPLOAD_TOO_LARGE:") === true);
  if (bytes === null) return uploadError(413, "UPLOAD_TOO_LARGE", "Files can be at most 10 MB.");
  const rejected = uploadRejection(contentType, bytes.byteLength);
  if (rejected) {
    const { code, message } = errorCode(new Error(rejected));
    return uploadError(code === "UPLOAD_TOO_LARGE" ? 413 : 400, code, message);
  }
  const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }));
  try {
    const result = await ctx.runMutation(internal.respond.recordUpload, { token, storageId, name, contentType, size: bytes.byteLength });
    return respond({ status: 200, body: result, headers: UPLOAD_CORS });
  } catch (caught) {
    // The endpoint created this file, so it is safe to remove when recording fails.
    await ctx.storage.delete(storageId);
    const { code, message } = errorCode(caught);
    return uploadError(code === "UPLOAD_TICKET_INVALID" ? 403 : 400, code, message);
  }
}));

const http = httpRouter();
// Keep auth endpoints disabled on Clerk installations.
// eslint-disable-next-line @convex-dev/no-process-env -- installation provider
if (process.env.CHAOS_AUTH_PROVIDER === "betterauth") {
  const authHandler = httpAction(async (ctx, request) => {
    const { createAuth } = await import("./betterAuth/auth");
    return createAuth(ctx).handler(request);
  });
  http.route({ pathPrefix: "/api/auth/", method: "GET", handler: authHandler });
  http.route({ pathPrefix: "/api/auth/", method: "POST", handler: authHandler });
  http.route({ path: "/.well-known/oauth-authorization-server", method: "GET", handler: authHandler });
}
http.route({ path: "/api/status/v1", method: "GET", handler: httpAction(async ctx => Response.json(await ctx.runQuery(makeFunctionReference<"query">("observability:publicStatus"), {}), { headers: { "Cache-Control": "public, max-age=30" } })) });
registerLearnIntegrationRoutes(http);
registerOrganizationIntegrationRoutes(http);
registerCommunityIntegrationRoutes(http);
registerLearnStudyIntegrationRoutes(http);
registerSourceRoutes(http);
http.route({ path: UPLOAD_PATH, method: "POST", handler: uploadHandler });
http.route({ path: UPLOAD_PATH, method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: UPLOAD_CORS })) });
http.route({ path: "/api/mcp/v1", method: "POST", handler: mcpHandler });
for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
  http.route({ pathPrefix: PREFIX, method, handler: handle });
}
export default http;
