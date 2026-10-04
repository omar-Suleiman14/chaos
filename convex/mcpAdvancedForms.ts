// Internal only: userId comes from the authenticated MCP transport envelope.
import { ConvexError, v } from "convex/values";
import { internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireLearnActor } from "./mcpLearn";
import { formRoleFor } from "./authz";
import { applyFormSettingsForActor, replaceDraft } from "./forms";
import { checkDefinition } from "./formLogic";
import { formSettingsValidator, ruleValidator, hiddenParameterValidator } from "./formModel";

async function editable(ctx: MutationCtx, userId: string, formId: Id<"forms">, expectedRevision: number) {
  await requireLearnActor(ctx, userId);
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  const form = await ctx.db.get("forms", formId);
  const role = form ? await formRoleFor(ctx, form, { subject: userId, issuer: "mcp", tokenIdentifier: `mcp|${userId}`, email: user!.email }) : null;
  if (!form || !role || role === "viewer" || form.isBanned) throw new Error("FORBIDDEN: Editable form required.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("INVALID_REVISION");
  if (form.draftRevision !== expectedRevision) throw new ConvexError({ code: "DRAFT_CONFLICT", currentRevision: form.draftRevision, expectedRevision });
  return form;
}
const edit = { userId: v.string(), formId: v.id("forms"), expectedRevision: v.number() };
const result = v.object({ revision: v.number() });
export const setBranching = internalMutation({
  args: { ...edit, target: v.union(v.literal("field"), v.literal("ending")), targetId: v.string(), rule: v.union(ruleValidator, v.null()) }, returns: result,
  handler: async (ctx, args) => {
    const form = await editable(ctx, args.userId, args.formId, args.expectedRevision);
    const entries = args.target === "field" ? form.draft.fields : form.draft.endings;
    if (entries.filter(row => row.id === args.targetId).length !== 1) throw new Error("TARGET_NOT_FOUND");
    const draft = { ...form.draft };
    if (args.target === "field") draft.fields = draft.fields.map(row => row.id === args.targetId ? { ...row, showIf: args.rule ?? undefined } : row);
    else draft.endings = draft.endings.map(row => row.id === args.targetId ? { ...row, showIf: args.rule ?? undefined } : row);
    const { errors } = checkDefinition(draft);
    if (errors.length) throw new ConvexError({ code: "INVALID_DEFINITION", errors });
    return { revision: await replaceDraft(ctx, form, draft, args.userId) };
  },
});
export const upsertFileQuestion = internalMutation({
  args: { ...edit, fieldId: v.string(), label: v.string(), required: v.boolean(), maxFiles: v.number(), description: v.optional(v.string()), beforeFieldId: v.optional(v.string()) }, returns: result,
  handler: async (ctx, args) => {
    const form = await editable(ctx, args.userId, args.formId, args.expectedRevision);
    const existing = form.draft.fields.find(row => row.id === args.fieldId);
    if (existing && existing.type !== "file") throw new Error("FIELD_TYPE_CONFLICT: Cannot replace another question type.");
    if (existing && args.beforeFieldId !== undefined) throw new Error("INVALID_POSITION: Updates preserve question order.");
    const field = { ...existing, id: args.fieldId, type: "file" as const, label: args.label, required: args.required, max: args.maxFiles, ...(args.description !== undefined ? { description: args.description } : {}) };
    const fields = [...form.draft.fields];
    if (existing) fields[fields.indexOf(existing)] = field;
    else {
      const index = args.beforeFieldId === undefined ? fields.length : fields.findIndex(row => row.id === args.beforeFieldId);
      if (index < 0) throw new Error("TARGET_NOT_FOUND");
      fields.splice(index, 0, field);
    }
    const draft = { ...form.draft, fields };
    const { errors } = checkDefinition(draft);
    if (errors.length) throw new ConvexError({ code: "INVALID_DEFINITION", errors });
    return { revision: await replaceDraft(ctx, form, draft, args.userId) };
  },
});
// 92 requires extracting forms.updateFormSettings into a shared actor service.
// 93–95 are not implemented by this module.

const responseControls = v.object({
  access: v.optional(v.union(v.literal("public"), v.literal("signed_in"), v.literal("code"))),
  opensAt: v.optional(v.union(v.number(), v.null())), closesAt: v.optional(v.union(v.number(), v.null())),
  responseLimit: v.optional(v.union(v.number(), v.null())), retentionDays: v.optional(v.union(v.number(), v.null())),
  onePerPerson: v.optional(v.boolean()), allowEditAfterSubmit: v.optional(v.boolean()), allowEditAfterClose: v.optional(v.boolean()),
  collectPartial: v.optional(v.boolean()), allowResumeLink: v.optional(v.boolean()), hideBranding: v.optional(v.boolean()),
  hiddenFields: v.optional(v.array(v.string())), hiddenParameters: v.optional(v.array(hiddenParameterValidator)), allowedEmails: v.optional(v.array(v.string())), allowedDomains: v.optional(v.array(v.string())),
  audienceTeamId: v.optional(v.union(v.id("businessTeams"), v.null())),
});
export const getResponseControls = internalQuery({ args: { userId: v.string(), formId: v.id("forms") }, returns: v.object({ settings: formSettingsValidator.omit("accessCodeHash"), hasAccessCode: v.boolean(), settingsRevision: v.number() }), handler: async (ctx, args) => {
  await requireLearnActor(ctx, args.userId);
  const form = await ctx.db.get("forms", args.formId);
  if (!form || form.ownerId !== args.userId || form.isBanned) throw new Error("FORBIDDEN: Form owner required");
  const { accessCodeHash, ...settings } = form.settings;
  return { settings, hasAccessCode: !!accessCodeHash, settingsRevision: form.settingsRevision ?? 0 };
} });
export const setResponseControls = internalMutation({ args: { userId: v.string(), formId: v.id("forms"), expectedSettingsRevision: v.number(), patch: responseControls, accessCode: v.optional(v.string()) }, returns: v.object({ settingsRevision: v.number() }), handler: async (ctx, args) => {
  await requireLearnActor(ctx, args.userId);
  const form = await ctx.db.get("forms", args.formId);
  if (!form || form.ownerId !== args.userId || form.isBanned) throw new Error("FORBIDDEN: Form owner required");
  if (!Number.isSafeInteger(args.expectedSettingsRevision) || args.expectedSettingsRevision !== (form.settingsRevision ?? 0)) {
    const { accessCodeHash: _secret, ...settings } = form.settings;
    throw new ConvexError({ code: "SETTINGS_CONFLICT", currentRevision: form.settingsRevision ?? 0, settings });
  }
  const p = args.patch;
  const settings = { ...form.settings, ...p,
    opensAt: p.opensAt === null ? undefined : p.opensAt ?? form.settings.opensAt,
    closesAt: p.closesAt === null ? undefined : p.closesAt ?? form.settings.closesAt,
    responseLimit: p.responseLimit === null ? undefined : p.responseLimit ?? form.settings.responseLimit,
    retentionDays: p.retentionDays === null ? undefined : p.retentionDays ?? form.settings.retentionDays,
    audienceTeamId: p.audienceTeamId === null ? undefined : p.audienceTeamId ?? form.settings.audienceTeamId,
  };
  await applyFormSettingsForActor(ctx, form, args.userId, { settings, accessCode: args.accessCode });
  return { settingsRevision: (form.settingsRevision ?? 0) + 1 };
} });
