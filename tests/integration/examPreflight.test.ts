import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
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
