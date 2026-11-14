import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { createExamAttemptTiming } from "../../convex/examSubmissionModel";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Private marking" });
  const choices = [
    { id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" },
  ];
  const make = (item: {
    kind: "multiple_choice" | "true_false" | "written"; prompt: string;
    choices: typeof choices; correctChoiceIds: string[];
    rubricCriteria?: { id: string; description: string; weightPercent: number }[];
  }) => owner.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      ...item, points: 2, status: "ready" as const,
      topics: [], terms: [], outcomes: [],
    },
  });
  const first = await make({
    kind: "multiple_choice", prompt: "Choose both", choices, correctChoiceIds: ["a", "b"],
  });
  const second = await make({
    kind: "true_false", prompt: "True?", choices: [], correctChoiceIds: ["true"],
  });
  const third = await make({
    kind: "written", prompt: "Explain", choices: [], correctChoiceIds: [],
    rubricCriteria: [{ id: "logic", description: "Reasoning", weightPercent: 100 }],
  });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  await owner.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Marking test", targetCount: 3,
    allocations: [{ id: "all", kind: "course", key: "", count: 3, points: 2,
      marking: { mode: "partial", incorrectPenalty: 0.5, blankPenalty: 0.25 } }],
  });
  await owner.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [
      { questionId: first, allocationId: "all" },
      { questionId: second, allocationId: "all" },
      { questionId: third, allocationId: "all" },
    ],
  });
  const { snapshotId } = await owner.mutation(api.examRuntime.sealDraft, {
    draftId, expectedRevision: 2,
  });
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 0, settings: defaultExamSettings,
  });
  await owner.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 1, prepared: true,
  });
  await t.run(async ctx => {
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course) throw new Error("Missing course");
    const pub = await ctx.db.insert("collectionVersions", {
      collectionId: courseId, number: 1, metadata: course.metadata, items: [],
      publishedAt: Date.now(),
    });
    await ctx.db.patch("learnCollections", courseId, {
      publishedVersionId: pub, visibility: "public",
    });
    const now = Date.now();
    await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      status: "approved", requestedAt: now, updatedAt: now, reviewedAt: now,
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
    if (!release) throw new Error("Missing release");
    return release._id;
  });
  const preflight = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, expectedPolicyVersion: preflight.policyVersion,
    expectedConsentRevision: preflight.consentRevision, accepted: true,
  });
  const attemptId = await t.run(async ctx => {
    const startedAt = Date.now() - 31_000;
    return ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "in_progress",
      revision: 0, startedAt, updatedAt: startedAt,
      ...createExamAttemptTiming(defaultExamSettings, startedAt),
    });
  });
  return { t, owner, student, snapshotId, releaseId, attemptId };
}

it("freezes weighted policies/rubrics and transactionally scores a private mixed exam", async () => {
  const { t, owner, student, snapshotId, releaseId, attemptId } = await setup();
  const snapshot = await owner.query(api.examRuntime.getOwnerSnapshot, { snapshotId });
  expect(snapshot.questions[0].marking).toMatchObject({
    mode: "partial", incorrectPenalty: 0.5, blankPenalty: 0.25,
  });
  expect(snapshot.questions[2].rubricCriteria).toEqual([
    { id: "logic", description: "Reasoning", weightPercent: 100 },
  ]);
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  const save = (questionIndex: number, mutationId: string, choiceIds: string[], text = "") =>
    student.mutation(api.examAnswers.save, {
      attemptId, questionIndex, expectedRevision: 0, mutationId,
      answer: { choiceIds, text, flagged: false, savedForLater: false },
    });
  await save(0, "grading-choice-1", ["a"]); // partial +1.00
  await save(1, "grading-truefalse-1", ["false"]); // incorrect -0.50
  await save(2, "grading-written-1", [], "A reasoned explanation"); // manual pending
  const prepared = await student.mutation(api.examSubmissions.prepareSubmission, {
    attemptId, expectedRevision: 0,
  });
  const receipt = await student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: prepared.confirmationId,
    expectedRevision: 0, confirmed: true,
  });
  expect(JSON.stringify(receipt)).not.toMatch(/grade|score|correctChoiceIds|rubric/);
  const grade = await owner.query(api.examGrading.getOwnerGrade, { attemptId });
  expect(grade).toMatchObject({
    state: "needs_manual", earnedCents: 50, maximumCents: 600,
    objectiveMaximumCents: 400, pendingWrittenCount: 1, algorithmVersion: 1,
  });
  expect(grade.finalPercentBasisPoints).toBeUndefined();
  expect(grade.entries[2].rubricCriteria[0].description).toBe("Reasoning");
  expect(JSON.stringify(grade)).not.toMatch(/correctChoiceIds|explanation|sampleAnswer|choices|prompt/);
  await expect(student.query(api.examGrading.getOwnerGrade, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
  const rows = await t.run(ctx => ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).collect());
  expect(rows).toHaveLength(1);
  const replay = await student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: prepared.confirmationId,
    expectedRevision: 0, confirmed: true,
  });
  expect(replay).toEqual(receipt);
  const again = await t.run(ctx => ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).collect());
  expect(again).toHaveLength(1);
});

it("does not grade an expired exam or expose grade data through receipts", async () => {
  const { t, owner, student, releaseId, attemptId } = await setup();
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, {
    studentEntryEnabled: true,
    settings: { ...defaultExamSettings, timeoutAction: "expire" },
  }));
  // The frozen attempt policy, not changed release settings, governs timeout outcome.
  await t.run(async ctx => {
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt) throw new Error("Missing attempt");
    await ctx.db.patch("examAttempts", attemptId, {
      submissionPolicy: { ...attempt.submissionPolicy!,
        timeoutAction: "expire" },
    });
  });
  const status = await student.query(api.examSubmissions.getStatus, { attemptId });
  vi.setSystemTime(status.deadlineAt + 1);
  const receipt = await t.mutation(internal.examSubmissions.finalizeAtDeadline, {
    attemptId, deadlineAt: status.deadlineAt,
  });
  expect(receipt).toMatchObject({ outcome: "expired" });
  const grade = await t.run(ctx => ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).collect());
  expect(grade).toHaveLength(0);
  await expect(owner.query(api.examGrading.getOwnerGrade, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
});
