import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { MutationCtx } from "../../convex/_generated/server";
import { authorDb, syncAuthorAsset } from "../../convex/authorIndex";
import { defaultFormSettings } from "../../convex/formModel";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

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
const indexedSettings = { ...defaultFormSettings, allowIndexing: true };
/** A live, indexable form row and (optionally) its published version, written without the author index. */
async function rawForm(ctx: MutationCtx, ownerId: string, shareId: string, published = true) {
  const formId = await ctx.db.insert("forms", { ownerId, title: "Form", shareId, status: published ? "live" : "draft", draft: definition, draftRevision: 0, settings: indexedSettings, ...(published ? { publishedVersion: 1 } : {}), responseCount: 0, partialCount: 0, createdAt: 1, updatedAt: 1 });
  if (published) await ctx.db.insert("formVersions", { formId, version: 1, definition, publishedAt: 1, publishedBy: ownerId, draftRevision: 0 });
  return formId;
}
const pageArgs = { paginationOpts: { numItems: 24, cursor: null } };

it("indexes normal creator publication automatically and removes it on unpublish", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { title: "Directory quiz", quizMode: true });
  const editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  const { hasAccessCode: _drop, accessCodeHash: _hash, ...settings } = editor.settings;
  void _drop; void _hash;
  await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, allowIndexing: true } });
  const saved = await owner.mutation(api.forms.saveFormDraft, {
    formId,
    expectedRevision: editor.draftRevision,
    definition: {
      ...editor.draft,
      fields: [{ id: "q", type: "choice" as const, label: "2 + 2?", required: true, options: [{ id: "a", label: "4" }, { id: "b", label: "5" }], quiz: { correctOptionIds: ["a"], points: 1 } }],
    },
  });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toHaveLength(1);
  // Repeated publication is one membership, not another author or increment.
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  await t.run(async ctx => {
    expect((await ctx.db.query("users").first())!.publicAuthorAssets).toBe(1);
  });
  await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
});

it("updates author membership atomically across publish, ownership transfer, replace and delete", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const first = await user(ctx), second = await user(ctx, "second");
    const id = await authorDb(ctx).insert("forms", { ownerId: "author", title: "Draft", shareId: "draft", status: "draft", draft: definition, draftRevision: 0, settings: indexedSettings, responseCount: 0, partialCount: 0, createdAt: 1, updatedAt: 1 });
    return { first, second, id };
  });
  expect((await t.query(api.publicAuthors.browse, pageArgs)).page).toEqual([]);
  await t.run(async ctx => {
    await ctx.db.insert("formVersions", { formId: ids.id, version: 1, definition, publishedAt: 1, publishedBy: "author", draftRevision: 0 });
    await authorDb(ctx).patch("forms", ids.id, { status: "live", publishedVersion: 1 });
    await syncAuthorAsset(ctx, "forms", ids.id);
    await authorDb(ctx).patch("forms", ids.id, { title: "Private draft changes" });
    expect((await ctx.db.get("users", ids.first))!.publicAuthorAssets).toBe(1);
    expect(await ctx.db.query("publicAuthorAssets").collect()).toHaveLength(1);
    await authorDb(ctx).patch("forms", ids.id, { ownerId: "second" });
    expect((await ctx.db.get("users", ids.first))!.publicAuthorAssets).toBe(0);
    expect((await ctx.db.get("users", ids.second))!.publicAuthorAssets).toBe(1);
    const row = (await ctx.db.get("forms", ids.id))!;
    const { _id, _creationTime, ...replacement } = row;
    void _id; void _creationTime;
    await authorDb(ctx).replace("forms", ids.id, { ...replacement, isBanned: true });
    expect((await ctx.db.get("users", ids.second))!.publicAuthorAssets).toBe(0);
    await authorDb(ctx).patch("forms", ids.id, { isBanned: false });
    await authorDb(ctx).delete("forms", ids.id);
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

it("does not accept a missing form snapshot or a version belonging to someone else's asset", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    const owner = await user(ctx);
    await authorDb(ctx).insert("forms", { ownerId: "author", title: "Published flag without a version", shareId: "missing-snapshot", status: "live", draft: definition, draftRevision: 0, settings: indexedSettings, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 1, updatedAt: 1 });
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
    for (let i = 0; i < 25; i++) await rawForm(ctx, "author", `old-${i}`);
    await rawForm(ctx, "author", "unpublished", false);
    await rawForm(ctx, "missing-user", "orphan");
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
