import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";
import { localToUtc } from "@/convex/formSchedule";

const TOKEN = "a".repeat(40);
const OTHER_TOKEN = "b".repeat(40);

function definition(): FormDefinition {
  const def = emptyDefinition("Field checks");
  def.fields = [
    { id: "age", type: "number", label: "Age", required: false, min: 1, max: 120, integer: true },
    { id: "price", type: "number", label: "Price", required: false, min: 0, step: 0.05 },
    { id: "day", type: "date", label: "Day", required: false, minValue: "2026-01-01", maxValue: "2026-12-31" },
    { id: "at", type: "time", label: "Time", required: false, minValue: "09:00", maxValue: "17:00" },
    { id: "stars", type: "rating", label: "Stars", required: false, max: 5 },
    { id: "likely", type: "scale", label: "How likely?", required: false, min: 1, max: 5, minLabel: "Unlikely", maxLabel: "Very likely" },
    { id: "mail", type: "email", label: "Email", required: false },
  ];
  return def;
}

async function setup(def = definition()) {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: def });
  const form = await owner.query(api.forms.getFormForEditor, { formId });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  return { t, owner, formId, shareId };
}

async function saveSettings(owner: Awaited<ReturnType<typeof setup>>["owner"], formId: Awaited<ReturnType<typeof setup>>["formId"], patch: Record<string, unknown>) {
  const form = await owner.query(api.forms.getFormForEditor, { formId });
  const { hasAccessCode: _h, accessCodeHash: _a, ...settings } = form!.settings as Record<string, unknown>;
  await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, ...patch } as never });
}

const submit = (shareId: string, key: string, answers: Record<string, string | number>, extra: Record<string, unknown> = {}) => ({
  shareId, submissionKey: key, answers, language: "en" as const, final: true, startedAt: Date.now() - 60_000, ...extra,
});

describe("field validation on the server", () => {
  it("stores valid values exactly and round-trips them into the response view and export", async () => {
    const { t, owner, formId, shareId } = await setup();
    const sent = { age: 34, price: 19.95, day: "2026-03-08", at: "09:30", stars: 4, likely: 5, mail: "a@b.co" };
    const res = await t.mutation(api.respond.submitResponse, submit(shareId, "key-roundtrip-1", sent));
    const detail = await owner.query(api.formResults.getResponse, { responseId: res.responseId });
    const byId = Object.fromEntries(detail!.items.map((i) => [i.fieldId, i.text]));
    expect(byId).toMatchObject({ age: "34", price: "19.95", day: "2026-03-08", at: "09:30", stars: "4", likely: "5", mail: "a@b.co" });
    const exported = await owner.query(api.formResults.exportResponses, { formId, includePartial: false, includeSpam: false, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported!.rows[0].answers).toEqual(sent);
    expect(exported!.rows[0].cells.price).toBe("19.95");
  });

  it.each([
    ["number out of range", { age: 0 }, "age"],
    ["number above range", { age: 121 }, "age"],
    ["fraction on a whole-number field", { age: 2.5 }, "age"],
    ["number off its step", { price: 0.07 }, "price"],
    ["non-numeric text for a number", { age: "abc" }, "age"],
    ["date before the earliest", { day: "2025-12-31" }, "day"],
    ["date after the latest", { day: "2027-01-01" }, "day"],
    ["impossible date", { day: "2026-02-30" }, "day"],
    ["time before the earliest", { at: "08:59" }, "at"],
    ["time after the latest", { at: "17:01" }, "at"],
    ["rating above the maximum", { stars: 6 }, "stars"],
    ["scale below the minimum", { likely: 0 }, "likely"],
    ["malformed email", { mail: "nope" }, "mail"],
  ])("rejects %s", async (_name, answers, fieldId) => {
    const { t, shareId } = await setup();
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "key-invalid-1", answers as Record<string, string | number>))).rejects.toThrow(new RegExp(`VALIDATION_FAILED.*${fieldId}`));
  });

  it("an empty optional number or rating stores no value, not zero", async () => {
    const { t, owner, shareId } = await setup();
    const res = await t.mutation(api.respond.submitResponse, submit(shareId, "key-empty-001", { mail: "a@b.co" }));
    const detail = await owner.query(api.formResults.getResponse, { responseId: res.responseId });
    expect(detail!.items.find((i) => i.fieldId === "age")).toMatchObject({ state: "skipped", text: "" });
    expect(detail!.items.find((i) => i.fieldId === "stars")).toMatchObject({ state: "skipped" });
  });

  it("shows scale endpoint labels in the response view, the analysis and the export header", async () => {
    const { t, owner, formId, shareId } = await setup();
    const res = await t.mutation(api.respond.submitResponse, submit(shareId, "key-labels-01", { likely: 3 }));
    const detail = await owner.query(api.formResults.getResponse, { responseId: res.responseId });
    expect(detail!.items.find((i) => i.fieldId === "likely")!.scale).toEqual({ min: 1, max: 5, step: 1, minLabel: "Unlikely", maxLabel: "Very likely" });
    const exported = await owner.query(api.formResults.exportResponses, { formId, includePartial: false, includeSpam: false, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported!.columns.find((c) => c.key === "likely")!.label).toBe("How likely? (1 = Unlikely; 5 = Very likely)");
    const analysis = await owner.query(api.formResults.getAnalysis, { formId });
    const dist = analysis!.fields.find((f) => f.fieldId === "likely")!.distribution!;
    expect(dist[0].label).toBe("1 — Unlikely");
    expect(dist[4].label).toBe("5 — Very likely");
  });

  it("rejects an unpublishable definition with a bad date bound or step", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const def = definition();
    def.fields = [{ id: "d", type: "date", label: "D", required: false, minValue: "2026-06-01", maxValue: "2026-01-01" }];
    const formId = await owner.mutation(api.forms.createForm, { definition: def });
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await expect(owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision })).rejects.toThrow(/PUBLICATION_BLOCKED/);
  });
});

describe("opening and closing schedules", () => {
  it("returns distinct not-open and closed states with the time zone, and enforces them on submit", async () => {
    const { t, owner, formId, shareId } = await setup();
    const now = Date.now();
    await saveSettings(owner, formId, { opensAt: now + 3_600_000, closesAt: now + 7_200_000, timezone: "Asia/Riyadh" });
    const before = await t.query(api.respond.getPublicForm, { shareId });
    expect(before).toMatchObject({ state: "not_open", opensAt: now + 3_600_000, timezone: "Asia/Riyadh" });
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "key-notopen-1", { mail: "a@b.co" }))).rejects.toThrow(/FORM_NOT_OPEN/);

    await saveSettings(owner, formId, { opensAt: now - 7_200_000, closesAt: now - 3_600_000, timezone: "Asia/Riyadh" });
    const after = await t.query(api.respond.getPublicForm, { shareId });
    expect(after).toMatchObject({ state: "closed", reason: "scheduled", closesAt: now - 3_600_000, timezone: "Asia/Riyadh" });
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "key-closed-01", { mail: "a@b.co" }))).rejects.toThrow(/FORM_CLOSED/);

    await saveSettings(owner, formId, { opensAt: now - 3_600_000, closesAt: now + 3_600_000, timezone: "Asia/Riyadh" });
    expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("open");
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "key-open-0001", { mail: "a@b.co" }))).resolves.toMatchObject({ status: "completed" });
  });

  it("an unpublished or archived form is never available, whatever the schedule", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
    const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
    const now = Date.now();
    await saveSettings(owner, formId, { opensAt: now - 1000, closesAt: now + 3_600_000, timezone: "UTC" });
    expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "key-draft-001", { mail: "a@b.co" }))).rejects.toThrow(/FORM_UNAVAILABLE/);

    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
    expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("open");
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
  });

  it("stores the wall time the creator meant, converted with daylight saving", async () => {
    const { owner, formId } = await setup();
    const closesAt = localToUtc("2026-03-09T09:00", "America/New_York")!;
    await saveSettings(owner, formId, { closesAt, timezone: "America/New_York" });
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    expect(form!.settings.closesAt).toBe(Date.UTC(2026, 2, 9, 13, 0));
    expect(form!.settings.timezone).toBe("America/New_York");
  });

  it("rejects an invalid time zone and keeps schedules saved without one working", async () => {
    const { t, owner, formId, shareId } = await setup();
    await expect(saveSettings(owner, formId, { timezone: "Mars/Base" })).rejects.toThrow(/INVALID_SETTINGS/);
    await saveSettings(owner, formId, { closesAt: Date.now() - 1000 });
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    expect(form!.settings.timezone).toBeUndefined();
    expect(await t.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "closed", timezone: null });
  });

  it("a response cannot slip in after closing by calling the server directly", async () => {
    const { t, owner, formId, shareId } = await setup();
    await saveSettings(owner, formId, { closesAt: Date.now() - 1 });
    await expect(t.mutation(api.respond.submitResponse, { ...submit(shareId, "key-direct-001", { mail: "a@b.co" }), final: false })).rejects.toThrow(/FORM_CLOSED/);
  });
});

describe("response edit history", () => {
  async function editable(settingsPatch: Record<string, unknown> = {}) {
    const ctx = await setup();
    await saveSettings(ctx.owner, ctx.formId, { allowEditAfterSubmit: true, ...settingsPatch });
    const first = await ctx.t.mutation(api.respond.submitResponse, submit(ctx.shareId, "key-edit-0001", { stars: 2, mail: "old@b.co" }, { editToken: TOKEN }));
    return { ...ctx, first };
  }
  const edit = (ctx: { shareId: string }, answers: Record<string, string | number>, editToken = TOKEN) =>
    ({ shareId: ctx.shareId, editToken, answers, language: "en" as const });

  it("is off by default: nothing can be edited", async () => {
    const { t, shareId } = await setup();
    await t.mutation(api.respond.submitResponse, submit(shareId, "key-noedit-01", { stars: 2 }, { editToken: TOKEN }));
    await expect(t.mutation(api.respond.updateSubmission, edit({ shareId }, { stars: 5 }))).rejects.toThrow(/EDIT_DISABLED/);
  });

  it("keeps the original, records the change and shows the latest everywhere", async () => {
    const ctx = await editable();
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 5, mail: "new@b.co" }));
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 3, mail: "new@b.co" }));

    const detail = await ctx.owner.query(api.formResults.getResponse, { responseId: ctx.first.responseId });
    expect(detail!.editCount).toBe(2);
    expect(detail!.editedAt).not.toBeNull();
    expect(detail!.items.find((i) => i.fieldId === "stars")!.text).toBe("3");
    expect(detail!.revisions.map((r) => r.revision)).toEqual([1, 2]);
    const original = detail!.revisions[0];
    expect(original.items.find((i) => i.fieldId === "stars")!.text).toBe("2");
    expect(original.items.find((i) => i.fieldId === "mail")!.text).toBe("old@b.co");
    expect(detail!.revisions[1].items.find((i) => i.fieldId === "stars")!.text).toBe("5");
    expect(original.replacedAt).toBeGreaterThanOrEqual(original.savedAt);

    const list = await ctx.owner.query(api.formResults.listResponses, { formId: ctx.formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(list.page[0]).toMatchObject({ editCount: 2 });
    expect(list.page[0].preview).toContain("3");

    const exported = await ctx.owner.query(api.formResults.exportResponses, { formId: ctx.formId, includePartial: false, includeSpam: false, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported!.rows).toHaveLength(1);
    expect(exported!.rows[0]).toMatchObject({ edited: true, editCount: 2 });
    expect(exported!.rows[0].answers).toMatchObject({ stars: 3, mail: "new@b.co" });

    const analysis = await ctx.owner.query(api.formResults.getAnalysis, { formId: ctx.formId });
    expect(analysis!.responseCount).toBe(1);
    expect(analysis!.editedResponses).toBe(1);
    const stars = analysis!.fields.find((f) => f.fieldId === "stars")!;
    expect(stars.distribution!.find((d) => d.id === "v3")!.count).toBe(1);
    expect(stars.distribution!.find((d) => d.id === "v2")!.count).toBe(0);
  });

  it("an unchanged resubmission is not an edit", async () => {
    const ctx = await editable();
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 2, mail: "old@b.co" }));
    const detail = await ctx.owner.query(api.formResults.getResponse, { responseId: ctx.first.responseId });
    expect(detail!.editCount).toBe(0);
    expect(detail!.revisions).toEqual([]);
  });

  it("refuses anyone without the private edit token", async () => {
    const ctx = await editable();
    await expect(ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 5 }, OTHER_TOKEN))).rejects.toThrow(/RESPONSE_NOT_FOUND/);
    await expect(ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 5 }, "short"))).rejects.toThrow();
    expect(await ctx.t.query(api.respond.getSubmissionForEdit, { shareId: ctx.shareId, editToken: OTHER_TOKEN })).toBeNull();
    const detail = await ctx.owner.query(api.formResults.getResponse, { responseId: ctx.first.responseId });
    expect(detail!.editCount).toBe(0);
    expect(detail!.items.find((i) => i.fieldId === "stars")!.text).toBe("2");
  });

  it("does not let respondents read edit history; only form collaborators can", async () => {
    const ctx = await editable();
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 4, mail: "old@b.co" }));
    expect(await ctx.t.query(api.formResults.getResponse, { responseId: ctx.first.responseId })).toBeNull();
  });

  it("blocks edits after the closing time unless the creator allows it", async () => {
    const ctx = await editable({ closesAt: Date.now() + 3_600_000, timezone: "UTC" });
    await saveSettings(ctx.owner, ctx.formId, { allowEditAfterSubmit: true, closesAt: Date.now() - 1, timezone: "UTC" });
    await expect(ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 5 }))).rejects.toThrow(/FORM_CLOSED/);
    expect(await ctx.t.query(api.respond.getSubmissionForEdit, { shareId: ctx.shareId, editToken: TOKEN })).toBeNull();
    expect((await ctx.t.query(api.respond.getPublicForm, { shareId: ctx.shareId, editToken: TOKEN })).state).toBe("closed");

    await saveSettings(ctx.owner, ctx.formId, { allowEditAfterSubmit: true, allowEditAfterClose: true, closesAt: Date.now() - 1, timezone: "UTC" });
    expect(await ctx.t.query(api.respond.getSubmissionForEdit, { shareId: ctx.shareId, editToken: TOKEN })).not.toBeNull();
    expect((await ctx.t.query(api.respond.getPublicForm, { shareId: ctx.shareId, editToken: TOKEN })).state).toBe("open");
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 5, mail: "old@b.co" }));
    // The bypass is for the edit link only: new responses and wrong tokens stay closed.
    expect((await ctx.t.query(api.respond.getPublicForm, { shareId: ctx.shareId })).state).toBe("closed");
    expect((await ctx.t.query(api.respond.getPublicForm, { shareId: ctx.shareId, editToken: OTHER_TOKEN })).state).toBe("closed");
    await expect(ctx.t.mutation(api.respond.submitResponse, submit(ctx.shareId, "key-late-0001", { stars: 1 }))).rejects.toThrow(/FORM_CLOSED/);
  });

  it("allowing edits after closing requires editing to be on", async () => {
    const { owner, formId } = await setup();
    await expect(saveSettings(owner, formId, { allowEditAfterClose: true })).rejects.toThrow(/INVALID_SETTINGS/);
  });

  it("deletes the history with the response", async () => {
    const ctx = await editable();
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 4, mail: "old@b.co" }));
    expect(await ctx.t.run(async (c) => (await c.db.query("formResponseRevisions").collect()).length)).toBe(1);
    await ctx.owner.mutation(api.formResults.deleteResponses, { formId: ctx.formId, responseIds: [ctx.first.responseId] });
    expect(await ctx.t.run(async (c) => (await c.db.query("formResponseRevisions").collect()).length)).toBe(0);
  });

  it("deletes the history with the form", async () => {
    const ctx = await editable();
    await ctx.t.mutation(api.respond.updateSubmission, edit(ctx, { stars: 4, mail: "old@b.co" }));
    await ctx.owner.mutation(api.forms.setFormStatus, { formId: ctx.formId, status: "archived" });
    await ctx.owner.mutation(api.forms.deleteForm, { formId: ctx.formId });
    await ctx.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const counts = await ctx.t.run(async (c) => ({
      revisions: (await c.db.query("formResponseRevisions").collect()).length,
      responses: (await c.db.query("formResponses").collect()).length,
    }));
    expect(counts).toEqual({ revisions: 0, responses: 0 });
  });
});
