import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

const document = {
  schemaVersion: 1 as const,
  blocks: [{ id: "p", type: "paragraph" as const, text: "Restricted course lecture", citations: [], conceptIds: [] }],
};

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Clinical teaching" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  const published = await doctor.query(api.lessons.getPublished, { lessonId });
  if (!published) throw new Error("Missing published version");
  return { t, doctor, student, courseId, lessonId, versionId: published._id };
}

it("blocks direct course, lesson, version and progress access until owner approval", async () => {
  const { t, doctor, student, courseId, lessonId, versionId } = await fixture();
  // Discoverability is not admission.
  expect((await t.query(api.courses.getPublic, { courseId }))?.lessons).toHaveLength(1);
  expect(await t.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  expect(await t.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();
  expect(await student.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();
  expect(await student.query(api.learnFrontend.publicLessonSummary, { id: lessonId })).toBeNull();
  expect(await student.query(api.learnFrontend.publicLessonsBatch, { ids: [lessonId] })).toEqual([]);
  await expect(t.query(internal.mcpLearn.getLesson, { userId: otherCreatorIdentity.subject, lessonId, view: "published" })).rejects.toThrow("NOT_FOUND");
  expect(await student.query(api.courses.myProgress, { courseId })).toEqual([]);
  await expect(student.mutation(api.courses.remember, { courseId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(api.lessons.getPublished, { lessonId })).rejects.toThrow("NOT_FOUND");
  await expect(student.query(api.lessons.getPublished, { lessonId })).rejects.toThrow("NOT_FOUND");
  await expect(student.query(api.lessonVersionReads.get, { lessonId, versionId })).rejects.toThrow("NOT_FOUND");

  // A pre-existing legacy enrollment is not an approval grant.
  await t.run(ctx => ctx.db.insert("courseEnrollments", {
    courseId, ownerId: creatorIdentity.subject,
    key: `user:${otherCreatorIdentity.subject}`, studentId: otherCreatorIdentity.subject,
    completedLessonIds: [], enrolledAt: Date.now(), updatedAt: Date.now(),
  }));
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: false, owner: false });
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();

  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  const [request] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });

  expect((await student.query(api.courses.lesson, { courseId, lessonId }))?.version._id).toBe(versionId);
  expect((await student.query(api.lessons.getPublished, { lessonId }))?._id).toBe(versionId);
  expect((await student.query(api.learnFrontend.publicLesson, { id: lessonId }))?.version._id).toBe(versionId);
  expect((await student.query(api.learnFrontend.publicLessonSummary, { id: lessonId }))?.lessonId).toBe(lessonId);
  expect((await student.query(api.learnFrontend.publicLessonsBatch, { ids: [lessonId] })).map(row => row.lessonId)).toEqual([lessonId]);
  expect((await t.query(internal.mcpLearn.getLesson, { userId: otherCreatorIdentity.subject, lessonId, view: "published" })).versionId).toBe(versionId);
  expect((await student.query(api.lessonVersionReads.get, { lessonId, versionId }))._id).toBe(versionId);
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: true, owner: false });
  expect(await student.query(api.courses.myProgress, { courseId })).toHaveLength(1);

  // A removed approval revokes all paths even when an enrollment row remains.
  await t.run(ctx => ctx.db.patch("courseJoinRequests", request.id, { status: "rejected" }));
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  await expect(student.query(api.lessons.getPublished, { lessonId })).rejects.toThrow("NOT_FOUND");
  expect(await student.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();
  expect(await student.query(api.learnFrontend.publicLessonSummary, { id: lessonId })).toBeNull();
  expect(await student.query(api.learnFrontend.publicLessonsBatch, { ids: [lessonId] })).toEqual([]);
  await expect(t.query(internal.mcpLearn.getLesson, { userId: otherCreatorIdentity.subject, lessonId, view: "published" })).rejects.toThrow("NOT_FOUND");
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: false, owner: false });
});

it("preserves unrestricted published lessons that do not belong to any course", async () => {
  const { t, doctor } = await fixture();
  const lessonId = await doctor.mutation(api.lessons.create, {
    metadata: { title: "Standalone resource", description: "", language: "en", tags: [] },
    document,
  });
  const result = await doctor.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  expect(result.ok).toBe(true);
  expect((await t.query(api.lessons.getPublished, { lessonId }))?.document.blocks).toHaveLength(1);
  expect((await t.query(api.learnFrontend.publicLesson, { id: lessonId }))?.version.document.blocks).toHaveLength(1);
  expect((await t.query(api.learnFrontend.publicLessonsBatch, { ids: [lessonId] })).map(row => row.lessonId)).toEqual([lessonId]);
});
