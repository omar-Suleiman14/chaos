import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

async function fixture() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), member = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await member.mutation(api.quizFunctions.getOrCreateUser, {});
  return { t, owner, member };
}
async function joined() {
  const f = await fixture(), teamId = await f.owner.mutation(api.businessTeams.create, { name: "School" });
  const invite = await f.owner.mutation(api.businessTeams.invite, { teamId, role: "member" });
  await f.member.mutation(api.businessTeams.accept, { token: invite.token });
  return { ...f, teamId };
}
describe("Business workspaces", () => {
  it("keeps Personal single-user and enables free Business without rewriting legacy plans", async () => {
    const { t, owner } = await fixture();
    const formId = await owner.mutation(api.forms.createForm, {});
    expect(await owner.query(api.businessTeams.list, {})).toEqual([]);
    await expect(owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "editor" })).rejects.toThrow("BUSINESS_REQUIRED");
    const before = await owner.query(api.quizFunctions.getCurrentUser, {});
    const teamId = await owner.mutation(api.businessTeams.create, { name: "Business" });
    expect((await owner.query(api.businessTeams.list, {}))[0]).toMatchObject({ team: { _id: teamId }, role: "owner" });
    expect((await owner.query(api.quizFunctions.getCurrentUser, {}))?.plan).toBe(before?.plan);
    expect(await t.run(ctx => ctx.db.query("businessActivity").collect())).toHaveLength(1);
  });
  it("binds email invitations to a verified address, stores only a hash and consumes each invitation once", async () => {
    const { t, owner, member } = await fixture(), teamId = await owner.mutation(api.businessTeams.create, { name: "School" });
    const invite = await owner.mutation(api.businessTeams.invite, { teamId, email: ` ${otherCreatorIdentity.email.toUpperCase()} `, role: "member" });
    const row = await t.run(ctx => ctx.db.get("businessInvites", invite.inviteId));
    expect(row?.tokenHash).not.toBe(invite.token);
    const unverified = t.withIdentity({ ...otherCreatorIdentity, emailVerified: false });
    expect(await unverified.query(api.businessTeams.inbox, {})).toEqual([]);
    await expect(unverified.mutation(api.businessTeams.accept, { token: invite.token })).rejects.toThrow("Verify");
    await expect(owner.mutation(api.businessTeams.accept, { inviteId: invite.inviteId })).rejects.toThrow("Verify");
    const verified = t.withIdentity({ ...otherCreatorIdentity, emailVerified: true });
    expect(await member.query(api.businessTeams.inbox, {})).toEqual([]);
    expect(await verified.query(api.businessTeams.inbox, {})).toHaveLength(1);
    await verified.mutation(api.businessTeams.accept, { inviteId: invite.inviteId });
    await expect(verified.mutation(api.businessTeams.accept, { token: invite.token })).rejects.toThrow("already used");
    expect(await t.run(ctx => ctx.db.get("businessInvites", invite.inviteId))).toBeNull();
  });
  it("expires and revokes links and rejects invitations from a demoted inviter", async () => {
    const { owner, member, teamId } = await joined();
    const expired = await owner.mutation(api.businessTeams.invite, { teamId, role: "member" });
    vi.advanceTimersByTime(7 * 86_400_000);
    await expect(member.mutation(api.businessTeams.accept, { token: expired.token })).rejects.toThrow("expired");
    const revoked = await owner.mutation(api.businessTeams.invite, { teamId, role: "member" });
    await owner.mutation(api.businessTeams.revokeInvite, { inviteId: revoked.inviteId });
    await expect(member.mutation(api.businessTeams.accept, { token: revoked.token })).rejects.toThrow("revoked");
    await owner.mutation(api.businessTeams.changeRole, { teamId, userId: otherCreatorIdentity.subject, role: "admin" });
    const link = await member.mutation(api.businessTeams.invite, { teamId, role: "member" });
    await owner.mutation(api.businessTeams.changeRole, { teamId, userId: otherCreatorIdentity.subject, role: "member" });
    await expect(owner.mutation(api.businessTeams.accept, { token: link.token })).rejects.toThrow("no longer has permission");
  });
  it("prevents member/admin escalation and transfers the unique owner atomically", async () => {
    const { t, owner, member, teamId } = await joined();
    await expect(member.mutation(api.businessTeams.invite, { teamId, role: "member" })).rejects.toThrow("TEAM_ACCESS_REQUIRED");
    await expect(member.mutation(api.businessTeams.rename, { teamId, name: "Stolen" })).rejects.toThrow("TEAM_ACCESS_REQUIRED");
    await owner.mutation(api.businessTeams.changeRole, { teamId, userId: otherCreatorIdentity.subject, role: "admin" });
    await expect(member.mutation(api.businessTeams.invite, { teamId, role: "admin" })).rejects.toThrow("Only the owner");
    await expect(member.mutation(api.businessTeams.changeRole, { teamId, userId: creatorIdentity.subject, role: "member" })).rejects.toThrow("Transfer ownership");
    await expect(owner.mutation(api.businessTeams.removeMember, { teamId, userId: creatorIdentity.subject })).rejects.toThrow("transfer ownership");
    await owner.mutation(api.businessTeams.changeRole, { teamId, userId: otherCreatorIdentity.subject, role: "owner" });
    const rows = await t.run(ctx => ctx.db.query("businessMembers").collect());
    expect(rows.filter(row => row.role === "owner")).toHaveLength(1);
    expect((await member.query(api.businessTeams.list, {}))[0].team.ownerId).toBe(otherCreatorIdentity.subject);
  });
  it("edits shared forms, lessons and courses through the existing editors, and revokes access immediately", async () => {
    const { owner, member, teamId } = await joined();
    const formId = await owner.mutation(api.forms.createForm, {}), courseId = await owner.mutation(api.courses.create, { title: "Team course" });
    const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: "Team lesson" });
    await expect(member.mutation(api.businessTeams.share, { teamId, asset: { kind: "form", id: formId } })).rejects.toThrow("Only the resource owner");
    await owner.mutation(api.businessTeams.share, { teamId, asset: { kind: "form", id: formId } });
    await owner.mutation(api.businessTeams.share, { teamId, asset: { kind: "course", id: courseId } });
    const form = await member.query(api.forms.getFormForEditor, { formId });
    expect(form?.role).toBe("editor");
    const lesson = await member.query(api.lessons.getDraft, { lessonId });
    expect(await member.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: lesson.revision, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Member edit", citations: [], conceptIds: [] }] } })).toBe(1);
    await member.mutation(api.courses.update, { courseId, title: "Collaborative course" });
    expect((await member.query(api.courses.get, { courseId })).isOwner).toBe(false);
    await expect(member.mutation(api.courses.publish, { courseId, visibility: "public" })).rejects.toThrow("NOT_FOUND");
    await expect(member.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).rejects.toThrow("Only the owner");
    const privateLesson = await owner.mutation(api.lessons.create, { metadata: { title: "Personal draft", description: "", language: "en", tags: [] } });
    await expect(member.mutation(api.courses.setOutline, { courseId, lessonIds: [lessonId, privateLesson] })).rejects.toThrow("Only the owner");
    await owner.mutation(api.businessTeams.removeMember, { teamId, userId: otherCreatorIdentity.subject });
    expect(await member.query(api.forms.getFormForEditor, { formId })).toBeNull();
    expect(await member.query(api.learnFrontend.editableLesson, { id: lessonId })).toBeNull();
    await expect(member.query(api.courses.get, { courseId })).rejects.toThrow("NOT_FOUND");
    await expect(member.query(api.businessTeams.resources, { teamId })).rejects.toThrow("TEAM_ACCESS_REQUIRED");
  });
  it("inherits folder and course access without copying collaborator grants, and stops sharing on removal", async () => {
    const { t, owner, member, teamId } = await joined();
    const folderId = await owner.mutation(api.folders.create, { name: "Shared", parentId: null });
    const childId = await owner.mutation(api.folders.create, { name: "Child", parentId: folderId });
    const formId = await owner.mutation(api.forms.createForm, {}), courseId = await owner.mutation(api.courses.create, {});
    const lessonId = await owner.mutation(api.courses.addLesson, { courseId });
    await owner.mutation(api.folders.addMember, { folderId: childId, asset: { kind: "form", id: formId } });
    await owner.mutation(api.folders.addMember, { folderId: childId, asset: { kind: "collection", id: courseId } });
    await owner.mutation(api.businessTeams.share, { teamId, asset: { kind: "folder", id: folderId } });
    expect((await member.query(api.forms.getFormForEditor, { formId }))?.role).toBe("editor");
    expect(await member.query(api.learnFrontend.editableLesson, { id: lessonId })).not.toBeNull();
    await member.mutation(api.folders.rename, { folderId: childId, name: "Edited" });
    const created = await member.mutation(api.folders.create, { parentId: childId, name: "By member" });
    expect((await owner.query(api.businessTeams.folder, { folderId: created })).ownerId).toBe(creatorIdentity.subject);
    await expect(member.mutation(api.folders.move, { folderId: childId, parentId: null })).rejects.toThrow("Only the folder owner");
    expect(await t.run(ctx => ctx.db.query("formCollaborators").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("lessonPermissions").collect())).toEqual([]);
    const shares = await owner.query(api.businessTeams.resources, { teamId });
    await owner.mutation(api.businessTeams.unshare, { shareId: shares[0].shareId });
    expect(await member.query(api.forms.getFormForEditor, { formId })).toBeNull();
    expect(await member.query(api.learnFrontend.editableLesson, { id: lessonId })).toBeNull();
  });
  it("does not let a team grant bypass account moderation", async () => {
    const { t, owner, member, teamId } = await joined();
    const formId = await owner.mutation(api.forms.createForm, {});
    await owner.mutation(api.businessTeams.share, { teamId, asset: { kind: "form", id: formId } });
    await t.run(async ctx => { const account = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique(); await ctx.db.patch("users", account!._id, { isBanned: true }); });
    expect(await member.query(api.forms.getFormForEditor, { formId })).toBeNull();
    expect(await member.query(api.businessTeams.resources, { teamId })).toEqual([]);
  });
});
