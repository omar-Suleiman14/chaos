import { afterEach, expect, it, vi } from "vitest";
import { internal } from "@/convex/_generated/api";
import { makeFunctionReference } from "convex/server";
const courseChat = {
  list: makeFunctionReference<"query">("mcpCourseChat:list"),
  search: makeFunctionReference<"query">("mcpCourseChat:search"),
  lecture: makeFunctionReference<"query">("mcpCourseChat:lecture"),
};
import { createTestConvex } from "./setup";

const teacher = "user_chatteacher", student = "user_chatstudent", stranger = "user_chatstranger";
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const t = createTestConvex();
  await t.run(async ctx => {
    for (const clerkId of [teacher, student, stranger]) await ctx.db.insert("users", {
      clerkId, username: clerkId, name: clerkId, email: clerkId + "@example.com",
      createdAt: 0, plan: "free",
    });
  });
  const { courseId } = await t.mutation(internal.mcpCourses.create, { userId: teacher, title: "Neuroscience" });
  const { lessonId } = await t.mutation(internal.mcpCourses.addLesson, { userId: teacher, courseId, title: "Brainstem" });
  await t.mutation(internal.mcpLearn.saveLesson, {
    userId: teacher, lessonId, expectedRevision: 0,
    document: { schemaVersion: 1, blocks: [
      { id: "axon", type: "paragraph", text: "The vestibular nuclei integrate balance signals.", citations: [], conceptIds: [] },
      { id: "arabic", type: "paragraph", text: "النوى الدهليزية تستقبل إشارات الاتزان.", citations: [], conceptIds: [] },
    ] },
  });
  expect(await t.mutation(internal.mcpCourses.publish, { userId: teacher, courseId, visibility: "public" })).toEqual({ ok: true });
  const course = await t.run(ctx => ctx.db.get("learnCollections", courseId));
  const live = await t.run(ctx => ctx.db.get("collectionVersions", course!.publishedVersionId!));
  const versionId = live!.items.flatMap(item => item.kind === "lesson" ? [item.versionId] : [])[0];
  return { t, courseId, lessonId, versionId };
}

async function approve(t: Awaited<ReturnType<typeof fixture>>["t"], courseId: Awaited<ReturnType<typeof fixture>>["courseId"]) {
  return t.run(async ctx => {
    const requestId = await ctx.db.insert("courseJoinRequests", {
      courseId, ownerId: teacher, studentId: student, status: "approved", requestedAt: 1, updatedAt: 1,
    });
    const enrollmentId = await ctx.db.insert("courseEnrollments", {
      courseId, ownerId: teacher, key: `user:${student}`, studentId: student,
      completedLessonIds: [], enrolledAt: 1, updatedAt: 1,
    });
    return { requestId, enrollmentId };
  });
}

it("denies pending, legacy-only and foreign access without exposing lecture content", async () => {
  const { t, courseId, lessonId } = await fixture();
  await expect(t.query(courseChat.lecture, { userId: student, courseId, lessonId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(courseChat.search, { userId: student, courseId, query: "vestibular" })).rejects.toThrow("NOT_FOUND");
  expect((await t.query(courseChat.list, { userId: student })).courses).toEqual([]);
  const { requestId } = await approve(t, courseId);
  await t.run(ctx => ctx.db.patch("courseJoinRequests", requestId, { status: "pending" }));
  expect((await t.query(courseChat.list, { userId: student })).courses).toEqual([]);
  await expect(t.query(courseChat.lecture, { userId: student, courseId, lessonId })).rejects.toThrow("NOT_FOUND");
  await expect(t.query(courseChat.lecture, { userId: stranger, courseId, lessonId })).rejects.toThrow("NOT_FOUND");
});

it("returns approved course listings and source-grounded English/Arabic block pages", async () => {
  const { t, courseId, lessonId, versionId } = await fixture();
  await approve(t, courseId);
  expect((await t.query(courseChat.list, { userId: student })).courses).toEqual([
    expect.objectContaining({ courseId, title: "Neuroscience", lessonCount: 1 }),
  ]);
  const hit = await t.query(courseChat.search, { userId: student, courseId, query: "vestibular", limit: 1 });
  expect(hit).toEqual({ courseId, nextOffset: null, results: [
    { lessonId, versionId, title: "Brainstem", snippets: [
      { blockId: "axon", type: "paragraph", text: "The vestibular nuclei integrate balance signals." },
    ] },
  ] });
  const ar = await t.query(courseChat.search, { userId: student, courseId, query: "الاتزان" });
  expect(ar.results[0]?.snippets[0]?.blockId).toBe("arabic");
  const page = await t.query(courseChat.lecture, { userId: student, courseId, lessonId, limit: 1 });
  expect(page).toMatchObject({ courseId, lessonId, versionId, title: "Brainstem", totalBlocks: 2, nextOffset: 1,
    blocks: [{ blockId: "axon", type: "paragraph", text: expect.stringContaining("vestibular") }] });
  expect((await t.query(courseChat.lecture, { userId: student, courseId, lessonId, offset: 1 })).blocks[0].blockId).toBe("arabic");
  await expect(t.query(courseChat.search, { userId: student, courseId, query: "" })).rejects.toThrow("VALIDATION_FAILED");
  await expect(t.query(courseChat.lecture, { userId: student, courseId, lessonId, limit: 11 })).rejects.toThrow("VALIDATION_FAILED");
});

it("revokes access immediately after approval changes, enrollment deletion or course moderation", async () => {
  const { t, courseId, lessonId } = await fixture();
  const { requestId, enrollmentId } = await approve(t, courseId);
  expect((await t.query(courseChat.lecture, { userId: student, courseId, lessonId })).blocks).toHaveLength(2);
  await t.run(ctx => ctx.db.patch("courseJoinRequests", requestId, { status: "suspended" }));
  await expect(t.query(courseChat.lecture, { userId: student, courseId, lessonId })).rejects.toThrow("NOT_FOUND");
  expect((await t.query(courseChat.list, { userId: student })).courses).toEqual([]);
  await t.run(ctx => ctx.db.patch("courseJoinRequests", requestId, { status: "approved" }));
  await t.run(ctx => ctx.db.delete("courseEnrollments", enrollmentId));
  await expect(t.query(courseChat.search, { userId: student, courseId, query: "vestibular" })).rejects.toThrow("NOT_FOUND");
  await t.run(async ctx => {
    await ctx.db.insert("courseEnrollments", { courseId, ownerId: teacher, key: `user:${student}`,
      studentId: student, completedLessonIds: [], enrolledAt: 1, updatedAt: 1 });
    await ctx.db.patch("learnCollections", courseId, { archived: true });
  });
  await expect(t.query(courseChat.lecture, { userId: student, courseId, lessonId })).rejects.toThrow("NOT_FOUND");
  await t.run(ctx => ctx.db.patch("learnCollections", courseId, { archived: false, communityState: "hidden" }));
  await expect(t.query(courseChat.search, { userId: student, courseId, query: "vestibular" })).rejects.toThrow("NOT_FOUND");
});

it("does not retrieve unpublished draft changes or another course", async () => {
  const { t, courseId, lessonId } = await fixture();
  await approve(t, courseId);
  const foreign = await t.mutation(internal.mcpCourses.create, { userId: teacher, title: "Hidden draft" });
  await expect(t.query(courseChat.lecture, { userId: student, courseId: foreign.courseId, lessonId })).rejects.toThrow("NOT_FOUND");
  const lesson = await t.run(ctx => ctx.db.get("lessons", lessonId));
  await t.mutation(internal.mcpLearn.saveLesson, {
    userId: teacher, lessonId, expectedRevision: lesson!.revision,
    document: { schemaVersion: 1, blocks: [{ id: "new", type: "paragraph", text: "SECRET DRAFT ONLY", citations: [], conceptIds: [] }] },
  });
  expect(JSON.stringify(await t.query(courseChat.lecture, { userId: student, courseId, lessonId }))).not.toContain("SECRET DRAFT ONLY");
  expect(JSON.stringify(await t.query(courseChat.search, { userId: student, courseId, query: "SECRET DRAFT" }))).not.toContain("SECRET DRAFT ONLY");
});

it("HTTP dispatch overrides spoofed actor input with the secret-protected transport identity", async () => {
  vi.stubEnv("CHAOS_MCP_SECRET", "s".repeat(40));
  const { t, courseId } = await fixture();
  await approve(t, courseId);
  const request = (userId: string, tool: string, input: Record<string, unknown>) => t.fetch("/api/mcp/v1", {
    method: "POST", headers: { Authorization: "Bearer " + "s".repeat(40), "Content-Type": "application/json" },
    body: JSON.stringify({ userId, tool, input }),
  });
  const unauthorized = await request(stranger, "list_enrolled_courses", { userId: student });
  expect(unauthorized.status).toBe(200);
  expect((await unauthorized.json()).result.courses).toEqual([]);
  const authorized = await request(student, "list_enrolled_courses", { userId: stranger });
  expect(authorized.status).toBe(200);
  expect((await authorized.json()).result.courses[0].courseId).toBe(courseId);
});
