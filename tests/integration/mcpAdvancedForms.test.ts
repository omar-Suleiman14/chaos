/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../convex/schema";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
const modules = import.meta.glob("../../convex/**/*.*s");
const file = makeFunctionReference<"mutation">("mcpAdvancedForms:upsertFileQuestion");
const branch = makeFunctionReference<"mutation">("mcpAdvancedForms:setBranching");
async function setup() {
  const t = convexTest(schema, modules);
  const formId = await t.run(async ctx => {
    for (const user of ["owner", "other"]) await ctx.db.insert("users", { clerkId: user, name: user, username: user, email: `${user}@example.com`, createdAt: 0 });
    const draft = emptyDefinition("Preserved title");
    draft.fields = [{ id: "first", type: "text", label: "First", required: false }];
    return ctx.db.insert("forms", { ownerId: "owner", title: draft.title, shareId: "advanced", status: "draft", draft, draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
  });
  return { t, formId, input: { userId: "owner", formId, expectedRevision: 1, fieldId: "upload", label: "Upload", required: false, maxFiles: 2 } };
}
describe("advanced form MCP draft operations", () => {
  it("preserves unrelated content and enforces conflicts and upload limits", async () => {
    const { t, formId, input } = await setup();
    await expect(t.mutation(file, { ...input, maxFiles: 6 })).rejects.toThrow("INVALID_DEFINITION");
    expect(await t.mutation(file, input)).toEqual({ revision: 2 });
    await expect(t.mutation(file, input)).rejects.toThrow("DRAFT_CONFLICT");
    await t.mutation(branch, { userId: "owner", formId, expectedRevision: 2, target: "field", targetId: "upload", rule: { match: "all", conditions: [{ fieldId: "first", op: "answered" }] } });
    const form = await t.run(ctx => ctx.db.get("forms", formId));
    expect(form!.draft.title).toBe("Preserved title");
    expect(form!.draft.fields[0].label).toBe("First");
    expect(form!.draft.fields[1].showIf!.conditions[0].fieldId).toBe("first");
    expect(form!.publishedVersion).toBeUndefined();
  });
  it("rejects unauthorized actors, type replacement and broken references atomically", async () => {
    const { t, formId, input } = await setup();
    await expect(t.mutation(file, { ...input, userId: "other" })).rejects.toThrow("FORBIDDEN");
    await expect(t.mutation(file, { ...input, fieldId: "first" })).rejects.toThrow("FIELD_TYPE_CONFLICT");
    await expect(t.mutation(branch, { userId: "owner", formId, expectedRevision: 1, target: "field", targetId: "first", rule: { match: "all", conditions: [{ fieldId: "missing", op: "answered" }] } })).rejects.toThrow("INVALID_DEFINITION");
    expect((await t.run(ctx => ctx.db.get("forms", formId)))!.draftRevision).toBe(1);
  });
});


it("updates settings through one policy and refuses stale writes and secret disclosure", async () => {
  const { t, formId } = await setup();
  const set = makeFunctionReference<"mutation">("mcpAdvancedForms:setResponseControls"), get = makeFunctionReference<"query">("mcpAdvancedForms:getResponseControls");
  await expect(t.mutation(set, { userId: "other", formId, expectedSettingsRevision: 0, patch: { collectPartial: true } })).rejects.toThrow("FORBIDDEN");
  expect(await t.mutation(set, { userId: "owner", formId, expectedSettingsRevision: 0, patch: { access: "code", retentionDays: 30 }, accessCode: "private-code" })).toEqual({ settingsRevision: 1 });
  await expect(t.mutation(set, { userId: "owner", formId, expectedSettingsRevision: 0, patch: { collectPartial: true } })).rejects.toThrow("SETTINGS_CONFLICT");
  const controls = await t.query(get, { userId: "owner", formId });
  expect(controls.hasAccessCode).toBe(true);
  expect(JSON.stringify(controls)).not.toContain("accessCodeHash");
  expect(JSON.stringify(controls)).not.toContain("private-code");
  await t.mutation(set, { userId: "owner", formId, expectedSettingsRevision: 1, patch: { access: "signed_in", onePerPerson: true, allowedDomains: ["Example.COM"], retentionDays: null }, accessCode: "" });
  const changed = await t.query(get, { userId: "owner", formId });
  expect(changed.settings.allowedDomains).toEqual(["example.com"]);
  expect(changed.settings.retentionDays).toBeUndefined();
  expect(changed.settingsRevision).toBe(2);
});
