import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const makeItem = (prompt: string, topic: string) => ({
  kind: "single_choice" as const, prompt,
  choices: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }],
  correctChoiceIds: ["a"], points: 2, topics: [topic],
  terms: ["Cardiology"], outcomes: [], status: "ready" as const,
});

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const other = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Heart course" });
  const lectureId = await doctor.mutation(api.courses.addLesson, { courseId, title: "Coronary blood flow" });
  await t.run(ctx => ctx.db.patch("learnCollections", courseId, {
    modules: [{ id: "cv", title: "Cardiovascular", lessonIds: [lectureId], assessments: [] }],
  }));
  const q1 = await doctor.mutation(api.questionBank.create, { item: makeItem("First question", "Anatomy") });
  const q2 = await doctor.mutation(api.questionBank.create, { item: makeItem("Second question", "Physiology") });
  await doctor.mutation(api.questionBank.addScope, { questionId: q1, courseId, lessonId: lectureId });
  await doctor.mutation(api.questionBank.addScope, { questionId: q1, courseId, moduleId: "cv" });
  await doctor.mutation(api.questionBank.addScope, { questionId: q2, courseId, moduleId: "cv", lessonId: lectureId });
  return { t, doctor, other, courseId, lectureId, q1, q2 };
}

it("restricts draft creation and reading to the course owner, and never exposes answer keys in candidate projections", async () => {
  const { t, doctor, other, courseId, q1 } = await fixture();
  const draftId = await doctor.mutation(api.examBuilder.createDraft, { courseId, title: "Midterm" });
  await expect(other.query(api.examBuilder.getDraft, { draftId })).rejects.toThrow("NOT_FOUND");
  await expect(other.query(api.examBuilder.preview, { draftId })).rejects.toThrow("NOT_FOUND");
  await expect(other.query(api.examBuilder.candidates, { draftId, allocationId: "whole_course" })).rejects.toThrow("NOT_FOUND");
  await expect(other.mutation(api.examBuilder.savePlan, { draftId, expectedRevision: 0,
    title: "Stolen", targetCount: 1, allocations: [{ id: "all", kind: "course", key: "", count: 1, points: 1 }] }))
    .rejects.toThrow("NOT_FOUND");
  await expect(other.mutation(api.examBuilder.createDraft, { courseId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(api.examBuilder.getDraft, { draftId })).rejects.toThrow("Not authenticated");
  const candidate = (await doctor.query(api.examBuilder.candidates, {
    draftId, allocationId: "whole_course",
  })).questions.find(q => q.questionId === q1);
  expect(candidate?.prompt).toBe("First question");
  expect(candidate).not.toHaveProperty("correctChoiceIds");
  expect(candidate).not.toHaveProperty("sampleAnswer");
  expect(candidate).not.toHaveProperty("explanation");
});

it("counts distinct questions across overlapping course and lecture allocations and auto-fills without repeats", async () => {
  const { doctor, courseId, lectureId, q1, q2 } = await fixture();
  const draftId = await doctor.mutation(api.examBuilder.createDraft, { courseId });
  const allocations = [
    { id: "any", kind: "course" as const, key: "", count: 1, points: 2.5 },
    { id: "anatomy", kind: "topic" as const, key: "Anatomy", count: 1, points: 3 },
  ];
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Circulation", targetCount: 2, allocations,
  });
  const coverage = await doctor.query(api.examBuilder.preview, { draftId });
  expect(coverage.readyQuestions).toBe(2);
  expect(coverage.rows.map(r => r.available)).toEqual([2, 1]);
  expect(coverage.feasible).toBe(true);
  await doctor.mutation(api.examBuilder.autoFill, { draftId, expectedRevision: 1 });
  const chosen = await doctor.query(api.examBuilder.getDraft, { draftId });
  expect(chosen.selections).toHaveLength(2);
  expect(chosen.selections.find(s => s.allocationId === "anatomy")?.questionId).toBe(q1);
  expect(chosen.selections.find(s => s.allocationId === "any")?.questionId).toBe(q2);
  expect(new Set(chosen.selections.map(s => s.questionId)).size).toBe(2);
  expect((await doctor.query(api.examBuilder.preview, { draftId })).selected.map(s => s.points)).toEqual([2.5, 3]);
  await expect(doctor.mutation(api.examBuilder.autoFill, { draftId, expectedRevision: 1 }))
    .rejects.toThrow("REVISION_CONFLICT");
  await expect(doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 2, title: "Bad", targetCount: 2,
    allocations: [{ id: "bad", kind: "lecture", key: "foreign" as Id<"lessons">, count: 2, points: 1 }],
  })).rejects.toThrow("NOT_FOUND");
  // Changing the allocation invalidates earlier question placement instead of leaving stale references.
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 2, title: "New", targetCount: 1,
    allocations: [{ id: "lecture", kind: "lecture", key: lectureId, count: 1, points: 2 }],
  });
  expect((await doctor.query(api.examBuilder.getDraft, { draftId })).selections).toEqual([]);
});

it("rejects duplicate, out-of-scope and cross-account selections and enforces quota shortages", async () => {
  const { doctor, other, courseId, q1, q2 } = await fixture();
  const draftId = await doctor.mutation(api.examBuilder.createDraft, { courseId });
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "Topic-specific", targetCount: 2,
    allocations: [{ id: "anatomy", kind: "topic", key: "Anatomy", count: 2, points: 1 }],
  });
  expect((await doctor.query(api.examBuilder.preview, { draftId })).feasible).toBe(false);
  await expect(doctor.mutation(api.examBuilder.autoFill, { draftId, expectedRevision: 1 }))
    .rejects.toThrow("INSUFFICIENT_QUESTIONS");
  await expect(doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [
      { questionId: q1, allocationId: "anatomy" }, { questionId: q1, allocationId: "anatomy" },
    ],
  })).rejects.toThrow("VALIDATION_FAILED");
  await expect(doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId: q2, allocationId: "anatomy" }],
  })).rejects.toThrow("NOT_FOUND");
  await expect(other.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId: q1, allocationId: "anatomy" }],
  })).rejects.toThrow("NOT_FOUND");
  const otherCourse = await other.mutation(api.courses.create, { title: "Other account" });
  const foreign = await other.mutation(api.questionBank.create, { item: makeItem("Private", "Anatomy") });
  await other.mutation(api.questionBank.addScope, { questionId: foreign, courseId: otherCourse });
  await expect(doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId: foreign, allocationId: "anatomy" }],
  })).rejects.toThrow("NOT_FOUND");
});

it("invalidates removed lecture links, archived questions and stale selection revisions", async () => {
  const { doctor, courseId, q1 } = await fixture();
  const draftId = await doctor.mutation(api.examBuilder.createDraft, { courseId });
  await doctor.mutation(api.examBuilder.savePlan, {
    draftId, expectedRevision: 0, title: "One question", targetCount: 1,
    allocations: [{ id: "anatomy", kind: "topic", key: "Anatomy", count: 1, points: 2 }],
  });
  await doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 1, selections: [{ questionId: q1, allocationId: "anatomy" }],
  });
  await doctor.mutation(api.questionBank.archive, { questionId: q1 });
  const preview = await doctor.query(api.examBuilder.preview, { draftId });
  expect(preview.selected[0].valid).toBe(false);
  expect(preview.rows[0].available).toBe(0);
  await expect(doctor.mutation(api.examBuilder.setSelections, {
    draftId, expectedRevision: 2, selections: [{ questionId: q1, allocationId: "anatomy" }],
  })).rejects.toThrow("NOT_FOUND");
  await doctor.mutation(api.examBuilder.removeDraft, { draftId, expectedRevision: 2 });
  expect(await doctor.query(api.examBuilder.listDrafts, { courseId })).toEqual([]);
});
