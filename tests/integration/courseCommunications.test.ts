import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function classroom() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const learner = t.withIdentity(otherCreatorIdentity);
  const outsider = t.withIdentity({
    ...otherCreatorIdentity,
    subject: "user_classroom_outsider",
    tokenIdentifier: creatorIdentity.issuer + "|user_classroom_outsider",
    email: "classroom-outsider@example.com",
    nickname: "outsider",
  });
  for (const actor of [doctor, learner, outsider])
    await actor.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Classroom security" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, {
    lessonId, expectedRevision: 0,
    document: { schemaVersion: 1, blocks: [
      { id: "intro", type: "paragraph", text: "Intro lecture", citations: [], conceptIds: [] },
    ] },
  });
  await doctor.mutation(api.courses.publish, { courseId, visibility: "public" });
  return { t, doctor, learner, outsider, courseId };
}
async function approve(f: Awaited<ReturnType<typeof classroom>>) {
  await f.learner.mutation(api.courseJoinRequests.requestJoin, { courseId: f.courseId });
  const [pending] = await f.doctor.query(api.courseJoinRequests.listPending, { courseId: f.courseId });
  await f.doctor.mutation(api.courseJoinRequests.decide, { requestId: pending.id, approve: true });
}
it("keeps draft announcements and draft events private until publishing", async () => {
  const f = await classroom();
  const id = await f.doctor.mutation(api.courseCommunications.createAnnouncement, {
    courseId: f.courseId, title: "مراجعة", body: "Lecture at 10",
  });
  const now = Date.now();
  const eventId = await f.doctor.mutation(api.courseCommunications.createEvent, {
    courseId: f.courseId, title: "Seminar", details: "Bring notes", location: "Room B",
    startsAt: now + 60_000, endsAt: now + 120_000,
  });
  await expect(f.learner.query(api.courseCommunications.myAnnouncements, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.learner.query(api.courseCommunications.myEvents, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await approve(f);
  expect(await f.learner.query(api.courseCommunications.myAnnouncements, { courseId: f.courseId })).toEqual([]);
  expect(await f.learner.query(api.courseCommunications.myEvents, { courseId: f.courseId })).toEqual([]);
  const [a] = await f.doctor.query(api.courseCommunications.teacherAnnouncements, { courseId: f.courseId });
  const [e] = await f.doctor.query(api.courseCommunications.teacherEvents, { courseId: f.courseId });
  await f.doctor.mutation(api.courseCommunications.reviseAnnouncement, {
    announcementId: id, expectedRevision: a.revision, title: a.title, body: a.body,
    published: true, archived: false,
  });
  await f.doctor.mutation(api.courseCommunications.reviseEvent, {
    eventId, expectedRevision: e.revision, title: e.title, details: e.details,
    location: e.location, startsAt: e.startsAt, endsAt: e.endsAt,
    published: true, archived: false,
  });
  expect((await f.learner.query(api.courseCommunications.myAnnouncements, { courseId: f.courseId }))[0])
    .toMatchObject({ title: "مراجعة" });
  expect((await f.learner.query(api.courseCommunications.myEvents, { courseId: f.courseId }))[0])
    .toMatchObject({ title: "Seminar", location: "Room B" });
  await expect(f.outsider.query(api.courseCommunications.myAnnouncements, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.learner.query(api.courseCommunications.teacherAnnouncements, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.learner.mutation(api.courseCommunications.reviseAnnouncement, {
    announcementId: id, expectedRevision: 1, title: "Forged", body: "Fake",
    published: true, archived: false,
  })).rejects.toThrow("NOT_FOUND");
  await expect(f.doctor.mutation(api.courseCommunications.reviseAnnouncement, {
    announcementId: id, expectedRevision: 0, title: "Stale", body: "Stale",
    published: true, archived: false,
  })).rejects.toThrow("REVISION_CONFLICT");
});
it("isolates private student messages, including after approval revocation", async () => {
  const f = await classroom();
  await approve(f);
  await f.learner.mutation(api.courseCommunications.sendMessage, {
    courseId: f.courseId, body: "Can I review the slides?",
  });
  expect((await f.learner.query(api.courseCommunications.conversation, { courseId: f.courseId }))[0])
    .toMatchObject({ isMine: true, body: "Can I review the slides?" });
  expect((await f.doctor.query(api.courseCommunications.conversation, {
    courseId: f.courseId, studentId: otherCreatorIdentity.subject,
  }))[0]).toMatchObject({ isMine: false });
  await expect(f.outsider.query(api.courseCommunications.conversation, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.doctor.query(api.courseCommunications.conversation, {
    courseId: f.courseId, studentId: "user_classroom_outsider",
  })).rejects.toThrow("NOT_FOUND");
  await f.t.run(async ctx => {
    const request = await ctx.db.query("courseJoinRequests").withIndex("by_course_student", q =>
      q.eq("courseId", f.courseId).eq("studentId", otherCreatorIdentity.subject)).unique();
    if (request) await ctx.db.patch("courseJoinRequests", request._id, { status: "removed" });
  });
  await expect(f.learner.query(api.courseCommunications.conversation, { courseId: f.courseId }))
    .rejects.toThrow("NOT_FOUND");
  await expect(f.doctor.query(api.courseCommunications.conversation, {
    courseId: f.courseId, studentId: otherCreatorIdentity.subject,
  })).rejects.toThrow("NOT_FOUND");
  await expect(f.learner.mutation(api.courseCommunications.sendMessage, {
    courseId: f.courseId, body: "Bypass",
  })).rejects.toThrow("NOT_FOUND");
});
