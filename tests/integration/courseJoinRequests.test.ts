import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Neurology" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, {
    lessonId,
    expectedRevision: 0,
    document: {
      schemaVersion: 1,
      blocks: [{ id: "p", type: "paragraph", text: "First lecture", citations: [], conceptIds: [] }],
    },
  });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" }))
    .toEqual({ ok: true });
  return { t, doctor, student, courseId };
}

it("requires a signed-in applicant and only lets the course owner approve", async () => {
  const { t, doctor, student, courseId } = await setup();

  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("none");
  expect(await doctor.query(api.courseJoinRequests.myStatus, { courseId })).toBe("approved");
  await expect(t.mutation(api.courseJoinRequests.requestJoin, { courseId }))
    .rejects.toThrow("Not authenticated");
  await expect(doctor.mutation(api.courseJoinRequests.requestJoin, { courseId }))
    .rejects.toThrow("Cannot request your own course");

  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId }); // idempotent
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("pending");
  expect(await student.query(api.courseStudents.myEnrollment, { courseId }))
    .toEqual({ enrolled: false, owner: false });

  await expect(student.query(api.courseJoinRequests.listPending, { courseId }))
    .rejects.toThrow("NOT_FOUND");
  const pending = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  expect(pending).toHaveLength(1);
  expect(pending[0].studentId).toBe(otherCreatorIdentity.subject);

  await expect(student.mutation(api.courseJoinRequests.decide, {
    requestId: pending[0].id,
    approve: true,
  })).rejects.toThrow("NOT_FOUND");

  expect(await doctor.mutation(api.courseJoinRequests.decide, {
    requestId: pending[0].id,
    approve: true,
  })).toBe("approved");
  expect(await doctor.mutation(api.courseJoinRequests.decide, {
    requestId: pending[0].id,
    approve: true,
  })).toBe("approved");

  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("approved");
  expect(await student.query(api.courseStudents.myEnrollment, { courseId }))
    .toEqual({ enrolled: true, owner: false });
  expect(await doctor.query(api.courseJoinRequests.listPending, { courseId })).toEqual([]);
});

it("supports withdrawing and re-requesting without granting membership after rejection", async () => {
  const { doctor, student, courseId } = await setup();
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  await student.mutation(api.courseJoinRequests.withdraw, { courseId });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("withdrawn");
  expect(await doctor.query(api.courseJoinRequests.listPending, { courseId })).toHaveLength(0);

  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  const [pending] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  expect(pending).toBeDefined();
  expect(await doctor.mutation(api.courseJoinRequests.decide, {
    requestId: pending.id,
    approve: false,
  })).toBe("rejected");

  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("rejected");
  expect(await student.query(api.courseStudents.myEnrollment, { courseId }))
    .toEqual({ enrolled: false, owner: false });
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("pending");
});

it("does not mistake a preexisting self-enrollment for doctor approval", async () => {
  const { doctor, student, courseId } = await setup();
  // This legacy path remains available until the enrollment migration PR.
  await student.mutation(api.courseStudents.enroll, { courseId });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("none");
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("pending");
  const [pending] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  expect(pending).toBeDefined();
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: pending.id, approve: true });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("approved");
});
