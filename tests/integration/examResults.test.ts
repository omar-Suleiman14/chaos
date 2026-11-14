import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { freezeResultPolicy } from "../../convex/examResultModel";
import { createTestConvex } from "./setup";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function fixture(visibility: "manual" | "immediate" | "after_close" = "manual",
  state: "auto_final" | "needs_manual" = "auto_final") {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Student transcripts" });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId });
  const now = Date.now();
  const settings = visibility === "after_close"
    ? { ...defaultExamSettings, resultVisibility: visibility, mode: "scheduled" as const,
        opensAt: now - 60_000, closesAt: now + 60_000, passingPercent: 75 }
    : { ...defaultExamSettings, resultVisibility: visibility };
  const ids = await t.run(async ctx => {
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId: creatorIdentity.subject, courseId, draftId, draftRevision: 0,
      version: 1, title: "Private transcript test",
      questions: [], totalPoints: 1, sealedAt: now,
    });
    const releaseId = await ctx.db.insert("examReleases", {
      ownerId: creatorIdentity.subject, courseId, draftId, activeSnapshotId: snapshotId,
      version: 1, studentEntryEnabled: false, settings, createdAt: now, updatedAt: now,
    });
    const attemptId = await ctx.db.insert("examAttempts", {
      ownerId: creatorIdentity.subject, courseId, snapshotId,
      studentId: otherCreatorIdentity.subject, state: "submitted" as const,
      revision: 1, startedAt: now - 30_000, updatedAt: now, closedAt: now, submittedAt: now,
    });
    const gradeId = await ctx.db.insert("examGrades", {
      ownerId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject,
      snapshotId, attemptId,
      state, earnedCents: 80, maximumCents: 100, objectiveMaximumCents: 100,
      pendingWrittenCount: state === "needs_manual" ? 1 : 0,
      ...(state === "auto_final" ? { finalPercentBasisPoints: 8000 } : {}),
      entries: [{ questionIndex: 0, status: "scored" as const,
        pointsAvailableCents: 100, pointsAwardedCents: 80 }],
      algorithmVersion: 1, gradedAt: now, resultPolicy: freezeResultPolicy(settings),
    });
    return { snapshotId, releaseId, attemptId, gradeId };
  });
  return { t, owner, student, ...ids };
}

it("withholds scores, restricts account access, audits publication and revocation", async () => {
  const { t, owner, student, snapshotId, attemptId } = await fixture();
  const before = await student.query(api.examResults.myResult, { attemptId });
  expect(before).toMatchObject({ status: "withheld", transcript: null });
  expect(JSON.stringify(before)).not.toMatch(/earnedCents|correctChoiceIds|rubric|pointsAwarded|prompt/);
  const list = await student.query(api.examResults.myResults, {});
  expect(list.entries).toHaveLength(1);
  expect(list.entries[0].transcript).toBeNull();
  await expect(owner.query(api.examResults.myResult, { attemptId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: true,
  })).rejects.toThrow("NOT_FOUND");
  const published = await owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: true,
  });
  expect(published).toEqual({ revision: 1, released: true });
  const transcript = await student.query(api.examResults.myResult, { attemptId });
  expect(transcript).toMatchObject({
    status: "released",
    transcript: { earnedCents: 80, maximumCents: 100, percentBasisPoints: 8000, passed: true },
  });
  expect(JSON.stringify(transcript)).not.toMatch(/correctChoiceIds|rubric|pointsAwarded|entries|explanation/);
  await expect(owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: false,
  })).rejects.toThrow("REVISION_CONFLICT");
  await owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 1, released: false,
  });
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
  const audits = await t.run(ctx => ctx.db.query("examResultPublicationAudit")
    .withIndex("by_snapshot_at", q => q.eq("snapshotId", snapshotId)).collect());
  expect(audits.map(a => a.action)).toEqual(["publish", "withhold"]);
});

it("honors the frozen scheduled close even if live settings are changed", async () => {
  const { t, student, releaseId, attemptId } = await fixture("after_close");
  const initially = await student.query(api.examResults.myResult, { attemptId });
  expect(initially.status).toBe("withheld");
  await t.run(ctx => ctx.db.patch("examReleases", releaseId, {
    settings: { ...defaultExamSettings, resultVisibility: "immediate" },
  }));
  expect((await student.query(api.examResults.myResult, { attemptId })).transcript).toBeNull();
  vi.setSystemTime(Date.now() + 120_000);
  const result = await student.query(api.examResults.myResult, { attemptId });
  expect(result).toMatchObject({ status: "released",
    transcript: { percentBasisPoints: 8000, passed: true } });
});

it("does not reveal pending written grades even after doctor publication", async () => {
  const { owner, student, snapshotId, attemptId } = await fixture("manual", "needs_manual");
  await owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: true,
  });
  const result = await student.query(api.examResults.myResult, { attemptId });
  expect(result.status).toBe("grading");
  expect(result.transcript).toBeNull();
});

it("immediate release requires a final grade; teacher-controlled override cannot bypass policy", async () => {
  const { owner, student, snapshotId, attemptId } = await fixture("immediate");
  const result = await student.query(api.examResults.myResult, { attemptId });
  expect(result.transcript?.percentBasisPoints).toBe(8000);
  await expect(owner.mutation(api.examResults.setPublication, {
    snapshotId, expectedRevision: 0, released: false,
  })).rejects.toThrow("POLICY_CONFLICT");
});
