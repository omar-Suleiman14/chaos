import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Cardiology" });
  const questionId = await owner.mutation(api.questionBank.createForCourse, {
    courseId, item: {
      kind: "single_choice", prompt: "What closes in S1?",
      choices: [{ id: "a", text: "AV valves" }, { id: "b", text: "Aortic valve" }],
      correctChoiceIds: ["a"], points: 1, topics: [], terms: [], outcomes: [], status: "ready",
    },
  });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  await owner.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Heart sounds", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }],
  });
  await owner.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId, allocationId: "all" }],
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
    const versionId = await ctx.db.insert("collectionVersions", {
      collectionId: courseId, number: 1, metadata: course.metadata, items: [],
      publishedAt: Date.now(),
    });
    await ctx.db.patch("learnCollections", courseId, {
      publishedVersionId: versionId, visibility: "public",
    });
    const now = Date.now();
    await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      status: "approved", requestedAt: now, updatedAt: now, reviewedAt: now,
      reviewedBy: creatorIdentity.subject,
    });
    await ctx.db.insert("courseEnrollments", {
      courseId, ownerId: creatorIdentity.subject, key: `user:${otherCreatorIdentity.subject}`,
      studentId: otherCreatorIdentity.subject, completedLessonIds: [],
      enrolledAt: now, updatedAt: now,
    });
  });
  const releaseId = await t.run(async ctx => {
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!release) throw new Error("Missing release");
    return release._id;
  });
  return { t, owner, student, courseId, draftId, releaseId, snapshotId };
}

async function assign(owner: Awaited<ReturnType<typeof setup>>["owner"],
  draftId: Awaited<ReturnType<typeof setup>>["draftId"]) {
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "all", studentIds: [], groupIds: [] }, assigned: true,
  });
}

it("preflight requires explicit assignment and approved enrollment, never sends answer keys", async () => {
  const { owner, student, draftId, releaseId, snapshotId } = await setup();
  await expect(student.query(api.examPreflight.get, { releaseId })).rejects.toThrow("NOT_FOUND");
  await assign(owner, draftId);
  const pre = await student.query(api.examPreflight.get, { releaseId });
  expect(pre).toMatchObject({
    title: "Heart sounds", questionCount: 1, durationMinutes: 60,
    maxAttempts: 1, status: "available", consentAccepted: false, entryEnabled: false,
  });
  expect(JSON.stringify(pre)).not.toMatch(/correctChoiceIds|sampleAnswer|explanation|choices|mediaId|questionBank/);
  await expect(student.mutation(api.examRuntime.startAttempt, { snapshotId }))
    .rejects.toThrow("EXAM_NOT_ASSIGNED");
  await expect(owner.query(api.examPreflight.get, { releaseId })).rejects.toThrow("NOT_FOUND");
});

it("requires explicit acceptance, enforces optimistic revisions and never creates an attempt", async () => {
  const { t, owner, student, draftId, releaseId } = await setup();
  await assign(owner, draftId);
  const pre = await student.query(api.examPreflight.get, { releaseId });
  const args = { releaseId, expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: 0 };
  await expect(student.mutation(api.examPreflight.acknowledge, {
    ...args, accepted: false,
  })).rejects.toThrow("CONSENT_REQUIRED");
  const accepted = await student.mutation(api.examPreflight.acknowledge, {
    ...args, accepted: true,
  });
  expect(accepted.revision).toBe(1);
  const latest = await student.query(api.examPreflight.get, { releaseId });
  expect(latest.consentAccepted).toBe(true);
  expect(latest.consentRevision).toBe(1);
  await expect(student.mutation(api.examPreflight.acknowledge, {
    ...args, accepted: true,
  })).rejects.toThrow("REVISION_CONFLICT");
  const attempts = await t.run(ctx => ctx.db.query("examAttempts").collect());
  expect(attempts).toEqual([]);
});

it("invalidates consent when policies or course permissions change", async () => {
  const { owner, student, draftId, courseId, releaseId } = await setup();
  await assign(owner, draftId);
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, accepted: true, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: pre.consentRevision,
  });
  await owner.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "suspend",
  });
  await expect(student.query(api.examPreflight.get, { releaseId })).rejects.toThrow("NOT_FOUND");
  await owner.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "readmit",
  });
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 2,
    settings: { ...defaultExamSettings, passingPercent: 60 },
  });
  await expect(student.query(api.examPreflight.get, { releaseId })).rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examPreflight.acknowledge, {
    releaseId, accepted: true, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: 1,
  })).rejects.toThrow("NOT_FOUND");
});

it("supports waiting before opening and fails closed after closing", async () => {
  const { owner, student, draftId, releaseId } = await setup();
  const now = Date.now();
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 2,
    settings: { ...defaultExamSettings, mode: "scheduled",
      opensAt: now + 60_000, closesAt: now + 180_000 },
  });
  await owner.mutation(api.examSettings.setPrepared, {
    draftId, expectedRevision: 3, prepared: true,
  });
  await assign(owner, draftId);
  const pre = await student.query(api.examPreflight.get, { releaseId });
  expect(pre.status).toBe("upcoming");
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, accepted: true, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: 0,
  });
  vi.setSystemTime(now + 90_000);
  expect((await student.query(api.examPreflight.get, { releaseId })).status).toBe("available");
  vi.setSystemTime(now + 180_001);
  await expect(student.query(api.examPreflight.get, { releaseId })).rejects.toThrow("EXAM_CLOSED");
  await expect(student.mutation(api.examPreflight.acknowledge, {
    releaseId, accepted: true, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: 1,
  })).rejects.toThrow("EXAM_CLOSED");
});

it("opens, resumes and submits a consented attempt without disclosing keys", async () => {
  const { t, owner, student, draftId, releaseId, snapshotId } = await setup();
  await assign(owner, draftId);
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, {
    releaseId, accepted: true, expectedPolicyVersion: pre.policyVersion,
    expectedConsentRevision: pre.consentRevision,
  });
  await expect(student.mutation(api.examAudience.setEntry, {
    draftId, expectedRevision: 1, enabled: true,
  })).rejects.toThrow("NOT_FOUND");
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  expect((await student.query(api.examPreflight.get, { releaseId })).consentAccepted).toBe(true);
  const attemptId = await student.mutation(api.examRuntime.startAttempt, { snapshotId });
  expect(await student.mutation(api.examRuntime.startAttempt, { snapshotId })).toBe(attemptId);
  await t.run(async ctx => {
    const enrollment = await ctx.db.query("courseEnrollments").withIndex("by_course_key",
      q => q.eq("courseId", pre.courseId).eq("key", `user:${otherCreatorIdentity.subject}`)).unique();
    if (!enrollment) throw new Error("enrollment missing");
    await ctx.db.patch("courseEnrollments", enrollment._id, { updatedAt: enrollment.updatedAt + 1 });
  });
  expect((await student.query(api.examPreflight.get, { releaseId })).consentAccepted).toBe(true);
  expect(await student.mutation(api.examRuntime.startAttempt, { snapshotId })).toBe(attemptId);
  await expect(owner.query(api.examRuntime.getQuestions, { attemptId })).rejects.toThrow("NOT_FOUND");
  const content = await student.query(api.examRuntime.getQuestions, { attemptId });
  expect(content.questions).toHaveLength(1);
  expect(JSON.stringify(content)).not.toMatch(/correctChoiceIds|sampleAnswer|explanation|rubric|sourceQuestionId/);
  await student.mutation(api.examAnswers.save, {
    attemptId, questionIndex: 0, expectedRevision: 0, mutationId: "answer-0001",
    answer: { choiceIds: ["a"], text: "", flagged: false, savedForLater: false },
  });
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 2, enabled: false });
  expect(await student.mutation(api.examRuntime.startAttempt, { snapshotId })).toBe(attemptId);
  expect((await student.query(api.examRuntime.getQuestions, { attemptId })).questions).toHaveLength(1);
  await expect(owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 2, settings: defaultExamSettings,
  })).rejects.toThrow("EXAM_ACTIVE");
  vi.setSystemTime(Date.now() + 31_000);
  const confirmation = await student.mutation(api.examSubmissions.prepareSubmission, { attemptId, expectedRevision: 0 });
  const receipt = await student.mutation(api.examSubmissions.submit, {
    attemptId, confirmationId: confirmation.confirmationId, expectedRevision: 0, confirmed: true,
  });
  expect(receipt.outcome).toBe("submitted");
  await expect(student.query(api.examRuntime.getQuestions, { attemptId })).rejects.toThrow("ATTEMPT_FINALIZED");
  const grade = await t.run(ctx => ctx.db.query("examGrades").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique());
  expect(grade?.earnedCents).toBe(100);
  await t.run(async ctx => {
    const release = await ctx.db.get("examReleases", releaseId);
    if (!release?.settings) throw new Error("release missing");
    await ctx.db.patch("examReleases", releaseId, { settings: { ...release.settings, resultVisibility: "immediate" } });
  });
  expect((await student.query(api.examResults.myResult, { attemptId })).status).toBe("withheld");
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 3, enabled: true });
  await expect(student.mutation(api.examRuntime.startAttempt, { snapshotId })).rejects.toThrow("ATTEMPT_LIMIT");
});


it("enforces consent, applies extra time, and restricts frozen media to the candidate", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  const { t, owner, student, draftId, releaseId, snapshotId } = await setup();
  await assign(owner, draftId);
  await owner.mutation(api.examInvigilation.setAccommodation, {
    draftId, studentId: otherCreatorIdentity.subject, kind: "extra_time", additionalMinutes: 20, expectedRevision: 0,
  });
  const mediaId = await t.run(async ctx => {
    const mediaId = await ctx.db.insert("questionBankMedia", { ownerId: creatorIdentity.subject,
      mimeType: "image/png", bytes: 100, status: "ready", etag: '"0123456789abcdef"',
      createdAt: Date.now(), expiresAt: Date.now() + 10000 });
    const snapshot = await ctx.db.get("examSnapshots", snapshotId);
    if (!snapshot) throw new Error("snapshot missing");
    const [first] = snapshot.questions;
    await ctx.db.patch("examSnapshots", snapshotId, { questions: [{ ...first,
      caseStudy: { stem: "Case", media: [{ mediaId, alt: "Chart", mimeType: "image/png", bytes: 100,
        etag: '"0123456789abcdef"' }] } }] });
    return mediaId;
  });
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  await expect(student.mutation(api.examRuntime.startAttempt, { snapshotId })).rejects.toThrow("CONSENT_REQUIRED");
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, { releaseId, accepted: true,
    expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: pre.consentRevision });
  const attemptId = await student.mutation(api.examRuntime.startAttempt, { snapshotId });
  const attempt = await student.query(api.examSubmissions.getStatus, { attemptId });
  expect(attempt.deadlineAt - attempt.startedAt).toBe(80 * 60_000);
  const projection = await student.query(api.examRuntime.getQuestions, { attemptId });
  expect(projection.questions[0].caseStudy?.media).toEqual([{ mediaId, alt: "Chart" }]);
  expect(await student.query(api.examMedia.contentUrl, { attemptId, mediaId })).toContain("/learn/exam-images/content");
  await expect(owner.query(api.examMedia.contentUrl, { attemptId, mediaId })).rejects.toThrow("NOT_FOUND");
  expect(await student.query(internal.examMedia.getReady, { attemptId, mediaId })).toMatchObject({ bytes: 100, mimeType: "image/png" });
  expect(await owner.query(internal.examMedia.getReady, { attemptId, mediaId })).toBeNull();
});

it("reveals only frozen enabled answer fields after release to the approved candidate", async () => {
  const { t, owner, student, draftId, releaseId, snapshotId } = await setup();
  await t.run(async ctx => {
    const release = await ctx.db.get("examReleases", releaseId);
    if (!release?.settings) throw new Error("release missing");
    await ctx.db.patch("examReleases", releaseId, { settings: { ...release.settings,
      showCorrectAnswers: true, showExplanations: false } });
  });
  await assign(owner, draftId);
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, { releaseId, accepted: true,
    expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: pre.consentRevision });
  const attemptId = await student.mutation(api.examRuntime.startAttempt, { snapshotId });
  vi.setSystemTime(Date.now() + 31_000);
  const confirmation = await student.mutation(api.examSubmissions.prepareSubmission, { attemptId, expectedRevision: 0 });
  await student.mutation(api.examSubmissions.submit, { attemptId, confirmationId: confirmation.confirmationId,
    expectedRevision: 0, confirmed: true });
  expect(await student.query(api.examResults.myReview, { attemptId })).toBeNull();
  await expect(owner.query(api.examResults.myReview, { attemptId })).rejects.toThrow("NOT_FOUND");
  await t.run(async ctx => {
    const release = await ctx.db.get("examReleases", releaseId);
    if (!release?.settings) throw new Error("release missing");
    await ctx.db.patch("examReleases", releaseId, { settings: { ...release.settings, showCorrectAnswers: false,
      showExplanations: true } });
  });
  await owner.mutation(api.examResults.setPublication, { snapshotId, expectedRevision: 0, released: true });
  const review = await student.query(api.examResults.myReview, { attemptId });
  expect(review?.[0]).toMatchObject({ correctChoiceIds: ["a"] });
  expect(review?.[0]).not.toHaveProperty("explanation");
  await t.run(async ctx => {
    const enrollment = await ctx.db.query("courseEnrollments").withIndex("by_course_key",
      q => q.eq("courseId", pre.courseId).eq("key", `user:${otherCreatorIdentity.subject}`)).unique();
    if (!enrollment) throw new Error("enrollment missing");
    await ctx.db.delete("courseEnrollments", enrollment._id);
  });
  expect(await student.query(api.examResults.myReview, { attemptId })).toBeNull();
});

it("closes and grades a real attempt at the server deadline without a connected player", async () => {
  const { t, owner, student, draftId, releaseId, snapshotId } = await setup();
  await assign(owner, draftId);
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  await student.mutation(api.examPreflight.acknowledge, { releaseId, accepted: true,
    expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: pre.consentRevision });
  const attemptId = await student.mutation(api.examRuntime.startAttempt, { snapshotId });
  await student.mutation(api.examAnswers.save, { attemptId, questionIndex: 0, expectedRevision: 0,
    mutationId: "saved-at-deadline", answer: { choiceIds: ["a"], text: "", flagged: false, savedForLater: false } });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers(), 100);
  const receipt = await student.query(api.examSubmissions.getReceipt, { attemptId });
  expect(receipt).toMatchObject({ reason: "timeout", outcome: "submitted", answeredCount: 1 });
  const grade = await t.run(ctx => ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique());
  expect(grade?.earnedCents).toBe(100);
});

it("discloses and freezes an explicitly selected monitoring policy", async () => {
  const { t, owner, student, draftId, releaseId, snapshotId } = await setup();
  await owner.mutation(api.examSettings.saveForDraft, { draftId, expectedRevision: 2,
    settings: { ...defaultExamSettings, integrityMode: "warn" } });
  await owner.mutation(api.examSettings.setPrepared, { draftId, expectedRevision: 3, prepared: true });
  await assign(owner, draftId);
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  expect(pre.integrityMode).toBe("warn");
  await student.mutation(api.examPreflight.acknowledge, { releaseId, accepted: true,
    expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: pre.consentRevision });
  const attemptId = await student.mutation(api.examRuntime.startAttempt, { snapshotId });
  expect(await student.query(api.examRuntime.getMyAttempt, { attemptId }))
    .toMatchObject({ integrityMode: "warn", telemetryConsented: true });
  await t.run(async ctx => {
    const release = await ctx.db.get("examReleases", releaseId);
    if (!release?.settings) throw new Error("release missing");
    await ctx.db.patch("examReleases", releaseId, { settings: { ...release.settings, integrityMode: "off" } });
  });
  expect((await student.query(api.examRuntime.getMyAttempt, { attemptId })).integrityMode).toBe("warn");
  await expect(student.mutation(api.examIntegrity.record, { attemptId, eventId: "frozen-policy-event", kind: "blur" }))
    .resolves.toMatchObject({ decision: "observed" });
});

it("invalidates consent when an accommodation changes the disclosed monitoring policy", async () => {
  const { owner, student, draftId, releaseId, snapshotId } = await setup();
  await owner.mutation(api.examSettings.saveForDraft, { draftId, expectedRevision: 2,
    settings: { ...defaultExamSettings, integrityMode: "review" } });
  await owner.mutation(api.examSettings.setPrepared, { draftId, expectedRevision: 3, prepared: true });
  await assign(owner, draftId);
  await owner.mutation(api.examInvigilation.setAccommodation, { draftId, studentId: otherCreatorIdentity.subject,
    kind: "reduced_monitoring", additionalMinutes: 0, expectedRevision: 0 });
  const pre = await student.query(api.examPreflight.get, { releaseId });
  expect(pre.integrityMode).toBe("off");
  await student.mutation(api.examPreflight.acknowledge, { releaseId, accepted: true,
    expectedPolicyVersion: pre.policyVersion, expectedConsentRevision: pre.consentRevision });
  await owner.mutation(api.examInvigilation.setAccommodation, { draftId, studentId: otherCreatorIdentity.subject,
    kind: "extra_time", additionalMinutes: 10, expectedRevision: 1 });
  await owner.mutation(api.examAudience.setEntry, { draftId, expectedRevision: 1, enabled: true });
  await expect(student.mutation(api.examRuntime.startAttempt, { snapshotId })).rejects.toThrow("CONSENT_REQUIRED");
  const changed = await student.query(api.examPreflight.get, { releaseId });
  expect(changed).toMatchObject({ integrityMode: "review", consentAccepted: false });
});

it("page preflight handles owner and unassigned student access without exposing content", async () => {
  const { owner, student, draftId, releaseId } = await setup();
  // The strict query still rejects these users, but the student page gets a safe empty state.
  expect(await owner.query(api.examPreflight.forStudentPage, { releaseId })).toBeNull();
  expect(await student.query(api.examPreflight.forStudentPage, { releaseId })).toBeNull();
  await assign(owner, draftId);
  expect(await owner.query(api.examPreflight.forStudentPage, { releaseId })).toBeNull();
  const preflight = await student.query(api.examPreflight.forStudentPage, { releaseId });
  expect(preflight).toMatchObject({ title: "Heart sounds", questionCount: 1 });
  expect(JSON.stringify(preflight)).not.toMatch(/correctChoiceIds|sampleAnswer|explanation|choices/);
});
