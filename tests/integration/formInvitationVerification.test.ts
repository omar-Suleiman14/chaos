import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

describe("form invitations require verified email", () => {
  for (const emailVerified of [undefined, false]) {
    for (const profileFirst of [false, true]) {
      it(`denies ${String(emailVerified)} verification with profile first ${profileFirst}`, async () => {
        const t = createTestConvex();
        const owner = t.withIdentity(creatorIdentity);
        const identity = { ...otherCreatorIdentity, ...(emailVerified === undefined ? {} : { emailVerified }) };
        const person = t.withIdentity(identity);
        await owner.mutation(api.quizFunctions.getOrCreateUser, {});
        const formId = await owner.mutation(api.forms.createForm, {});
        if (profileFirst) await person.mutation(api.quizFunctions.getOrCreateUser, {});
        await owner.mutation(api.businessTeams.create, { name: "Test team" });
        await owner.mutation(api.forms.inviteCollaborator, { formId, email: identity.email, role: "editor" });
        const row = (await t.run(ctx => ctx.db.query("formCollaborators").collect()))[0];
        expect(row.userId).toBeUndefined();
        expect(await t.run(ctx => ctx.db.query("notifications").collect())).toEqual([]);
        for (const sync of [false, true]) {
          if (sync) await person.mutation(api.quizFunctions.getOrCreateUser, {});
          expect(await person.query(api.forms.getFormForEditor, { formId })).toBeNull();
          expect(await person.query(api.forms.searchIndex, {})).toEqual([]);
          expect((await person.query(api.forms.listMyForms, {})).invites).toEqual([]);
          expect((await person.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
          await expect(person.mutation(api.forms.acceptInvite, { collaboratorId: row._id })).rejects.toThrow("UNAUTHORIZED");
          await expect(person.mutation(api.forms.declineInvite, { collaboratorId: row._id })).rejects.toThrow("UNAUTHORIZED");
          await person.mutation(api.forms.leaveForm, { formId });
          expect((await t.run(ctx => ctx.db.get("formCollaborators", row._id)))?.userId).toBeUndefined();
        }
        const verified = t.withIdentity({ ...identity, emailVerified: true });
        expect(await verified.query(api.forms.getFormForEditor, { formId })).not.toBeNull();
        expect((await verified.query(api.forms.searchIndex, {})).map(row => row.id)).toContain(formId);
        await verified.mutation(api.forms.acceptInvite, { collaboratorId: row._id });
        // Accepted account grants survive a later absent email claim.
        expect(await person.query(api.forms.getFormForEditor, { formId })).not.toBeNull();
        await person.mutation(api.forms.leaveForm, { formId });
        expect(await t.run(ctx => ctx.db.get("formCollaborators", row._id))).toBeNull();
      });
    }
  }

  it("does not trust historical pending prebindings or delete another account's accepted grant", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, {});
    const collaboratorId = await t.run(ctx => ctx.db.insert("formCollaborators", { formId, email: otherCreatorIdentity.email, userId: otherCreatorIdentity.subject, role: "editor", status: "pending", invitedBy: creatorIdentity.subject, createdAt: Date.now() }));
    for (const verification of [undefined, false]) {
      const person = t.withIdentity({ ...otherCreatorIdentity, ...(verification === undefined ? {} : { emailVerified: verification }) });
      await person.mutation(api.quizFunctions.getOrCreateUser, {});
      expect(await person.query(api.forms.getFormForEditor, { formId })).toBeNull();
      expect(await person.query(api.forms.searchIndex, {})).toEqual([]);
      expect((await person.query(api.forms.listMyForms, {})).invites).toEqual([]);
      await expect(person.mutation(api.forms.acceptInvite, { collaboratorId })).rejects.toThrow("UNAUTHORIZED");
      await person.mutation(api.forms.leaveForm, { formId });
      expect(await t.run(ctx => ctx.db.get("formCollaborators", collaboratorId))).not.toBeNull();
    }
    await t.withIdentity({ ...otherCreatorIdentity, emailVerified: true }).mutation(api.forms.acceptInvite, { collaboratorId });
    const outsider = t.withIdentity({ ...otherCreatorIdentity, subject: "user_outsider", tokenIdentifier: `${otherCreatorIdentity.issuer}|user_outsider`, emailVerified: true });
    await outsider.mutation(api.forms.leaveForm, { formId });
    expect((await t.run(ctx => ctx.db.get("formCollaborators", collaboratorId)))?.userId).toBe(otherCreatorIdentity.subject);
    await expect(outsider.mutation(api.forms.declineInvite, { collaboratorId })).rejects.toThrow("UNAUTHORIZED");
    // Legacy rows with explicit account IDs remain usable without email verification.
    await t.run(ctx => ctx.db.patch("formCollaborators", collaboratorId, { status: undefined }));
    expect(await t.withIdentity(otherCreatorIdentity).query(api.forms.getFormForEditor, { formId })).not.toBeNull();
    await t.run(ctx => ctx.db.patch("formCollaborators", collaboratorId, { status: "declined" }));
    expect(await t.withIdentity(otherCreatorIdentity).query(api.forms.searchIndex, {})).toEqual([]);
  });
});
