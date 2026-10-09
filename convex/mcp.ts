import { authorDb } from "./authorIndex";
// Backend for the ChatGPT app (MCP server at /mcp).
//
// The Next.js /mcp route verifies the person's Clerk OAuth token, then calls
// POST /api/mcp/v1 (convex/http.ts) with a shared secret and the verified Clerk
// user id. These internal functions only ever reach that person's own forms
// and quizzes (plus forms shared with them), mirroring the dashboard's rules.

import { v } from "convex/values";
import { supportEmail } from "./support";
import { env, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { answerText, checkDefinition, isAnswerable } from "./formLogic";
import type { Aggregates, Answers, FormDefinition } from "./formLogic";
import { createFormRecord, publishNow, replaceDraft } from "./forms";
import { fromDefinition, parseFormInput, themeView, themeWarnings, toDefinition } from "./mcpContract";
import type { McpFormInput } from "./mcpContract";
import { hasPro, matchesAccountFormCollaborator } from "./authz";
import { insertNewUser } from "./quizFunctions";
import { consumeRate, logActivity } from "./serverUtils";
import { emitFormStatusChange } from "./webhookEvents";
import { registerMcpGames } from "./mcpGames";
import { withFormCounts, withOwnerFormCounts } from "./formCounts";

type Ctx = QueryCtx | MutationCtx;
type Role = "owner" | "editor" | "viewer";

const CALLS_PER_MINUTE = 120;
const roleRank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function appUrl(path: string | null): string | null {
  const base = (env.CHAOS_APP_URL ?? "https://chaos.fail").replace(/\/+$/, "");
  return path ? `${base}${path}` : null;
}

async function userRow(ctx: Ctx, userId: string) {
  return await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first();
}

async function requireWritable(ctx: MutationCtx, userId: string) {
  const user = await userRow(ctx, userId);
  if (!user) fail("ACCOUNT_REQUIRED", "Finish signing in to Chaos first.");
  if (user.isBanned || user.suspendedUntil) fail("ACCOUNT_RESTRICTED", `This Chaos account is read-only. Contact ${supportEmail()}.`);
  return user;
}

// ── Session start: account + rate limit ─────────────────────────────────────

/** Runs before every tool call. Creates the account on first use, like the web app does. */
export const begin = internalMutation({
  args: {
    userId: v.string(),
    profile: v.optional(v.object({ name: v.string(), email: v.string(), imageUrl: v.optional(v.string()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await userRow(ctx, args.userId);
    if (!existing) {
      if (!args.profile) fail("ACCOUNT_REQUIRED", `Open ${appUrl("/")} and sign in once, then try again.`);
      await insertNewUser(ctx, { clerkId: args.userId, name: args.profile.name || "Anonymous", email: args.profile.email, imageUrl: args.profile.imageUrl });
    }
    // The ChatGPT app is a Pro feature (new accounts start with a 30-day Pro trial).
    const user = await userRow(ctx, args.userId);
    if (!hasPro(user, Date.now())) {
      fail("PRO_REQUIRED", `Chaos in ChatGPT is part of Chaos Pro. Contact ${supportEmail()} to upgrade, then try again.`);
    }
    await consumeRate(ctx, `mcp:${args.userId}`, CALLS_PER_MINUTE, 60_000);
    return null;
  },
});

// ── Access ──────────────────────────────────────────────────────────────────

type Item = { kind: "form"; ref: string; doc: Doc<"forms">; role: Role };

async function formRole(ctx: Ctx, form: Doc<"forms">, userId: string): Promise<Role | null> {
  if (form.ownerId === userId) return "owner";
  const rows = await ctx.db.query("formCollaborators").withIndex("by_formId", (q) => q.eq("formId", form._id)).take(100);
  // This transport proves an account ID, not email verification. Pending email
  // invitations must be accepted through the verified native identity flow.
  return rows.find((c) => matchesAccountFormCollaborator(c, userId))?.role ?? null;
}

/** Ids are `form_<id>`; a bare form id also works. Quizzes are quiz forms. */
async function loadItem(ctx: Ctx, userId: string, ref: string, minimum: Role = "viewer"): Promise<Item> {
  const match = /^(?:form_)?([A-Za-z0-9]+)$/.exec(ref.trim());
  if (match) {
    const id = ctx.db.normalizeId("forms", match[1]);
    const form = id ? await ctx.db.get("forms", id) : null;
    const role = form ? await formRole(ctx, form, userId) : null;
    if (form && role) {
      if (roleRank[role] < roleRank[minimum]) fail("FORBIDDEN", `You are a ${role} on this form; this needs ${minimum} access.`);
      return { kind: "form", ref: `form_${form._id}`, doc: await withFormCounts(ctx, form), role };
    }
  }
  return fail("NOT_FOUND", "No form or quiz with that id in this Chaos account. Use search_forms to find it.");
}

function formLinks(form: Doc<"forms">) {
  return {
    editUrl: appUrl(`/dashboard/forms/${form._id}`)!,
    shareUrl: form.publishedVersion !== undefined ? appUrl(`/f/${form.shareId}`) : null,
    resultsUrl: appUrl(`/dashboard/forms/${form._id}/responses`)!,
  };
}

function summary(item: Item) {
  const f = item.doc;
  return {
    id: item.ref, kind: "form" as const, title: f.title, status: f.status, quizMode: !!f.draft.quiz?.enabled,
    questionCount: f.draft.fields.filter(isAnswerable).length, responseCount: f.responseCount,
    hasUnpublishedChanges: f.publishedRevision !== undefined && f.draftRevision > f.publishedRevision,
    role: item.role, updatedAt: new Date(f.updatedAt).toISOString(), ...formLinks(f),
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

const statusFilter = v.optional(v.union(v.literal("live"), v.literal("draft"), v.literal("closed"), v.literal("archived"), v.literal("any")));

export const searchForms = internalQuery({
  args: { userId: v.string(), query: v.optional(v.string()), status: statusFilter, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
    const words = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (title: string) => words.every((w) => title.toLowerCase().includes(w));
    // Archived forms only appear when asked for, like the library.
    const statusOk = (status: string) => (args.status === "any" ? true : args.status ? status === args.status : status !== "archived");
    const items: Item[] = [];
    const owned = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", args.userId)).order("desc").take(500);
    for (const doc of owned) items.push({ kind: "form", ref: `form_${doc._id}`, doc, role: "owner" });
    const memberships = await ctx.db.query("formCollaborators").withIndex("by_userId", (q) => q.eq("userId", args.userId)).take(200);
    const seen = new Set(owned.map((f) => f._id as string));
    for (const m of memberships) {
      if (!matchesAccountFormCollaborator(m, args.userId)) continue;
      if (seen.has(m.formId)) continue;
      seen.add(m.formId);
      const doc = await ctx.db.get("forms", m.formId);
      if (doc) items.push({ kind: "form", ref: `form_${doc._id}`, doc, role: m.role });
    }
    const filtered = items
      .filter((i) => matches(i.doc.title) && statusOk(i.doc.status))
      .sort((a, b) => b.doc.updatedAt - a.doc.updatedAt);
    const shown = filtered.slice(0, limit);
    const counted = new Map((await withOwnerFormCounts(ctx, args.userId, shown.map((i) => i.doc))).map((doc) => [doc._id as string, doc]));
    const page = shown.map((i) => ({ ...i, doc: counted.get(i.doc._id)! }));
    return { total: filtered.length, items: page.map(summary) };
  },
});

export const getForm = internalQuery({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const item = await loadItem(ctx, args.userId, args.id);
    const view = fromDefinition(item.doc.draft as FormDefinition);
    const report = checkDefinition(item.doc.draft as FormDefinition);
    return {
      ...summary(item),
      revision: item.doc.draftRevision,
      ...view,
      readyToPublish: report.errors.length === 0,
      problems: report.errors,
    };

  },
});

const ANALYSIS_SAMPLE = 1000;

export const getResults = internalQuery({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const item = await loadItem(ctx, args.userId, args.id);
    const form = item.doc;
    let def = form.draft as FormDefinition;
    if (form.publishedVersion !== undefined) {
      const row = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
      if (row) def = row.definition as FormDefinition;
    }
    const aggRow = await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", form._id)).unique();
    const agg = (aggRow?.counts ?? {}) as Aggregates;
    const questions = def.fields.filter(isAnswerable).map((f) => {
      const a = agg[f.id] ?? { answered: 0 };
      let distribution: { option: string; count: number }[] | null = null;
      if (f.type === "choice" || f.type === "dropdown" || f.type === "multi_choice" || f.type === "ranking") {
        distribution = (f.options ?? []).map((o) => ({ option: o.label, count: a.options?.[o.id] ?? 0 }));
      } else if (f.type === "rating" || f.type === "scale") {
        distribution = [];
        for (let n = f.type === "rating" ? 1 : f.min ?? 1; n <= (f.max ?? 5); n++) distribution.push({ option: String(n), count: a.options?.[`v${n}`] ?? 0 });
      }
      const correct = f.quiz?.correctOptionIds.map((id) => f.options?.find((o) => o.id === id)?.label).filter(Boolean);
      return {
        id: f.id, label: f.label, type: fromDefinition({ ...def, fields: [f] }).questions[0]?.type ?? f.type,
        answered: Math.max(0, a.answered),
        average: a.sum !== undefined && a.answered > 0 ? Math.round((a.sum / a.answered) * 100) / 100 : null,
        distribution,
        ...(correct?.length ? { correctAnswers: correct } : {}),
        ...(distribution === null ? { note: "Free-text answers: use list_responses to read them." } : {}),
      };
    });
    let quiz: { averageScore: number; maxScore: number; averagePercent: number; graded: number } | null = null;
    if (def.quiz?.enabled) {
      const recent = await ctx.db.query("formResponses")
        .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "completed"))
        .order("desc").take(ANALYSIS_SAMPLE);
      const graded = recent.filter((r) => !r.spam && r.quizScore !== undefined && (r.quizMaxScore ?? 0) > 0);
      if (graded.length) {
        const avg = graded.reduce((s, r) => s + r.quizScore!, 0) / graded.length;
        const pct = graded.reduce((s, r) => s + r.quizScore! / r.quizMaxScore!, 0) / graded.length;
        quiz = { averageScore: Math.round(avg * 10) / 10, maxScore: graded[0].quizMaxScore!, averagePercent: Math.round(pct * 1000) / 10, graded: graded.length };
      }
    }
    const started = form.responseCount + form.partialCount;
    return {
      ...summary(item),
      responses: form.responseCount,
      unfinished: form.partialCount,
      completionRate: form.settings.collectPartial && started > 0 ? Math.round((form.responseCount / started) * 1000) / 10 : null,
      averageMinutes: aggRow && aggRow.timedCount > 0 ? Math.round(aggRow.totalDurationMs / aggRow.timedCount / 600) / 100 : null,
      lastResponseAt: form.lastResponseAt ? new Date(form.lastResponseAt).toISOString() : null,
      quiz,
      questions,
    };
  },
});

export const listResponses = internalQuery({
  args: { userId: v.string(), id: v.string(), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const item = await loadItem(ctx, args.userId, args.id);
    const numItems = Math.min(25, Math.max(1, Math.floor(args.limit ?? 10)));
    const cursor = args.cursor || null;
    const form = item.doc;
    const page = await ctx.db.query("formResponses")
      .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "completed"))
      .order("desc").paginate({ numItems, cursor });
    const defs = new Map<number, FormDefinition | null>();
    const responses = [];
    for (const r of page.page) {
      if (r.spam) continue;
      if (!defs.has(r.version)) {
        const row = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", r.version)).unique();
        defs.set(r.version, (row?.definition as FormDefinition) ?? null);
      }
      const def = defs.get(r.version);
      const answers: Record<string, string> = {};
      for (const f of def?.fields ?? []) {
        // Uploaded files stay in Chaos; only their count is shown.
        if (!isAnswerable(f)) continue;
        const text = answerText(f, (r.answers as Answers)[f.id]);
        if (text) answers[f.label || f.id] = text;
      }
      responses.push({
        submittedAt: new Date(r.submittedAt).toISOString(),
        receipt: r.receiptCode,
        ...(r.quizScore !== undefined ? { score: r.quizScore, maxScore: r.quizMaxScore ?? null } : {}),
        ...(r.hidden !== undefined ? { hidden: r.hidden } : {}),
        ...(r.typedHidden !== undefined ? { typedHidden: r.typedHidden } : {}),
        tags: r.tags,
        answers,
      });
    }
    return { ...summary(item), responses, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

// ── Writes ──────────────────────────────────────────────────────────────────

function parsedOrFail(raw: unknown, partial: boolean): Partial<McpFormInput> {
  const parsed = parseFormInput(raw, partial);
  if ("errors" in parsed) fail("VALIDATION_FAILED", parsed.errors.join(" "));
  return parsed.input;
}

export async function createMcpFormDraft(ctx: MutationCtx, userId: string, raw: unknown) {
  await requireWritable(ctx, userId);
  const input = parsedOrFail(raw, false);
  const definition = toDefinition(input);
  // Drafts only: the creator reviews in Chaos or asks to publish explicitly.
  const formId = await createFormRecord(ctx, userId, definition, { source: { kind: "integration", label: "ChatGPT" } });
  const form = (await ctx.db.get("forms", formId))!;
  const report = checkDefinition(definition);
  return {
    ...summary({ kind: "form", ref: `form_${formId}`, doc: form, role: "owner" }),
    revision: form.draftRevision,
    readyToPublish: report.errors.length === 0,
    problems: report.errors,
    theme: themeView(definition.theme),
    warnings: themeWarnings(definition.theme),
  };
}

export const createForm = internalMutation({
  args: { userId: v.string(), input: v.any() },
  handler: (ctx, args) => createMcpFormDraft(ctx, args.userId, args.input),
});

// Registered here so the existing internal.mcp namespace remains the transport contract.
export const { createGameDraft, listGames, getGame, hostGame, setGameSettings, advanceGame, endGame } = registerMcpGames(createMcpFormDraft);

export const updateForm = internalMutation({
  args: { userId: v.string(), id: v.string(), expectedRevision: v.optional(v.number()), input: v.any() },
  handler: async (ctx, args) => {
    await requireWritable(ctx, args.userId);
    const item = await loadItem(ctx, args.userId, args.id, "editor");
    const form = item.doc;
    if (form.status === "archived") fail("FORM_ARCHIVED", "Restore this form before editing it.");
    if (args.expectedRevision !== undefined && args.expectedRevision !== form.draftRevision) {
      fail("DRAFT_CONFLICT", `This form changed in Chaos (now revision ${form.draftRevision}). Call get_form again and reapply the change.`);
    }
    const input = parsedOrFail(args.input, true);
    const previous = form.draft as FormDefinition;
    const definition = toDefinition(input, previous);
    const removed = input.questions ? previous.fields.filter((f) => !definition.fields.some((n) => n.id === f.id)).length : 0;
    await replaceDraft(ctx, form, definition, args.userId);
    const fresh = (await ctx.db.get("forms", form._id))!;
    const report = checkDefinition(definition);
    return {
      ...summary({ ...item, doc: await withFormCounts(ctx, fresh) }),
      revision: fresh.draftRevision,
      readyToPublish: report.errors.length === 0,
      problems: report.errors,
      theme: themeView(definition.theme),
      warnings: themeWarnings(definition.theme),
      notes: [
        ...(removed ? [`${removed} question${removed === 1 ? " was" : "s were"} removed from the draft. Collected responses are kept.`] : []),
        ...(fresh.publishedVersion !== undefined ? ["Respondents still see the live version until you publish."] : []),
      ],
    };
  },
});

export const publishForm = internalMutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    await requireWritable(ctx, args.userId);
    const item = await loadItem(ctx, args.userId, args.id, "editor");
    const form = item.doc;
    if (form.status === "archived") fail("FORM_ARCHIVED", "Restore this form before publishing it.");
    if (item.role !== "owner" && form.settings.requireApproval) fail("APPROVAL_REQUIRED", "The owner must approve publishing. Request it in Chaos.");
    try {
      await publishNow(ctx, form, args.userId);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.startsWith("PUBLICATION_BLOCKED")) fail("PUBLICATION_BLOCKED", text.replace(/^PUBLICATION_BLOCKED:\s*/, "").split("\n").join(" "));
      throw error;
    }
    const fresh = (await ctx.db.get("forms", form._id))!;
    return {
      ...summary({ ...item, doc: await withFormCounts(ctx, fresh) }),
      version: fresh.publishedVersion,
      note: fresh.status === "closed" ? "Published, but the form is closed. Use set_form_status with reopen to accept responses." : "Live. Share shareUrl with respondents.",
    };
  },
});

export const setFormStatus = internalMutation({
  args: { userId: v.string(), id: v.string(), action: v.union(v.literal("close"), v.literal("reopen"), v.literal("archive"), v.literal("restore")) },
  handler: async (ctx, args) => {
    await requireWritable(ctx, args.userId);
    const item = await loadItem(ctx, args.userId, args.id, "owner");
    const form = item.doc;
    const published = form.publishedVersion !== undefined;
    let status: Doc<"forms">["status"];
    if (args.action === "close") {
      if (form.status !== "live") fail("INVALID_STATUS", "Only live forms can be closed.");
      status = "closed";
    } else if (args.action === "reopen") {
      if (form.status !== "closed") fail("INVALID_STATUS", "Only closed forms can be reopened.");
      if (form.isBanned) fail("CONTENT_HELD", "This form is held by an administrator.");
      status = "live";
    } else if (args.action === "archive") {
      if (form.status === "archived") fail("INVALID_STATUS", "This form is already archived.");
      status = "archived";
    } else {
      if (form.status !== "archived") fail("INVALID_STATUS", "Only archived forms can be restored.");
      status = published ? "closed" : "draft";
    }
    await authorDb(ctx).patch("forms", form._id, { status, updatedAt: Date.now() });
    await emitFormStatusChange(ctx, form, status);
    await logActivity(ctx, form._id, args.userId, { close: "closed", reopen: "reopened", archive: "archived", restore: "restored" }[args.action]);
    const fresh = (await ctx.db.get("forms", form._id))!;
    return { ...summary({ ...item, doc: fresh }), previousStatus: form.status };
  },
});
