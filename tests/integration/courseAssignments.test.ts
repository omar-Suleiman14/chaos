import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { freezeResultPolicy } from "../../convex/examResultModel";
import { createTestConvex } from "./setup";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Assignment testing" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0,
    document: { schemaVersion: 1, blocks: [
      { id: "first", type: "paragraph", text: "Learning outcomes", citations: [], conceptIds: [] },
    ] } });
  await doctor.mutation(api.courses.publish, { courseId, visibility: "public" });
  const now = Date.now();
  const assignmentId = await doctor.mutation(api.courseAssignments.create, {
    courseId, kind: "lesson", lessonId, title: "Assignment 1", instructions: "Finish lesson",
    outcome: "Anatomy", opensAt: now - 60_000, dueAt: now + 86_400_000,
  });
  return { t, doctor, student, courseId, lessonId, assignmentId, now };
}
async function approve(f: Awaited<ReturnType<typeof fixture>>) {
  await f.student.mutation(api.courseJoinRequests.requestJoin, { courseId: f.courseId });
  const [pending] = await f.doctor.query(api.courseJoinRequests.listPending, { courseId: f.courseId });
  await f.doctor.mutation(api.courseJoinRequests.decide, { requestId: pending.id, approve: true });
}
async function publish(f: Awaited<ReturnType<typeof fixture>>) {
  const [row] = await f.doctor.query(api.courseAssignments.teacherAssignments, { courseId: f.courseId });
  await f.doctor.mutation(api.courseAssignments.revise, {
    assignmentId: f.assignmentId, expectedRevision: row.revision,
    title: row.title, instructions: row.instructions, outcome: row.outcome,
    opensAt: row.opensAt, dueAt: row.dueAt, published: true, archived: false,
  });
}
it("keeps draft, roster and outcomes private, then uses existing lesson completion", async () => {
  const f = await fixture();
  await expect(f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.student.query(api.courseAssignments.teacherAssignments, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.student.mutation(api.courseAssignments.create, {
    courseId: f.courseId, kind: "lesson", lessonId: f.lessonId,
    title: "Forgery", instructions: "", outcome: "",
    opensAt: 1, dueAt: 100,
  })).rejects.toThrow("NOT_FOUND");
  await approve(f);
  expect(await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId })).toEqual([]);
  await publish(f);
  const [task] = await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId });
  expect(task).toMatchObject({ title: "Assignment 1", state: "due", percentBasisPoints: null });
  const before = await f.doctor.query(api.courseAssignments.teacherGradebook, { assignmentId: f.assignmentId });
  expect(before).toMatchObject({ count: 1, completed: 0, missed: 0 });
  await f.student.mutation(api.courseStudents.recordLesson, {
    courseId: f.courseId, lessonId: f.lessonId, completed: true,
  });
  expect((await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))[0].state)
    .toBe("completed");
  const gradebook = await f.doctor.query(api.courseAssignments.teacherGradebook, { assignmentId: f.assignmentId });
  expect(gradebook).toMatchObject({ completed: 1, rows: [{ assigned: true, percentBasisPoints: null }] });
  await expect(f.student.query(api.courseAssignments.teacherGradebook, { assignmentId: f.assignmentId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.doctor.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
});
it("requires revision control and honors revocation after publishing", async () => {
  const f = await fixture();
  await approve(f); await publish(f);
  await expect(f.doctor.mutation(api.courseAssignments.revise, {
    assignmentId: f.assignmentId, expectedRevision: 0, title: "Stale",
    instructions: "", outcome: "", opensAt: 1, dueAt: 2,
    published: true, archived: false,
  })).rejects.toThrow("REVISION_CONFLICT");
  const rows = await f.doctor.query(api.courseAssignments.teacherAssignments, { courseId: f.courseId });
  expect(rows).toHaveLength(1);
  await f.t.run(async ctx => {
    const request = await ctx.db.query("courseJoinRequests")
      .withIndex("by_course_student", q => q.eq("courseId", f.courseId)
        .eq("studentId", otherCreatorIdentity.subject)).unique();
    if (request) await ctx.db.patch("courseJoinRequests", request._id, { status: "removed" });
  });
  await expect(f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  expect((await f.doctor.query(api.courseAssignments.teacherGradebook, {
    assignmentId: f.assignmentId })).rows).toEqual([]);
});
it("keeps student exam percentages hidden until official release and regrade approval", async () => {
  const f = await fixture(); await approve(f);
  const { snapshotId, attemptId, gradeId } = await f.t.run(async ctx => {
    const draftId = await ctx.db.insert("examBuilderDrafts", {
      ownerId: creatorIdentity.subject, courseId: f.courseId, title: "Final exam",
      targetCount: 0, allocations: [], selections: [], revision: 0,
      createdAt: f.now, updatedAt: f.now,
    });
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId: creatorIdentity.subject, courseId: f.courseId, draftId,
      draftRevision: 0, version: 1, title: "Final exam",
      questions: [], totalPoints: 1, sealedAt: f.now,
    });
    await ctx.db.insert("examReleases", {
      ownerId: creatorIdentity.subject, courseId: f.courseId, draftId,
      activeSnapshotId: snapshotId, version: 1, studentEntryEnabled: false,
      audience: { mode: "all", studentIds: [], groupIds: [] },
      audienceRevision: 1, assignmentActive: true, preparedForAudience: true,
      createdAt: f.now, updatedAt: f.now,
    });
    const attemptId = await ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId: f.courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "submitted" as const,
      revision: 1, startedAt: f.now - 30_000, updatedAt: f.now,
      submittedAt: f.now, closedAt: f.now,
    });
    const gradeId = await ctx.db.insert("examGrades", {
      ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      snapshotId, attemptId, state: "auto_final" as const,
      earnedCents: 70, maximumCents: 100, objectiveMaximumCents: 100,
      pendingWrittenCount: 0, finalPercentBasisPoints: 7000,
      entries: [], algorithmVersion: 1, gradedAt: f.now,
      resultPolicy: freezeResultPolicy(defaultExamSettings),
    });
    return { snapshotId, attemptId, gradeId };
  });
  const examAssignmentId = await f.doctor.mutation(api.courseAssignments.create, {
    courseId: f.courseId, kind: "exam", snapshotId,
    title: "Final", instructions: "Complete the assessment", outcome: "Review",
    opensAt: f.now - 300_000, dueAt: f.now + 300_000,
  });
  const row = (await f.doctor.query(api.courseAssignments.teacherAssignments, {
    courseId: f.courseId })).find(a => a._id === examAssignmentId)!;
  await f.doctor.mutation(api.courseAssignments.revise, {
    assignmentId: row._id, expectedRevision: row.revision,
    title: row.title, instructions: row.instructions, outcome: row.outcome,
    opensAt: row.opensAt, dueAt: row.dueAt, published: true, archived: false,
  });
  const entry = (await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .find(a => a.id === examAssignmentId)!;
  expect(entry).toMatchObject({ grading: "withheld", percentBasisPoints: null, state: "completed" });
  const privateGradebook = await f.doctor.query(api.courseAssignments.teacherGradebook, { assignmentId: examAssignmentId });
  expect(privateGradebook.rows[0]).toMatchObject({ percentBasisPoints: 7000, releasedToStudent: false });
  await f.doctor.mutation(api.examResults.setPublication, { snapshotId, expectedRevision: 0, released: true });
  expect((await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .find(a => a.id === examAssignmentId)?.percentBasisPoints).toBe(7000);
  await f.t.run(ctx => ctx.db.patch("examGrades", gradeId, { reviewHold: true }));
  expect((await f.student.query(api.courseAssignments.myAssignments, { courseId: f.courseId }))
    .find(a => a.id === examAssignmentId)?.percentBasisPoints).toBeNull();
  expect(await f.student.query(api.examResults.myResult, { attemptId }))
    .toMatchObject({ status: "withheld" });
});
