import { studyValue } from "./studyLessonValue";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { consumeRate } from "./serverUtils";
import { requireLearnActor } from "./mcpLearn";
import { LEARN_LIMITS, sourceMetadata } from "./learnModel";
import { trackSourceUploadForActor } from "./learnSourceRetention";
import { fingerprintBytes, sourceFingerprint } from "./sourceFingerprint";
import { accessibleStudySource } from "./studyLessons";
import {
  mimeKinds,
  validSignature,
  registerSourceUploadForActor,
  updateSourceForActor,
  validateMetadata as validateSourceMetadata,
} from "./learnSources";
const ref = <T extends "mutation" | "query">(type: T, name: string) =>
  makeFunctionReference<T>(`studySourceUploads:${name}`);
const chunkArgs = {
  userId: v.string(),
  key: v.string(),
  index: v.number(),
  totalChunks: v.number(),
  data: v.string(),
  contentType: v.string(),
  metadata: sourceMetadata,
};
function invalid(message: string): never {
  throw new Error(`VALIDATION_FAILED: ${message}`);
}
export const saveChunk = internalMutation({
  args: chunkArgs,
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    if (
      !/^[A-Za-z0-9_-]{1,160}$/.test(a.key) ||
      !Number.isSafeInteger(a.totalChunks) ||
      a.totalChunks < 1 ||
      a.totalChunks > 200 ||
      !Number.isSafeInteger(a.index) ||
      a.index < 0 ||
      a.index >= a.totalChunks ||
      a.data.length > 174764 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        a.data,
      )
    )
      invalid("Invalid chunk bounds or base64.");
    const bytes = atob(a.data).length;
    if (
      !bytes ||
      bytes > 128 * 1024 ||
      mimeKinds[a.contentType] !== a.metadata.kind ||
      !a.metadata.title.trim() ||
      a.metadata.title.length > 200 ||
      !a.metadata.origin.trim()
    )
      invalid("Unsupported MIME type, empty metadata or oversized chunk.");
    let upload = await ctx.db
      .query("studySourceUploads")
      .withIndex("by_owner_key", (q) =>
        q.eq("ownerId", a.userId).eq("key", a.key),
      )
      .unique();
    if (
      upload &&
      (upload.totalChunks !== a.totalChunks ||
        upload.contentType !== a.contentType ||
        studyValue(upload.metadata) !== studyValue(a.metadata))
    )
      invalid(
        "Upload key already belongs to different metadata or chunk count.",
      );
    if (upload && upload.expiresAt < Date.now())
      invalid("Transfer expired; use a new key.");
    if (!upload) {
      await consumeRate(ctx, `learn:study-transfer:${a.userId}`, 40, 3600000);
      const id = await ctx.db.insert("studySourceUploads", {
        ownerId: a.userId,
        key: a.key,
        metadata: a.metadata,
        contentType: a.contentType,
        totalChunks: a.totalChunks,
        bytes: 0,
        expiresAt: Date.now() + 86400000,
      });
      upload = (await ctx.db.get("studySourceUploads", id))!;
      await ctx.scheduler.runAfter(86400000, ref("mutation", "cleanup"), {
        uploadId: id,
      });
    }
    const prior = await ctx.db
      .query("studySourceChunks")
      .withIndex("by_upload_index", (q) =>
        q.eq("uploadId", upload!._id).eq("index", a.index),
      )
      .unique();
    if (prior && prior.data !== a.data)
      invalid("A retry cannot change saved chunk bytes.");
    if (!prior) {
      if (upload.sourceId) invalid("Completed upload cannot change.");
      if (upload.bytes + bytes > LEARN_LIMITS.fileBytes)
        invalid("File exceeds 25 MB.");
      await ctx.db.insert("studySourceChunks", {
        uploadId: upload._id,
        index: a.index,
        data: a.data,
      });
      await ctx.db.patch("studySourceUploads", upload._id, {
        bytes: upload.bytes + bytes,
      });
    }
    const received = await ctx.db
      .query("studySourceChunks")
      .withIndex("by_upload_index", (q) => q.eq("uploadId", upload!._id))
      .take(200);
    return {
      uploadId: upload._id,
      receivedChunks: received.length,
      totalChunks: upload.totalChunks,
      sourceId: upload.sourceId ?? null,
    };
  },
});
export const chunk = internalQuery({
  args: {
    userId: v.string(),
    uploadId: v.id("studySourceUploads"),
    index: v.number(),
  },
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    const u = await ctx.db.get("studySourceUploads", a.uploadId);
    if (!u || u.ownerId !== a.userId || u.expiresAt < Date.now())
      throw new Error("NOT_FOUND: Transfer unavailable.");
    return (
      (
        await ctx.db
          .query("studySourceChunks")
          .withIndex("by_upload_index", (q) =>
            q.eq("uploadId", u._id).eq("index", a.index),
          )
          .unique()
      )?.data ?? null
    );
  },
});
export const complete = internalMutation({
  args: {
    userId: v.string(),
    uploadId: v.id("studySourceUploads"),
    storageId: v.id("_storage"),
    fingerprint: sourceFingerprint,
  },
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    const u = await ctx.db.get("studySourceUploads", a.uploadId);
    if (!u || u.ownerId !== a.userId || u.expiresAt < Date.now())
      throw new Error("NOT_FOUND: Transfer unavailable.");
    if (u.sourceId) return { sourceId: u.sourceId, duplicate: true };
    const registered = await registerSourceUploadForActor(ctx, a.userId, {
      metadata: u.metadata,
      metadataVisibility: "private",
      contentVisibility: "private",
      storageId: a.storageId,
      contentType: u.contentType,
      fingerprint: a.fingerprint,
    });
    await ctx.db.patch("studySourceUploads", u._id, {
      sourceId: registered.sourceId,
    });
    return registered;
  },
});
export const upload = internalAction({
  args: chunkArgs,
  handler: async (
    ctx,
    a,
  ): Promise<{
    receivedChunks: number;
    totalChunks: number;
    sourceId: Id<"learnSources"> | null;
  }> => {
    const saved = (await ctx.runMutation(ref("mutation", "saveChunk"), a)) as {
      uploadId: Id<"studySourceUploads">;
      receivedChunks: number;
      totalChunks: number;
      sourceId: Id<"learnSources"> | null;
    };
    if (saved.sourceId || saved.receivedChunks !== saved.totalChunks)
      return {
        receivedChunks: saved.receivedChunks,
        totalChunks: saved.totalChunks,
        sourceId: saved.sourceId,
      };
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let index = 0; index < saved.totalChunks; index++) {
      const data = (await ctx.runQuery(ref("query", "chunk"), {
        userId: a.userId,
        uploadId: saved.uploadId,
        index,
      })) as string | null;
      if (!data) invalid("Missing chunk; retry transfer.");
      chunks.push(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    }
    const blob = new Blob(chunks, { type: a.contentType });
    if (!(await validSignature(blob, a.contentType)))
      invalid("File signature does not match MIME type.");
    const storageId = await ctx.storage.store(blob);
    try {
      await ctx.runMutation(ref("mutation", "trackBlob"), {
        userId: a.userId,
        storageId,
      });
      const result = (await ctx.runMutation(ref("mutation", "complete"), {
        userId: a.userId,
        uploadId: saved.uploadId,
        storageId,
        fingerprint: fingerprintBytes(new Uint8Array(await blob.arrayBuffer())),
      })) as { sourceId: Id<"learnSources">; duplicate: boolean };
      if (result.duplicate) await ctx.storage.delete(storageId);
      return {
        receivedChunks: saved.receivedChunks,
        totalChunks: saved.totalChunks,
        sourceId: result.sourceId,
      };
    } catch (e) {
      await ctx.storage.delete(storageId);
      throw e;
    }
  },
});
export const cleanup = internalMutation({
  args: { uploadId: v.id("studySourceUploads") },
  handler: async (ctx, a) => {
    const chunks = await ctx.db
      .query("studySourceChunks")
      .withIndex("by_upload_index", (q) => q.eq("uploadId", a.uploadId))
      .take(50);
    for (const c of chunks) await ctx.db.delete("studySourceChunks", c._id);
    if (chunks.length === 50)
      await ctx.scheduler.runAfter(0, ref("mutation", "cleanup"), a);
    else await ctx.db.delete("studySourceUploads", a.uploadId);
  },
});

export const contentAccess = internalQuery({
  args: { userId: v.string(), sourceId: v.id("learnSources") },
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    const s = await accessibleStudySource(ctx, a.userId, a.sourceId);
    return { metadata: s.metadata, storageId: s.storageId ?? null };
  },
});
export const readContent = internalAction({
  args: {
    userId: v.string(),
    sourceId: v.id("learnSources"),
    offset: v.optional(v.number()),
  },
  handler: async (
    ctx,
    a,
  ): Promise<{
    metadata: InferMetadata;
    contentType: string | null;
    data: string | null;
    totalBytes: number;
    nextOffset: number | null;
  }> => {
    const access = (await ctx.runQuery(ref("query", "contentAccess"), {
      userId: a.userId,
      sourceId: a.sourceId,
    })) as { metadata: InferMetadata; storageId: Id<"_storage"> | null };
    const offset = a.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0)
      invalid("Invalid file offset.");
    if (!access.storageId)
      return {
        metadata: access.metadata,
        contentType: null,
        data: null,
        totalBytes: 0,
        nextOffset: null,
      };
    const blob = await ctx.storage.get(access.storageId);
    if (!blob || offset >= blob.size)
      invalid("Missing file or offset beyond file.");
    const bytes = new Uint8Array(
      await blob.slice(offset, offset + 128 * 1024).arrayBuffer(),
    );
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return {
      metadata: access.metadata,
      contentType: blob.type,
      data: btoa(binary),
      totalBytes: blob.size,
      nextOffset:
        offset + bytes.length < blob.size ? offset + bytes.length : null,
    };
  },
});
type InferMetadata = import("convex/values").Infer<typeof sourceMetadata>;
export const reference = internalMutation({
  args: {
    userId: v.string(),
    metadata: sourceMetadata,
    metadataVisibility: v.optional(
      v.union(v.literal("private"), v.literal("public")),
    ),
  },
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    if (
      !["url", "video", "reference"].includes(a.metadata.kind) ||
      !a.metadata.title.trim() ||
      a.metadata.title.length > 200 ||
      !a.metadata.origin.trim()
    )
      invalid("Use URL/video/reference metadata with a title and origin.");
    try {
      validateSourceMetadata(a.metadata);
    } catch {
      invalid(
        "Source metadata must meet Chaos limits and use an HTTPS URL where required.",
      );
    }
    const metadataVisibility = a.metadataVisibility ?? "private";
    const candidates = await ctx.db
      .query("learnSources")
      .withIndex("by_ownerId_and_sha256_and_status", (q) =>
        q
          .eq("ownerId", a.userId)
          .eq("sha256", undefined)
          .eq("status", "active"),
      )
      .take(101);
    const existing = candidates.find(
      (s) =>
        s.metadataVisibility === metadataVisibility &&
        studyValue(s.metadata) === studyValue(a.metadata),
    );
    if (existing) return { sourceId: existing._id, duplicate: true };
    if (candidates.length > 100)
      invalid(
        "Select an existing reference explicitly in large source libraries.",
      );
    const sourceId = await ctx.db.insert("learnSources", {
      ownerId: a.userId,
      uploadedBy: a.userId,
      metadata: a.metadata,
      metadataVisibility,
      contentVisibility: "private",
      createdAt: Date.now(),
      status: "active",
    });
    return { sourceId, duplicate: false };
  },
});

export const trackBlob = internalMutation({
  args: { userId: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, a) =>
    trackSourceUploadForActor(
      ctx,
      await requireLearnActor(ctx, a.userId),
      a.storageId,
    ),
});

export const publishSource = internalMutation({
  args: {
    userId: v.string(),
    sourceId: v.id("learnSources"),
    includeImage: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const ownerId = await requireLearnActor(ctx, a.userId);
    const source = await accessibleStudySource(ctx, ownerId, a.sourceId);
    if (source.ownerId !== ownerId)
      throw new Error("FORBIDDEN: Only the source owner may publish it.");
    if (a.includeImage && source.metadata.kind !== "image")
      invalid(
        "Only explicitly selected image assets can publish bytes through this workflow. PDF/slide/file bytes stay private.",
      );
    await updateSourceForActor(ctx, ownerId, {
      sourceId: a.sourceId,
      metadataVisibility: "public",
      ...(a.includeImage ? { contentVisibility: "public" as const } : {}),
    });
    return {
      sourceId: a.sourceId,
      metadataVisibility: "public",
      contentVisibility: a.includeImage ? "public" : source.contentVisibility,
    };
  },
});
