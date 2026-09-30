import { expect, test } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { SOURCE_RETENTION_LIMITS } from "../../convex/learnSourceRetention";
const purge = makeFunctionReference<"mutation">("learnSourceRetention:requestPurge");
const cleanup = makeFunctionReference<"mutation">("learnSourceRetention:cleanup");
const track = makeFunctionReference<"mutation">("learnSourceRetention:trackUpload");
async function fixture() {
  const t = createTestConvex();
  const sourceId = await t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob(["teaching material"]));
    return ctx.db.insert("learnSources", { ownerId: "owner", uploadedBy: "owner", createdAt: 0, metadata: { title: "Notes", kind: "file", origin: "owner" }, metadataVisibility: "private", contentVisibility: "private", status: "removed", storageId });
  });
  return { t, sourceId, owner: t.withIdentity({ subject: "owner", issuer: "https://clerk.test" }) };
}
async function due(t: ReturnType<typeof createTestConvex>) {
  await t.run(async ctx => { for (const job of await ctx.db.query("learnSourceCleanup").take(10)) await ctx.db.patch("learnSourceCleanup", job._id, { dueAt: 0 }); });
}
test("purge is owner-only, grace protected, idempotent and keeps metadata", async () => {
  const { t, owner, sourceId } = await fixture();
  await expect(t.mutation(purge, { sourceId })).rejects.toThrow();
  await expect(t.withIdentity({ subject: "other" }).mutation(purge, { sourceId })).rejects.toThrow("unauthorized");
  await owner.mutation(purge, { sourceId }); await owner.mutation(purge, { sourceId });
  const job = await t.run(ctx => ctx.db.query("learnSourceCleanup").first());
  expect(job!.dueAt).toBeGreaterThanOrEqual(Date.now() + SOURCE_RETENTION_LIMITS.graceMs - 1000);
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
  await due(t); expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 1 });
  await t.run(async ctx => { const source = await ctx.db.get("learnSources", sourceId); expect(source?.metadata.title).toBe("Notes"); expect(source?.status).toBe("removed"); expect(source?.storageId).toBeUndefined(); expect(await ctx.db.system.get("_storage", job!.storageId)).toBeNull(); });
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
});
test("immutable historical citations preserve bytes even on removed lessons", async () => {
  const { t, owner, sourceId } = await fixture();
  await t.run(async ctx => {
    const metadata = { title: "History", description: "", language: "en", tags: [] };
    const draft = { schemaVersion: 1 as const, blocks: [] };
    const lessonId = await ctx.db.insert("lessons", { ownerId: "owner", metadata, draft, revision: 1, status: "archived", visibility: "private", communityState: "removed", createdAt: 0, updatedAt: 0, searchText: "" });
    await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, authorId: "owner", publishedAt: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Citation", conceptIds: [], citations: [{ sourceId, locator: { kind: "page", page: 1 } }] }] } });
  });
  await owner.mutation(purge, { sourceId }); await due(t);
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
  await t.run(async ctx => { const source = await ctx.db.get("learnSources", sourceId); expect(await ctx.db.system.get("_storage", source!.storageId!)).not.toBeNull(); });
});
test("takedowns, restored status, and banned owners cannot be purged by cleanup", async () => {
  const { t, owner, sourceId } = await fixture();
  await owner.mutation(purge, { sourceId }); await due(t);
  await t.run(ctx => ctx.db.insert("learnSourceAudit", { sourceId, actorKey: "admin", action: "takedown", reason: "copyright", before: "active", after: "removed", createdAt: 0 }));
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
  await expect(owner.mutation(purge, { sourceId })).rejects.toThrow("Moderation");
  const next = await fixture(); await next.owner.mutation(purge, { sourceId: next.sourceId }); await due(next.t);
  await next.t.run(ctx => ctx.db.patch("learnSources", next.sourceId, { status: "retained" }));
  expect(await next.t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
  const banned = await fixture(); await banned.owner.mutation(purge, { sourceId: banned.sourceId }); await due(banned.t);
  await banned.t.run(ctx => ctx.db.insert("users", { clerkId: "owner", name: "Owner", email: "o@example.test", username: "owner", isBanned: true, createdAt: 0 }));
  expect(await banned.t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
});
test("orphan receipts delete only unlinked bytes and preserve shared storage", async () => {
  const { t, owner, sourceId } = await fixture();
  const orphan = await t.run(ctx => ctx.storage.store(new Blob(["orphan"])));
  await owner.mutation(track, { storageId: orphan });
  const source = await t.run(ctx => ctx.db.get("learnSources", sourceId));
  await owner.mutation(track, { storageId: source!.storageId! });
  await due(t); expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 1 });
  await t.run(async ctx => { expect(await ctx.db.system.get("_storage", orphan)).toBeNull(); expect(await ctx.db.system.get("_storage", source!.storageId!)).not.toBeNull(); });
});
test("history scans resume safely and a late citation prevents purge on retries", async () => {
  const { t, owner, sourceId } = await fixture();
  await t.run(async ctx => {
    const metadata = { title: "History", description: "", language: "en", tags: [] };
    const document = { schemaVersion: 1 as const, blocks: [] };
    const lessonId = await ctx.db.insert("lessons", { ownerId: "owner", metadata, draft: document, revision: 1, status: "active", visibility: "private", communityState: "ok", createdAt: 0, updatedAt: 0, searchText: "" });
    for (let number = 1; number <= 5; number++) await ctx.db.insert("lessonVersions", { lessonId, number, metadata, authorId: "owner", publishedAt: number, document: number === 5 ? { schemaVersion: 1, blocks: [{ id: "image", type: "image", sourceId, alt: "historical", caption: "", conceptIds: [], citations: [] }] } : document });
  });
  await owner.mutation(purge, { sourceId }); await due(t);
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 0 });
  expect((await t.run(ctx => ctx.db.query("learnSourceCleanup").first()))?.cursor).not.toBeNull();
  await t.mutation(cleanup, {});
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
  const source = await t.run(ctx => ctx.db.get("learnSources", sourceId));
  expect(source?.storageId).toBeDefined();
});
test("a second source sharing the bytes prevents owner purge", async () => {
  const { t, owner, sourceId } = await fixture();
  await t.run(async ctx => {
    const source = (await ctx.db.get("learnSources", sourceId))!;
    const { _id, _creationTime, ...copy } = source; void _id; void _creationTime;
    await ctx.db.insert("learnSources", { ...copy, ownerId: "other", uploadedBy: "other", status: "active" });
  });
  await owner.mutation(purge, { sourceId }); await due(t);
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
});
test("published collection source resources hold bytes across bounded collection pages", async () => {
  const { t, owner, sourceId } = await fixture();
  await t.run(async ctx => {
    const metadata = { title: "Pack", description: "", language: "en", tags: [] };
    const collectionId = await ctx.db.insert("learnCollections", { ownerId: "owner", metadata, items: [], revision: 5, visibility: "private", communityState: "removed", createdAt: 0, updatedAt: 0 });
    for (let number = 1; number <= 5; number++) await ctx.db.insert("collectionVersions", { collectionId, metadata, number, publishedAt: number, items: number === 5 ? [{ kind: "source", id: sourceId }] : [] });
  });
  await owner.mutation(purge, { sourceId }); await due(t);
  // Legacy jobs omit phase. Lesson completion commits a null collection cursor.
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
  expect(await t.run(ctx => ctx.db.query("learnSourceCleanup").first())).toMatchObject({ phase: "collections", cursor: null });
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 0 });
  expect((await t.run(ctx => ctx.db.query("learnSourceCleanup").first()))?.cursor).not.toBeNull();
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0, held: 1 });
  const source = await t.run(ctx => ctx.db.get("learnSources", sourceId));
  expect(await t.run(ctx => ctx.db.system.get("_storage", source!.storageId!))).not.toBeNull();
  expect(await t.mutation(cleanup, {})).toMatchObject({ deleted: 0 });
});
