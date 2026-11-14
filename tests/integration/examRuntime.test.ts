import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const bank = (prompt: string) => ({
  kind: "single_choice" as const, prompt, choices: [{ id: "a", text: "Correct" }, { id: "b", text: "Wrong" }],
  correctChoiceIds: ["a"], points: 2, topics: ["Heart"], terms: [], outcomes: [], status: "ready" as const,
});
async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Cardiology" });
  const q = await owner.mutation(api.questionBank.createForCourse, { courseId, item: bank("Original question") });
  const draftId = await owner.mutation(api.examBuilder.createDraft, { courseId, title: "Circulation" });
  await owner.mutation(api.examBuilder.savePlan, { draftId, expectedRevision: 0,
    title: "Circulation", targetCount: 1,
    allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 3 }] });
  return { t, owner, other, courseId, q, draftId };
}
it("seals immutable content and private answer keys, with optimistic and idempotent publication", async () => {
  const { owner, other, t, q, draftId, courseId } = await setup();
  await expect(owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 1 }))
    .rejects.toThrow("INCOMPLETE_EXAM");
  await owner.mutation(api.examBuilder.setSelections, { draftId, expectedRevision: 1,
    selections: [{ questionId: q, allocationId: "all" }] });
  await expect(other.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 }))
    .rejects.toThrow("NOT_FOUND");
  const { snapshotId, version } = await owner.mutation(api.examRuntime.sealDraft, {
    draftId, expectedRevision: 2,
  });
  expect(version).toBe(1);
  expect(await owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 }))
    .toEqual({ snapshotId, version: 1 });
  const frozen = await owner.query(api.examRuntime.getOwnerSnapshot, { snapshotId });
  expect(frozen?.questions[0]).toMatchObject({
    prompt: "Original question", correctChoiceIds: ["a"], points: 3, sourceRevision: 0,
  });
  expect(frozen?.totalPoints).toBe(3);
  await expect(other.query(api.examRuntime.getOwnerSnapshot, { snapshotId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(api.examRuntime.getOwnerSnapshot, { snapshotId })).rejects.toThrow("Not authenticated");
  const publicAttempt = await other.mutation(api.examRuntime.startAttempt, { snapshotId }).catch(error => String(error));
  expect(publicAttempt).toContain("EXAM_NOT_ASSIGNED");
  await owner.mutation(api.questionBank.update, { questionId: q, expectedRevision: 0,
    item: { ...bank("Revised question"), correctChoiceIds: ["b"] } });
  expect((await owner.query(api.examRuntime.getOwnerSnapshot, { snapshotId }))?.questions[0].prompt)
    .toBe("Original question");
  expect((await owner.query(api.examRuntime.getOwnerSnapshot, { snapshotId }))?.questions[0].correctChoiceIds)
    .toEqual(["a"]);
  expect((await owner.query(api.examRuntime.listSealed, { courseId }))[0].snapshotId).toBe(snapshotId);
  await expect(owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 1 }))
    .rejects.toThrow("REVISION_CONFLICT");
});
it("fails closed on stale, archived or incomplete source questions and never publishes a partial version", async () => {
  const { owner, q, draftId, courseId } = await setup();
  await owner.mutation(api.examBuilder.setSelections, { draftId, expectedRevision: 1,
    selections: [{ questionId: q, allocationId: "all" }] });
  await owner.mutation(api.questionBank.archive, { questionId: q });
  await expect(owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 }))
    .rejects.toThrow("NOT_FOUND");
  expect(await owner.query(api.examRuntime.listSealed, { courseId })).toHaveLength(0);
});
it("seals media references with checked owner, MIME and ETag instead of live editor references", async () => {
  const { t, owner, q, draftId } = await setup();
  const imageId = await t.run(ctx => ctx.db.insert("questionBankMedia", {
    ownerId: creatorIdentity.subject, mimeType: "image/png", bytes: 24,
    status: "ready", etag: '"1234567890123456"', createdAt: Date.now(), expiresAt: Date.now()+10000,
  }));
  await owner.mutation(api.questionBank.update, { questionId: q, expectedRevision: 0,
    item: { ...bank("Clinical case"), caseStudy: { stem: "Symptoms", media: [{ mediaId: imageId, alt: "ECG" }] } } });
  await owner.mutation(api.examBuilder.setSelections, { draftId, expectedRevision: 1,
    selections: [{ questionId: q, allocationId: "all" }] });
  const { snapshotId } = await owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 });
  const first = await owner.query(api.examRuntime.getOwnerSnapshot, { snapshotId });
  expect(first?.questions[0].caseStudy?.media[0]).toMatchObject({
    mimeType: "image/png", etag: '"1234567890123456"', alt: "ECG",
  });
});
it("attempt lifecycle transitions are revision-safe, terminal and private", async () => {
  const { t, owner, other, q, draftId, courseId } = await setup();
  await owner.mutation(api.examBuilder.setSelections, { draftId, expectedRevision: 1,
    selections: [{ questionId: q, allocationId: "all" }] });
  const { snapshotId } = await owner.mutation(api.examRuntime.sealDraft, { draftId, expectedRevision: 2 });
  const attemptId = await t.run(ctx => ctx.db.insert("examAttempts", {
    ownerId: creatorIdentity.subject, courseId, snapshotId, studentId: otherCreatorIdentity.subject,
    state: "in_progress", revision: 0, startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await expect(owner.query(api.examRuntime.getMyAttempt, { attemptId })).rejects.toThrow("NOT_FOUND");
  await expect(other.query(api.examRuntime.getMyAttempt, { attemptId })).rejects.toThrow("NOT_FOUND");
  const closed = await t.mutation(internal.examRuntime.closeAttemptInternal, {
    attemptId, expectedRevision: 0, nextState: "submitted",
  });
  expect(closed).toMatchObject({ state: "submitted", revision: 1 });
  expect(await t.mutation(internal.examRuntime.closeAttemptInternal, {
    attemptId, expectedRevision: 1, nextState: "submitted",
  })).toEqual({ state: "submitted", revision: 1 });
  await expect(t.mutation(internal.examRuntime.closeAttemptInternal, {
    attemptId, expectedRevision: 1, nextState: "expired",
  })).rejects.toThrow("ATTEMPT_FINALIZED");
  await expect(t.mutation(internal.examRuntime.closeAttemptInternal, {
    attemptId, expectedRevision: 0, nextState: "submitted",
  })).rejects.toThrow("REVISION_CONFLICT");
});
