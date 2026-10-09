import { getAuthIdentity } from "./authIdentity";
import { consumeRate } from "./serverUtils";
import { assertSourceStorageAvailable, changeSourceStorage, sourceUploadRateKey, SOURCE_UPLOADS_PER_HOUR, SOURCE_UPLOAD_WINDOW_MS } from "./sourceStorage";
import { observeHttp } from "../lib/backendTelemetry";
import { v, type Infer } from "convex/values";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { LEARN_LIMITS, sourceMetadata, visibility } from "./learnModel";
import { creatorRestricted, requireActiveUser } from "./authz";
import { fingerprintBytes, nearByteDuplicate, sourceFingerprint, SOURCE_SIMILARITY_LIMITS } from "./sourceFingerprint";

type Metadata = Infer<typeof sourceMetadata>;
export const SOURCE_UPLOAD_PATH = "/learn/sources/upload";
export const SOURCE_CONTENT_PATH = "/learn/sources/content";
const provenanceSummary = v.object({
  uploader: v.union(
    v.object({
      kind: v.literal("profile"),
      username: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
    v.object({ kind: v.literal("opaque"), ownerId: v.string() }),
  ),
  uploadedAt: v.number(),
  origin: v.string(),
});
const metadataResult = v.object({
  _id: v.id("learnSources"),
  metadata: sourceMetadata,
  metadataVisibility: visibility,
  contentVisibility: visibility,
  createdAt: v.number(),
  provenance: provenanceSummary,
});
// Bearer tokens are explicitly supplied by the UI; cookies/credentialed CORS are
// not supported. Wildcard origins do not bypass per-request content authorization.
const SOURCE_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Type, Content-Length, Content-Disposition",
  "Cache-Control": "no-store, private",
};
/** Mount OPTIONS on both source paths, or call registerSourceRoutes for all routes. */
export const sourcePreflight = httpAction(async (_ctx, request) => {
  if (request.method !== "OPTIONS")
    return new Response("Method not allowed", {
      status: 405,
      headers: SOURCE_CORS,
    });
  const method = request.headers.get("access-control-request-method");
  const expected =
    new URL(request.url).pathname === SOURCE_UPLOAD_PATH ? "POST" : "GET";
  const headers =
    request.headers
      .get("access-control-request-headers")
      ?.split(",")
      .map((header) => header.trim().toLowerCase()) ?? [];
  if (
    method !== expected ||
    headers.some(
      (header) => header !== "authorization" && header !== "content-type",
    )
  )
    return new Response("Unsupported preflight", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(null, { status: 204, headers: SOURCE_CORS });
});
/** Replace the existing two mounts with this helper in http.ts (do not mount twice). */
export function registerSourceRoutes(http: HttpRouter) {
  http.route({ path: SOURCE_UPLOAD_PATH, method: "POST", handler: upload });
  http.route({
    path: SOURCE_CONTENT_PATH,
    method: "GET",
    handler: downloadContent,
  });
  for (const path of [SOURCE_UPLOAD_PATH, SOURCE_CONTENT_PATH])
    http.route({ path, method: "OPTIONS", handler: sourcePreflight });
}
/* oxlint-disable eslint/no-control-regex -- Control characters are deliberately matched to sanitise untrusted text and URLs. */
function publicLabel(value: string) {
  const label = value.trim();
  // Legacy names may have been populated from email; never repeat them publicly.
  return label && label.length <= 200 && !/[@\u0000-\u001f\u007f]/.test(label)
    ? label
    : undefined;
}
/* oxlint-enable eslint/no-control-regex */
async function provenance(
  ctx: QueryCtx,
  source: Doc<"learnSources">,
): Promise<Infer<typeof provenanceSummary>> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", source.uploadedBy))
    .first();
  const username = user ? publicLabel(user.username) : undefined;
  const name = user ? publicLabel(user.name) : undefined;
  return {
    uploader:
      username || name
        ? {
            kind: "profile",
            ...(username ? { username } : {}),
            ...(name ? { name } : {}),
          }
        : { kind: "opaque", ownerId: source.ownerId },
    uploadedAt: source.createdAt,
    origin: source.metadata.origin,
  };
}
const visibilityArgs = {
  metadata: sourceMetadata,
  metadataVisibility: visibility,
  contentVisibility: visibility,
};
export const mimeKinds: Record<string, Metadata["kind"]> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "application/vnd.ms-powerpoint": "slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "slides",
  "text/plain": "file",
};
function starts(bytes: Uint8Array, signature: number[]) {
  return (
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}
function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
// Check the ZIP directory, rather than accepting every ZIP as a PowerPoint file.
function isPptx(bytes: Uint8Array): boolean {
  if (!starts(bytes, [0x50, 0x4b, 3, 4])) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (
    end < 0 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    return false;
  const count = view.getUint16(end + 10, true);
  if (!count || count > 10000 || view.getUint16(end + 8, true) !== count)
    return false;
  let offset = view.getUint32(end + 16, true);
  if (offset + view.getUint32(end + 12, true) !== end) return false;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > end ||
      view.getUint32(offset, true) !== 0x02014b50 ||
      view.getUint16(offset + 8, true) & 1
    )
      return false;
    const nameLength = view.getUint16(offset + 28, true);
    const next =
      offset +
      46 +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
    if (next > end) return false;
    const local = view.getUint32(offset + 42, true);
    if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50)
      return false;
    const name = ascii(bytes, offset + 46, nameLength);
    if (
      view.getUint16(local + 26, true) !== nameLength ||
      ascii(bytes, local + 30, nameLength) !== name
    )
      return false;
    names.add(name);
    offset = next;
  }
  return (
    offset === end &&
    names.has("[Content_Types].xml") &&
    names.has("ppt/presentation.xml")
  );
}
/* oxlint-disable eslint/no-control-regex -- Control characters are deliberately matched to sanitise untrusted text and URLs. */
export async function validSignature(
  blob: Blob,
  contentType: string,
): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  switch (contentType) {
    case "image/png":
      return starts(head, [137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg":
      return starts(head, [255, 216, 255]);
    case "image/webp":
      return (
        head.length === 16 &&
        ascii(head, 0, 4) === "RIFF" &&
        ascii(head, 8, 4) === "WEBP" &&
        ["VP8 ", "VP8L", "VP8X"].includes(ascii(head, 12, 4)) &&
        new DataView(head.buffer).getUint32(4, true) + 8 === blob.size
      );
    case "application/pdf":
      return ascii(head, 0, 5) === "%PDF-";
    case "application/vnd.ms-powerpoint":
      return starts(head, [208, 207, 17, 224, 161, 177, 26, 225]);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return isPptx(new Uint8Array(await blob.arrayBuffer()));
    case "text/plain": {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await blob.arrayBuffer(),
        );
        return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
/* oxlint-enable eslint/no-control-regex */
/* oxlint-disable eslint/no-control-regex -- Control characters are deliberately matched to sanitise untrusted text and URLs. */
function bounded(value: string, max: number) {
  if (
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error("Invalid source metadata");
}
/* oxlint-enable eslint/no-control-regex */
export function validateMetadata(metadata: Metadata) {
  bounded(metadata.title, LEARN_LIMITS.title);
  bounded(metadata.origin, 500);
  if (metadata.author !== undefined) bounded(metadata.author, 200);
  if (metadata.license !== undefined) bounded(metadata.license, 500);
  if (metadata.url !== undefined) {
    bounded(metadata.url, 2048);
    const url = new URL(metadata.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new Error("Invalid source URL");
  }
  if ((metadata.kind === "url" || metadata.kind === "video") && !metadata.url)
    throw new Error("Source URL required");
}
async function accessible(
  ctx: QueryCtx,
  sourceId: Id<"learnSources">,
  part: "metadata" | "content",
): Promise<Doc<"learnSources"> | null> {
  const source = await ctx.db.get("learnSources", sourceId);
  // Retained sources remain readable for citations already published. New
  // publication must separately require active sources rather than using this read gate.
  if (
    !source ||
    source.status === "removed" ||
    (await creatorRestricted(ctx, source.ownerId))
  )
    return null;
  const identity = await getAuthIdentity(ctx);
  if (identity && (await creatorRestricted(ctx, identity.subject))) return null;
  if (identity?.subject === source.ownerId) return source;
  const level =
    part === "metadata" ? source.metadataVisibility : source.contentVisibility;
  if (level === "public") return source;
  if (level !== "restricted" || !identity) return null;
  const grant = await ctx.db
    .query("learnSourceGrants")
    .withIndex("by_sourceId_and_userId", (q) =>
      q.eq("sourceId", sourceId).eq("userId", identity.subject),
    )
    .unique();
  return grant?.[part] ? source : null;
}
export const create = mutation({
  args: visibilityArgs,
  returns: v.id("learnSources"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    validateMetadata(args.metadata);
    if (
      args.metadata.kind !== "url" &&
      args.metadata.kind !== "reference" &&
      args.metadata.kind !== "video"
    )
      throw new Error("File sources require authenticated upload");
    return await ctx.db.insert("learnSources", {
      ...args,
      ownerId: identity.subject,
      uploadedBy: identity.subject,
      createdAt: Date.now(),
      status: "active",
    });
  },
});
export const getMetadata = query({
  args: { sourceId: v.id("learnSources") },
  returns: v.union(v.null(), metadataResult),
  handler: async (ctx, args) => {
    const source = await accessible(ctx, args.sourceId, "metadata");
    return source
      ? {
          _id: source._id,
          metadata: source.metadata,
          metadataVisibility: source.metadataVisibility,
          contentVisibility: source.contentVisibility,
          createdAt: source.createdAt,
          provenance: await provenance(ctx, source),
        }
      : null;
  },
});
/** Returns the revocable proxy route. Private/restricted content requires fetch with
 * Authorization: Bearer <Convex JWT> and credentials: "omit"; an unauthenticated
 * image/link cannot use it. Mount OPTIONS with registerSourceRoutes for browser fetch.
 */
export const getContentUrl = query({
  args: { sourceId: v.id("learnSources") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const source = await accessible(ctx, args.sourceId, "content");
    if (
      !source?.storageId ||
      !(await ctx.db.system.get("_storage", source.storageId))
    )
      return null;
    const url = new URL(SOURCE_CONTENT_PATH, env.CONVEX_SITE_URL);
    url.searchParams.set("sourceId", source._id);
    return url.toString();
  },
});
// Only the HTTP proxy may receive a storage ID. Public clients receive its route.
export const readContentStorage = internalQuery({
  args: { sourceId: v.string() },
  returns: v.union(v.null(), v.id("_storage")),
  handler: async (ctx, args) => {
    const sourceId = ctx.db.normalizeId("learnSources", args.sourceId);
    if (!sourceId) return null;
    const source = await accessible(ctx, sourceId, "content");
    return source?.storageId ?? null;
  },
});
const contentStorage = makeFunctionReference<
  "query",
  { sourceId: string },
  Id<"_storage"> | null
>("learnSources:readContentStorage");
/** Mount GET at SOURCE_CONTENT_PATH. Never redirects to a bearer storage URL. */
export const downloadContent = httpAction(async (ctx, request) => observeHttp(ctx, "source-files", async () => {
  const headers = {
    ...SOURCE_CORS,
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers });
  const sourceId = new URL(request.url).searchParams.get("sourceId");
  if (!sourceId || sourceId.length > 200)
    return new Response("Source not found", { status: 404, headers });
  const storageId: Id<"_storage"> | null = await ctx.runQuery(contentStorage, {
    sourceId,
  });
  if (!storageId)
    return new Response("Source not found", { status: 404, headers });
  const blob = await ctx.storage.get(storageId);
  if (!blob) return new Response("Source not found", { status: 404, headers });
  return new Response(blob, {
    headers: {
      ...headers,
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Disposition": "attachment",
      "Content-Length": String(blob.size),
    },
  });
}));
async function ownedSource(ctx: MutationCtx, sourceId: Id<"learnSources">) {
  const { identity } = await requireActiveUser(ctx);
  const source = await ctx.db.get("learnSources", sourceId);
  if (
    !source ||
    source.ownerId !== identity.subject ||
    source.status === "removed"
  )
    throw new Error("Source not found or unauthorized");
  return source;
}
export const update = mutation({
  args: {
    sourceId: v.id("learnSources"),
    metadata: v.optional(sourceMetadata),
    metadataVisibility: v.optional(visibility),
    contentVisibility: v.optional(visibility),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return updateSourceForActor(ctx,(await requireActiveUser(ctx)).identity.subject,args);
  },
});
/** Shared source edits; actor is checked by native auth or the MCP transport. */
export async function updateSourceForActor(ctx: MutationCtx, actor: string, args: { sourceId: Id<"learnSources">; metadata?: Metadata; metadataVisibility?: Infer<typeof visibility>; contentVisibility?: Infer<typeof visibility> }) {
    const source = await ctx.db.get("learnSources",args.sourceId);
    if(!source || source.ownerId!==actor || source.status==="removed") throw new Error("Source not found or unauthorized");
    const patch: Partial<
      Pick<
        Doc<"learnSources">,
        "metadata" | "metadataVisibility" | "contentVisibility"
      >
    > = {};
    if (args.metadata !== undefined) {
      validateMetadata(args.metadata);
      if (args.metadata.kind !== source.metadata.kind)
        throw new Error("Source kind cannot be changed");
      if (args.metadata.origin !== source.metadata.origin)
        throw new Error("Source origin cannot be changed");
      patch.metadata = args.metadata;
    }
    if (args.metadataVisibility !== undefined)
      patch.metadataVisibility = args.metadataVisibility;
    if (args.contentVisibility !== undefined)
      patch.contentVisibility = args.contentVisibility;
    await ctx.db.patch("learnSources", source._id, patch);
    return null;
}
/** Retention keeps citation access; removal revokes all access. Both preserve blobs. */
export const remove = mutation({
  args: { sourceId: v.id("learnSources"), retain: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ownedSource(ctx, args.sourceId);
    await ctx.db.patch("learnSources", source._id, {
      status: args.retain ? "retained" : "removed",
    });
    return null;
  },
});
export const setGrant = mutation({
  args: {
    sourceId: v.id("learnSources"),
    userId: v.string(),
    metadata: v.boolean(),
    content: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", args.sourceId);
    if (
      !source ||
      source.status === "removed" ||
      source.ownerId !== identity.subject
    )
      throw new Error("Source not found or unauthorized");
    bounded(args.userId, 200);
    const grant = await ctx.db
      .query("learnSourceGrants")
      .withIndex("by_sourceId_and_userId", (q) =>
        q.eq("sourceId", args.sourceId).eq("userId", args.userId),
      )
      .unique();
    if (!args.metadata && !args.content) {
      if (grant) await ctx.db.delete("learnSourceGrants", grant._id);
    } else if (grant)
      await ctx.db.patch("learnSourceGrants", grant._id, {
        metadata: args.metadata,
        content: args.content,
      });
    else await ctx.db.insert("learnSourceGrants", args);
    return null;
  },
});
// Internal only: storageId must come from upload's freshly stored blob, never a client registration API.
export const registerUpload = internalMutation({
  args: {
    ...visibilityArgs,
    storageId: v.id("_storage"),
    contentType: v.string(),
    fingerprint: v.optional(sourceFingerprint),
  },
  returns: v.object({ sourceId: v.id("learnSources"), duplicate: v.boolean(), nearDuplicateOf: v.optional(v.id("learnSources")) }),
  handler: async (ctx, args) => {
    return registerSourceUploadForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args);
  },
});
/** Shared validated registration; actor is verified by the UI or MCP transport. */
export async function registerSourceUploadForActor(ctx: MutationCtx, actor: string, args: { metadata: Metadata; metadataVisibility: Infer<typeof visibility>; contentVisibility: Infer<typeof visibility>; storageId: Id<"_storage">; contentType: string; fingerprint?: Infer<typeof sourceFingerprint> }) {
    // Bounds how fast one account can add files (each up to 25 MB); a refused upload's file is deleted by the caller.
    await consumeRate(ctx, sourceUploadRateKey(actor), SOURCE_UPLOADS_PER_HOUR, SOURCE_UPLOAD_WINDOW_MS);
    validateMetadata(args.metadata);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (
      !file ||
      file.size === 0 ||
      file.size > LEARN_LIMITS.fileBytes ||
      (file.contentType !== undefined &&
        file.contentType !== args.contentType) ||
      mimeKinds[args.contentType] !== args.metadata.kind
    )
      throw new Error("Invalid source file");
    // Only private, active files from this owner qualify; retained citations keep their source.
    const candidates = await ctx.db
      .query("learnSources")
      .withIndex("by_ownerId_and_sha256_and_status", (q) =>
        q
          .eq("ownerId", actor)
          .eq("sha256", file.sha256)
          .eq("status", "active"),
      )
      .take(100);
    const duplicate = candidates.find(
      (source) =>
        source.metadataVisibility === "private" &&
        source.contentVisibility === "private",
    );
    if (
      duplicate &&
      args.metadataVisibility === "private" &&
      args.contentVisibility === "private" &&
      duplicate.storageId &&
      (await ctx.db.system.get("_storage", duplicate.storageId))
    )
      return { sourceId: duplicate._id, duplicate: true };
    // A duplicate above reuses a kept file; anything new must fit the account's storage allowance.
    await assertSourceStorageAvailable(ctx, actor, file.size);
    if (args.fingerprint && (args.fingerprint.chunks.length > SOURCE_SIMILARITY_LIMITS.sampledChunks || args.fingerprint.chunks.some(chunk => !/^[0-9a-f]{16}$/.test(chunk)))) throw new Error("Invalid source fingerprint");
    const nearCandidates = args.fingerprint ? await ctx.db.query("learnSources").withIndex("by_ownerId_and_contentType_and_status", q => q.eq("ownerId", actor).eq("contentType", args.contentType).eq("status", "active")).order("desc").take(SOURCE_SIMILARITY_LIMITS.candidates) : [];
    const near = nearCandidates.find(source => source.fingerprint && source.size !== undefined && source.sha256 !== file.sha256 && nearByteDuplicate(args.fingerprint!, file.size, source.fingerprint, source.size));
    const sourceId = await ctx.db.insert("learnSources", {
      ...args,
      ...(near ? { nearDuplicateOf: near._id } : {}),
      ownerId: actor,
      uploadedBy: actor,
      sha256: file.sha256,
      size: file.size,
      contentType: file.contentType ?? args.contentType,
      createdAt: Date.now(),
      status: "active",
    });
    await changeSourceStorage(ctx, actor, file.size);
    return { sourceId, duplicate: false, ...(near ? { nearDuplicateOf: near._id } : {}) };
}
const admitUpload = makeFunctionReference<"query", { bytes: number }, { ok: true } | { ok: false; status: number; message: string }>("sourceStorage:admitUpload");
const registration = makeFunctionReference<
  "mutation",
  {
    metadata: Metadata;
    metadataVisibility: Infer<typeof visibility>;
    contentVisibility: Infer<typeof visibility>;
    storageId: Id<"_storage">;
    contentType: string;
    fingerprint?: Infer<typeof sourceFingerprint>;
  },
  { sourceId: Id<"learnSources">; duplicate: boolean; nearDuplicateOf?: Id<"learnSources"> }
>("learnSources:registerUpload");
/** Mount as POST. Raw file body; title/origin query parameters; uploads begin private.
 * Bearer authentication is validated by Convex, never by a caller-supplied owner ID.
 */
export const upload = httpAction(async (ctx, request) => observeHttp(ctx, "source-files", async () => {
  const headers = SOURCE_CORS;
  if (!(await ctx.auth.getUserIdentity()))
    return new Response("Not authenticated", { status: 401, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  const contentType =
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "";
  const kind = mimeKinds[contentType];
  if (!kind)
    return new Response("Unsupported content type", { status: 415, headers });
  const params = new URL(request.url).searchParams;
  const metadata: Metadata = {
    title: params.get("title") ?? "",
    origin: params.get("origin") ?? "",
    kind,
  };
  try {
    validateMetadata(metadata);
  } catch {
    return new Response("Invalid source metadata", { status: 400, headers });
  }
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > LEARN_LIMITS.fileBytes)
  )
    return new Response("File too large", { status: 413, headers });
  // Refuse before reading the body, so a spent hourly budget or a full allowance never stores a file.
  const admission = await ctx.runQuery(admitUpload, { bytes: declared ? Number(declared) : 1 });
  if (!admission.ok) return new Response(admission.message, { status: admission.status, headers });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Empty file", { status: 400, headers });
  let storageId: Id<"_storage"> | undefined;
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LEARN_LIMITS.fileBytes) {
        await reader.cancel();
        return new Response("File too large", { status: 413, headers });
      }
      chunks.push(new Uint8Array(value));
    }
    if (!size) return new Response("Empty file", { status: 400, headers });
    const blob = new Blob(chunks, { type: contentType });
    if (!(await validSignature(blob, contentType)))
      return new Response("File signature does not match content type", {
        status: 415,
        headers,
      });
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(makeFunctionReference<"mutation", { storageId: Id<"_storage"> }, null>("learnSourceRetention:trackUpload"), { storageId });
    const result: { sourceId: Id<"learnSources">; duplicate: boolean } =
      await ctx.runMutation(registration, {
        metadata,
        metadataVisibility: "private",
        contentVisibility: "private",
        storageId,
        contentType,
        fingerprint: fingerprintBytes(new Uint8Array(await blob.arrayBuffer())),
      });
    if (result.duplicate) await ctx.storage.delete(storageId);
    storageId = undefined;
    return Response.json(result, { status: 201, headers });
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return new Response("Upload failed", { status: 400, headers });
  } finally {
    reader.releaseLock();
  }
}));
