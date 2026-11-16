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

it("scores, moderates and finalizes written exams without leaking interim grades", async () => {
  const { t, owner, student, draftId, attemptId, snapshotId } = await fixture();
  expect((await owner.query(api.examEssayGrading.queue, { draftId })).entries[0])
    .toMatchObject({ pendingWrittenCount: 1, approvedCount: 0 });
  const work = await owner.query(api.examEssayGrading.work, { attemptId, questionIndex: 0 });
  expect(work).toMatchObject({ response: "My supported argument", mark: null });
  await expect(student.query(api.examEssayGrading.work, { attemptId, questionIndex: 0 }))
    .rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    criterionScores: [{ criterionId: "logic", scorePercent: 80 }], feedback: "No",
  })).rejects.toThrow("NOT_FOUND");
  await expect(owner.mutation(api.examEssayGrading.finalize, {
    attemptId, expectedGradeRevision: 0,
  })).rejects.toThrow("GRADING_CONFLICT");
  await expect(owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    criterionScores: [{ criterionId: "wrong", scorePercent: 80 }], feedback: "",
  })).rejects.toThrow("INVALID_MARK");
  const saved = await owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    criterionScores: [{ criterionId: "logic", scorePercent: 80 }], feedback: "Good",
  });
  expect(saved).toMatchObject({ revision: 1, awardedCents: 160 });
  await expect(owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    criterionScores: [{ criterionId: "logic", scorePercent: 95 }], feedback: "",
  })).rejects.toThrow("REVISION_CONFLICT");
  await owner.mutation(api.examEssayGrading.submitForReview, {
    attemptId, questionIndex: 0, expectedRevision: 1,
  });
  await owner.mutation(api.examEssayGrading.moderate, {
    attemptId, questionIndex: 0, expectedRevision: 2,
    decision: "changes_requested", note: "Need a citation",
  });
  expect((await owner.query(api.examEssayGrading.work,
    { attemptId, questionIndex: 0 })).mark?.status).toBe("changes_requested");
  await owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 3,
    criterionScores: [{ criterionId: "logic", scorePercent: 90 }], feedback: "Revised",
  });
  await owner.mutation(api.examEssayGrading.submitForReview, {
    attemptId, questionIndex: 0, expectedRevision: 4,
  });
  await owner.mutation(api.examEssayGrading.moderate, {
    attemptId, questionIndex: 0, expectedRevision: 5, decision: "approve", note: "Reviewed",
  });
  const pending = await student.query(api.examResults.myResult, { attemptId });
  expect(pending).toMatchObject({ status: "grading", transcript: null });
  await expect(owner.mutation(api.examEssayGrading.finalize, {
    attemptId, expectedGradeRevision: 1,
  })).rejects.toThrow("REVISION_CONFLICT");
  const final = await owner.mutation(api.examEssayGrading.finalize, {
    attemptId, expectedGradeRevision: 0,
  });
  expect(final).toMatchObject({ earnedCents: 180, finalPercentBasisPoints: 9000 });
  await expect(owner.mutation(api.examEssayGrading.save, {
    attemptId, questionIndex: 0, expectedRevision: 6,
    criterionScores: [{ criterionId: "logic", scorePercent: 100 }], feedback: "",
  })).rejects.toThrow("GRADING_CONFLICT");
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
  await owner.mutation(api.examResults.setPublication, { snapshotId, expectedRevision: 0, released: true });
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript)
    .toMatchObject({ earnedCents: 180, percentBasisPoints: 9000, passed: true });
  const audit = await t.run(ctx => ctx.db.query("examEssayMarkAudit")
    .withIndex("by_attempt_at", q => q.eq("attemptId", attemptId)).collect());
  expect(audit.map(a => a.action)).toEqual([
    "save", "submit", "changes_requested", "save", "submit", "approve", "finalize",
  ]);
});
