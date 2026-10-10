import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";

const metadata = { title: "Publicationfixture", description: "", language: "ar", tags: [], indexing: "index" as const };
const document = { schemaVersion: 1 as const, blocks: [] };

it("keeps publication, version visibility and indexing boundaries distinct across lesson readers", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkId: "owner", username: "owner", name: "Owner", email: "owner@example.test", createdAt: 0 });
    const lessonId = await ctx.db.insert("lessons", { ownerId: "owner", metadata, draft: document, revision: 0, status: "active", visibility: "public", communityState: "ok", searchText: "Publicationfixture", createdAt: 0, updatedAt: 0 });
    const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, document, visibility: "public", authorId: "owner", publishedAt: 1 });
    await ctx.db.patch("lessons", lessonId, { publishedVersionId: versionId });
    return { lessonId, versionId, userId };
  });
  const paginationOpts = { numItems: 10, cursor: null };
  const check = async (readable: boolean, indexable = readable) => {
    const single = await t.query(api.learnFrontend.publicLesson, { id: ids.lessonId });
    const batch = await t.query(api.learnFrontend.publicLessonsBatch, { ids: [ids.lessonId] });
    expect(single !== null).toBe(readable);
    expect(batch).toEqual(single ? [single] : []);
    expect((await t.query(api.learnSearch.searchPublic, { text: "Publicationfixture", paginationOpts })).page).toHaveLength(readable ? 1 : 0);
    expect((await t.query(api.learnFrontend.listIndexableLessons, { paginationOpts })).page).toHaveLength(indexable ? 1 : 0);
  };
  await check(true);
  for (const patch of [{ status: "archived" as const }, { visibility: "private" as const }, { communityState: "hidden" as const }, { publishedVersionId: undefined }]) {
    await t.run(ctx => ctx.db.patch("lessons", ids.lessonId, patch));
    await check(false);
    await t.run(ctx => ctx.db.patch("lessons", ids.lessonId, { status: "active", visibility: "public", communityState: "ok", publishedVersionId: ids.versionId }));
  }
  await t.run(ctx => ctx.db.patch("lessonVersions", ids.versionId, { visibility: "private" }));
  await check(false);
  await t.run(ctx => ctx.db.patch("lessonVersions", ids.versionId, { visibility: undefined }));
  await check(true); // Legacy published versions remain supported.
  await t.run(ctx => ctx.db.patch("lessonVersions", ids.versionId, { metadata: { ...metadata, indexing: "noindex" } }));
  await check(true, false); // Discoverable does not imply sitemap consent.
  await t.run(ctx => ctx.db.patch("users", ids.userId, { isBanned: true }));
  await check(false);
});

it("keeps directory, catalogue and sitemap course publication boundaries aligned", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const courseId = await ctx.db.insert("learnCollections", { ownerId: "owner", metadata, items: [], revision: 0, visibility: "public", communityState: "ok", createdAt: 0, updatedAt: 0 });
    const versionId = await ctx.db.insert("collectionVersions", { collectionId: courseId, number: 1, metadata, items: [], publishedAt: 1 });
    await ctx.db.patch("learnCollections", courseId, { publishedVersionId: versionId });
    return { courseId, versionId };
  });
  const check = async (visible: boolean) => {
    const expected = visible ? 1 : 0;
    expect((await t.query(api.courseDirectory.browse, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(expected);
    expect(await t.query(api.courses.listPublic, {})).toHaveLength(expected);
    expect((await t.query(api.courses.listIndexable, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(expected);
  };
  await check(true);
  for (const patch of [{ archived: true }, { visibility: "private" as const }, { communityState: "review" as const }, { publishedVersionId: undefined }]) {
    await t.run(ctx => ctx.db.patch("learnCollections", ids.courseId, patch));
    await check(false);
    await t.run(ctx => ctx.db.patch("learnCollections", ids.courseId, { archived: false, visibility: "public", communityState: "ok", publishedVersionId: ids.versionId }));
  }
  await t.run(ctx => ctx.db.delete("collectionVersions", ids.versionId));
  await check(false);
});
