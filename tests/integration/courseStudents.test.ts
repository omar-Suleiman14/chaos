import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const paragraph = (id: string, text: string) => ({ id, type: "paragraph" as const, text, citations: [], conceptIds: [] });
const guestToken = "g".repeat(43);

async function publishedCourse() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), teacher = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await teacher.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await teacher.mutation(api.courses.create, { title: "Liver basics" });
  const first = await teacher.mutation(api.courses.addLesson, { courseId });
  const second = await teacher.mutation(api.courses.addLesson, { courseId, title: "Portal hypertension" });
  for (const lessonId of [first, second]) {
    await teacher.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [paragraph("p", "Text")] } });
  }
  expect(await teacher.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  return { t, teacher, student, courseId, first, second };
}

it("requires owner approval for course enrollment and progress; rejects guest and legacy paths", async () => {
  const { t, teacher, student, courseId, first, second } = await publishedCourse();

  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: false, owner: false });
  expect(await t.query(api.courseStudents.myEnrollment, { courseId, guestToken })).toEqual({ enrolled: false, owner: false });
  expect(await teacher.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: true, owner: true });

  await expect(student.mutation(api.courseStudents.enroll, { courseId })).rejects.toThrow("APPROVAL_REQUIRED");
  await expect(t.mutation(api.courseStudents.enroll, { courseId, guestToken, guestName: "Sam" })).rejects.toThrow("APPROVAL_REQUIRED");
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, completed: true });
  await t.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, guestToken, completed: true });

  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, completed: true });
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: false, owner: false });
  expect((await teacher.query(api.courseStudents.analytics, { courseId })).enrolled).toBe(0);

  const [request] = await teacher.query(api.courseJoinRequests.listPending, { courseId });
  await teacher.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: true, owner: false });
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, completed: true });
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: second, completed: true });
  await t.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, guestToken, completed: true });

  const stats = await teacher.query(api.courseStudents.analytics, { courseId });
  expect(stats).toMatchObject({ published: true, lessons: 2, enrolled: 1, signedIn: 1, guests: 0, finished: 1, averagePercent: 100 });
  expect(stats.perLesson.map(l => l.completed)).toEqual([1, 1]);
  expect(stats.students[0]).toMatchObject({ guest: false, completed: 2, percent: 100, finished: true });
  expect(await teacher.query(api.studentRoster.count, {})).toBe(1);
  await expect(student.query(api.courseStudents.analytics, { courseId })).rejects.toThrow("NOT_FOUND");
});
