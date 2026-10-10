import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authorDb } from "../../convex/authorIndex";
import { measureConvex } from "../../perf/lib/convex";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const metadata = { title: "Synthetic lesson", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Synthetic teaching", citations: [], conceptIds: [] }] };
async function legacyFixture(count = 501) {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), member = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await member.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  const earlyLessonId = await owner.mutation(api.lessons.create, { metadata, document });
  const teamId = await owner.mutation(api.businessTeams.create, { name: "Synthetic team" });
  const seeded = await t.run(async ctx => {
    const memberId = await ctx.db.insert("businessMembers", { teamId, userId: otherCreatorIdentity.subject, role: "member", joinedAt: 0 });
    const courses: Id<"learnCollections">[] = [], shares: Id<"businessShares">[] = [];
    for (let i = 0; i < count; i++) {
      const id = await ctx.db.insert("learnCollections", { ownerId: creatorIdentity.subject, metadata: { ...metadata, title: `Course ${i}` }, items: [], lessonIds: i === count - 1 ? [lessonId] : i === 0 ? [earlyLessonId] : [], revision: 0, visibility: "private", communityState: "ok", createdAt: i, updatedAt: i });
      courses.push(id);
      if (i === 0 || i === count - 1) shares.push(await ctx.db.insert("businessShares", { teamId, asset: { kind: "course", id }, ownerId: creatorIdentity.subject, sharedBy: creatorIdentity.subject, createdAt: 0 }));
    }
    return { memberId, courses, shares };
  });
  return { t, owner, member, lessonId, earlyLessonId, teamId, ...seeded };
}
async function finishBackfill(t: ReturnType<typeof createTestConvex>, restart = false) {
  await t.mutation(internal.businessTeams.backfillCourseMemberships, { restart });
  for (let i = 0; i < 100; i++) {
    const state = await t.run(ctx => ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique());
    if (state?.complete) return;
    if (!state || state.cursor === undefined) throw new Error("Backfill did not start");
    await t.mutation(internal.businessTeams.backfillCourseMembershipsPage, { generation: state.generation, cursor: state.cursor });
  }
  throw new Error("Backfill did not complete within fixture bound");
}

describe("indexed course membership", () => {
  it("repairs inherited access beyond 500 courses without scanning unrelated courses", async () => {
    const f = await legacyFixture();
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.earlyLessonId })).not.toBeNull();
    const before = await measureConvex(() => f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId }));
    expect(before.result).toBeNull();
    expect(before.cost.documentsRead).toBeGreaterThanOrEqual(500);
    await finishBackfill(f.t);
    const after = await measureConvex(() => f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId }));
    expect(after.result?._id).toBe(f.lessonId);
    expect(after.cost.documentsRead).toBeLessThan(25);
    expect(await f.t.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("courseLessonMemberships").collect())).toHaveLength(2);
    await f.owner.mutation(api.businessTeams.removeMember, { teamId: f.teamId, userId: otherCreatorIdentity.subject });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
  });

  it("enforces the unpublished-course boundary beyond the newest 500 courses", async () => {
    const f = await legacyFixture();
    await finishBackfill(f.t);
    await expect(f.owner.mutation(api.lessons.publish, { lessonId: f.earlyLessonId, expectedRevision: 0, visibility: "public" })).rejects.toThrow("COURSE_UNPUBLISHED");
    await f.owner.mutation(api.courses.setArchived, { courseId: f.courses[0], archived: true });
    expect((await f.owner.mutation(api.lessons.publish, { lessonId: f.earlyLessonId, expectedRevision: 0, visibility: "public" })).ok).toBe(true);
  });

  it("updates older live course links without rewriting historical lesson versions", async () => {
    const f = await legacyFixture();
    await finishBackfill(f.t);
    await f.owner.mutation(api.courses.publish, { courseId: f.courses[0], visibility: "public" });
    const lesson = await f.owner.query(api.lessons.getDraft, { lessonId: f.earlyLessonId });
    const historical = await f.t.run(ctx => ctx.db.get("lessonVersions", lesson.publishedVersionId!));
    await f.owner.mutation(api.lessons.saveDraft, { lessonId: f.earlyLessonId, expectedRevision: lesson.revision, document: { ...document, blocks: [{ ...document.blocks[0], text: "Updated synthetic teaching" }] } });
    const published = await f.owner.mutation(api.lessons.publish, { lessonId: f.earlyLessonId, expectedRevision: lesson.revision + 1, visibility: "public" });
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error("Publication failed");
    const course = await f.t.run(ctx => ctx.db.get("learnCollections", f.courses[0]));
    const live = await f.t.run(ctx => ctx.db.get("collectionVersions", course!.publishedVersionId!));
    expect(live?.items).toMatchObject([{ kind: "lesson", id: f.earlyLessonId, versionId: published.versionId }]);
    expect(await f.t.run(ctx => ctx.db.get("lessonVersions", historical!._id))).toEqual(historical);
  });

  it("maintains fresh outlines transactionally and lets empty drafts override legacy items", async () => {
    const f = await legacyFixture(2);
    await finishBackfill(f.t);
    await f.owner.mutation(api.courses.setOutline, { courseId: f.courses[1], lessonIds: [] });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    const newCourse = await f.owner.mutation(api.courses.create, { title: "Managed" });
    await f.owner.mutation(api.courses.setOutline, { courseId: newCourse, lessonIds: [f.lessonId] });
    await f.owner.mutation(api.businessTeams.share, { teamId: f.teamId, asset: { kind: "course", id: newCourse } });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).not.toBeNull();
    await f.t.run(ctx => authorDb(ctx).delete("learnCollections", newCourse));
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("courseLessonMemberships").withIndex("by_courseId", q => q.eq("courseId", newCourse)).collect())).toEqual([]);
  });

  it("inherits through a shared folder and rechecks unsharing without copying grants", async () => {
    const f = await legacyFixture();
    await finishBackfill(f.t);
    await f.owner.mutation(api.businessTeams.unshare, { shareId: f.shares[1] });
    const folderId = await f.owner.mutation(api.folders.create, { name: "Shared", parentId: null });
    await f.owner.mutation(api.folders.addMember, { folderId, asset: { kind: "collection", id: f.courses[500] } });
    await f.owner.mutation(api.businessTeams.share, { teamId: f.teamId, asset: { kind: "folder", id: folderId } });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).not.toBeNull();
    await f.owner.mutation(api.businessTeams.removeMember, { teamId: f.teamId, userId: otherCreatorIdentity.subject });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("lessonPermissions").collect())).toEqual([]);
  });

  it("ignores stale or forged associations and revoked course shares", async () => {
    const f = await legacyFixture(2);
    await finishBackfill(f.t);
    await f.owner.mutation(api.businessTeams.unshare, { shareId: f.shares[1] });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    await f.t.run(async ctx => {
      await ctx.db.insert("courseLessonMemberships", { courseId: f.courses[0], lessonId: f.lessonId, ownerId: creatorIdentity.subject });
      const foreign = await ctx.db.insert("learnCollections", { ownerId: otherCreatorIdentity.subject, metadata, items: [], lessonIds: [f.lessonId], revision: 0, visibility: "private", communityState: "ok", createdAt: 0, updatedAt: 0 });
      await ctx.db.insert("courseLessonMemberships", { courseId: foreign, lessonId: f.lessonId, ownerId: creatorIdentity.subject });
    });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
  });

  it("backfills legacy items, preserves complete rows, and makes restart/duplicate pages idempotent", async () => {
    const f = await legacyFixture(25);
    await f.t.run(async ctx => {
      const versionId = await ctx.db.insert("lessonVersions", { lessonId: f.lessonId, number: 1, metadata, document, authorId: creatorIdentity.subject, publishedAt: 0, visibility: "public" });
      await ctx.db.patch("learnCollections", f.courses[24], { lessonIds: undefined, items: [{ kind: "lesson", id: f.lessonId, versionId }] });
    });
    const original = await f.t.run(ctx => ctx.db.get("learnCollections", f.courses[24]));
    await f.t.mutation(internal.businessTeams.backfillCourseMemberships, {});
    await f.t.mutation(internal.businessTeams.backfillCourseMembershipsPage, { generation: 1, cursor: null });
    const state = await f.t.run(ctx => ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique());
    expect(state?.complete).toBe(false);
    await f.t.mutation(internal.businessTeams.backfillCourseMembershipsPage, { generation: 1, cursor: null });
    expect(await f.t.run(ctx => ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique())).toEqual(state);
    await finishBackfill(f.t, true);
    await f.t.mutation(internal.businessTeams.backfillCourseMembershipsPage, { generation: 1, cursor: state!.cursor! });
    const edges = await f.t.run(ctx => ctx.db.query("courseLessonMemberships").collect());
    await finishBackfill(f.t, true);
    expect(await f.t.run(ctx => ctx.db.query("courseLessonMemberships").collect())).toEqual(edges);
    expect(await f.t.run(ctx => ctx.db.get("learnCollections", f.courses[24]))).toEqual(original);
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).not.toBeNull();
    await f.owner.mutation(api.courses.setOutline, { courseId: f.courses[24], lessonIds: [] });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
  });

  it("initializes new installations without a migration and indexes newly added lessons", async () => {
    const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
    const courseId = await owner.mutation(api.courses.create, {});
    const lessonId = await owner.mutation(api.courses.addLesson, { courseId });
    expect((await t.run(ctx => ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique()))?.complete).toBe(true);
    expect(await t.run(ctx => ctx.db.query("courseLessonMemberships").withIndex("by_courseId", q => q.eq("courseId", courseId)).collect())).toMatchObject([{ courseId, lessonId, ownerId: creatorIdentity.subject }]);
  });

  it("keeps concurrent outline changes and new courses when a backfill resumes", async () => {
    const f = await legacyFixture(25);
    await f.t.mutation(internal.businessTeams.backfillCourseMemberships, {});
    await f.t.mutation(internal.businessTeams.backfillCourseMembershipsPage, { generation: 1, cursor: null });
    await f.owner.mutation(api.courses.setOutline, { courseId: f.courses[24], lessonIds: [] });
    const courseId = await f.owner.mutation(api.courses.create, {});
    await f.owner.mutation(api.courses.setOutline, { courseId, lessonIds: [f.lessonId] });
    await f.owner.mutation(api.businessTeams.share, { teamId: f.teamId, asset: { kind: "course", id: courseId } });
    await finishBackfill(f.t);
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).not.toBeNull();
    expect(await f.t.run(ctx => ctx.db.query("courseLessonMemberships").withIndex("by_ownerId_and_lessonId", q => q.eq("ownerId", creatorIdentity.subject).eq("lessonId", f.lessonId)).collect())).toMatchObject([{ courseId }]);
  });

  it("keeps rejected outline changes atomic and still enforces creator moderation", async () => {
    const f = await legacyFixture(2);
    await finishBackfill(f.t);
    const before = await f.t.run(ctx => ctx.db.query("courseLessonMemberships").collect());
    const foreignLessonId = await f.member.mutation(api.lessons.create, { metadata, document });
    await expect(f.owner.mutation(api.courses.setOutline, { courseId: f.courses[1], lessonIds: [foreignLessonId] })).rejects.toThrow("NOT_FOUND");
    expect(await f.t.run(ctx => ctx.db.query("courseLessonMemberships").collect())).toEqual(before);
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).not.toBeNull();
    await f.owner.mutation(api.courses.publish, { courseId: f.courses[1], visibility: "public" });
    expect(await f.t.query(api.learnFrontend.publicLesson, { id: f.lessonId })).not.toBeNull();
    await f.t.run(async ctx => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    expect(await f.member.query(api.learnFrontend.editableLesson, { id: f.lessonId })).toBeNull();
    expect(await f.t.query(api.learnFrontend.publicLesson, { id: f.lessonId })).toBeNull();
    const userId = await f.t.run(async ctx => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
      await ctx.db.patch("users", user!._id, { isBanned: false, suspendedUntil: Date.now() - 1 });
      return user!._id;
    });
    // Expiry is cleared by the scheduler, not interpreted differently in this read.
    expect(await f.t.query(api.learnFrontend.publicLesson, { id: f.lessonId })).toBeNull();
    await f.t.run(ctx => ctx.db.patch("users", userId, { suspendedUntil: undefined }));
    expect(await f.t.query(api.learnFrontend.publicLesson, { id: f.lessonId })).not.toBeNull();
    await f.t.run(ctx => ctx.db.delete("users", userId));
    expect((await f.t.query(api.learnFrontend.publicLesson, { id: f.lessonId }))?.ownerName).toBe("Chaos creator");
  });
});
