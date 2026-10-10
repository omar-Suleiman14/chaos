import { searchText } from "./formSearchText";
import { DELETE_GRACE_MS } from "./formDeletion";
import { assertDraftSize } from "./formDraftSize";
export { assertDraftSize } from "./formDraftSize";
import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { consumeCreation } from "./plans";
import { businessMember, requireBusinessWorkspace } from "./businessAccess";
import { deleteUploadRecord } from "./formResults";
import { supportEmail } from "./support";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Infer } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { getFormIfRole, hasPro, matchesAccountFormCollaborator, matchesFormCollaborator, verifiedIdentityEmail, ownsRecord, requireActiveUser, requireFormRole } from "./authz";
import { checkHiddenFieldNames, checkHiddenParameters, normalizeEmailRules } from "./formRespondent";
import { checkDefinition, emptyDefinition, LIMITS } from "./formLogic";
import type { FormDefinition } from "./formLogic";
import { isValidTimeZone } from "./formSchedule";
import { defaultFormSettings, definitionValidator, formRoleValidator, formSettingsValidator, themeValidator } from "./formModel";
import { displayName, logActivity, notify, randomCode, sha256Hex } from "./serverUtils";
import { builtInTemplates } from "./formTemplates";
import { emitFormStatusChange, emitWebhookEvent, formItem } from "./webhookEvents";
import { withFormCounts, withOwnerFormCounts } from "./formCounts";
import { enumerateForms } from "./formInventory";

type Definition = Infer<typeof definitionValidator>;

/** Pro (or an active trial) on the form owner's account. */
export async function ownerHasPro(ctx: QueryCtx | MutationCtx, ownerId: string): Promise<boolean> {
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).first();
  return hasPro(owner, Date.now());
}


async function uniqueShareId(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const shareId = randomCode(10);
    const clash = await ctx.db.query("forms").withIndex("by_shareId", (q) => q.eq("shareId", shareId)).first();
    if (!clash) return shareId;
  }
  throw new Error("SHARE_ID_UNAVAILABLE: Please try again.");
}

/** Shared by the dashboard and the integration API. */
export async function createFormRecord(
  ctx: MutationCtx,
  ownerId: string,
  definition: Definition,
  extra: { source?: Doc<"forms">["source"]; groupName?: string } = {}
): Promise<Id<"forms">> {
  assertDraftSize(definition);
  await consumeCreation(ctx, ownerId);
  const now = Date.now();
  const formId = await authorDb(ctx).insert("forms", {
    ownerId,
    title: definition.title,
    shareId: await uniqueShareId(ctx),
    status: "draft",
    draft: definition,
    draftRevision: 1,
    settings: defaultFormSettings,
    responseCount: 0,
    partialCount: 0,
    source: extra.source,
    groupName: extra.groupName,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("formAggregates", { formId, counts: {}, totalDurationMs: 0, timedCount: 0 });
  await logActivity(ctx, formId, extra.source?.kind === "integration" ? "integration" : ownerId, "created", extra.source?.label);
  return formId;
}

/** Replace the draft. Published versions and responses are never touched. */
export async function replaceDraft(ctx: MutationCtx, form: Doc<"forms">, definition: Definition, actorId: string): Promise<number> {
  if (form.status === "archived") throw new Error("FORM_ARCHIVED: Restore this form before editing.");
  assertDraftSize(definition);
  const draftRevision = form.draftRevision + 1;
  await authorDb(ctx).patch("forms", form._id, { draft: definition, title: definition.title, draftRevision, updatedAt: Date.now() });
  // One activity row per burst of edits keeps the log readable.
  const last = await ctx.db.query("formActivity").withIndex("by_formId_and_at", (q) => q.eq("formId", form._id)).order("desc").first();
  if (!last || last.action !== "edited" || last.actorId !== actorId || Date.now() - last.at > 10 * 60_000) {
    await logActivity(ctx, form._id, actorId, "edited");
  }
  return draftRevision;
}

export function formSummary(form: Doc<"forms">) {
  return {
    _id: form._id,
    title: form.title,
    shareId: form.shareId,
    status: form.status,
    draftRevision: form.draftRevision,
    publishedVersion: form.publishedVersion,
    hasUnpublishedChanges: form.publishedRevision !== undefined && form.draftRevision > form.publishedRevision,
    responseCount: form.responseCount,
    partialCount: form.partialCount,
    lastResponseAt: form.lastResponseAt,
    groupName: form.groupName,
    fieldCount: form.draft.fields.length,
    quizMode: form.draft.quiz?.enabled ?? false,
    /** For library thumbnails. */
    theme: form.draft.theme,
    presentation: form.draft.presentation,
    source: form.source,
    approvalPending: !!form.approval,
    updatedAt: form.updatedAt,
    createdAt: form.createdAt,
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────

export const listMyForms = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return { owned: [], shared: [] };
    const inventory = await enumerateForms(ctx, { kind: "identity", identity }, { owned: 500, memberships: 200, excludeOwnedShared: true });
    const shared = [];
    const invites = [];
    // One name lookup per owner, not per shared form.
    const ownerNames = new Map<string, string>();
    for (const { form: stored, membership: m } of inventory.shared) {
      if (stored.pendingDeleteAt !== undefined) continue;
      const form = await withFormCounts(ctx, stored);
      let ownerName = ownerNames.get(form.ownerId);
      if (ownerName === undefined) ownerNames.set(form.ownerId, (ownerName = await displayName(ctx, form.ownerId)));
      if (m.status === "pending") {
        invites.push({ collaboratorId: m._id, formId: form._id, title: form.title, role: m.role, ownerName, createdAt: m.createdAt });
      } else {
        shared.push({ ...formSummary(form), role: m.role, ownerName });
      }
    }
    return { owned: (await withOwnerFormCounts(ctx, identity.subject, inventory.owned.filter(form => form.pendingDeleteAt === undefined))).map(formSummary), shared, invites };
  },
});

/** Cursor-paginated replacement for the legacy capped listMyForms/searchIndex snapshots. */
export const listMyFormsPage = query({
  args: {
    source: v.union(v.literal("owned"), v.literal("account"), v.literal("email")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    const empty = { owned: [], shared: [], invites: [], searchIndex: [] };
    if (!identity) return { page: empty, isDone: true, continueCursor: "" };
    const limit = args.paginationOpts.numItems;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("VALIDATION_FAILED: Page size must be from 1 to 50.");
    if (args.source === "owned") {
      const batch = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
      const forms = await withOwnerFormCounts(ctx, identity.subject, batch.page.filter((form) => form.pendingDeleteAt === undefined));
      const searchIndex = forms.map((form) => ({ id: form._id, title: form.title, status: form.status, quiz: form.draft.quiz?.enabled ?? false, text: searchText(form.draft) }));
      return { ...batch, page: { ...empty, owned: forms.map(formSummary), searchIndex } };
    }
    if (args.source === "account") {
      const batch = await ctx.db.query("formCollaborators").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).paginate(args.paginationOpts);
      const shared = [];
      const searchIndex = [];
      const seen = new Set<string>();
      const ownerNames = new Map<string, string>();
      for (const membership of batch.page) {
        if (membership.status === "pending" || !matchesFormCollaborator(membership, identity) || seen.has(membership.formId)) continue;
        seen.add(membership.formId);
        const stored = await ctx.db.get("forms", membership.formId);
        if (!stored || stored.ownerId === identity.subject || stored.pendingDeleteAt !== undefined) continue;
        const form = await withFormCounts(ctx, stored);
        let ownerName = ownerNames.get(form.ownerId);
        if (ownerName === undefined) ownerNames.set(form.ownerId, (ownerName = await displayName(ctx, form.ownerId)));
        shared.push({ ...formSummary(form), role: membership.role, ownerName });
        searchIndex.push({ id: form._id, title: form.title, status: form.status, quiz: form.draft.quiz?.enabled ?? false, text: searchText(form.draft) });
      }
      return { ...batch, page: { ...empty, shared, searchIndex } };
    }
    const email = verifiedIdentityEmail(identity);
    if (!email) return { page: empty, isDone: true, continueCursor: "" };
    const batch = await ctx.db.query("formCollaborators").withIndex("by_email", (q) => q.eq("email", email)).paginate(args.paginationOpts);
    const shared = [];
    const invites = [];
    const searchIndex = [];
    const seen = new Set<string>();
    const ownerNames = new Map<string, string>();
    for (const membership of batch.page) {
      if ((membership.userId && membership.status !== "pending") || !matchesFormCollaborator(membership, identity) || seen.has(membership.formId)) continue;
      seen.add(membership.formId);
      const stored = await ctx.db.get("forms", membership.formId);
      if (!stored || stored.ownerId === identity.subject || stored.pendingDeleteAt !== undefined) continue;
      const form = await withFormCounts(ctx, stored);
      let ownerName = ownerNames.get(form.ownerId);
      if (ownerName === undefined) ownerNames.set(form.ownerId, (ownerName = await displayName(ctx, form.ownerId)));
      searchIndex.push({ id: form._id, title: form.title, status: form.status, quiz: form.draft.quiz?.enabled ?? false, text: searchText(form.draft) });
      if (membership.status === "pending") {
        invites.push({ collaboratorId: membership._id, formId: form._id, title: form.title, role: membership.role, ownerName, createdAt: membership.createdAt });
      } else {
        shared.push({ ...formSummary(form), role: membership.role, ownerName });
      }
    }
    return { ...batch, page: { ...empty, shared, invites, searchIndex } };
  },
});

const SEARCH_FORM_CAP = 300;

/** For the Ctrl+K palette: every form the person owns or collaborates on (archived too) with the text inside it. */
export const searchIndex = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const inventory = await enumerateForms(ctx, { kind: "identity", identity }, { owned: SEARCH_FORM_CAP, memberships: 100 });
    const forms = [...inventory.owned, ...inventory.shared.map(row => row.form)].filter(form => form.pendingDeleteAt === undefined);
    return forms.map((form) => ({
      id: form._id,
      title: form.title,
      status: form.status,
      quiz: form.draft.quiz?.enabled ?? false,
      text: searchText(form.draft),
    }));
  },
});

/** Versions with the publisher's display name (looked up once per person, not an account id). */
async function withPublisherNames(ctx: QueryCtx, versions: Doc<"formVersions">[]) {
  const names = new Map<string, string>();
  for (const id of new Set(versions.map((ver) => ver.publishedBy))) names.set(id, await displayName(ctx, id));
  return versions.map((ver) => ({ version: ver.version, publishedAt: ver.publishedAt, publishedByName: names.get(ver.publishedBy) ?? "Someone" }));
}

export const getFormForEditor = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access || access.form.pendingDeleteAt !== undefined) return null;
    const { role } = access;
    const form = await withFormCounts(ctx, access.form);
    const versions = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) => q.eq("formId", form._id))
      .order("desc")
      .take(50);
    return {
      ...formSummary(form),
      role,
      slug: form.slug ?? null,
      draft: form.draft,
      settings: { ...form.settings, accessCodeHash: undefined, hasAccessCode: !!form.settings.accessCodeHash },
      /** The owner's plan allows hiding Chaos branding (respondents only see it hidden while this holds). */
      settingsRevision: form.settingsRevision ?? 0,
      canHideBranding: await ownerHasPro(ctx, form.ownerId),
      approval: form.approval ? { ...form.approval, requestedByName: await displayName(ctx, form.approval.requestedBy) } : null,
      versions: await withPublisherNames(ctx, versions),
    };
  },
});

export const getVersion = query({
  args: { formId: v.id("forms"), version: v.number() },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    return await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) => q.eq("formId", args.formId).eq("version", args.version))
      .unique();
  },
});

// ── Draft lifecycle ─────────────────────────────────────────────────────────

export const createForm = mutation({
  args: {
    title: v.optional(v.string()),
    templateId: v.optional(v.string()),
    ownTemplateId: v.optional(v.id("formTemplates")),
    definition: v.optional(definitionValidator),
    groupName: v.optional(v.string()),
    sourceLabel: v.optional(v.string()),
    quizMode: v.optional(v.boolean()),
  },
  returns: v.id("forms"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    let definition: Definition = emptyDefinition(args.title?.trim() || "Untitled form");
    let source: Doc<"forms">["source"] | undefined;
    if (args.templateId) {
      const template = builtInTemplates.find((t) => t.id === args.templateId);
      if (!template) throw new Error("TEMPLATE_NOT_FOUND: That template does not exist.");
      definition = JSON.parse(JSON.stringify(template.definition)) as Definition;
      source = { kind: "template", label: template.name };
    } else if (args.ownTemplateId) {
      const template = await ctx.db.get("formTemplates", args.ownTemplateId);
      if (!template || !ownsRecord(template, identity)) throw new Error("TEMPLATE_NOT_FOUND: That template does not exist.");
      definition = template.definition;
      source = { kind: "template", label: template.name };
    } else if (args.definition) {
      definition = args.definition;
      // Imports name their source; a blank built from the creator's defaults has none.
      if (args.sourceLabel) source = { kind: "import", label: args.sourceLabel.slice(0, 200) };
    }
    if (args.title?.trim()) definition = { ...definition, title: args.title.trim() };
    if (args.quizMode) definition = { ...definition, title: args.title?.trim() || "Untitled quiz", quiz: { enabled: true } };
    return await createFormRecord(ctx, identity.subject, definition, { source, groupName: args.groupName });
  },
});

export const saveFormDraft = mutation({
  args: { formId: v.id("forms"), expectedRevision: v.number(), definition: definitionValidator },
  returns: v.object({ draftRevision: v.number() }),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "editor");
    if (form.draftRevision !== args.expectedRevision) {
      throw new Error("DRAFT_CONFLICT: This form changed elsewhere. Your version is kept in this browser.");
    }
    return { draftRevision: await replaceDraft(ctx, form, args.definition, identity.subject) };
  },
});

export const updateFormSettings = mutation({
  args: {
    formId: v.id("forms"),
    settings: formSettingsValidator.omit("accessCodeHash"),
    /** New access code; empty string clears it; undefined keeps the current code. */
    accessCode: v.optional(v.string()),
    groupName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "owner");
    return applyFormSettingsForActor(ctx, form, identity.subject, args);
  },
});

/** Shared owner-only settings policy for native and trusted client transports. */
const editableSettingsValidator = formSettingsValidator.omit("accessCodeHash");
export async function applyFormSettingsForActor(ctx: MutationCtx, form: Doc<"forms">, actorId: string, args: { settings: Infer<typeof editableSettingsValidator>; accessCode?: string; groupName?: string }) {
  if (form.ownerId !== actorId || form.isBanned) throw new Error("FORBIDDEN: Form owner required");
    const s = args.settings;
    if (s.responseLimit !== undefined && (!Number.isInteger(s.responseLimit) || s.responseLimit < 1)) throw new Error("INVALID_SETTINGS: The response limit must be a whole number.");
    if (s.retentionDays !== undefined && (!Number.isInteger(s.retentionDays) || s.retentionDays < 1 || s.retentionDays > 3650)) throw new Error("INVALID_SETTINGS: Retention must be 1–3650 days.");
    if (s.opensAt !== undefined && s.closesAt !== undefined && s.opensAt >= s.closesAt) throw new Error("INVALID_SETTINGS: The closing time must be after the opening time.");
    if (s.timezone !== undefined && !isValidTimeZone(s.timezone)) throw new Error("INVALID_SETTINGS: Choose a valid time zone, for example Asia/Riyadh.");
    if (s.allowEditAfterClose && !s.allowEditAfterSubmit) throw new Error("INVALID_SETTINGS: Turn on editing after submitting before allowing edits after closing.");
    if ((s.closedMessage?.length ?? 0) > 2000) throw new Error("INVALID_SETTINGS: The closed message is too long.");
    if ((s.notifyRules?.length ?? 0) > 20) throw new Error("INVALID_SETTINGS: Use at most 20 notification rules.");
    if (s.onePerPerson && s.access !== "signed_in") throw new Error("INVALID_SETTINGS: One response per person can only be enforced when respondents sign in.");
    let accessCodeHash = form.settings.accessCodeHash;
    if (args.accessCode !== undefined) {
      const code = args.accessCode.trim();
      if (code && (code.length < 6 || code.length > 100)) throw new Error("INVALID_SETTINGS: Access codes need 6–100 characters.");
      accessCodeHash = code ? await sha256Hex(`${form._id}:${code}`) : undefined;
    }
    if (s.access === "code" && !accessCodeHash) throw new Error("INVALID_SETTINGS: Set an access code.");
    const hiddenFields = s.hiddenFields ? checkHiddenFieldNames(s.hiddenFields) : undefined;
    const hiddenParameters = s.hiddenParameters ?? form.settings.hiddenParameters;
    checkHiddenParameters(hiddenParameters ?? [], hiddenFields ?? []);
    const rules = normalizeEmailRules(s.allowedEmails, s.allowedDomains);
    if ((rules.emails.length || rules.domains.length) && s.access !== "signed_in") throw new Error("INVALID_SETTINGS: Email and domain limits only work when respondents sign in.");
    if (s.audienceTeamId && s.audienceTeamId !== form.settings.audienceTeamId) {
      if (s.access !== "signed_in") throw new Error("INVALID_SETTINGS: Team-only forms need respondents to sign in.");
      if (!await businessMember(ctx, s.audienceTeamId, actorId)) throw new Error("TEAM_ACCESS_REQUIRED: You can only limit a form to a team you belong to.");
    }
    // Eligibility is the owner's plan, read here; the client flag alone never hides branding.
    if (s.hideBranding && !form.settings.hideBranding && !(await ownerHasPro(ctx, form.ownerId))) throw new Error("PRO_REQUIRED: Removing Chaos branding needs Pro.");
    await authorDb(ctx).patch("forms", form._id, {
      settingsRevision: (form.settingsRevision ?? 0) + 1,
      settings: {
        ...s, accessCodeHash,
        hiddenFields: hiddenFields?.length ? hiddenFields : undefined,
        hiddenParameters,
        hideBranding: s.hideBranding || undefined,
        allowedEmails: rules.emails.length ? rules.emails : undefined,
        allowedDomains: rules.domains.length ? rules.domains : undefined,
        audienceTeamId: s.access === "signed_in" ? s.audienceTeamId : undefined,
      },
      groupName: args.groupName === undefined ? form.groupName : args.groupName.trim() || undefined,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, form._id, actorId, "changed settings");
    return null;
}

export async function publishNow(ctx: MutationCtx, form: Doc<"forms">, actorId: string) {
  if (form.isBanned) throw new Error(`CONTENT_HELD: Contact ${supportEmail()} before republishing.`);
  const report = checkDefinition(form.draft as FormDefinition);
  if (report.errors.length) throw new Error("PUBLICATION_BLOCKED:\n" + report.errors.join("\n"));
  const version = (form.publishedVersion ?? 0) + 1;
  const now = Date.now();
  await ctx.db.insert("formVersions", {
    formId: form._id,
    version,
    definition: form.draft,
    publishedAt: now,
    publishedBy: await displayName(ctx, actorId),
    draftRevision: form.draftRevision,
  });
  await authorDb(ctx).patch("forms", form._id, {
    status: form.status === "closed" ? "closed" : "live",
    publishedVersion: version,
    publishedRevision: form.draftRevision,
    approval: undefined,
    updatedAt: now,
  });
  await logActivity(ctx, form._id, actorId, "published", `Version ${version}`);
  const fresh = (await ctx.db.get("forms", form._id))!;
  await emitWebhookEvent(ctx, form.ownerId, "form.published", `form_${form._id}`, () => ({ base: { item: formItem(fresh) } }));
  return version;
}

export const publishForm = mutation({
  args: { formId: v.id("forms"), expectedRevision: v.number() },
  returns: v.object({ outcome: v.union(v.literal("published"), v.literal("approval_requested")), version: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const { form, role, identity } = await requireFormRole(ctx, args.formId, "editor");
    if (form.draftRevision !== args.expectedRevision) throw new Error("DRAFT_CONFLICT: This form changed elsewhere. Reload before publishing.");
    if (form.status === "archived") throw new Error("FORM_ARCHIVED: Restore this form before publishing.");
    if (role !== "owner" && form.settings.requireApproval) {
      const report = checkDefinition(form.draft as FormDefinition);
      if (report.errors.length) throw new Error("PUBLICATION_BLOCKED:\n" + report.errors.join("\n"));
      await authorDb(ctx).patch("forms", form._id, { approval: { requestedBy: identity.subject, requestedAt: Date.now(), revision: form.draftRevision } });
      await notify(ctx, form.ownerId, "approval", `${await displayName(ctx, identity.subject)} asked you to publish “${form.title}”.`, `approval:${form._id}:${form.draftRevision}`, form._id);
      await logActivity(ctx, form._id, identity.subject, "requested publication");
      return { outcome: "approval_requested" as const };
    }
    return { outcome: "published" as const, version: await publishNow(ctx, form, identity.subject) };
  },
});

export const rejectPublication = mutation({
  args: { formId: v.id("forms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "owner");
    if (!form.approval) return null;
    await authorDb(ctx).patch("forms", form._id, { approval: undefined });
    await notify(ctx, form.approval.requestedBy, "approval", `Publication of “${form.title}” was not approved.`, `approval-rejected:${form._id}:${form.approval.revision}`, form._id);
    await logActivity(ctx, form._id, identity.subject, "declined publication");
    return null;
  },
});

export const setFormStatus = mutation({
  args: { formId: v.id("forms"), status: v.union(v.literal("live"), v.literal("closed"), v.literal("archived"), v.literal("draft")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "owner");
    if (form.pendingDeleteAt !== undefined) throw new Error("DELETE_PENDING: Undo the pending deletion first.");
    if (args.status === "live" && form.isBanned) throw new Error("CONTENT_HELD: This form is held by an administrator.");
    if (args.status === "live" && form.publishedVersion === undefined) throw new Error("NOT_PUBLISHED: Publish the form first.");
    // "draft" is only valid to restore an archived, never-published form.
    const status = args.status === "draft" && form.publishedVersion !== undefined ? "closed" : args.status;
    await authorDb(ctx).patch("forms", form._id, { status, updatedAt: Date.now() });
    await emitFormStatusChange(ctx, form, status);
    await logActivity(ctx, form._id, identity.subject, status === "live" ? "reopened" : status === "closed" ? "closed" : status === "archived" ? "archived" : "restored");
    return null;
  },
});

export const restoreVersion = mutation({
  args: { formId: v.id("forms"), version: v.number(), expectedRevision: v.number() },
  returns: v.object({ draftRevision: v.number() }),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "editor");
    if (form.draftRevision !== args.expectedRevision) throw new Error("DRAFT_CONFLICT: This form changed elsewhere. Reload first.");
    const version = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", args.version))
      .unique();
    if (!version) throw new Error("VERSION_NOT_FOUND: That version does not exist.");
    const draftRevision = await replaceDraft(ctx, form, version.definition, identity.subject);
    await logActivity(ctx, form._id, identity.subject, "restored version", `Version ${args.version} copied into the draft`);
    return { draftRevision };
  },
});

export const duplicateForm = mutation({
  args: { formId: v.id("forms") },
  returns: v.id("forms"),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "viewer");
    await requireActiveUser(ctx);
    return await createFormRecord(ctx, identity.subject, { ...form.draft, title: `${form.draft.title} (copy)`.slice(0, LIMITS.title) }, {
      source: { kind: "copy", label: form.title },
      groupName: form.ownerId === identity.subject ? form.groupName : undefined,
    });
  },
});

/**
 * Queue irreversible deletion on the server. The row and every dependent record
 * remain intact for five seconds, even if the browser closes or changes device.
 */
export const deleteForm = mutation({
  args: { formId: v.id("forms") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { form } = await requireFormRole(ctx, args.formId, "owner");
    if (form.status !== "archived") throw new Error("ARCHIVE_FIRST: Archive the form before deleting it.");
    if (form.pendingDeleteAt !== undefined) throw new Error("DELETE_PENDING: This form is already scheduled for deletion.");
    const deleteAt = Date.now() + DELETE_GRACE_MS;
    const revision = (form.deleteRevision ?? 0) + 1;
    await authorDb(ctx).patch("forms", form._id, { pendingDeleteAt: deleteAt, deleteRevision: revision });
    await ctx.scheduler.runAt(deleteAt, internal.forms.finalizePendingFormDeletion, { formId: form._id, deleteAt, revision });
    return deleteAt;
  },
});

/** Undo is owner-only; once the deadline has passed there is no way to revive data. */
export const undoDeleteForm = mutation({
  args: { formId: v.id("forms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form } = await requireFormRole(ctx, args.formId, "owner");
    if (form.status !== "archived" || form.pendingDeleteAt === undefined || Date.now() >= form.pendingDeleteAt) {
      throw new Error("UNDO_EXPIRED: The deletion grace period has ended.");
    }
    await authorDb(ctx).patch("forms", form._id, { pendingDeleteAt: undefined });
    return null;
  },
});

/** Scheduled jobs cannot delete a row that was undone or rescheduled. */
export const finalizePendingFormDeletion = internalMutation({
  args: { formId: v.id("forms"), deleteAt: v.number(), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const form = await ctx.db.get("forms", args.formId);
    if (!form || form.status !== "archived" || form.pendingDeleteAt !== args.deleteAt || form.deleteRevision !== args.revision || Date.now() < args.deleteAt) return null;
    await authorDb(ctx).delete("forms", form._id);
    await ctx.scheduler.runAfter(0, internal.forms.purgeFormData, { formId: form._id });
    return null;
  },
});

// One table and four rows per transaction bound bytes even for large histories.
const PURGE_BATCH = 4;

/** Deletes everything owned by a deleted form, in bounded batches. */
export const purgeFormData = internalMutation({
  args: { formId: v.id("forms"), phase: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = args.formId;
    if (await ctx.db.get("forms", id)) return null;
    const phase = args.phase ?? 0;
    let remaining = false;
    const drain = async <T extends TableNames>(table: T, rows: Doc<T>[]) => {
      if (rows.length === PURGE_BATCH) remaining = true;
      for (const row of rows) await ctx.db.delete(table, row._id as Id<T>);
    };
    switch (phase) {
      case 0: {
        const uploads = await ctx.db.query("formUploads").withIndex("by_formId_and_uploadKey", (q) => q.eq("formId", id)).take(PURGE_BATCH);
        remaining = uploads.length === PURGE_BATCH;
        for (const upload of uploads) await deleteUploadRecord(ctx, upload);
        break;
      }
      case 1: await drain("formResponseRevisions", await ctx.db.query("formResponseRevisions").withIndex("by_formId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 2: await drain("formResponses", await ctx.db.query("formResponses").withIndex("by_formId_and_submittedAt", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 3: await drain("formVersions", await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 4: await drain("formAggregates", await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 5: await drain("formResumeDrafts", await ctx.db.query("formResumeDrafts").withIndex("by_formId_and_tokenHash", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 6: await drain("formSavedViews", await ctx.db.query("formSavedViews").withIndex("by_formId_and_ownerId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 7: await drain("formCollaborators", await ctx.db.query("formCollaborators").withIndex("by_formId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 8: await drain("formComments", await ctx.db.query("formComments").withIndex("by_formId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 9: await drain("formActivity", await ctx.db.query("formActivity").withIndex("by_formId_and_at", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      case 10: await drain("formCounters", await ctx.db.query("formCounters").withIndex("by_formId", (q) => q.eq("formId", id)).take(PURGE_BATCH)); break;
      default: return null;
    }
    if (remaining || phase < 10) await ctx.scheduler.runAfter(0, internal.forms.purgeFormData, { formId: id, phase: remaining ? phase : phase + 1 });
    return null;
  },
});

// ── Collaboration ───────────────────────────────────────────────────────────

export const listCollaborators = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return [];
    const rows = await ctx.db.query("formCollaborators").withIndex("by_formId", (q) => q.eq("formId", args.formId)).take(100);
    return rows.map((r) => ({ _id: r._id, email: r.email, role: r.role, joined: !!r.userId, createdAt: r.createdAt }));
  },
});

export const inviteCollaborator = mutation({
  args: { formId: v.id("forms"), email: v.string(), role: formRoleValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "owner");
    await requireBusinessWorkspace(ctx, identity.subject);
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("INVALID_EMAIL: Enter a valid email address.");
    if (identity.email?.toLowerCase() === email) throw new Error("INVALID_EMAIL: You already own this form.");
    const existing = await ctx.db.query("formCollaborators").withIndex("by_formId", (q) => q.eq("formId", form._id)).take(100);
    if (existing.length >= 50) throw new Error("COLLABORATOR_LIMIT: A form can have at most 50 collaborators.");
    const match = existing.find((c) => c.email === email);
    if (match) await ctx.db.patch("formCollaborators", match._id, { role: args.role, status: "pending" });
    else await ctx.db.insert("formCollaborators", { formId: form._id, email, role: args.role, status: "pending", invitedBy: identity.subject, createdAt: Date.now() });
    // A stored profile email is not evidence of ownership of the invited address.
    if (match?.userId && matchesAccountFormCollaborator(match, match.userId)) await notify(ctx, match.userId, "comment", `You can now ${args.role === "editor" ? "edit" : "view"} “${form.title}”.`, `invite:${form._id}:${email}:${args.role}`, form._id);
    await logActivity(ctx, form._id, identity.subject, "shared", `${email} as ${args.role}`);
    return null;
  },
});

export const removeCollaborator = mutation({
  args: { collaboratorId: v.id("formCollaborators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("formCollaborators", args.collaboratorId);
    if (!row) return null;
    const { identity } = await requireFormRole(ctx, row.formId, "owner");
    await ctx.db.delete("formCollaborators", row._id);
    await logActivity(ctx, row.formId, identity.subject, "removed access", row.email);
    return null;
  },
});

export const acceptInvite = mutation({
  args: { collaboratorId: v.id("formCollaborators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.get("formCollaborators", args.collaboratorId);
    if (!row) throw new Error("NOT_FOUND: Invitation not found.");
    if (!matchesFormCollaborator(row, identity)) throw new Error("UNAUTHORIZED: This invitation was sent to someone else.");
    await ctx.db.patch("formCollaborators", row._id, { status: "accepted", userId: identity.subject });
    return null;
  },
});

export const declineInvite = mutation({
  args: { collaboratorId: v.id("formCollaborators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.get("formCollaborators", args.collaboratorId);
    if (!row) return null;
    if (!matchesFormCollaborator(row, identity)) throw new Error("UNAUTHORIZED: This invitation was sent to someone else.");
    await ctx.db.delete("formCollaborators", row._id);
    return null;
  },
});

export const leaveForm = mutation({
  args: { formId: v.id("forms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const rows = await ctx.db.query("formCollaborators").withIndex("by_formId", (q) => q.eq("formId", args.formId)).take(100);
    const match = rows.find((c) => matchesFormCollaborator(c, identity));
    if (match) await ctx.db.delete("formCollaborators", match._id);
    return null;
  },
});

export const listComments = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return [];
    const rows = await ctx.db.query("formComments").withIndex("by_formId", (q) => q.eq("formId", args.formId)).order("desc").take(200);
    return rows.map((c) => ({
      _id: c._id,
      formId: c.formId,
      authorName: c.authorName,
      fieldId: c.fieldId,
      body: c.body,
      resolved: c.resolved,
      createdAt: c.createdAt,
    }));
  },
});

export const addComment = mutation({
  args: { formId: v.id("forms"), body: v.string(), fieldId: v.optional(v.string()) },
  returns: v.id("formComments"),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "viewer");
    const body = args.body.trim();
    if (!body || body.length > 5000) throw new Error("INVALID_COMMENT: Comments need 1–5000 characters.");
    const authorName = await displayName(ctx, identity.subject);
    const id = await ctx.db.insert("formComments", { formId: form._id, authorId: identity.subject, authorName, fieldId: args.fieldId, body, resolved: false, createdAt: Date.now() });
    if (form.ownerId !== identity.subject) await notify(ctx, form.ownerId, "comment", `${authorName} commented on “${form.title}”.`, `comment:${id}`, form._id);
    return id;
  },
});

export const resolveComment = mutation({
  args: { commentId: v.id("formComments"), resolved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("formComments", args.commentId);
    if (!comment) return null;
    await requireFormRole(ctx, comment.formId, "editor");
    await ctx.db.patch("formComments", comment._id, { resolved: args.resolved });
    return null;
  },
});

export const listActivity = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return [];
    return await ctx.db.query("formActivity").withIndex("by_formId_and_at", (q) => q.eq("formId", args.formId)).order("desc").take(100);
  },
});

// ── Templates ───────────────────────────────────────────────────────────────

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    const own = identity
      ? await ctx.db.query("formTemplates").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).take(100)
      : [];
    return {
      builtIn: builtInTemplates.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description, languages: t.definition.languages, fieldCount: t.definition.fields.length })),
      own: own.map((t) => ({ _id: t._id, name: t.name, category: t.category, fieldCount: t.definition.fields.length, createdAt: t.createdAt })),
    };
  },
});

export const saveAsTemplate = mutation({
  args: { formId: v.id("forms"), name: v.string(), category: v.string() },
  returns: v.id("formTemplates"),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "viewer");
    await requireActiveUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 120) throw new Error("INVALID_TEMPLATE: Template names need 1–120 characters.");
    const count = (await ctx.db.query("formTemplates").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).take(101)).length;
    if (count >= 100) throw new Error("TEMPLATE_LIMIT: You can keep at most 100 templates.");
    return await ctx.db.insert("formTemplates", { ownerId: identity.subject, name, category: args.category.slice(0, 60) || "Custom", definition: form.draft, createdAt: Date.now() });
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id("formTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const template = await ctx.db.get("formTemplates", args.templateId);
    if (template && ownsRecord(template, identity)) await ctx.db.delete("formTemplates", template._id);
    return null;
  },
});

/** Portable export of the draft definition (no responses, no credentials). */
export const exportDefinition = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    return { format: "chaos-form", formatVersion: 1, exportedAt: null as number | null, definition: access.form.draft };
  },
});

/** Personal theme presets can be applied to any draft without changing published versions. */
export const listMyThemes = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("formThemes"), name: v.string(), theme: themeValidator, updatedAt: v.number() })),
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const themes = await ctx.db.query("formThemes")
      .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject))
      .order("desc").take(50);
    return themes.map((theme) => ({ _id: theme._id, name: theme.name, theme: theme.theme, updatedAt: theme.updatedAt }));
  },
});

export const saveTheme = mutation({
  args: { name: v.string(), theme: themeValidator },
  returns: v.id("formThemes"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 80) throw new Error("INVALID_THEME: Enter a name of at most 80 characters.");
    for (const color of [args.theme.accent, args.theme.pageColor, args.theme.surfaceColor, args.theme.textColor]) {
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("INVALID_THEME: Use six-digit hex colours.");
    }
    if (args.theme.logoUrl && !/^https:\/\//.test(args.theme.logoUrl)) throw new Error("INVALID_THEME: Logo addresses must use HTTPS.");
    const count = (await ctx.db.query("formThemes").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).take(51)).length;
    if (count >= 50) throw new Error("THEME_LIMIT: You can keep at most 50 saved themes.");
    const now = Date.now();
    return await ctx.db.insert("formThemes", { ownerId: identity.subject, name, theme: args.theme, createdAt: now, updatedAt: now });
  },
});

export const deleteTheme = mutation({
  args: { themeId: v.id("formThemes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const theme = await ctx.db.get("formThemes", args.themeId);
    if (theme && theme.ownerId === identity.subject) await ctx.db.delete("formThemes", theme._id);
    return null;
  },
});
