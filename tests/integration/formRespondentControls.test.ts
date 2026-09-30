/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";
import { defaultFormSettings } from "@/convex/formModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

type Test = ReturnType<typeof createTestConvex>;

function definition(): FormDefinition {
  const def = emptyDefinition("Controls");
  def.fields = [{ id: "source", type: "text", label: "Where did you hear about us?", required: false }];
  return def;
}

async function publish(t: Test) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form.draftRevision });
  return { owner, formId, shareId: form.shareId };
}

async function setPro(t: Test, until: number | undefined) {
  await t.run(async (ctx) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique();
    await ctx.db.patch("users", user!._id, until === undefined ? { plan: "free", planExpiresAt: undefined } : { plan: "pro", planExpiresAt: until });
  });
}

const submit = (shareId: string, key: string, extra: Record<string, unknown> = {}) => ({
  shareId, submissionKey: key, answers: { source: "typed answer" }, language: "en" as const, final: true, startedAt: Date.now() - 60_000, ...extra,
});

describe("hidden fields", () => {
  it("stores declared link values beside answers, never over them, and exports them", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t);
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hiddenFields: ["lang"] } })).rejects.toThrow(/INVALID_SETTINGS/);
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hiddenFields: ["bad name"] } })).rejects.toThrow(/INVALID_SETTINGS/);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hiddenFields: ["source", "campaign"] } });
    expect(await t.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open", hiddenFields: ["source", "campaign"] });

    // "source" is also a question id: the parameter must not replace the typed answer.
    const { responseId } = await t.mutation(api.respond.submitResponse, submit(shareId, "hidden-key-1", { hidden: { source: "instagram", campaign: " fall\u0000 ", injected: "x" } }));
    const stored = await t.run((ctx) => ctx.db.get("formResponses", responseId));
    expect(stored!.answers).toEqual({ source: "typed answer" });
    expect(stored!.hidden).toEqual({ source: "instagram", campaign: "fall" });

    expect((await owner.query(api.formResults.getResponse, { responseId }))!.hidden).toEqual({ source: "instagram", campaign: "fall" });
    const list = await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(list.page[0]).toMatchObject({ hidden: { source: "instagram", campaign: "fall" } });
    const page = await owner.query(api.formResults.exportResponses, { formId, includePartial: false, includeSpam: true, paginationOpts: { numItems: 10, cursor: null } });
    expect(page!.hiddenColumns).toEqual(["source", "campaign"]);
    expect(page!.rows[0].hidden).toEqual({ source: "instagram", campaign: "fall" });
  });
});

describe("branding", () => {
  it("lets only Pro owners hide branding and brings it back when the plan lapses", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t);
    // New accounts start with a Pro trial; end it to test a free owner.
    await setPro(t, undefined);
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hideBranding: true } })).rejects.toThrow(/PRO_REQUIRED/);
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.canHideBranding).toBe(false);

    const until = Date.now() + 86_400_000;
    await setPro(t, until);
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.canHideBranding).toBe(true);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hideBranding: true } });
    expect(await t.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open", hideBranding: true });

    // A stored flag is not trusted on its own: the plan is checked on every load.
    await setPro(t, undefined);
    expect(await t.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open", hideBranding: false });
    // Re-saving other settings keeps working after the plan lapses.
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, hideBranding: true, showReceipt: false } });
  });

  it("does not let collaborators or other people change it", async () => {
    const t = createTestConvex();
    const { formId } = await publish(t);
    const other = t.withIdentity(otherCreatorIdentity);
    await expect(other.mutation(api.forms.updateFormSettings, { formId: formId as Id<"forms">, settings: { ...defaultFormSettings, hideBranding: true } })).rejects.toThrow();
  });
});

describe("email and domain restriction", () => {
  const verified = (email: string, subject: string) => ({ ...otherCreatorIdentity, subject, tokenIdentifier: `${otherCreatorIdentity.issuer}|${subject}`, email, emailVerified: true });

  it("is enforced when the form loads and when answers are submitted", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t);
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, allowedDomains: ["school.edu"] } })).rejects.toThrow(/sign in/);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "signed_in", allowedEmails: ["Guest@Example.com"], allowedDomains: ["@School.edu"] } });
    const saved = (await owner.query(api.forms.getFormForEditor, { formId }))!.settings;
    expect(saved).toMatchObject({ allowedEmails: ["guest@example.com"], allowedDomains: ["school.edu"] });

    const student = t.withIdentity(verified("kid@school.edu", "user_student"));
    const guest = t.withIdentity(verified("guest@example.com", "user_guest"));
    const outsider = t.withIdentity(verified("kid@evil-school.edu", "user_outsider"));
    const unverified = t.withIdentity({ ...verified("kid2@school.edu", "user_unverified"), emailVerified: false });

    expect(await student.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open" });
    expect(await guest.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open" });
    const blocked = await outsider.query(api.respond.getPublicForm, { shareId });
    expect(blocked).toMatchObject({ state: "restricted", reason: "not_allowed", email: "kid@evil-school.edu" });
    // The allow-list itself is never sent to respondents.
    expect(blocked).not.toHaveProperty("allowedDomains");
    expect(JSON.stringify(blocked)).not.toContain("\"school.edu\"");
    expect(JSON.stringify(blocked)).not.toContain("guest@example.com");
    expect(await unverified.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "restricted", reason: "unverified" });

    await expect(outsider.mutation(api.respond.submitResponse, submit(shareId, "outsider-key"))).rejects.toThrow(/EMAIL_NOT_ALLOWED/);
    await expect(unverified.mutation(api.respond.submitResponse, submit(shareId, "unverified-key"))).rejects.toThrow(/EMAIL_UNVERIFIED/);
    await expect(outsider.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "source" })).rejects.toThrow(/EMAIL_NOT_ALLOWED/);
    expect(await student.mutation(api.respond.submitResponse, submit(shareId, "student-key"))).toMatchObject({ status: "completed" });
  });
});
