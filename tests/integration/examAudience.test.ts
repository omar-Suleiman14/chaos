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
  return { t, owner, student, courseId, draftId, snapshotId };
}

async function publishForTest(
  t: ReturnType<typeof createTestConvex>,
  courseId: import("../../convex/_generated/dataModel").Id<"learnCollections">,
) {
  await t.run(async ctx => {
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course) throw new Error("Missing course");
    const versionId = await ctx.db.insert("collectionVersions", {
      collectionId: courseId, number: 1, metadata: course.metadata,
      items: [], publishedAt: Date.now(),
    });
    await ctx.db.patch("learnCollections", courseId, {
      publishedVersionId: versionId, visibility: "public",
    });
  });
}

async function approve(
  t: ReturnType<typeof createTestConvex>,
  courseId: import("../../convex/_generated/dataModel").Id<"learnCollections">,
) {
  await t.run(async ctx => {
    const now = Date.now();
    await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      status: "approved", requestedAt: now, updatedAt: now,
      reviewedAt: now, reviewedBy: creatorIdentity.subject,
    });
    await ctx.db.insert("courseEnrollments", {
      courseId, ownerId: creatorIdentity.subject,
      key: "user:" + otherCreatorIdentity.subject,
      studentId: otherCreatorIdentity.subject, completedLessonIds: [],
      enrolledAt: now, updatedAt: now,
    });
  });
}

it("rejects foreign owners, unapproved student selection, unpublished courses and stale writes", async () => {
  const { owner, student, t, courseId, draftId } = await setup();
  const all = { mode: "all" as const, studentIds: [], groupIds: [] };
  await expect(student.query(api.examAudience.getForDraft, { draftId })).rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0, audience: all, assigned: true,
  })).rejects.toThrow("NOT_FOUND");
  await expect(owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0, audience: all, assigned: true,
  })).rejects.toThrow("COURSE_UNPUBLISHED");
  await publishForTest(t, courseId);
  await expect(owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "students", studentIds: [otherCreatorIdentity.subject], groupIds: [] },
    assigned: true,
  })).rejects.toThrow("APPROVAL_REQUIRED");
  const result = await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0, audience: all, assigned: true,
  });
  expect(result).toBe(1);
  await expect(owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0, audience: all, assigned: false,
  })).rejects.toThrow("REVISION_CONFLICT");
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
});

it("lists safe metadata for approved course students only; revocation is immediate", async () => {
  const { owner, student, t, courseId, draftId, snapshotId } = await setup();
  await publishForTest(t, courseId);
  await approve(t, courseId);
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "all", studentIds: [], groupIds: [] }, assigned: true,
  });
  const due = await student.query(api.examAudience.myDue, {});
  expect(due).toHaveLength(1);
  expect(due[0]).toMatchObject({
    courseId, title: "Heart sounds", questionCount: 1, durationMinutes: 60,
    status: "due",
  });
  expect(JSON.stringify(due)).not.toMatch(/correctChoiceIds|sampleAnswer|explanation|choices|questionBank/);
  await expect(student.mutation(api.examRuntime.startAttempt, { snapshotId }))
    .rejects.toThrow("EXAM_NOT_ASSIGNED");
  await owner.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "suspend",
  });
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
  await owner.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "readmit",
  });
  expect(await student.query(api.examAudience.myDue, {})).toHaveLength(1);
});

it("applies selected-student and live group membership rules and supports explicit unassignment", async () => {
  const { owner, student, t, courseId, draftId } = await setup();
  await publishForTest(t, courseId);
  await approve(t, courseId);
  const groupId = await owner.mutation(api.courseCohorts.createGroup, { courseId, name: "Group A" });
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "groups", studentIds: [], groupIds: [groupId] }, assigned: true,
  });
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
  await owner.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  });
  expect(await student.query(api.examAudience.myDue, {})).toHaveLength(1);
  await owner.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "remove",
  });
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 1,
    audience: { mode: "students", studentIds: [otherCreatorIdentity.subject], groupIds: [] },
    assigned: true,
  });
  expect(await student.query(api.examAudience.myDue, {})).toHaveLength(1);
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 2,
    audience: { mode: "students", studentIds: [otherCreatorIdentity.subject], groupIds: [] },
    assigned: false,
  });
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
});

it("settings edits invalidate prior assignments without exposing answer keys", async () => {
  const { owner, student, t, courseId, draftId } = await setup();
  await publishForTest(t, courseId);
  await approve(t, courseId);
  await owner.mutation(api.examAudience.setForDraft, {
    draftId, expectedRevision: 0,
    audience: { mode: "all", studentIds: [], groupIds: [] }, assigned: true,
  });
  expect(await student.query(api.examAudience.myDue, {})).toHaveLength(1);
  await owner.mutation(api.examSettings.saveForDraft, {
    draftId, expectedRevision: 2,
    settings: { ...defaultExamSettings, passingPercent: 75 },
  });
  expect((await owner.query(api.examAudience.getForDraft, { draftId })).assigned).toBe(false);
  expect(await student.query(api.examAudience.myDue, {})).toEqual([]);
});
