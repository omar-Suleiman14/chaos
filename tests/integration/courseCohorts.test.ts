import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

const thirdIdentity = {
  ...otherCreatorIdentity,
  subject: "user_course_third",
  tokenIdentifier: `${otherCreatorIdentity.issuer}|user_course_third`,
  email: "third@example.com",
  name: "Taylor Student",
  nickname: "taylor",
};

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  const third = t.withIdentity(thirdIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  await third.mutation(api.quizFunctions.getOrCreateUser, {});
  await t.run(async ctx => {
    for (const [userId, handle] of [
      [otherCreatorIdentity.subject, "course_riley"],
      [thirdIdentity.subject, "course_taylor"],
    ]) {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
      if (!user) throw new Error("Missing fixture user");
      await ctx.db.patch("users", user._id, { username: handle });
    }
  });
  const courseId = await doctor.mutation(api.courses.create, { title: "CNS group teaching" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, {
    lessonId, expectedRevision: 0,
    document: { schemaVersion: 1,
      blocks: [{ id: "p", type: "paragraph", text: "Private lecture", citations: [], conceptIds: [] }],
    },
  });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" }))
    .toEqual({ ok: true });
  return { t, doctor, student, third, courseId, lessonId };
}

async function approve(doctor: ReturnType<ReturnType<typeof createTestConvex>["withIdentity"]>,
  student: ReturnType<ReturnType<typeof createTestConvex>["withIdentity"]>, courseId: string) {
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  const [request] = await doctor.query(api.courseJoinRequests.listPending, { courseId: courseId as never });
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
}

it("keeps group writes owner-only and requires admission before joining groups", async () => {
  const { doctor, student, third, courseId } = await fixture();
  await expect(student.query(api.courseCohorts.roster, { courseId })).rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(api.courseCohorts.createGroup, { courseId, name: "Secret" })).rejects.toThrow("NOT_FOUND");

  const groupId = await doctor.mutation(api.courseCohorts.createGroup, { courseId, name: "Group A" });
  await expect(doctor.mutation(api.courseCohorts.createGroup, { courseId, name: "group a" }))
    .rejects.toThrow("ALREADY_EXISTS");
  await expect(doctor.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  })).rejects.toThrow("APPROVAL_REQUIRED");
  await expect(student.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  })).rejects.toThrow("NOT_FOUND");

  await approve(doctor, student, courseId);
  await doctor.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  });
  await doctor.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  }); // idempotent
  const result = await doctor.query(api.courseCohorts.roster, { courseId });
  expect(result.groups[0].studentIds).toEqual([otherCreatorIdentity.subject]);
  expect(result.students).toEqual(expect.arrayContaining([
    expect.objectContaining({ studentId: otherCreatorIdentity.subject, status: "approved" }),
  ]));

  await expect(doctor.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [thirdIdentity.subject], action: "readmit",
  })).rejects.toThrow("NOT_FOUND");
  await doctor.mutation(api.courseCohorts.renameGroup, { groupId, name: "CNS Cohort" });
  expect((await doctor.query(api.courseCohorts.roster, { courseId })).groups[0].name).toBe("CNS Cohort");
  await doctor.mutation(api.courseCohorts.deleteGroup, { groupId });
  expect((await doctor.query(api.courseCohorts.roster, { courseId })).groups).toHaveLength(0);
  await expect(third.query(api.courses.lesson, { courseId, lessonId: (await doctor.query(api.courses.getPublic, { courseId }))!.lessons[0].id }))
    .resolves.toBeNull();
});

it("suspends, removes and explicitly readmits with immediate server-side revocation", async () => {
  const { doctor, student, courseId, lessonId } = await fixture();
  await approve(doctor, student, courseId);
  const groupId = await doctor.mutation(api.courseCohorts.createGroup, { courseId, name: "A1" });
  await doctor.mutation(api.courseCohorts.changeGroupMembers, {
    groupId, studentIds: [otherCreatorIdentity.subject], action: "add",
  });
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).not.toBeNull();

  await doctor.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "suspend",
  });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("suspended");
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  await expect(student.mutation(api.courseJoinRequests.requestJoin, { courseId })).rejects.toThrow("readmit");
  expect((await doctor.query(api.courseCohorts.roster, { courseId })).groups[0].studentIds)
    .toContain(otherCreatorIdentity.subject);

  await doctor.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "readmit",
  });
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).not.toBeNull();
  await doctor.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "remove",
  });
  expect(await student.query(api.courseJoinRequests.myStatus, { courseId })).toBe("removed");
  expect(await student.query(api.courseStudents.myEnrollment, { courseId }))
    .toEqual({ enrolled: false, owner: false });
  expect((await doctor.query(api.courseCohorts.roster, { courseId })).groups[0].studentIds).toEqual([]);

  await doctor.mutation(api.courseCohorts.manageStudents, {
    courseId, studentIds: [otherCreatorIdentity.subject], action: "readmit",
  });
  expect(await student.query(api.courseStudents.myEnrollment, { courseId }))
    .toEqual({ enrolled: true, owner: false });
  expect((await doctor.query(api.courseCohorts.roster, { courseId })).groups[0].studentIds).toEqual([]);
});

it("an invitation requires the right student to accept; declining never admits them", async () => {
  const { doctor, student, third, courseId, lessonId } = await fixture();
  await doctor.mutation(api.courseCohorts.inviteStudent, { courseId, username: "@course_riley" });
  await doctor.mutation(api.courseCohorts.inviteStudent, { courseId, username: "@course_riley" });
  expect(await student.query(api.courseCohorts.myInvitation, { courseId })).toBe("pending");
  expect(await third.query(api.courseCohorts.myInvitation, { courseId })).toBe("none");
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  await expect(third.mutation(api.courseCohorts.respondToInvitation, { courseId, accept: true }))
    .rejects.toThrow("NOT_FOUND");
  await student.mutation(api.courseCohorts.respondToInvitation, { courseId, accept: true });
  expect(await student.query(api.courseCohorts.myInvitation, { courseId })).toBe("none");
  expect(await student.query(api.courses.lesson, { courseId, lessonId })).not.toBeNull();
  await expect(student.mutation(api.courseCohorts.respondToInvitation, { courseId, accept: true }))
    .rejects.toThrow("NOT_FOUND");

  await doctor.mutation(api.courseCohorts.inviteStudent, { courseId, username: "course_taylor" });
  await third.mutation(api.courseCohorts.respondToInvitation, { courseId, accept: false });
  expect(await third.query(api.courseJoinRequests.myStatus, { courseId })).toBe("none");
  expect(await third.query(api.courses.lesson, { courseId, lessonId })).toBeNull();
  await doctor.mutation(api.courseCohorts.inviteStudent, { courseId, username: "course_taylor" });
  await doctor.mutation(api.courseCohorts.cancelInvitation, { courseId, studentId: thirdIdentity.subject });
  expect(await third.query(api.courseCohorts.myInvitation, { courseId })).toBe("none");
  await expect(third.mutation(api.courseCohorts.respondToInvitation, { courseId, accept: true }))
    .rejects.toThrow("NOT_FOUND");
});
