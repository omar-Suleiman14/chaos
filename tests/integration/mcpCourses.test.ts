import { expect, it, vi, afterEach } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
const m = (name: string) => makeFunctionReference<"mutation">("mcpCourses:" + name);
const read = makeFunctionReference<"query">("mcpCourses:read");
const userId = "user_courseowner", other = "user_courseother";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
 const t = createTestConvex();
 await t.run(async ctx => { for (const clerkId of [userId, other]) await ctx.db.insert("users", { clerkId, username: clerkId, name: clerkId, email: clerkId + "@example.com", createdAt: 0, plan: "free" }); });
 return t;
}
it("keeps course and lesson creation as drafts, replaces outlines and publishes explicitly", async () => {
 const t = await setup();
 const { courseId } = await t.mutation(m("create"), { userId, title: "Course" });
 const { lessonId } = await t.mutation(m("addLesson"), { userId, courseId, title: "First" });
 const second = await t.mutation(m("addLesson"), { userId, courseId, title: "Second" });
 await t.mutation(m("update"), { userId, courseId, description: "Draft description" });
 await t.mutation(m("setOutline"), { userId, courseId, lessonIds: [second.lessonId, lessonId] });
 expect((await t.query(read, { userId, courseId })).lessons.map((l: { id: string }) => l.id)).toEqual([second.lessonId, lessonId]);
 expect((await t.run(ctx => ctx.db.get("learnCollections", courseId)))?.publishedVersionId).toBeUndefined();
 for (const id of [lessonId, second.lessonId]) {
  expect((await t.run(ctx => ctx.db.get("lessons", id)))?.publishedVersionId).toBeUndefined();
  await t.mutation(makeFunctionReference<"mutation">("mcpLearn:saveLesson"), { userId, lessonId: id, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Text", citations: [], conceptIds: [] }] } });
 }
 await expect(t.mutation(m("publish"), { userId, courseId, visibility: "private" })).rejects.toThrow("BUSINESS_REQUIRED");
 expect(await t.mutation(m("publish"), { userId, courseId, visibility: "public" })).toEqual({ ok: true });
 const row = await t.run(ctx => ctx.db.get("learnCollections", courseId));
 const snapshot = await t.run(ctx => ctx.db.get("collectionVersions", row!.publishedVersionId!));
 await t.mutation(m("update"), { userId, courseId, title: "Later draft" });
 expect((await t.run(ctx => ctx.db.get("collectionVersions", snapshot!._id)))?.metadata.title).toBe("Course");
 await t.mutation(m("setOutline"), { userId, courseId, lessonIds: [] });
 expect(await t.run(ctx => ctx.db.get("lessons", lessonId))).not.toBeNull();
});
it("rechecks active actors and current ownership across every operation", async () => {
 const t = await setup();
 await expect(t.mutation(m("create"), { userId: "missing" })).rejects.toThrow("ACCOUNT_REQUIRED");
 const { courseId } = await t.mutation(m("create"), { userId });
 await expect(t.query(read, { userId: other, courseId })).rejects.toThrow("NOT_FOUND");
 for (const [name, input] of [["update", {title:"X"}], ["setOutline", {lessonIds:[]}], ["addLesson", {}], ["publish", {visibility:"public"}]] as const)
  await expect(t.mutation(m(name), { userId: other, courseId, ...input })).rejects.toThrow("NOT_FOUND");
 const foreign = await t.mutation(m("create"), { userId: other });
 const lesson = await t.mutation(m("addLesson"), { userId: other, courseId: foreign.courseId });
 await expect(t.mutation(m("setOutline"), { userId, courseId, lessonIds: [lesson.lessonId] })).rejects.toThrow("NOT_FOUND");
 await t.run(async ctx => { const u = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).unique(); await ctx.db.patch("users", u!._id, { suspendedUntil: Date.now()+10000 }); });
 await expect(t.query(read, { userId, courseId })).rejects.toThrow("ACCOUNT_RESTRICTED");
 for (const [name, input] of [["create", {}], ["update", {title:"X"}], ["setOutline", {lessonIds:[]}], ["addLesson", {}], ["publish", {visibility:"public"}]] as const)
  await expect(t.mutation(m(name), { userId, ...(name === "create" ? {} : {courseId}), ...input })).rejects.toThrow("ACCOUNT_RESTRICTED");
});
it("HTTP dispatch overrides injected actor with the trusted envelope", async () => {
 vi.stubEnv("CHAOS_MCP_SECRET", "s".repeat(40));
 const t = await setup();
 const response = await t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: "Bearer " + "s".repeat(40), "Content-Type": "application/json" }, body: JSON.stringify({ userId, tool: "create_course", input: { userId: other, title: "Envelope owner" } }) });
 expect(response.status).toBe(200);
 const body = await response.json();
 expect((await t.run(ctx => ctx.db.get("learnCollections", body.result.courseId)))?.ownerId).toBe(userId);
});


it.each(["review", "hidden", "removed"] as const)("rejects unchanged published lessons in moderation state %s before snapshot reuse", async communityState => {
 const t = await setup();
 const { courseId } = await t.mutation(m("create"), { userId });
 const { lessonId } = await t.mutation(m("addLesson"), { userId, courseId, title: "Moderated lesson" });
 await t.mutation(makeFunctionReference<"mutation">("mcpLearn:saveLesson"), { userId, lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Text", citations: [], conceptIds: [] }] } });
 expect(await t.mutation(m("publish"), { userId, courseId, visibility: "public" })).toEqual({ ok: true });
 const before = await t.run(ctx => ctx.db.get("learnCollections", courseId));
 const beforeLesson = await t.run(ctx => ctx.db.get("lessons", lessonId));
 await t.run(ctx => ctx.db.patch("lessons", lessonId, { communityState }));
 expect(await t.mutation(m("publish"), { userId, courseId, visibility: "public" })).toEqual({ ok: false, problems: [{ lessonId, title: "Moderated lesson", message: expect.stringContaining("Resolve its moderation state") }] });
 const after = await t.run(ctx => ctx.db.get("learnCollections", courseId));
 expect(after?.publishedVersionId).toBe(before?.publishedVersionId);
 expect(after?.revision).toBe(before?.revision);
 expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))?.publishedVersionId).toBe(beforeLesson?.publishedVersionId);
});
it("returns actionable problems for missing, foreign-owned and archived outline lessons without leaking foreign metadata", async () => {
 const t = await setup();
 const { courseId } = await t.mutation(m("create"), { userId });
 const missing = await t.mutation(m("addLesson"), { userId, courseId });
 const archived = await t.mutation(m("addLesson"), { userId, courseId, title: "Archived lesson" });
 const foreignCourse = await t.mutation(m("create"), { userId: other });
 const foreign = await t.mutation(m("addLesson"), { userId: other, courseId: foreignCourse.courseId, title: "SECRET FOREIGN TITLE" });
 await t.run(async ctx => {
  await ctx.db.delete("lessons", missing.lessonId);
  await ctx.db.patch("lessons", archived.lessonId, { status: "archived" });
  await ctx.db.patch("learnCollections", courseId, { lessonIds: [missing.lessonId, foreign.lessonId, archived.lessonId] });
 });
 const result = await t.mutation(m("publish"), { userId, courseId, visibility: "public" });
 expect(result).toEqual({ ok: false, problems: [
  { lessonId: missing.lessonId, title: "Unavailable lesson", message: expect.stringContaining("Remove it from the course outline") },
  { lessonId: foreign.lessonId, title: "Unavailable lesson", message: expect.stringContaining("no longer owned by you") },
  { lessonId: archived.lessonId, title: "Archived lesson", message: expect.stringContaining("Reactivate it") },
 ] });
 expect(JSON.stringify(result)).not.toContain("SECRET FOREIGN TITLE");
 expect((await t.run(ctx => ctx.db.get("learnCollections", courseId)))?.publishedVersionId).toBeUndefined();
 expect((await t.run(ctx => ctx.db.get("lessons", foreign.lessonId)))?.publishedVersionId).toBeUndefined();
});
