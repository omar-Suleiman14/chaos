import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const item = {
  kind: "single_choice" as const, prompt: "What supplies the myocardium?",
  choices: [{ id: "a", text: "Coronary arteries" }, { id: "b", text: "Pulmonary veins" }],
  correctChoiceIds: ["a"], points: 2,
  explanation: "Coronary circulation supplies the heart muscle.",
  topics: ["Circulation"], terms: ["Cardiovascular"], outcomes: ["Describe coronary blood flow"],
  status: "ready" as const,
};
async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Cardiology" });
  const secondCourseId = await doctor.mutation(api.courses.create, { title: "Physiology" });
  const lectureId = await doctor.mutation(api.courses.addLesson, { courseId, title: "Coronary flow" });
  await t.run(ctx => ctx.db.patch("learnCollections", courseId, {
    modules: [{ id: "m1", title: "CVS", lessonIds: [lectureId], assessments: [] }],
  }));
  return { t, doctor, student, courseId, secondCourseId, lectureId };
}

it("keeps answer keys private even when someone knows the question ID", async () => {
  const { t, doctor, student, courseId } = await fixture();
  const questionId = await doctor.mutation(api.questionBank.create, { item });
  expect((await doctor.query(api.questionBank.get, { questionId })).correctChoiceIds).toEqual(["a"]);
  await expect(student.query(api.questionBank.get, { questionId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(api.questionBank.get, { questionId })).rejects.toThrow("Not authenticated");
  await expect(student.mutation(api.questionBank.update, { questionId, expectedRevision: 0, item }))
    .rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.questionBank.addScope, { questionId, courseId }))
    .rejects.toThrow("NOT_FOUND");
  const mine = await student.query(api.questionBank.listMine, { paginationOpts: { numItems: 10, cursor: null } });
  expect(mine.page).toEqual([]);
});

it("reuses the same question across courses, modules and lectures without copying keys", async () => {
  const { doctor, student, courseId, secondCourseId, lectureId } = await fixture();
  const questionId = await doctor.mutation(api.questionBank.create, { item });
  const scopeId = await doctor.mutation(api.questionBank.addScope, { questionId, courseId, moduleId: "m1", lessonId: lectureId });
  expect(await doctor.mutation(api.questionBank.addScope, { questionId, courseId, moduleId: "m1", lessonId: lectureId })).toBe(scopeId);
  await doctor.mutation(api.questionBank.addScope, { questionId, courseId: secondCourseId });
  expect(await doctor.query(api.questionBank.listScopes, { questionId })).toHaveLength(2);
  expect((await doctor.query(api.questionBank.selectForExam, {
    courseId, moduleIds: ["m1"], lessonIds: [lectureId], topics: ["circulation"],
  })).questions.map(q => q._id)).toEqual([questionId]);
  expect((await doctor.query(api.questionBank.selectForExam, { courseId: secondCourseId })).questions)
    .toEqual([expect.objectContaining({ _id: questionId, correctChoiceIds: ["a"] })]);
  await expect(student.query(api.questionBank.selectForExam, { courseId })).rejects.toThrow("NOT_FOUND");
  await doctor.mutation(api.questionBank.removeScope, { scopeId });
  expect((await doctor.query(api.questionBank.selectForExam, { courseId })).questions).toEqual([]);
  expect((await doctor.query(api.questionBank.selectForExam, { courseId: secondCourseId })).questions).toHaveLength(1);
});

it("rejects unrelated courses and stale module/lecture links and filters", async () => {
  const { doctor, student, courseId, lectureId } = await fixture();
  const questionId = await doctor.mutation(api.questionBank.create, { item });
  const foreignCourseId = await student.mutation(api.courses.create, { title: "Other teacher" });
  await expect(doctor.mutation(api.questionBank.addScope, { questionId, courseId: foreignCourseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(doctor.mutation(api.questionBank.addScope, { questionId, courseId, moduleId: "unknown" }))
    .rejects.toThrow("NOT_FOUND");
  await expect(doctor.mutation(api.questionBank.addScope, { questionId, courseId, moduleId: "m1",
    lessonId: await student.mutation(api.courses.addLesson, { courseId: foreignCourseId }) }))
    .rejects.toThrow("NOT_FOUND");
  await doctor.mutation(api.questionBank.addScope, { questionId, courseId, lessonId: lectureId });
  await expect(doctor.query(api.questionBank.selectForExam, { courseId, moduleIds: ["missing"] }))
    .rejects.toThrow("NOT_FOUND");
  await expect(doctor.query(api.questionBank.selectForExam, { courseId, limit: 101 }))
    .rejects.toThrow("VALIDATION_FAILED");
});

it("validates answer keys and protects edits with revisions and archive state", async () => {
  const { doctor, courseId } = await fixture();
  await expect(doctor.mutation(api.questionBank.create, {
    item: { ...item, correctChoiceIds: ["missing"] },
  })).rejects.toThrow("VALIDATION_FAILED");
  await expect(doctor.mutation(api.questionBank.create, {
    item: { ...item, topics: ["Circulation", "circulation"] },
  })).rejects.toThrow("VALIDATION_FAILED");
  const questionId = await doctor.mutation(api.questionBank.create, { item });
  await doctor.mutation(api.questionBank.addScope, { questionId, courseId });
  expect(await doctor.mutation(api.questionBank.update, {
    questionId, expectedRevision: 0, item: { ...item, prompt: "Updated coronary blood flow?" },
  })).toBe(1);
  await expect(doctor.mutation(api.questionBank.update, { questionId, expectedRevision: 0, item }))
    .rejects.toThrow("REVISION_CONFLICT");
  await doctor.mutation(api.questionBank.archive, { questionId });
  expect((await doctor.query(api.questionBank.selectForExam, { courseId })).questions).toEqual([]);
  const archived = await doctor.query(api.questionBank.listMine, {
    paginationOpts: { numItems: 10, cursor: null }, status: "archived",
  });
  expect(archived.page.map(q => q._id)).toEqual([questionId]);
  expect(await doctor.mutation(api.questionBank.update, { questionId, expectedRevision: 2, item })).toBe(3);
  expect((await doctor.query(api.questionBank.selectForExam, { courseId })).questions).toHaveLength(1);
});
