import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
afterEach(() => vi.unstubAllEnvs());
it("indexes published courses, excludes drafts and revoked creators", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(),
    owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, {
    title: "Anatomy",
  });
  const lessonId = await owner.mutation(api.courses.addLesson, {
    courseId,
    title: "Meninges",
  });
  await owner.mutation(api.lessons.saveDraft, {
    lessonId,
    expectedRevision: 0,
    document: {
      schemaVersion: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          text: "Lesson",
          citations: [],
          conceptIds: [],
        },
      ],
    },
  });
  const args = {
    text: "Anatomy",
    paginationOpts: { numItems: 24, cursor: null },
  };
  expect(
    (await t.query(api.courseDirectory.browse, { ...args, text: undefined }))
      .page,
  ).toEqual([]);
  expect(
    await owner.mutation(api.courses.publish, {
      courseId,
      visibility: "public",
    }),
  ).toEqual({ ok: true });
  expect((await t.query(api.courseDirectory.browse, args)).page).toMatchObject([
    { id: courseId, title: "Anatomy", lessons: 1 },
  ]);
  await owner.mutation(api.courses.update, {
    courseId,
    title: "Secret draft title",
  });
  expect(
    (await t.query(api.courseDirectory.browse, { ...args, text: "Secret" }))
      .page,
  ).toEqual([]);
  expect(
    await owner.mutation(api.courses.publish, {
      courseId,
      visibility: "public",
    }),
  ).toEqual({ ok: true });
  expect(
    (await t.query(api.courseDirectory.browse, { ...args, text: "Secret" }))
      .page,
  ).toMatchObject([{ id: courseId, title: "Secret draft title" }]);
  await owner.mutation(api.courses.update, { courseId, title: "Anatomy" });
  await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
  await t.run((ctx) =>
    ctx.db.patch("learnCollections", courseId, { searchText: undefined }),
  );
  await t.mutation(internal.courseDirectory.backfill, {});
  expect((await t.query(api.courseDirectory.browse, args)).page).toHaveLength(
    1,
  );
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject))
      .unique();
    await ctx.db.patch("users", user!._id, { isBanned: true });
  });
  expect((await t.query(api.courseDirectory.browse, args)).page).toEqual([]);
});

it("continues after a page containing only unpublished courses", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Visible course" });
  const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: "Lesson" });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Lesson", citations: [], conceptIds: [] }] } });
  await owner.mutation(api.courses.publish, { courseId, visibility: "public" });

  await t.run(async (ctx) => {
    for (let index = 0; index < 24; index++) {
      await ctx.db.insert("learnCollections", {
        ownerId: creatorIdentity.subject,
        metadata: { title: `Draft ${index}`, description: "", language: "en", tags: [] },
        items: [], lessonIds: [], revision: 0, visibility: "public", communityState: "ok",
        createdAt: 1000 + index, updatedAt: 1000 + index,
      });
    }
    await ctx.db.patch("learnCollections", courseId, { updatedAt: 1 });
  });

  const first = await t.query(api.courseDirectory.browse, { paginationOpts: { numItems: 24, cursor: null } });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  const second = await t.query(api.courseDirectory.browse, { paginationOpts: { numItems: 24, cursor: first.continueCursor } });
  expect(second.page).toMatchObject([{ id: courseId, title: "Visible course" }]);
});
