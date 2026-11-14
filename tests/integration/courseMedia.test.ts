import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const reserve = makeFunctionReference<"mutation", {
  courseId: Id<"learnCollections">; lessonId: Id<"lessons">;
  versionId: Id<"lessonVersions">; bytes: number; mimeType: string;
}, Id<"courseMediaObjects">>("courseMedia:reserveUpload");
const markReady = makeFunctionReference<"mutation", { mediaId: Id<"courseMediaObjects">; etag: string }, null>("courseMedia:markReady");
const getContentUrl = makeFunctionReference<"query", { mediaId: Id<"courseMediaObjects"> }, string | null>("courseMedia:getContentUrl");
const getReady = makeFunctionReference<"query", { id: string }, { etag: string; key: string } | null>("courseMedia:getReady");
const remove = makeFunctionReference<"mutation", { mediaId: Id<"courseMediaObjects"> }, null>("courseMedia:remove");
const doc = { schemaVersion: 1 as const, blocks: [
  { id: "p", type: "paragraph" as const, text: "Lecture", citations: [], conceptIds: [] },
] };
const etag = '"1234567890abcdef1234567890abcdef"';

async function fixture() {
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity);
  const student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await doctor.mutation(api.courses.create, { title: "Clinical media course" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: doc });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  const version = await doctor.query(api.lessons.getPublished, { lessonId });
  if (!version) throw new Error("Course lesson was not published");
  return { t, doctor, student, courseId, lessonId, versionId: version._id };
}

it("binds media uploads to doctor-owned course lessons and pinned versions", async () => {
  const { t, doctor, student, courseId, lessonId, versionId } = await fixture();
  const args = { courseId, lessonId, versionId, mimeType: "image/png", bytes: 32 };
  await expect(student.mutation(reserve, args)).rejects.toThrow("NOT_FOUND");
  await expect(t.mutation(reserve, args)).rejects.toThrow();
  await expect(doctor.mutation(reserve, { ...args, bytes: 25 * 1024 * 1024 + 1 })).rejects.toThrow("Invalid");
  await expect(doctor.mutation(reserve, { ...args, mimeType: "text/html" })).rejects.toThrow("Invalid");
  const unrelatedCourse = await doctor.mutation(api.courses.create, { title: "Other" });
  await expect(doctor.mutation(reserve, { ...args, courseId: unrelatedCourse })).rejects.toThrow("NOT_FOUND");

  const mediaId = await doctor.mutation(reserve, args);
  expect(await t.query(getContentUrl, { mediaId })).toBeNull();
  expect(await student.query(getContentUrl, { mediaId })).toBeNull();
  expect(await doctor.query(getContentUrl, { mediaId })).toBeNull();
  await expect(student.mutation(remove, { mediaId })).rejects.toThrow("NOT_FOUND");
  await expect(student.mutation(markReady, { mediaId, etag })).rejects.toThrow();
  await doctor.mutation(markReady, { mediaId, etag });
  const url = await doctor.query(getContentUrl, { mediaId });
  expect(url).toBe("https://test.convex.site/learn/course-media/content?mediaId=" + mediaId);
  expect(url).not.toContain("r2.cloudflarestorage.com");
  expect((await doctor.query(getReady, { id: mediaId }))?.key).toBe("course-media/" + mediaId);
  expect(await student.query(getReady, { id: mediaId })).toBeNull();
  expect(await t.query(getContentUrl, { mediaId })).toBeNull();

  // Public discovery must not authorize course bytes.
  expect(await t.query(api.courses.getPublic, { courseId })).not.toBeNull();
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  expect(await student.query(getContentUrl, { mediaId })).toBeNull();
  const [request] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  expect(await student.query(getContentUrl, { mediaId })).toBe(url);
  expect((await student.query(getReady, { id: mediaId }))?.etag).toBe(etag);

  await t.run(ctx => ctx.db.patch("courseJoinRequests", request.id, { status: "suspended" }));
  expect(await student.query(getContentUrl, { mediaId })).toBeNull();
  expect(await student.query(getReady, { id: mediaId })).toBeNull();
  await doctor.mutation(remove, { mediaId });
  expect(await doctor.query(getContentUrl, { mediaId })).toBeNull();
  expect(await doctor.query(getReady, { id: mediaId })).toBeNull();
});

it("fails closed on expired or removed upload reservations", async () => {
  const { t, doctor, courseId, lessonId, versionId } = await fixture();
  const mediaId = await doctor.mutation(reserve, { courseId, lessonId, versionId, bytes: 20, mimeType: "application/pdf" });
  await t.run(ctx => ctx.db.patch("courseMediaObjects", mediaId, { expiresAt: Date.now() - 1 }));
  await expect(doctor.mutation(markReady, { mediaId, etag })).rejects.toThrow("NOT_FOUND");
  await doctor.mutation(remove, { mediaId });
  expect(await doctor.query(getContentUrl, { mediaId })).toBeNull();
});
