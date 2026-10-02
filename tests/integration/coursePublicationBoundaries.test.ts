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
