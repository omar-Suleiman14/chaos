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
  const courseId = await owner.mutation(api.courses.create, { title: "Appeal privacy test" });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  const questionId = await owner.mutation(api.questionBank.createForCourse, { courseId, item: {
    kind: "written", prompt: "Describe a pathway", choices: [], correctChoiceIds: [],
    points: 2, topics: [], terms: [], outcomes: [], status: "ready",
    rubricCriteria: [{ id: "evidence", description: "Evidence", weightPercent: 100 }],
  } });
  const now = Date.now();
  const ids = await t.run(async ctx => {
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId: creatorIdentity.subject, courseId, draftId, draftRevision: 0,
      version: 1, title: "Private essay",
      questions: [{ sourceQuestionId: questionId, sourceRevision: 0, allocationId: "essay",
        kind: "written", prompt: "Describe a pathway", choices: [], correctChoiceIds: [],
        points: 2, topics: [], terms: [], outcomes: [],
        rubricCriteria: [{ id: "evidence", description: "Evidence", weightPercent: 100 }] }],
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
      revision: 1, startedAt: now - 100_000, submittedAt: now, closedAt: now, updatedAt: now,
    });
    await ctx.db.insert("examAttemptAnswers", {
      attemptId, snapshotId, studentId: otherCreatorIdentity.subject,
      questionIndex: 0, choiceIds: [], text: "The pathway follows a supported mechanism",
      flagged: false, savedForLater: false, revision: 1, lastMutationId: "seed", savedAt: now,
    });
    await ctx.db.insert("examGrades", {
      attemptId, snapshotId, ownerId: creatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, state: "needs_manual",
      earnedCents: 0, maximumCents: 200, objectiveMaximumCents: 0,
      pendingWrittenCount: 1, entries: [{
        questionIndex: 0, status: "needs_manual", pointsAvailableCents: 200, pointsAwardedCents: 0,
      }], algorithmVersion: 1, gradedAt: now, resultPolicy: {
        visibility: "manual", passingPercent: 50,
      },
    });
    return { snapshotId, attemptId };
  });
  return { t, owner, student, draftId, ...ids };
}
const score = (scorePercent: number) => [{ criterionId: "evidence", scorePercent }];

it("doctor alone consumes an assisted proposal; approval does not finalize or publish", async () => {
  const { t, owner, student, attemptId } = await fixture();
  const adminId = "user_authorizedGradeAdmin";
  await t.run(async ctx => {
    await ctx.db.insert("users", {
      clerkId: adminId, name: "Admin", username: "authorizedAdmin",
      email: "admin@example.com", createdAt: 0,
    });
    await ctx.db.insert("admins", { clerkId: adminId, email: "admin@example.com", grantedAt: 0 });
  });
  const job = await owner.mutation(api.examGradingJobs.request, {
    attemptId, confirmAdminAccess: true, requestKey: "doctor-review-001",
  });
  await t.mutation(internal.mcpAdmin.claimGradingJob, {
    userId: adminId, jobId: job.jobId, expectedRevision: 0,
  });
  await t.mutation(internal.examGradingProposals.save, {
    userId: adminId, jobId: job.jobId, questionIndex: 0, expectedRevision: 0,
    criterionScores: score(80), feedback: "Evidence supports the claim",
    evidence: [{ criterionId: "evidence", quote: "supported mechanism",
      rationale: "The response names the mechanistic support." }],
    confidence: "medium",
  });
  await t.mutation(internal.examGradingProposals.submit, {
    userId: adminId, jobId: job.jobId, expectedRevision: 1,
  });
  await expect(student.query(api.examDoctorReview.review, { jobId: job.jobId }))
    .rejects.toThrow("NOT_FOUND");
  const review = await owner.query(api.examDoctorReview.review, { jobId: job.jobId });
  expect(review.proposals).toMatchObject([{ awardedCents: 160, state: "sent" }]);
  await expect(student.mutation(api.examDoctorReview.decide, {
    jobId: job.jobId, questionIndex: 0, expectedJobRevision: 2,
    expectedMarkRevision: 0, decision: "accept", note: "Reviewed",
  })).rejects.toThrow("NOT_FOUND");
  const decision = await owner.mutation(api.examDoctorReview.decide, {
    jobId: job.jobId, questionIndex: 0, expectedJobRevision: 2,
    expectedMarkRevision: 0, decision: "accept", note: "Verified evidence",
  });
  expect(decision.state).toBe("accepted");
  await expect(owner.mutation(api.examDoctorReview.decide, {
    jobId: job.jobId, questionIndex: 0, expectedJobRevision: 2,
    expectedMarkRevision: 0, decision: "accept", note: "Replay",
  })).rejects.toThrow("REVISION_CONFLICT");
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
  await owner.mutation(api.examEssayGrading.finalize, {
    attemptId, expectedGradeRevision: 0,
  });
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
});

it("appeals are student-authenticated; regrading holds the old transcript until doctor release", async () => {
  const { owner, student, attemptId, snapshotId, draftId } = await fixture();
  await owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    criterionScores: score(70), feedback: "First review",
  });
  await owner.mutation(api.examEssayGrading.submitForReview, {
    attemptId, questionIndex: 0, expectedRevision: 1,
  });
  await owner.mutation(api.examEssayGrading.moderate, {
    attemptId, questionIndex: 0, expectedRevision: 2,
    decision: "approve", note: "Human approved",
  });
  await owner.mutation(api.examEssayGrading.finalize, {
    attemptId, expectedGradeRevision: 0,
  });
  await expect(student.mutation(api.examDoctorReview.fileAppeal, {
    attemptId, reason: "The mark misses my argument completely.",
  })).rejects.toThrow("GRADING_CONFLICT");
  await owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: true,
  });
  const appealed = await student.mutation(api.examDoctorReview.fileAppeal, {
    attemptId, reason: "I think the supported argument deserves more marks.",
  });
  expect(appealed.status).toBe("pending");
  await expect(student.mutation(api.examDoctorReview.fileAppeal, {
    attemptId, reason: "This is another appeal against the same score.",
  })).rejects.toThrow("GRADING_CONFLICT");
  expect((await owner.query(api.examDoctorReview.appealsForDraft, { draftId }))
    .entries[0].status).toBe("pending");
  const change = await owner.mutation(api.examDoctorReview.regrade, {
    attemptId, questionIndex: 0, expectedGradeRevision: 1, expectedMarkRevision: 3,
    criterionScores: score(90), feedback: "Correction", reason: "Evidence was underweighted",
  });
  expect(change).toMatchObject({ earnedCents: 180, held: true });
  const hidden = await student.query(api.examResults.myResult, { attemptId });
  expect(hidden).toMatchObject({ status: "withheld", transcript: null });
  await expect(owner.mutation(api.examDoctorReview.releaseRegrade, {
    attemptId, expectedGradeRevision: 2, confirmRelease: true,
  })).rejects.toThrow("GRADING_CONFLICT");
  await owner.mutation(api.examDoctorReview.decideAppeal, {
    appealId: appealed.appealId, expectedRevision: 0,
    decision: "adjusted", note: "Rubric applied to corrected evidence",
  });
  await owner.mutation(api.examDoctorReview.releaseRegrade, {
    attemptId, expectedGradeRevision: 2, confirmRelease: true,
  });
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript)
    .toMatchObject({ earnedCents: 180, percentBasisPoints: 9000 });
  expect((await student.query(api.examDoctorReview.myAppeal, { attemptId })).status).toBe("adjusted");
});
