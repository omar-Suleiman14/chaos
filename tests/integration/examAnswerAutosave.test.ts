import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { normalizeExamAnswer } from "../../convex/examAnswerModel";
import { createExamAttemptTiming } from "../../convex/examSubmissionModel";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const answer = (choiceIds: string[] = ["a"]) => ({
  choiceIds, text: "", flagged: false, savedForLater: false,
});
async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Exam autosave" });
  const questionId = await owner.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      kind: "single_choice", prompt: "Which valve?", choices: [
        { id: "a", text: "Mitral" }, { id: "b", text: "Pulmonary" },
      ], correctChoiceIds: ["a"], points: 1,
      topics: [], terms: [], outcomes: [], status: "ready",
    },
  });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  await owner.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Valve exam", targetCount: 1,
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
    draftId, expectedRevision: 0, settings: defaultExamSettings,
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
    if (!release) throw new Error("missing release");
    return release._id;
  });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: pre.consentRevision, accepted: true,
  });
  const attemptId = await t.run(async ctx => {
    const startedAt = Date.now();
    return ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "in_progress", revision: 0,
      startedAt, updatedAt: startedAt,
      ...createExamAttemptTiming(defaultExamSettings, startedAt),
    });
  });
  return { t, owner, student, courseId, releaseId, attemptId };
}

it("validates frozen question answers without comparing private marking keys", () => {
  const q = { kind: "multiple_choice" as const, choices: [{ id: "a" }, { id: "b" }] };
  expect(normalizeExamAnswer(q, ["b", "a"], "")).toEqual({
    choiceIds: ["b", "a"], text: "",
  });
  expect(() => normalizeExamAnswer(q, ["b", "b"], "")).toThrow("INVALID_ANSWER");
  expect(() => normalizeExamAnswer(q, ["c"], "")).toThrow("INVALID_ANSWER");
  expect(() => normalizeExamAnswer({ ...q, kind: "written" }, ["a"], "text"))
    .toThrow("INVALID_ANSWER");
  expect(() => normalizeExamAnswer(q, ["a"], "not permitted")).toThrow("INVALID_ANSWER");
});

it("remains fail-closed when real student entry is disabled, even with seeded attempts", async () => {
  const { student, attemptId } = await fixture();
  await expect(student.query(api.examAnswers.getMine, { attemptId }))
    .rejects.toThrow("EXAM_NOT_READY");
  await expect(student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "save-attempt-001", answer: answer(),
  })).rejects.toThrow("EXAM_NOT_READY");
});

it("recovers ACKs, rejects stale tabs, invalid answers and finalized saves", async () => {
  const { t, owner, student, attemptId, releaseId } = await fixture();
  // Test-only controlled release: startAttempt still unconditionally throws.
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  expect(await student.query(api.examAnswers.getMine, { attemptId })).toEqual([]);
  const args = {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "autosave-retry-001", answer: answer(),
  };
  const ack = await student.mutation(api.examAnswers.save, args);
  expect(ack).toMatchObject({ questionIndex: 0, revision: 1 });
  expect(await student.mutation(api.examAnswers.save, args)).toEqual(ack);
  await expect(student.mutation(api.examAnswers.save, {
    ...args, answer: answer(["b"]),
  })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(student.mutation(api.examAnswers.save, {
    ...args, mutationId: "another-tab-002", answer: answer(["b"]),
  })).rejects.toThrow("REVISION_CONFLICT");
  const recovered = await student.query(api.examAnswers.getMine, { attemptId });
  expect(recovered).toEqual([{
    questionIndex: 0, choiceIds: ["a"], text: "", flagged: false,
    savedForLater: false, revision: 1, savedAt: ack.savedAt,
    lastMutationId: "autosave-retry-001",
  }]);
  expect(JSON.stringify(recovered)).not.toMatch(/correctChoiceIds|explanation|sampleAnswer/);
  await expect(owner.query(api.examAnswers.getMine, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examAnswers.save, {
    ...args, questionIndex: 3, mutationId: "invalid-question-003",
  })).rejects.toThrow("INVALID_ANSWER");
  await expect(student.mutation(api.examAnswers.save, {
    ...args, mutationId: "invalid-choice-004", expectedRevision: 1,
    answer: answer(["unknown"]),
  })).rejects.toThrow("INVALID_ANSWER");
  const changed = await student.mutation(api.examAnswers.save, {
    ...args, expectedRevision: 1, mutationId: "save-second-005",
    answer: { ...answer(["b"]), flagged: true, savedForLater: true },
  });
  expect(changed.revision).toBe(2);
  await t.mutation(internal.examRuntime.closeAttemptInternal, {
    attemptId, expectedRevision: 0, nextState: "submitted",
  });
  await expect(student.mutation(api.examAnswers.save, {
    ...args, expectedRevision: 2, mutationId: "save-after-submit",
  })).rejects.toThrow("ATTEMPT_FINALIZED");
});

it("revokes answer access when a course student is suspended", async () => {
  const { t, owner, student, attemptId, releaseId, courseId } = await fixture();
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, { studentEntryEnabled: true }));
  await owner.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "suspend",
  });
  await expect(student.query(api.examAnswers.getMine, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "save-revoked-006", answer: answer(),
  })).rejects.toThrow("NOT_FOUND");
});
