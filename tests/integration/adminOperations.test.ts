import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";

const paginationOpts = { cursor: null, numItems: 20 };

it("requires a current admin role for all operational views and support writes", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const outsider = t.withIdentity(otherCreatorIdentity);
  for (const caller of [t, outsider]) {
    await expect(caller.query(api.adminOperations.admissions, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    await expect(caller.query(api.adminOperations.exams, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    await expect(caller.query(api.adminOperations.grading, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    await expect(caller.query(api.adminOperations.audit, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    await expect(caller.query(api.adminOperations.cases, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    await expect(caller.mutation(api.adminOperations.createCase, { subject: "Access issue", summary: "Student could not access class", priority: "normal" })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
  }

  const admin = t.withIdentity(creatorIdentity);
  await admin.query(api.adminOperations.cases, { paginationOpts });
  await t.run(async ctx => {
    const grant = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
    await ctx.db.delete(grant!._id);
  });
  await expect(admin.query(api.adminOperations.cases, { paginationOpts })).rejects.toThrow(/forbidden|admin access required/i);
});

it("records support transitions atomically, rejects stale revisions, and supports bounded pagination", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const admin = t.withIdentity(creatorIdentity);
  const id = await admin.mutation(api.adminOperations.createCase, {
    subject: "Enrollment access", summary: "A learner cannot see an approved course.",
    priority: "urgent",
  });
  expect((await admin.query(api.adminOperations.cases, { paginationOpts })).page[0]).toMatchObject({
    id, status: "open", revision: 0, priority: "urgent",
  });
  await expect(admin.mutation(api.adminOperations.transitionCase, {
    caseId: id, status: "resolved", expectedRevision: 0, reason: "short",
  })).rejects.toThrow("INVALID_SUPPORT");
  const result = await admin.mutation(api.adminOperations.transitionCase, {
    caseId: id, status: "in_progress", expectedRevision: 0,
    reason: "Investigating enrollment permission state",
  });
  expect(result.revision).toBe(1);
  await expect(admin.mutation(api.adminOperations.transitionCase, {
    caseId: id, status: "resolved", expectedRevision: 0,
    reason: "Permission was corrected",
  })).rejects.toThrow("REVISION_CONFLICT");
  await admin.mutation(api.adminOperations.transitionCase, {
    caseId: id, status: "resolved", expectedRevision: 1,
    reason: "Verified permission was corrected",
  });
  const audit = await admin.query(api.adminOperations.audit, { paginationOpts });
  expect(audit.page.map(entry => entry.action)).toEqual([
    "support_case_resolved", "support_case_in_progress", "support_case_created",
  ]);
  expect(audit.page[0].reason).toBe("Verified permission was corrected");
  expect((await admin.query(api.adminOperations.cases, { status: "resolved", paginationOpts })).page).toHaveLength(1);
  expect((await admin.query(api.adminOperations.cases, { status: "open", paginationOpts })).page).toHaveLength(0);
  await expect(admin.query(api.adminOperations.cases, {
    paginationOpts: { cursor: null, numItems: 50 },
  })).rejects.toThrow("INVALID_PAGE");
  await admin.mutation(api.adminOperations.createCase, {
    subject: "Another ticket", summary: "Investigate a second reported issue", priority: "normal",
  });
  const first = await admin.query(api.adminOperations.cases, { paginationOpts: { cursor: null, numItems: 1 } });
  expect(first.isDone).toBe(false);
  const second = await admin.query(api.adminOperations.cases, {
    paginationOpts: { cursor: first.continueCursor, numItems: 1 },
  });
  expect(first.page[0].id).not.toBe(second.page[0].id);
});

it("exposes course, exam and grading lifecycle metadata without private exam material", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const ids = await t.run(async ctx => {
    const ownerId = otherCreatorIdentity.subject;
    const courseId = await ctx.db.insert("learnCollections", {
      ownerId, metadata: { title: "Clinical anatomy", description: "Do not disclose draft text", language: "en", tags: [] },
      items: [], lessonIds: [], revision: 0, visibility: "private", communityState: "ok", createdAt: 1, updatedAt: 1,
    });
    const requestId = await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId, studentId: "learner-001", status: "pending", requestedAt: 2, updatedAt: 2,
    });
    const draftId = await ctx.db.insert("examBuilderDrafts", {
      ownerId, courseId, title: "Sensitive exam", targetCount: 0,
      allocations: [], selections: [], revision: 0, createdAt: 3, updatedAt: 3,
    });
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId, courseId, draftId, draftRevision: 0, version: 1,
      title: "Secret question bank", questions: [], totalPoints: 0, sealedAt: 4,
    });
    const releaseId = await ctx.db.insert("examReleases", {
      ownerId, courseId, draftId, activeSnapshotId: snapshotId, version: 1,
      studentEntryEnabled: false, settings: defaultExamSettings,
      createdAt: 5, updatedAt: 6,
    });
    const attemptId = await ctx.db.insert("examAttempts", {
      ownerId, courseId, snapshotId, studentId: "learner-001",
      state: "submitted", revision: 1, startedAt: 7, submittedAt: 8, closedAt: 8, updatedAt: 8,
    });
    const jobId = await ctx.db.insert("examGradingJobs", {
      attemptId, snapshotId, courseId, studentId: "learner-001", ownerId,
      requestKey: "private-job-key", status: "queued", revision: 0,
      retryCount: 0, requestedAt: 9, updatedAt: 9,
    });
    return { courseId, requestId, releaseId, jobId };
  });
  const admin = t.withIdentity(creatorIdentity);
  const admissions = await admin.query(api.adminOperations.admissions, { status: "pending", paginationOpts });
  const exams = await admin.query(api.adminOperations.exams, { paginationOpts });
  const grading = await admin.query(api.adminOperations.grading, { status: "queued", paginationOpts });
  expect(admissions.page[0]).toMatchObject({ id: ids.requestId, courseTitle: "Clinical anatomy", status: "pending" });
  expect(exams.page[0]).toMatchObject({ id: ids.releaseId, studentEntryEnabled: false, configured: false });
  expect(grading.page[0]).toMatchObject({ id: ids.jobId, status: "queued", retryCount: 0 });
  const serialized = JSON.stringify([admissions, exams, grading]);
  expect(serialized).not.toMatch(/Secret question bank|private-job-key|Sensitive exam|Do not disclose draft text/);
});
