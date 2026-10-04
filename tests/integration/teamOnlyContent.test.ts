import { expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const outsiderIdentity = { ...otherCreatorIdentity, subject: "user_outsider", tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_outsider", email: "outsider@example.com", name: "Out Sider" };
const paragraph = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Internal handbook", citations: [], conceptIds: [] }] };
const meta = { title: "Team handbook", description: "", language: "en", tags: [] };

async function team() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), member = t.withIdentity(otherCreatorIdentity), outsider = t.withIdentity(outsiderIdentity);
  for (const who of [owner, member, outsider]) await who.mutation(api.quizFunctions.getOrCreateUser, {});
  const teamId = await owner.mutation(api.businessTeams.create, { name: "School" });
  const invite = await owner.mutation(api.businessTeams.invite, { teamId, role: "member" });
  await member.mutation(api.businessTeams.accept, { token: invite.token });
  return { t, owner, member, outsider, teamId };
}

it("team-only lessons, courses and flashcards are readable by team members only", async () => {
  const { t, owner, member, outsider, teamId } = await team();
  const lessonId = await owner.mutation(api.lessons.create, { metadata: meta, document: paragraph });
  await expect(owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "restricted" })).rejects.toThrow("TEAM_REQUIRED");
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "restricted", teamId });
  expect((await member.query(api.learnFrontend.publicLesson, { id: lessonId }))?.version.metadata.title).toBe("Team handbook");
  expect(await outsider.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();
  expect(await t.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();

  // Publishing to a team you don't belong to is refused.
  const foreign = await outsider.mutation(api.lessons.create, { metadata: meta, document: paragraph });
  await expect(outsider.mutation(api.lessons.publish, { lessonId: foreign, expectedRevision: 0, visibility: "restricted", teamId })).rejects.toThrow("TEAM_ACCESS_REQUIRED");

  const courseId = await owner.mutation(api.courses.create, { language: "en" });
  const weekOne = await owner.mutation(api.courses.addLesson, { courseId, title: "Week 1" });
  const draft = await owner.query(api.lessons.getDraft, { lessonId: weekOne });
  await owner.mutation(api.lessons.saveDraft, { lessonId: weekOne, expectedRevision: draft.revision, document: paragraph, metadata: draft.metadata });
  expect(await owner.mutation(api.courses.publish, { courseId, visibility: "restricted", teamId })).toEqual({ ok: true });
  // The course's lessons become team-only with it.
  expect(await member.query(api.learnFrontend.publicLesson, { id: weekOne })).not.toBeNull();
  expect(await outsider.query(api.learnFrontend.publicLesson, { id: weekOne })).toBeNull();
  expect((await member.query(api.courses.getPublic, { courseId }))?.lessons).toHaveLength(1);
  expect(await outsider.query(api.courses.getPublic, { courseId })).toBeNull();

  const setId = await owner.mutation(api.flashcards.create, { title: "Terms", cards: [{ id: "c", front: "Front", back: "Back", conceptIds: [] }] });
  await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility: "restricted", teamId });
  expect((await member.query(api.flashcards.getPublished, { setId }))?.title).toBe("Terms");
  await expect(outsider.query(api.flashcards.getPublished, { setId })).rejects.toThrow();
  // Unpublishing clears the team.
  await owner.mutation(api.flashcards.setLifecycle, { setId, expectedRevision: 1, action: "unpublish" });
  expect((await t.run(ctx => ctx.db.get("flashcardSets", setId)))?.audienceTeamId).toBeUndefined();
});

it("team-only quizzes accept responses and live players from team members only", async () => {
  vi.useFakeTimers();
  try {
    const { t, owner, member, outsider, teamId } = await team();
    const formId = await owner.mutation(api.forms.createForm, { quizMode: true });
    const initial = await owner.query(api.forms.getFormForEditor, { formId });
    const definition = { ...initial!.draft, fields: [{ id: "q", type: "choice" as const, label: "Capital of France?", required: true, options: [{ id: "paris", label: "Paris" }, { id: "rome", label: "Rome" }], quiz: { correctOptionIds: ["paris"], points: 1 } }] };
    const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const form = (await t.run(ctx => ctx.db.get("forms", formId)))!;
    const { accessCodeHash: _hash, ...settings } = form.settings;
    await expect(outsider.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, access: "signed_in", audienceTeamId: teamId } })).rejects.toThrow();
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, audienceTeamId: teamId } })).rejects.toThrow("sign in");
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, access: "signed_in", audienceTeamId: teamId } });

    expect((await member.query(api.respond.getPublicForm, { shareId: form.shareId }))?.state).not.toBe("restricted");
    expect((await outsider.query(api.respond.getPublicForm, { shareId: form.shareId }))?.state).toBe("restricted");

    // Games hosted from a team-only quiz are team-only.
    const gameId = await owner.mutation(api.live.createGame, { formId });
    const pin = (await owner.query(api.live.hostView, { gameId }))!.pin;
    await expect(outsider.mutation(api.live.joinGame, { pin, nickname: "Out", token: "ab".repeat(16) })).rejects.toThrow("LIVE_TEAM_ONLY");
    await expect(t.mutation(api.live.joinGame, { pin, nickname: "Anon", token: "cd".repeat(16) })).rejects.toThrow("LIVE_TEAM_ONLY");
    expect((await member.mutation(api.live.joinGame, { pin, nickname: "Riley", token: "ef".repeat(16) })).status).toBe("joined");
  } finally {
    vi.useRealTimers();
  }
});

it("MCP team tools act as the connected account and never return member emails or stored links", async () => {
  const { t, member, teamId } = await team();
  const userId = otherCreatorIdentity.subject;
  expect(await t.query(internal.mcpBusiness.listTeams, { userId })).toEqual({ teams: [{ teamId, name: "School", role: "member" }] });
  const { members } = await t.query(internal.mcpBusiness.listMembers, { userId, teamId });
  expect(members).toHaveLength(2);
  expect(members.every(row => !("email" in row))).toBe(true);
  // Members can't invite; the owner gets a single-use link.
  await expect(t.mutation(internal.mcpBusiness.inviteMember, { userId, teamId, role: "member" })).rejects.toThrow("TEAM_ACCESS_REQUIRED");
  const invite = await t.mutation(internal.mcpBusiness.inviteMember, { userId: creatorIdentity.subject, teamId, role: "member" });
  expect(invite.link).toMatch(/\/dashboard\/teams#invite=[a-f0-9]{64}$/);
  const { invitations } = await t.query(internal.mcpBusiness.listInvitations, { userId: creatorIdentity.subject, teamId });
  expect(JSON.stringify(invitations)).not.toContain(invite.link.split("=")[1]);
  const formId = await member.mutation(api.forms.createForm, {});
  expect(await t.mutation(internal.mcpBusiness.share, { userId, teamId, asset: { kind: "form", id: formId } })).toEqual({ ok: true });
  expect((await t.query(internal.mcpBusiness.listResources, { userId: creatorIdentity.subject, teamId })).resources.map(row => row.asset.id)).toEqual([formId]);
});
