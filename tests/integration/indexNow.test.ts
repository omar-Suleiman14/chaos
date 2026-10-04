import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { authorDb } from "../../convex/authorIndex";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

const key = "0123456789abcdef0123456789abcdef";
const metadata = { title: "Public lesson", description: "Indexable", language: "en", tags: [], indexing: "index" as const };
const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Public content", citations: [], conceptIds: [] }] };

beforeEach(() => {
  process.env.INDEXNOW_KEY = key;
  process.env.CHAOS_APP_URL = "https://chaos.fail";
});
afterEach(() => {
  delete process.env.INDEXNOW_KEY;
  delete process.env.CHAOS_APP_URL;
  vi.restoreAllMocks();
});

type T = ReturnType<typeof createTestConvex>;
async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  return { t, owner };
}
const queued = (t: T) => t.run(async ctx => (await ctx.db.query("indexNowQueue").collect()).map(row => row.url).sort());
const clear = (t: T) => t.run(async ctx => { for (const row of await ctx.db.query("indexNowQueue").collect()) await ctx.db.delete("indexNowQueue", row._id); });

it("queues a lesson URL on publish, material update and unpublish, but not on draft saves", async () => {
  const { t, owner } = await setup();
  const lessonId = await owner.mutation(api.lessons.create, { metadata });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
  expect(await queued(t)).toEqual([]);
  expect((await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).ok).toBe(true);
  expect(await queued(t)).toEqual([`https://chaos.fail/learn/${lessonId}`]);

  await clear(t);
  // Autosaves change only the draft, which the public page never shows.
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 2, document: { ...document, blocks: [{ ...document.blocks[0], text: "Draft edit" }] } });
  expect(await queued(t)).toEqual([]);
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 3, visibility: "public" });
  expect(await queued(t)).toEqual([`https://chaos.fail/learn/${lessonId}`]);

  await clear(t);
  // Republishing identical content is not a material update.
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 4, visibility: "public" });
  expect(await queued(t)).toEqual([]);

  await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 5, action: "unpublish" });
  expect(await queued(t)).toEqual([`https://chaos.fail/learn/${lessonId}`]);
});

it("never queues noindex lessons", async () => {
  const { t, owner } = await setup();
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { ...metadata, indexing: "noindex" } });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" });
  await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 2, action: "unpublish" });
  expect(await queued(t)).toEqual([]);
});

it("queues a published course and its lessons once each", async () => {
  const { t, owner } = await setup();
  const courseId = await owner.mutation(api.courses.create, { title: "Course" });
  const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: "Lesson" });
  const lesson = await owner.query(api.lessons.getDraft, { lessonId });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: lesson.revision, document, metadata: { ...lesson.metadata, indexing: "index" } });
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" });
  await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
  expect(await queued(t)).toEqual([`https://chaos.fail/learn/${lessonId}`, `https://chaos.fail/learn/courses/${courseId}`].sort());
  await clear(t);
  await owner.mutation(api.courses.unpublish, { courseId });
  expect(await queued(t)).toEqual([`https://chaos.fail/learn/courses/${courseId}`]);
});

it("queues forms only while the creator allows indexing, including on delete", async () => {
  const { t } = await setup();
  const definition = emptyDefinition("Public form");
  const formId = await t.run(async ctx => {
    const id = await authorDb(ctx).insert("forms", { ownerId: creatorIdentity.subject, title: "Form", shareId: "share1", status: "live", draft: definition, draftRevision: 0, settings: defaultFormSettings, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("formVersions", { formId: id, version: 1, definition, publishedAt: 1, publishedBy: "author", draftRevision: 0 });
    return id;
  });
  expect(await queued(t)).toEqual([]);
  await t.run(ctx => authorDb(ctx).patch("forms", formId, { settings: { ...defaultFormSettings, allowIndexing: true } }));
  expect(await queued(t)).toEqual(["https://chaos.fail/f/share1"]);
  await clear(t);
  await t.run(ctx => authorDb(ctx).delete("forms", formId));
  expect(await queued(t)).toEqual(["https://chaos.fail/f/share1"]);
});

it("does nothing without an IndexNow key", async () => {
  delete process.env.INDEXNOW_KEY;
  const { t, owner } = await setup();
  const lessonId = await owner.mutation(api.lessons.create, { metadata });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" });
  expect(await queued(t)).toEqual([]);
});

it("flushes the queue in one batch and keeps publishing working when IndexNow fails", async () => {
  const { t, owner } = await setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("IndexNow down"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
  expect((await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).ok).toBe(true);
  await t.action(internal.indexNow.flush, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body).toMatchObject({ host: "chaos.fail", key, urlList: [`https://chaos.fail/learn/${lessonId}`] });
  expect(await queued(t)).toEqual([]);
});
