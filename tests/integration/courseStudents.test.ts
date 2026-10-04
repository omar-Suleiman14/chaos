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
    await teacher.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" });
  }
  expect(await teacher.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  return { t, teacher, student, courseId, first, second };
}

it("enrolls signed-in and guest learners, adds them to the roster and reports their progress to the teacher only", async () => {
  const { t, teacher, student, courseId, first, second } = await publishedCourse();

  // Nobody is enrolled until they press Start; the owner always is.
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: false, owner: false });
  expect(await t.query(api.courseStudents.myEnrollment, { courseId, guestToken })).toEqual({ enrolled: false, owner: false });
  expect(await teacher.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: true, owner: true });

  // Progress before enrolling is ignored; guests need a well-formed device token.
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, completed: true });
  await expect(t.mutation(api.courseStudents.enroll, { courseId, guestToken: "short" })).rejects.toThrow("VALIDATION_FAILED");

  await student.mutation(api.courseStudents.enroll, { courseId });
  await t.mutation(api.courseStudents.enroll, { courseId, guestToken, guestName: "Sam" });
  await student.mutation(api.courseStudents.enroll, { courseId }); // idempotent
  await teacher.mutation(api.courseStudents.enroll, { courseId }); // owners are never their own students
  expect(await student.query(api.courseStudents.myEnrollment, { courseId })).toEqual({ enrolled: true, owner: false });
  expect(await t.query(api.courseStudents.myEnrollment, { courseId, guestToken })).toEqual({ enrolled: true, owner: false });

  // Both show up in the teacher's Students roster.
  expect(await teacher.query(api.studentRoster.count, {})).toBe(2);
  const roster = await teacher.query(api.studentRoster.mine, { paginationOpts: { numItems: 24, cursor: null } });
  expect(roster.page.map(r => r.name)).toContain("Sam");

  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, completed: true });
  await student.mutation(api.courseStudents.recordLesson, { courseId, lessonId: second, completed: true });
  await t.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, guestToken, completed: true });
  await t.mutation(api.courseStudents.recordLesson, { courseId, lessonId: first, guestToken, completed: false });
  await t.mutation(api.courseStudents.recordLesson, { courseId, lessonId: second, guestToken });

  const stats = await teacher.query(api.courseStudents.analytics, { courseId });
  expect(stats).toMatchObject({ published: true, lessons: 2, enrolled: 2, signedIn: 1, guests: 1, active7d: 2, finished: 1, averagePercent: 50 });
  expect(stats.perLesson.map(l => l.completed)).toEqual([1, 1]);
  const sam = stats.students.find(s => s.name === "Sam")!;
  expect(sam).toMatchObject({ guest: true, username: null, completed: 0, percent: 0, finished: false, lastLesson: "Portal hypertension" });
  expect(stats.students.find(s => !s.guest)).toMatchObject({ completed: 2, percent: 100, finished: true });

  // Analytics are the course owner's alone.
  await expect(student.query(api.courseStudents.analytics, { courseId })).rejects.toThrow("NOT_FOUND");
});
