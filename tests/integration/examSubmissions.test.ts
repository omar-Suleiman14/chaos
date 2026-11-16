import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import {
  defaultExamSettings, type ExamSettings,
} from "../../convex/examSettingsModel";
import { createExamAttemptTiming } from "../../convex/examSubmissionModel";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function fixture(settings: ExamSettings = defaultExamSettings) {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Timed exam" });
  const questionId = await owner.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      kind: "single_choice", prompt: "A?", choices: [
        { id: "a", text: "A" }, { id: "b", text: "B" },
      ], correctChoiceIds: ["a"], points: 1, status: "ready",
      topics: [], terms: [], outcomes: [],
    },
  });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  await owner.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Timed exam", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await owner.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1,
    selections: [{ questionId, allocationId: "all" }],
  });
  const { snapshotId } = await owner.mutation(api.examRuntime.sealDraft, {
    draftId, expectedRevision: 2,
  });
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings,
  });
  await owner.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  });
  await t.run(async ctx => {
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course) throw new Error("missing course");
    const pub = await ctx.db.insert("collectionVersions", {
      collectionId: courseId, number: 1, metadata: course.metadata,
      items: [], publishedAt: Date.now(),
    });
    await ctx.db.patch("learnCollections", courseId, {
      publishedVersionId: pub, visibility: "public",
    });
    const now = Date.now();
    await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: creatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, status: "approved",
      requestedAt: now, updatedAt: now, reviewedAt: now,
      reviewedBy: creatorIdentity.subject,
    });
    await ctx.db.insert("courseEnrollments", {
      courseId, ownerId: creatorIdentity.subject,
      key: "user:" + otherCreatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, completedLessonIds: [],
      enrolledAt: now, updatedAt: now,
    });
  });
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "all", studentIds: [], groupIds: [] }, assigned: true,
  });
  const releaseId = await t.run(async ctx => {
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!release) throw new Error("missing release");
    return release._id;
  });
  const preflight = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, expectedPolicyVersion: preflight.policyVersion,
    expectedConsentRevision: preflight.consentRevision, accepted: true,
  });
  // Seeded in a test transaction ONLY: public entry API is still hard-disabled.
  const attemptId = await t.run(async ctx => {
    const startedAt = Date.now() - 31_000;
    return ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "in_progress",
      revision: 0, startedAt, updatedAt: startedAt,
      ...createExamAttemptTiming(settings, startedAt),
    });
  });
  return { t, owner, student, releaseId, attemptId, snapshotId, courseId };
}

const answer = { choiceIds: ["a"], text: "", flagged: false, savedForLater: false };

it("keeps real entry and pre-confirmation submission blocked by default", async () => {
  const { student, attemptId, owner } = await fixture();
  await expect(student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  })).rejects.toThrow("EXAM_NOT_READY");
  await expect(student.query(api.examSubmissions.getStatus, { attemptId }))
    .rejects.toThrow("EXAM_NOT_READY");
  await expect(student.query(api.examSubmissions.getReceipt, { attemptId })).resolves.toBeNull();
  await expect(owner.query(api.examSubmissions.getReceipt, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
});

it("requires two explicit steps, then returns the same durable receipt to a retry", async () => {
  const { t, owner, student, releaseId, attemptId, snapshotId } = await fixture();
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  const status = await student.query(api.examSubmissions.getStatus, { attemptId });
  expect(status).toMatchObject({
    canPrepare: true, timedOut: false, state: "in_progress", answeredCount: 0,
  });
  await expect(student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: "not-issued", expectedRevision: 0, confirmed: true,
  })).rejects.toThrow("CONFIRMATION_STALE");
  const prepared = await student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  });
  expect(prepared).toMatchObject({ answeredCount: 0, questionCount: 1 });
  await expect(owner.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: prepared.confirmationId,
    expectedRevision: 0, confirmed: true,
  })).rejects.toThrow("NOT_FOUND");
  const args = {
    attemptId, confirmationId: prepared.confirmationId,
    expectedRevision: 0, confirmed: true as const,
  };
  const receipt = await student.mutation(api.examSubmissions.submit, args);
  expect(receipt).toMatchObject({
    attemptId, snapshotId, outcome: "submitted", reason: "student",
    answeredCount: 0, questionCount: 1,
  });
  expect(await student.mutation(api.examSubmissions.submit, args)).toEqual(receipt);
  expect(await student.query(api.examSubmissions.getReceipt, { attemptId })).toEqual(receipt);
  const row = await t.run(ctx => ctx.db.get("examAttempts", attemptId));
  expect(row).toMatchObject({ state: "submitted", revision: 1 });
  expect(JSON.stringify(receipt)).not.toMatch(/correctChoiceIds|explanation|choices|prompt/);
  await expect(student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "late-save-after-submit", answer,
  })).rejects.toThrow("ATTEMPT_FINALIZED");
});

it("invalidates confirmation after an autosave and rechecks all-answers policy", async () => {
  const { t, student, releaseId, attemptId } = await fixture({
    ...defaultExamSettings, requireAllAnswers: true,
  });
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  await expect(student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  })).rejects.toThrow("ANSWERS_REQUIRED");
  await student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "submit-answer-initial", answer,
  });
  const prepared = await student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  });
  await student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 1,
    mutationId: "submit-answer-update2", answer: { ...answer, choiceIds: ["b"] },
  });
  await expect(student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: prepared.confirmationId,
    expectedRevision: 0, confirmed: true,
  })).rejects.toThrow("ANSWERS_CHANGED");
  const renewed = await student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  });
  const receipt = await student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: renewed.confirmationId,
    expectedRevision: 0, confirmed: true,
  });
  expect(receipt).toMatchObject({ outcome: "submitted", answeredCount: 1 });
});

it("never accepts a last-second browser save; reconciles timeout automatically or on demand", async () => {
  const { t, student, releaseId, attemptId } = await fixture();
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  const { deadlineAt } = await student.query(api.examSubmissions.getStatus, { attemptId });
  await expect(student.mutation(api.examSubmissions.expireDue, { attemptId }))
    .rejects.toThrow("ATTEMPT_NOT_DUE");
  vi.setSystemTime(deadlineAt + 1);
  await expect(student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "post-deadline-save", answer,
  })).rejects.toThrow("ATTEMPT_TIMED_OUT");
  const completed = await t.mutation(internal.examSubmissions.finalizeAtDeadline, {
    attemptId, deadlineAt,
  });
  expect(completed).toMatchObject({ outcome: "submitted", reason: "timeout" });
  expect(await t.mutation(internal.examSubmissions.finalizeAtDeadline, {
    attemptId, deadlineAt,
  })).toBeNull();
  expect(await student.mutation(api.examSubmissions.expireDue, { attemptId })).toEqual(completed);
  expect(await student.query(api.examSubmissions.getReceipt, { attemptId })).toEqual(completed);
});

it("honors expire-on-timeout policy even when manual early submission is prohibited", async () => {
  const { t, student, releaseId, attemptId } = await fixture({
    ...defaultExamSettings, timeoutAction: "expire", allowEarlySubmission: false,
  });
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  await expect(student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  })).rejects.toThrow("EARLY_SUBMISSION_DISABLED");
  const { deadlineAt } = await student.query(api.examSubmissions.getStatus, { attemptId });
  vi.setSystemTime(deadlineAt + 1);
  const receipt = await student.mutation(api.examSubmissions.expireDue, { attemptId });
  expect(receipt).toMatchObject({ outcome: "expired", reason: "timeout" });
  expect(await student.mutation(api.examSubmissions.expireDue, { attemptId })).toEqual(receipt);
});
