import { expect, it, vi, afterEach } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
const m = (name: string) => makeFunctionReference<"mutation">("mcpFlashcards:" + name);
const q = (name: string) => makeFunctionReference<"query">("mcpFlashcards:" + name);
const userId = "user_cardowner", other = "user_cardother";
const cards = [{ id: "c1", front: "Capital of France?", back: "Paris", conceptIds: [] }];
afterEach(() => vi.unstubAllEnvs());
async function setup() {
 const t = createTestConvex();
 await t.run(async ctx => { for (const clerkId of [userId, other]) await ctx.db.insert("users", { clerkId, username: clerkId, name: clerkId, email: clerkId + "@example.com", createdAt: 0, plan: "free" }); });
 return t;
}
const lesson = async (t: ReturnType<typeof createTestConvex>, owner: string) => (await t.mutation(makeFunctionReference<"mutation">("mcpLearn:createLesson"), { userId: owner, metadata: { title: "Lesson", description: "", language: "en", tags: [] } })).lessonId;

it("creates a private draft, saves with revisions, publishes explicitly and attaches to an owned lesson", async () => {
 const t = await setup();
 const { setId, revision } = await t.mutation(m("create"), { userId, title: "Capitals", cards });
 expect(revision).toBe(0);
 expect(await t.query(q("get"), { userId, setId })).toMatchObject({ setId, title: "Capitals", cards, cardCount: 1, revision: 0, visibility: "private", publishedVersionId: null, archived: false });
 const saved = await t.mutation(m("save"), { userId, setId, expectedRevision: 0, title: "Capitals", cards: [...cards, { id: "c2", front: "Capital of Spain?", back: "Madrid", conceptIds: [] }] });
 expect(saved).toEqual({ revision: 1 });
 await expect(t.mutation(m("save"), { userId, setId, expectedRevision: 0, title: "Stale", cards })).rejects.toThrow("REVISION_CONFLICT");
 expect((await t.run(ctx => ctx.db.get("flashcardSets", setId)))?.publishedVersionId).toBeUndefined();
 const { versionId, revision: published } = await t.mutation(m("publish"), { userId, setId, expectedRevision: 1, visibility: "public" });
 expect(published).toBe(2);
 expect((await t.run(ctx => ctx.db.get("flashcardVersions", versionId)))?.cards).toHaveLength(2);
 const listed = await t.query(q("list"), { userId });
 expect(listed).toMatchObject({ sets: [{ setId, title: "Capitals", cardCount: 2, visibility: "public", publishedVersionId: versionId, archived: false }], nextCursor: null });
 const lessonId = await lesson(t, userId);
 const { attachmentId } = await t.mutation(m("attach"), { userId, lessonId, versionId, label: "Practice", order: 0 });
 expect((await t.query(q("listAttached"), { userId, lessonId })).attachments).toEqual([{ attachmentId, setId, versionId, title: "Capitals", label: "Practice", order: 0, cardCount: 2 }]);
 expect(await t.mutation(m("detach"), { userId, attachmentId })).toEqual({ ok: true });
 expect((await t.query(q("listAttached"), { userId, lessonId })).attachments).toEqual([]);
 expect(await t.mutation(m("lifecycle"), { userId, setId, expectedRevision: 2, action: "archive" })).toEqual({ revision: 3 });
 await expect(t.mutation(m("save"), { userId, setId, expectedRevision: 3, title: "Archived", cards })).rejects.toThrow("NOT_FOUND");
 expect(await t.mutation(m("lifecycle"), { userId, setId, expectedRevision: 3, action: "restore" })).toEqual({ revision: 4 });
 expect(await t.mutation(m("lifecycle"), { userId, setId, expectedRevision: 4, action: "unpublish" })).toMatchObject({ revision: 5 });
 expect(await t.query(q("get"), { userId, setId })).toMatchObject({ visibility: "private", publishedVersionId: null, archived: false });
});

it("refuses another user's set, lesson and attachment and rechecks the actor", async () => {
 const t = await setup();
 const { setId } = await t.mutation(m("create"), { userId, title: "Mine", cards });
 const { versionId } = await t.mutation(m("publish"), { userId, setId, expectedRevision: 0, visibility: "private" });
 await expect(t.query(q("get"), { userId: other, setId })).rejects.toThrow("NOT_FOUND");
 await expect(t.mutation(m("save"), { userId: other, setId, expectedRevision: 1, title: "Steal", cards })).rejects.toThrow("NOT_FOUND");
 await expect(t.mutation(m("publish"), { userId: other, setId, expectedRevision: 1, visibility: "public" })).rejects.toThrow("NOT_FOUND");
 await expect(t.mutation(m("lifecycle"), { userId: other, setId, expectedRevision: 1, action: "archive" })).rejects.toThrow("NOT_FOUND");
 expect((await t.query(q("list"), { userId: other })).sets).toEqual([]);
 // Another user cannot attach a private version, even to their own lesson.
 const theirLesson = await lesson(t, other);
 await expect(t.mutation(m("attach"), { userId: other, lessonId: theirLesson, versionId, label: "", order: 0 })).rejects.toThrow("NOT_FOUND");
 // Nor attach to, list or detach from a lesson they do not own.
 const myLesson = await lesson(t, userId);
 await expect(t.mutation(m("attach"), { userId: other, lessonId: myLesson, versionId, label: "", order: 0 })).rejects.toThrow("NOT_FOUND");
 const { attachmentId } = await t.mutation(m("attach"), { userId, lessonId: myLesson, versionId, label: "", order: 0 });
 await expect(t.mutation(m("detach"), { userId: other, attachmentId })).rejects.toThrow("NOT_FOUND");
 await expect(t.query(q("listAttached"), { userId: other, lessonId: myLesson })).rejects.toThrow("NOT_FOUND");
 expect(await t.run(ctx => ctx.db.get("lessonFlashcards", attachmentId))).not.toBeNull();
 expect((await t.run(ctx => ctx.db.get("flashcardSets", setId)))?.revision).toBe(1);
 await expect(t.mutation(m("create"), { userId: "user_missing", title: "X", cards })).rejects.toThrow("ACCOUNT_REQUIRED");
 await t.run(async ctx => { const u = await ctx.db.query("users").withIndex("by_clerkId", x => x.eq("clerkId", userId)).unique(); await ctx.db.patch("users", u!._id, { suspendedUntil: Date.now() + 10000 }); });
 await expect(t.mutation(m("save"), { userId, setId, expectedRevision: 1, title: "Mine", cards })).rejects.toThrow("ACCOUNT_RESTRICTED");
 await expect(t.query(q("get"), { userId, setId })).rejects.toThrow("ACCOUNT_RESTRICTED");
});

it("HTTP dispatch uses the envelope actor and maps conflicts and foreign sets", async () => {
 vi.stubEnv("CHAOS_MCP_SECRET", "s".repeat(40));
 const t = await setup();
 const call = (tool: string, input: Record<string, unknown>, actor = userId) => t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: "Bearer " + "s".repeat(40), "Content-Type": "application/json" }, body: JSON.stringify({ userId: actor, tool, input }) });
 const created = await call("create_flashcard_set", { userId: other, title: "Envelope", cards });
 expect(created.status).toBe(200);
 const { setId } = (await created.json()).result;
 expect((await t.run(ctx => ctx.db.get("flashcardSets", setId)))?.ownerId).toBe(userId);
 const conflict = await call("save_flashcard_set", { setId, expectedRevision: 7, title: "Envelope", cards });
 expect(conflict.status).toBe(409);
 expect(await conflict.json()).toMatchObject({ error: { code: "REVISION_CONFLICT" } });
 expect((await call("get_flashcard_set", { setId }, other)).status).toBe(404);
 expect((await call("get_flashcard_set", { setId: "bogus" })).status).toBe(400);
 const capabilities = await (await call("get_learn_capabilities", {})).json();
 expect(capabilities.result.tools.flashcards.tools).toContain("attach_lesson_flashcards");
 expect(capabilities.result.tools.courses.tools).toEqual(expect.arrayContaining(["list_courses", "set_course_archived"]));
 expect(capabilities.result.tools.games.tools).toContain("host_game");
});
