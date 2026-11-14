import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const learner = t.withIdentity(otherCreatorIdentity);
  const outsider = t.withIdentity({
    ...otherCreatorIdentity,
    subject: "user_notifications_outsider",
    tokenIdentifier: creatorIdentity.issuer + "|user_notifications_outsider",
    email: "outsider-notices@example.com",
  });
  for (const user of [doctor, learner, outsider])
    await user.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Academic notices" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, {
    lessonId, expectedRevision: 0,
    document: { schemaVersion: 1, blocks: [
      { id: "intro", type: "paragraph", text: "Class introduction", citations: [], conceptIds: [] },
    ] },
  });
  await doctor.mutation(api.courses.publish, { courseId, visibility: "public" });
  return { t, doctor, learner, outsider, courseId };
}

it("notifies the doctor of requests but keeps each user's inbox isolated", async () => {
  const f = await setup();
  await f.learner.mutation(api.courseJoinRequests.requestJoin, { courseId: f.courseId });
  const ownerInbox = await f.doctor.query(api.notifications.listNotifications, {});
  expect(ownerInbox.items.filter(n => n.kind === "course_enrollment")).toHaveLength(1);
  expect((await f.learner.query(api.notifications.listNotifications, {})).items).toHaveLength(0);
  expect((await f.outsider.query(api.notifications.listNotifications, {})).items).toHaveLength(0);
  await f.outsider.mutation(api.notifications.markNotificationsRead, {
    ids: [ownerInbox.items[0]._id],
  });
  expect((await f.doctor.query(api.notifications.listNotifications, {})).unread).toBe(1);
});

it("notifies only on publication, obeys preferences and hides revoked course notifications", async () => {
  const f = await setup();
  await f.learner.mutation(api.courseJoinRequests.requestJoin, { courseId: f.courseId });
  const [request] = await f.doctor.query(api.courseJoinRequests.listPending, { courseId: f.courseId });
  await f.doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  expect((await f.learner.query(api.notifications.listNotifications, {})).items)
    .toEqual(expect.arrayContaining([expect.objectContaining({ kind: "course_enrollment" })]));

  const noticeId = await f.doctor.mutation(api.courseCommunications.createAnnouncement, {
    courseId: f.courseId, title: "Tutorial", body: "Lecture review",
  });
  expect((await f.learner.query(api.notifications.listNotifications, {})).items
    .some(n => n.kind === "course_announcement")).toBe(false);
  await f.learner.mutation(api.notifications.setNotificationPreference, {
    kind: "course_announcement", enabled: false,
  });
  await f.doctor.mutation(api.courseCommunications.reviseAnnouncement, {
    announcementId: noticeId, expectedRevision: 0,
    title: "Tutorial", body: "Lecture review", published: true, archived: false,
  });
  expect((await f.learner.query(api.notifications.listNotifications, {})).items
    .some(n => n.kind === "course_announcement")).toBe(false);

  await f.learner.mutation(api.notifications.setNotificationPreference, {
    kind: "course_announcement", enabled: true,
  });
  const secondId = await f.doctor.mutation(api.courseCommunications.createAnnouncement, {
    courseId: f.courseId, title: "Exam notice", body: "Class news",
  });
  await f.doctor.mutation(api.courseCommunications.reviseAnnouncement, {
    announcementId: secondId, expectedRevision: 0,
    title: "Exam notice", body: "Class news", published: true, archived: false,
  });
  expect((await f.learner.query(api.notifications.listNotifications, {})).items
    .filter(n => n.kind === "course_announcement")).toHaveLength(1);

  await f.t.run(async ctx => {
    const row = await ctx.db.query("courseJoinRequests")
      .withIndex("by_course_student", q =>
        q.eq("courseId", f.courseId).eq("studentId", otherCreatorIdentity.subject)).unique();
    if (row) await ctx.db.patch("courseJoinRequests", row._id, { status: "removed" });
  });
  expect((await f.learner.query(api.notifications.listNotifications, {})).items).toHaveLength(0);
  expect((await f.doctor.query(api.notifications.listNotifications, {})).unread).toBe(1);
});

it("routes private message notifications only to the other approved participant", async () => {
  const f = await setup();
  await f.learner.mutation(api.courseJoinRequests.requestJoin, { courseId: f.courseId });
  const [request] = await f.doctor.query(api.courseJoinRequests.listPending, { courseId: f.courseId });
  await f.doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  await f.learner.mutation(api.courseCommunications.sendMessage, {
    courseId: f.courseId, body: "Can you check my lecture notes?",
  });
  const ownerInbox = await f.doctor.query(api.notifications.listNotifications, {});
  expect(ownerInbox.items.filter(n => n.kind === "course_message")).toHaveLength(1);
  expect(ownerInbox.items.find(n => n.kind === "course_message")?.message)
    .not.toContain("lecture notes");
  expect((await f.outsider.query(api.notifications.listNotifications, {})).items).toHaveLength(0);
});
