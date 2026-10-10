import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
type T = ReturnType<typeof createTestConvex>;
const owner = creatorIdentity.subject, editor = otherCreatorIdentity.subject;

async function sharedForm() {
  const t = createTestConvex();
  const asOwner = t.withIdentity(creatorIdentity), asEditor = t.withIdentity(otherCreatorIdentity);
  await asOwner.mutation(api.quizFunctions.getOrCreateUser, {});
  await asEditor.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await asOwner.mutation(api.forms.createForm, {});
  await t.run(ctx => ctx.db.insert("formCollaborators", { formId, email: otherCreatorIdentity.email, userId: editor, role: "editor", status: "accepted", invitedBy: owner, createdAt: 0 }));
  return { t, asOwner, asEditor, formId };
}
const draftOf = async (t: T, formId: Id<"forms">) => (await t.run(ctx => ctx.db.get("forms", formId)))!;
async function editorWrites(t: T, asEditor: ReturnType<T["withIdentity"]>, formId: Id<"forms">) {
  const form = await draftOf(t, formId);
  const web = () => asEditor.mutation(api.forms.saveFormDraft, { formId, expectedRevision: form.draftRevision, definition: { ...form.draft, title: "Changed by editor" } });
  const mcp = () => t.mutation(internal.mcp.updateForm, { userId: editor, id: `form_${formId}`, expectedRevision: form.draftRevision, input: { title: "Changed via MCP" } });
  const mcpBranching = () => t.mutation(internal.mcpAdvancedForms.setBranching, { userId: editor, formId, expectedRevision: form.draftRevision, target: "ending", targetId: "missing", rule: null });
  return { web, mcp, mcpBranching };
}

describe("moderation freezes direct collaborators", () => {
  it.each([
    ["the owner is banned", { isBanned: true }],
    ["the owner is suspended", { suspendedUntil: Date.now() + 86_400_000 }],
  ] as const)("an explicit editor cannot write when %s (web and MCP)", async (_label, restriction) => {
    const { t, asEditor, formId } = await sharedForm();
    await t.run(async ctx => {
      const row = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", owner)).first();
      await ctx.db.patch("users", row!._id, restriction);
    });
    const { web, mcp, mcpBranching } = await editorWrites(t, asEditor, formId);
    await expect(web()).rejects.toThrow("FORM_NOT_FOUND");
    await expect(mcp()).rejects.toThrow("FORBIDDEN");
    await expect(mcpBranching()).rejects.toThrow("FORBIDDEN");
    await expect(asEditor.mutation(api.forms.publishForm, { formId, expectedRevision: (await draftOf(t, formId)).draftRevision })).rejects.toThrow("FORM_NOT_FOUND");
    await expect(t.mutation(internal.mcp.publishForm, { userId: editor, id: `form_${formId}` })).rejects.toThrow("FORBIDDEN");
    expect((await draftOf(t, formId)).draft.title).not.toMatch(/Changed/);
    // Read access is kept so collaborators can still see what they worked on.
    expect(await asEditor.query(api.forms.getFormForEditor, { formId })).not.toBeNull();
  });

  it("an explicit editor cannot edit a held form; the owner and unrestricted editors are unaffected", async () => {
    const { t, asOwner, asEditor, formId } = await sharedForm();
    // Control: before any moderation the editor can write on both transports.
    const before = await draftOf(t, formId);
    await asEditor.mutation(api.forms.saveFormDraft, { formId, expectedRevision: before.draftRevision, definition: { ...before.draft, title: "Editor draft" } });
    await t.run(ctx => ctx.db.patch("forms", formId, { isBanned: true }));
    const { web, mcp, mcpBranching } = await editorWrites(t, asEditor, formId);
    await expect(web()).rejects.toThrow("FORM_NOT_FOUND");
    await expect(mcp()).rejects.toThrow("FORBIDDEN");
    await expect(mcpBranching()).rejects.toThrow("FORBIDDEN");
    expect((await draftOf(t, formId)).draft.title).toBe("Editor draft");
    // The owner keeps editing their own held draft.
    const held = await draftOf(t, formId);
    await asOwner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: held.draftRevision, definition: { ...held.draft, title: "Owner fix" } });
    expect((await draftOf(t, formId)).draft.title).toBe("Owner fix");
  });
});

describe("restricted learners are read-only", () => {
  const paragraph = { id: "p", type: "paragraph" as const, text: "Text", citations: [], conceptIds: [] };
  async function course() {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
    const t = createTestConvex(), teacher = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
    await teacher.mutation(api.quizFunctions.getOrCreateUser, {});
    await student.mutation(api.quizFunctions.getOrCreateUser, {});
    const courseId = await teacher.mutation(api.courses.create, { title: "Liver basics" });
    const lessonId = await teacher.mutation(api.courses.addLesson, { courseId });
    await teacher.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [paragraph] } });
    expect(await teacher.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
    return { t, teacher, student, courseId, lessonId };
  }
  it.each([
    ["banned", { isBanned: true }, "ACCOUNT_BANNED"],
    ["suspended", { suspendedUntil: Date.now() + 86_400_000 }, "ACCOUNT_SUSPENDED"],
  ] as const)("a %s account cannot enroll, record progress or remember courses (web and MCP)", async (_label, restriction, code) => {
    const { t, teacher, student, courseId, lessonId } = await course();
    await student.mutation(api.courseStudents.enroll, { courseId }); // enrolled before the restriction
    await t.run(async ctx => {
      const row = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", editor)).first();
      await ctx.db.patch("users", row!._id, restriction);
    });
    const progress = async () => (await t.run(ctx => ctx.db.query("courseEnrollments").collect()))[0].completedLessonIds;
    await expect(student.mutation(api.courseStudents.recordLesson, { courseId, lessonId, completed: true })).rejects.toThrow(code);
    expect(await progress()).toEqual([]);
    await t.run(async ctx => { for (const row of await ctx.db.query("courseEnrollments").collect()) await ctx.db.delete("courseEnrollments", row._id); });
    const countBefore = await teacher.query(api.studentRoster.count, {});
    await expect(student.mutation(api.courseStudents.enroll, { courseId })).rejects.toThrow(code);
    expect(await t.run(ctx => ctx.db.query("courseEnrollments").collect())).toHaveLength(0);
    expect(await teacher.query(api.studentRoster.count, {})).toBe(countBefore);
    await expect(student.mutation(api.courses.remember, { courseId })).rejects.toThrow(code);
    await expect(t.mutation(internal.mcpCourses.remember, { userId: editor, courseId })).rejects.toThrow("ACCOUNT_RESTRICTED");
    // Guests keep enrolling.
    await t.mutation(api.courseStudents.enroll, { courseId, guestToken: "g".repeat(43) });
  });
});
