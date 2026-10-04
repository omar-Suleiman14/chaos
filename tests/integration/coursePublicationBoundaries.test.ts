import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function publishedCourse() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Published course" });
  const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: "Published lesson" });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Public content", citations: [], conceptIds: [] }] } });
  await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
  return { t, owner, courseId, lessonId };
}

it("keeps unpublished course metadata out of public discovery", async () => {
  const { t, owner, courseId } = await publishedCourse();
  const original = (await t.query(api.courses.listPublic, {}))[0];
  await owner.mutation(api.courses.update, { courseId, title: "Private draft title", description: "Unpublished notes" });
  expect((await t.query(api.courses.listPublic, {}))[0]).toEqual(original);
  expect((await t.query(api.courses.getPublic, { courseId }))?.title).toBe("Published course");
});

it("rechecks lesson access and course moderation for public outlines", async () => {
  const { t, courseId, lessonId } = await publishedCourse();
  await t.run(ctx => ctx.db.patch("lessons", lessonId, { visibility: "private" }));
  expect((await t.query(api.courses.getPublic, { courseId }))?.lessons).toEqual([]);
  await t.run(ctx => ctx.db.patch("learnCollections", courseId, { communityState: "hidden" }));
  expect(await t.query(api.courses.getPublic, { courseId })).toBeNull();
  expect(await t.query(api.courses.listPublic, {})).toEqual([]);
});

it("excludes restricted creators and rejects malformed catalogue limits", async () => {
  const { t, courseId } = await publishedCourse();
  await t.run(async ctx => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
    await ctx.db.patch("users", user!._id, { isBanned: true });
  });
  expect(await t.query(api.courses.getPublic, { courseId })).toBeNull();
  expect(await t.query(api.courses.listPublic, {})).toEqual([]);
  await expect(t.query(api.courses.listPublic, { limit: 1.5 })).rejects.toThrow("VALIDATION_FAILED");
});

it("publishes lessons with their course, then keeps the live course in step with lesson updates", async () => {
 const { t, owner, courseId, lessonId } = await publishedCourse();
 const text = (doc: unknown) => (doc as { blocks: { text: string }[] }).blocks[0].text;
 // Publishing the course published its lesson.
 expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))?.publishedVersionId).toBeDefined();
 // Once the course is live, publishing the lesson updates the course too.
 let row = await t.run(ctx => ctx.db.get("lessons", lessonId));
 await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: row!.revision, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Lesson update", citations: [], conceptIds: [] }] } });
 row = await t.run(ctx => ctx.db.get("lessons", lessonId));
 expect((await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: row!.revision, visibility: "public" })).ok).toBe(true);
 expect(text((await t.query(api.courses.lesson, { courseId, lessonId }))?.version.document)).toBe("Lesson update");
 // Republishing the course publishes newer lesson drafts as well.
 row = await t.run(ctx => ctx.db.get("lessons", lessonId));
 await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: row!.revision, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Course update", citations: [], conceptIds: [] }] } });
 expect(await owner.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
 expect(text((await t.query(api.courses.lesson, { courseId, lessonId }))?.version.document)).toBe("Course update");
 // A lesson that can't be published blocks the course and stays unpublished.
 const draftLesson = await owner.mutation(api.courses.addLesson, { courseId, title: "Draft" });
 expect((await owner.mutation(api.courses.publish, { courseId, visibility: "public" })).ok).toBe(false);
 expect((await t.run(ctx => ctx.db.get("lessons", draftLesson)))?.publishedVersionId).toBeUndefined();
 await owner.mutation(api.courses.unpublish, { courseId });
 expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))?.publishedVersionId).toBeDefined();
});

it("won't publish a lesson on its own before its course is published", async () => {
 vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
 const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
 await owner.mutation(api.quizFunctions.getOrCreateUser, {});
 const courseId = await owner.mutation(api.courses.create, { title: "Draft course" });
 const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: "Lesson" });
 await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Text", citations: [], conceptIds: [] }] } });
 await expect(owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).rejects.toThrow("COURSE_UNPUBLISHED");
 expect(await owner.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
 // Inside a published course, a plain lesson link resolves to its course.
 expect(await t.query(api.courses.courseForLesson, { lessonId })).toBe(courseId);
 // Lessons outside any course publish as before.
 const solo = await owner.mutation(api.lessons.create, { metadata: { title: "Solo", description: "", language: "en", tags: [] } });
 expect(await t.query(api.courses.courseForLesson, { lessonId: solo })).toBeNull();
});
