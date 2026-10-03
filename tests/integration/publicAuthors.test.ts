import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { MutationCtx } from "../../convex/_generated/server";
import { authorDb, syncAuthorAsset } from "../../convex/authorIndex";
import { defaultFormSettings } from "../../convex/formModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures } from "../fixtures";

afterEach(() => vi.unstubAllEnvs());

const metadata = { title: "Published", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [] };
const definition = {
  schemaVersion: 1, title: "Public form", description: "", defaultLanguage: "en" as const,
  languages: ["en" as const], presentation: "page" as const, fields: [], endings: [],
  theme: { accent: "#000", background: "plain" as const, font: "sans" as const, radius: "small" as const },
};
async function user(ctx: MutationCtx, username = "author", extra = {}) {
  return ctx.db.insert("users", { clerkId: username, username, name: "Author Name", email: "private@example.test", createdAt: 123, ...extra });
}
async function quiz(ctx: MutationCtx, ownerId = "author") {
  return authorDb(ctx).insert("quizzes", { creatorId: ownerId, creatorUsername: ownerId, title: "Draft", slug: "quiz", isPublished: true, publishedSnapshot: { title: "Published", questions: [] }, createdAt: 123, updatedAt: 123 });
}
const pageArgs = { paginationOpts: { numItems: 24, cursor: null } };

it("indexes normal creator publication automatically and removes it on unpublish", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const quizId = await owner.mutation(api.quizFunctions.createQuiz, { title: "Directory quiz" });
  await owner.mutation(api.quizFunctions.addQuestion, { quizId, ...questionFixtures.mcq });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
  await owner.mutation(api.quizFunctions.publishQuiz, { quizId });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toHaveLength(1);
  // Repeated publication is one membership, not another author or increment.
  await owner.mutation(api.quizFunctions.publishQuiz, { quizId });
  await t.run(async ctx => {
    expect((await ctx.db.query("users").first())!.publicAuthorAssets).toBe(1);
  });
  await owner.mutation(api.quizFunctions.unpublishQuiz, { quizId });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
});

it("updates author membership atomically across publish, ownership transfer, replace and delete", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const first = await user(ctx), second = await user(ctx, "second");
    const id = await authorDb(ctx).insert("quizzes", { creatorId: "author", creatorUsername: "author", title: "Draft", slug: "draft", isPublished: false, createdAt: 1, updatedAt: 1 });
    return { first, second, id };
  });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
  await t.run(async ctx => {
    await authorDb(ctx).patch("quizzes", ids.id, { isPublished: true, publishedSnapshot: { title: "Public", questions: [] } });
    await syncAuthorAsset(ctx, "quizzes", ids.id);
    await authorDb(ctx).patch("quizzes", ids.id, { title: "Private draft changes" });
    expect((await ctx.db.get("users", ids.first))!.publicAuthorAssets).toBe(1);
    expect(await ctx.db.query("publicAuthorAssets").collect()).toHaveLength(1);
    await authorDb(ctx).patch("quizzes", ids.id, { creatorId: "second", creatorUsername: "second" });
    expect((await ctx.db.get("users", ids.first))!.publicAuthorAssets).toBe(0);
    expect((await ctx.db.get("users", ids.second))!.publicAuthorAssets).toBe(1);
    const row = (await ctx.db.get("quizzes", ids.id))!;
    const { _id, _creationTime, ...replacement } = row;
    void _id; void _creationTime;
    await authorDb(ctx).replace("quizzes", ids.id, { ...replacement, isBanned: true });
    expect((await ctx.db.get("users", ids.second))!.publicAuthorAssets).toBe(0);
    await authorDb(ctx).patch("quizzes", ids.id, { isBanned: false });
    await authorDb(ctx).delete("quizzes", ids.id);
    expect((await ctx.db.get("users", ids.second))!.publicAuthorAssets).toBe(0);
    expect(await ctx.db.query("publicAuthorAssets").collect()).toEqual([]);
  });
});

it("requires published, indexed snapshots for forms, lessons and courses; draft edits stay private", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    const owner = await user(ctx);
    const form = await authorDb(ctx).insert("forms", { ownerId: "author", title: "Form", shareId: "public", status: "live", draft: definition, draftRevision: 0, settings: { ...defaultFormSettings, allowIndexing: true }, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 1, updatedAt: 1 });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBeUndefined();
    await ctx.db.insert("formVersions", { formId: form, version: 1, definition, publishedAt: 1, publishedBy: "author", draftRevision: 0 });
    await authorDb(ctx).patch("forms", form, { publishedVersion: 1 });
    const lesson = await authorDb(ctx).insert("lessons", { ownerId: "author", metadata, draft: document, revision: 0, status: "active", visibility: "public", communityState: "ok", searchText: "", createdAt: 1, updatedAt: 1 });
    const lessonVersion = await ctx.db.insert("lessonVersions", { lessonId: lesson, number: 1, metadata, document, visibility: "public", authorId: "author", publishedAt: 1 });
    await authorDb(ctx).patch("lessons", lesson, { publishedVersionId: lessonVersion });
    const course = await authorDb(ctx).insert("learnCollections", { ownerId: "author", metadata, items: [], revision: 0, visibility: "public", communityState: "ok", createdAt: 1, updatedAt: 1 });
    const courseVersion = await ctx.db.insert("collectionVersions", { collectionId: course, number: 1, metadata, items: [], publishedAt: 1 });
    await authorDb(ctx).patch("learnCollections", course, { publishedVersionId: courseVersion });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBe(3);
    await authorDb(ctx).patch("lessons", lesson, { metadata: { ...metadata, indexing: "noindex", title: "Secret draft" } });
    await authorDb(ctx).patch("learnCollections", course, { metadata: { ...metadata, indexing: "noindex" } });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBe(3);
    await authorDb(ctx).patch("forms", form, { settings: { ...defaultFormSettings, access: "signed_in", allowIndexing: true } });
    await authorDb(ctx).patch("lessons", lesson, { visibility: "restricted" });
    await authorDb(ctx).patch("learnCollections", course, { archived: true });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBe(0);
    await authorDb(ctx).patch("forms", form, { settings: { ...defaultFormSettings, allowIndexing: false } });
    const hiddenVersion = await ctx.db.insert("lessonVersions", { lessonId: lesson, number: 2, metadata: { ...metadata, indexing: "noindex" }, document, visibility: "public", authorId: "author", publishedAt: 2 });
    await authorDb(ctx).patch("lessons", lesson, { visibility: "public", publishedVersionId: hiddenVersion });
    const hiddenCourseVersion = await ctx.db.insert("collectionVersions", { collectionId: course, number: 2, metadata: { ...metadata, indexing: "noindex" }, items: [], publishedAt: 2 });
    await authorDb(ctx).patch("learnCollections", course, { archived: false, publishedVersionId: hiddenCourseVersion });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBe(0);
  });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
});

it("projects only public card fields and keeps paging past filtered authors", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    await user(ctx, "visible", { publicAuthorAssets: 1, cardStyle: 3 });
    await user(ctx, "banned", { publicAuthorAssets: 5, isBanned: true });
    await user(ctx, "suspended", { publicAuthorAssets: 4, suspendedUntil: Date.now() + 60_000 });
    await user(ctx, "bad username", { publicAuthorAssets: 3 });
    await user(ctx, "private");
    await user(ctx, "no-assets", { publicAuthorAssets: 0 });
  });
  const first = await t.query(api.publicAuthors.browse, { paginationOpts: { numItems: 3, cursor: null } });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  const next = await t.query(api.publicAuthors.browse, { paginationOpts: { numItems: 3, cursor: first.continueCursor } });
  expect(next.page).toHaveLength(1);
  expect(next.page[0]).toMatchObject({ username: "visible", name: "Author Name", style: 3, memberSince: 123 });
  expect(Object.keys(next.page[0]).sort()).toEqual(["memberSince", "name", "seed", "style", "username"]);
  expect(JSON.stringify(next)).not.toContain("private@example.test");
  expect(next.isDone).toBe(true);
});

it("does not accept a missing quiz snapshot or a version belonging to someone else's asset", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    const owner = await user(ctx);
    await authorDb(ctx).insert("quizzes", { creatorId: "author", creatorUsername: "author", title: "Legacy published flag", slug: "missing-snapshot", isPublished: true, createdAt: 1, updatedAt: 1 });
    const base = { ownerId: "author", metadata, draft: document, revision: 0, status: "active" as const, visibility: "public" as const, communityState: "ok" as const, searchText: "", createdAt: 1, updatedAt: 1 };
    const first = await authorDb(ctx).insert("lessons", base);
    const second = await authorDb(ctx).insert("lessons", base);
    const version = await ctx.db.insert("lessonVersions", { lessonId: second, number: 1, metadata, document, visibility: "public", authorId: "author", publishedAt: 1 });
    await authorDb(ctx).patch("lessons", first, { publishedVersionId: version });
    expect((await ctx.db.get("users", owner))!.publicAuthorAssets).toBeUndefined();
    expect(await ctx.db.query("publicAuthorAssets").collect()).toEqual([]);
  });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
});

it("backfills multiple pages and all asset phases without duplicating membership on restart", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    await user(ctx);
    for (let i = 0; i < 25; i++) await ctx.db.insert("quizzes", { creatorId: "author", creatorUsername: "author", title: "Quiz", slug: `old-${i}`, isPublished: true, publishedSnapshot: { title: "Public", questions: [] }, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("quizzes", { creatorId: "author", creatorUsername: "author", title: "Unpublished", slug: "unpublished", isPublished: false, createdAt: 1, updatedAt: 1 });
    await quiz(ctx, "missing-user");
  });
  for (let i = 0; i < 2; i++) {
    await t.mutation(internal.publicAuthors.backfill, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async ctx => {
      expect(await ctx.db.query("publicAuthorAssets").collect()).toHaveLength(25);
      expect((await ctx.db.query("users").first())!.publicAuthorAssets).toBe(25);
    });
  }
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toHaveLength(1);
});

it.each([0, 49])("rejects invalid directory page size %s", async numItems => {
  const t = createTestConvex();
  await expect(t.query(api.publicAuthors.browse, { paginationOpts: { numItems, cursor: null } })).rejects.toThrow("Invalid author page size");
});
