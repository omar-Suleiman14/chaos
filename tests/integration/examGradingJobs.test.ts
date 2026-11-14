import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
import { defaultExamSettings } from "../../convex/examSettingsModel";

afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Private essay marking" });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  const questionId = await owner.mutation(api.questionBank.createForCourse, { courseId, item: {
    kind: "written", prompt: "Defend the hypothesis", choices: [], correctChoiceIds: [],
    points: 2, topics: [], terms: [], outcomes: [], status: "ready",
    rubricCriteria: [{ id: "logic", description: "Evidence", weightPercent: 100 }],
  } });
  const now = Date.now();
  const ids = await t.run(async ctx => {
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId: creatorIdentity.subject, courseId, draftId,
      draftRevision: 0, version: 1, title: "Human marking",
      questions: [{ sourceQuestionId: questionId, sourceRevision: 0, allocationId: "essay",
        kind: "written", prompt: "Defend the hypothesis", choices: [],
        correctChoiceIds: [], points: 2, topics: [], terms: [], outcomes: [],
        rubricCriteria: [{ id: "logic", description: "Evidence", weightPercent: 100 }] }],
      totalPoints: 2, sealedAt: now,
    });
    await ctx.db.insert("examReleases", {
      ownerId: creatorIdentity.subject, courseId, draftId,
      activeSnapshotId: snapshotId, version: 1, studentEntryEnabled: false,
      settings: { ...defaultExamSettings, resultVisibility: "manual" },
      createdAt: now, updatedAt: now,
    });
    const attemptId = await ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "submitted",
      revision: 1, startedAt: now - 60_000, submittedAt: now, closedAt: now, updatedAt: now,
    });
    await ctx.db.insert("examAttemptAnswers", {
      attemptId, snapshotId, studentId: otherCreatorIdentity.subject,
      questionIndex: 0, choiceIds: [], text: "My supported argument", flagged: false,
      savedForLater: false, revision: 1, lastMutationId: "seed", savedAt: now,
    });
    await ctx.db.insert("examGrades", {
      attemptId, snapshotId, ownerId: creatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, state: "needs_manual",
      earnedCents: 0, maximumCents: 200, objectiveMaximumCents: 0,
      pendingWrittenCount: 1, entries: [{ questionIndex: 0,
        status: "needs_manual", pointsAvailableCents: 200, pointsAwardedCents: 0 }],
      algorithmVersion: 1, gradedAt: now,
      resultPolicy: { visibility: "manual", passingPercent: 50 },
    });
    return { snapshotId, attemptId };
  });
  return { t, owner, student, draftId, ...ids };
}

it("creates one opt-in job per attempt; only admins may claim and expired claims are retried", async () => {
  const { t, owner, student, attemptId, draftId } = await fixture();
  const options = { attemptId, requestKey: "test-request-01", confirmAdminAccess: true };
  await expect(student.mutation(api.examGradingJobs.request, options)).rejects.toThrow("NOT_FOUND");
  await expect(owner.mutation(api.examGradingJobs.request,
    { ...options, confirmAdminAccess: false })).rejects.toThrow("INVALID_REQUEST");
  const first = await owner.mutation(api.examGradingJobs.request, options);
  expect(first).toMatchObject({ status: "queued", revision: 0, reused: false });
  expect(await owner.mutation(api.examGradingJobs.request, options)).toMatchObject({
    jobId: first.jobId, reused: true,
  });
  await expect(owner.mutation(api.examGradingJobs.request,
    { ...options, requestKey: "different-request-01" })).rejects.toThrow("GRADING_CONFLICT");
  expect((await owner.query(api.examGradingJobs.myJobs, { draftId })).jobs).toHaveLength(1);
  await expect(student.query(api.examGradingJobs.myJobs, { draftId })).rejects.toThrow("NOT_FOUND");
  await expect(student.query(api.examGradingJobs.adminQueue, {})).rejects.toThrow();
  const adminId = "user_123456789abc";
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: adminId, email: "grader-admin@example.org",
      name: "Admin", username: "grader-admin", createdAt: 0 });
    await ctx.db.insert("admins", { clerkId: adminId, email: "grader-admin@example.org", grantedAt: 0 });
  });
  const admin = t.withIdentity({ subject: adminId, issuer: creatorIdentity.issuer,
    tokenIdentifier: `https://test.example|${adminId}` });
  const queue = await admin.query(api.examGradingJobs.adminQueue, { status: "queued" });
  expect(queue.jobs).toHaveLength(1);
  expect(queue.jobs[0]).not.toHaveProperty("answer");
  const claimed = await admin.mutation(api.examGradingJobs.adminClaim, { jobId: first.jobId, expectedRevision: 0 });
  expect(claimed.revision).toBe(1);
  await expect(admin.mutation(api.examGradingJobs.adminClaim,
    { jobId: first.jobId, expectedRevision: 0 })).rejects.toThrow("REVISION_CONFLICT");
  await expect(admin.mutation(api.examGradingJobs.adminRetry,
    { jobId: first.jobId, expectedRevision: 1 })).rejects.toThrow("GRADING_CONFLICT");
  await t.run(async ctx => ctx.db.patch("examGradingJobs", first.jobId, { claimExpiresAt: 1 }));
  expect(await admin.mutation(api.examGradingJobs.adminRetry,
    { jobId: first.jobId, expectedRevision: 1 })).toMatchObject({ retryCount: 1, revision: 2 });
  expect((await t.run(ctx => ctx.db.query("examGradingJobAudit")
    .withIndex("by_job_time", q => q.eq("jobId", first.jobId)).collect()))
    .map(a => a.action)).toEqual(["requested", "claimed", "requeued"]);
});
