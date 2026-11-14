import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
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

it("gates answer bundles behind explicit consent, claim and admin identity; proposals never finalize grades", async () => {
  const { t, owner, student, attemptId, snapshotId } = await fixture();
  const aId = "user_gradingAdmin01";
  const bId = "user_gradingAdmin02";
  await t.run(async ctx => {
    for (const id of [aId, bId]) {
      await ctx.db.insert("users", { clerkId: id, name: id, username: id, email: id + "@example.org", createdAt: 0 });
      await ctx.db.insert("admins", { clerkId: id, email: id + "@example.org", grantedAt: 0 });
    }
  });
  const opt = await owner.mutation(api.examGradingJobs.request,
    { attemptId, requestKey: "proposal-request-001", confirmAdminAccess: true });
  await expect(t.mutation(internal.examGradingProposals.bundle, { userId: aId, jobId: opt.jobId }))
    .rejects.toThrow("GRADING_CONFLICT");
  await expect(t.mutation(internal.examGradingProposals.bundle,
    { userId: otherCreatorIdentity.subject, jobId: opt.jobId })).rejects.toThrow();
  const queued = await t.query(internal.mcpAdmin.gradingJobs, { userId: aId, status: "queued" });
  expect(queued.jobs[0]).not.toHaveProperty("response");
  await t.mutation(internal.mcpAdmin.claimGradingJob, { userId: aId, jobId: opt.jobId, expectedRevision: 0 });
  await expect(t.mutation(internal.examGradingProposals.bundle, { userId: bId, jobId: opt.jobId }))
    .rejects.toThrow("GRADING_CONFLICT");
  const data = await t.mutation(internal.examGradingProposals.bundle, { userId: aId, jobId: opt.jobId });
  expect(data.questions[0]).toMatchObject({ response: "My supported argument",
    rubricCriteria: [{ id: "logic", weightPercent: 100 }] });
  const draft = { userId: aId, jobId: opt.jobId, questionIndex: 0, expectedRevision: 0,
    criterionScores: [{ criterionId: "logic", scorePercent: 80 }],
    evidence: [{ criterionId: "logic", quote: "supported argument",
      rationale: "Answer supplies an argument for the claim." }],
    confidence: "medium" as const, feedback: "Check the reasoning", modelId: "manual-assistant" };
  await expect(t.mutation(internal.examGradingProposals.save,
    { ...draft, evidence: [{ ...draft.evidence[0], quote: "fabricated citation" }] }))
    .rejects.toThrow("INVALID_PROPOSAL");
  await expect(t.mutation(internal.examGradingProposals.submit,
    { userId: aId, jobId: opt.jobId, expectedRevision: 1 })).rejects.toThrow("GRADING_CONFLICT");
  const saved = await t.mutation(internal.examGradingProposals.save, draft);
  expect(saved).toMatchObject({ awardedCents: 160, revision: 1 });
  await expect(t.mutation(internal.examGradingProposals.save, draft)).rejects.toThrow("REVISION_CONFLICT");
  const sent = await t.mutation(internal.examGradingProposals.submit,
    { userId: aId, jobId: opt.jobId, expectedRevision: 1 });
  expect(sent.status).toBe("doctor_review");
  expect((await t.run(ctx => ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique()))).toMatchObject({
      snapshotId, state: "needs_manual", pendingWrittenCount: 1, earnedCents: 0,
  });
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
  await expect(t.mutation(internal.examGradingProposals.bundle, { userId: aId, jobId: opt.jobId }))
    .rejects.toThrow("GRADING_CONFLICT");
  const audit = await t.run(ctx => ctx.db.query("examGradingJobAudit")
    .withIndex("by_job_time", q => q.eq("jobId", opt.jobId)).collect());
  expect(audit.map(v => v.action)).toEqual(["requested", "claimed", "bundle_read", "proposal_saved", "sent_to_doctor"]);
});
