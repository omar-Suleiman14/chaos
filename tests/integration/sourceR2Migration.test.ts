import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

const getCandidate = makeFunctionReference<"query", { sourceId: Id<"learnSources"> },
  { storageId: Id<"_storage">; ready: boolean }>("sourceR2Migration:candidate");
const activate = makeFunctionReference<"mutation", {
  sourceId: Id<"learnSources">; storageId: Id<"_storage">; sha256: string;
  bytes: number; contentType: string; etag: string;
}, null>("sourceR2Migration:activate");
const selectContent = makeFunctionReference<"query", { sourceId: string }, unknown>("learnSources:readContentStorage");
const rollback = makeFunctionReference<"mutation", { sourceId: Id<"learnSources"> }, null>("sourceR2Migration:rollback");
const etag = '"1234567890abcdef1234567890abcdef"';
const sha256 = "a".repeat(64);
const contentType = "image/png";

async function setup() {
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity), stranger = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await stranger.mutation(api.quizFunctions.getOrCreateUser, {});
  const storageId = await t.run(async ctx => ctx.storage.store(new Blob(["fake"], { type: contentType })));
  const sourceId = await t.run(async ctx => ctx.db.insert("learnSources", {
    ownerId: creatorIdentity.subject, uploadedBy: creatorIdentity.subject,
    metadata: { title: "Legacy image", kind: "image", origin: "upload" },
    metadataVisibility: "private", contentVisibility: "private", storageId,
    sha256, size: 4, contentType, status: "active", createdAt: Date.now(),
  }));
  return { t, owner, stranger, sourceId, storageId };
}

it("activates private R2 only for an unchanged owned source and preserves a reversible selector", async () => {
  const { t, owner, stranger, sourceId, storageId } = await setup();
  expect((await owner.query(getCandidate, { sourceId })).ready).toBe(false);
  await expect(stranger.query(getCandidate, { sourceId })).rejects.toThrow("NOT_FOUND");
  await expect(stranger.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType, etag })).rejects.toThrow("NOT_FOUND");
  await expect(owner.mutation(activate, { sourceId, storageId, sha256: "b".repeat(64), bytes: 4, contentType, etag })).rejects.toThrow("changed");
  await expect(owner.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType, etag: "unquoted" })).rejects.toThrow("changed");

  await owner.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType, etag });
  expect((await owner.query(getCandidate, { sourceId })).ready).toBe(true);
  expect(await owner.query(selectContent, { sourceId })).toEqual({
    kind: "r2", key: "learn-sources/" + sourceId, etag, bytes: 4, contentType,
  });
  expect(await stranger.query(selectContent, { sourceId })).toBeNull();
  expect(await t.query(selectContent, { sourceId })).toBeNull();
  expect(await owner.query(api.learnSources.getContentUrl, { sourceId })).toContain("/learn/sources/content?sourceId=");
  // Idempotent activation cannot replace verified R2 bytes with a different ETag.
  await owner.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType, etag });
  await expect(owner.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType,
    etag: '"0987654321abcdef0987654321abcdef"' })).rejects.toThrow("different");
  await expect(stranger.mutation(rollback, { sourceId })).rejects.toThrow("NOT_FOUND");
  await owner.mutation(rollback, { sourceId });
  expect(await owner.query(selectContent, { sourceId })).toEqual({ kind: "convex", storageId });
  const source = await t.run(ctx => ctx.db.get("learnSources", sourceId));
  expect(source?.r2).toBeUndefined();
});

it("removed sources do not expose migrated bytes or get rolled back by non-owners", async () => {
  const { t, owner, sourceId, storageId } = await setup();
  await owner.mutation(activate, { sourceId, storageId, sha256, bytes: 4, contentType, etag });
  await t.run(ctx => ctx.db.patch("learnSources", sourceId, { status: "removed" }));
  expect(await owner.query(selectContent, { sourceId })).toBeNull();
  expect(await owner.query(api.learnSources.getContentUrl, { sourceId })).toBeNull();
  await expect(owner.query(getCandidate, { sourceId })).rejects.toThrow("NOT_FOUND");
});
