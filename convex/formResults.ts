import { questionQuality, type QualityQuestion, type QualityObservation } from "./questionQuality";
import { gradeQuiz } from "./formQuiz";
import { nicknameKey, questionsFromForm, MAX_LIVE_QUESTIONS } from "./liveLogic";
import { authorDb } from "./authorIndex";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getFormIfRole, ownsRecord, requireFormRole } from "./authz";
import { answerText, isAnswerable, isEmptyAnswer, visibleFieldIds } from "./formLogic";
import type { Aggregates, Answers, FormDefinition, FormField } from "./formLogic";
import { countResponse, definitionForResponse } from "./respond";
import { dateSpread, histogram, median, mostCommonWrong, scoreSummary, tallyQuizAnswer } from "./formAnalysis";
import type { Bin, DateSpread, QuizQuestionTally } from "./formAnalysis";
import { displayName, logActivity } from "./serverUtils";
import { changeFormCounts, readFormCounts } from "./formCounts";

type Ctx = QueryCtx | MutationCtx;

const filterValidator = v.object({
  status: v.optional(v.union(v.literal("completed"), v.literal("partial"))),
  reviewed: v.optional(v.boolean()),
  tag: v.optional(v.string()),
  search: v.optional(v.string()),
  spam: v.optional(v.boolean()),
});

/** Definitions by version, loaded once per request. */
function versionCache(ctx: Ctx, formId: Id<"forms">) {
  const cache = new Map<number, FormDefinition | null>();
  return async (version: number): Promise<FormDefinition | null> => {
    if (!cache.has(version)) {
      const row = await ctx.db
        .query("formVersions")
        .withIndex("by_formId_and_version", (q) => q.eq("formId", formId).eq("version", version))
        .unique();
      cache.set(version, (row?.definition as FormDefinition) ?? null);
    }
    return cache.get(version)!;
  };
}

/** The definition used for columns and analysis: the live version, else the draft. */
async function reportingDefinition(ctx: Ctx, form: Doc<"forms">): Promise<FormDefinition> {
  if (form.publishedVersion !== undefined) {
    const row = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!))
      .unique();
    if (row) return row.definition as FormDefinition;
  }
  return form.draft as FormDefinition;
}

/** A scale's endpoints, for showing what the low and high ends of an answer mean. */
function scaleInfo(f: FormField) {
  if (f.type !== "scale") return null;
  return { min: f.min ?? 1, max: f.max ?? 5, step: f.step ?? 1, minLabel: f.minLabel ?? null, maxLabel: f.maxLabel ?? null };
}

/** Export/column label; scales carry their endpoint labels, e.g. "How likely? (1 = Unlikely; 5 = Very likely)". */
export function columnLabel(f: FormField): string {
  const info = scaleInfo(f);
  if (!info || (!info.minLabel && !info.maxLabel)) return f.label;
  const ends = [info.minLabel ? `${info.min} = ${info.minLabel}` : "", info.maxLabel ? `${info.max} = ${info.maxLabel}` : ""].filter(Boolean).join("; ");
  return `${f.label} (${ends})`;
}

function preview(def: FormDefinition | null, answers: Answers): string {
  if (!def) return "";
  const parts: string[] = [];
  for (const f of def.fields) {
    if (!isAnswerable(f) || f.type === "file") continue;
    const text = answerText(f, answers[f.id]);
    if (text) parts.push(text);
    if (parts.length === 3) break;
  }
  return parts.join(" · ").slice(0, 200);
}

const TAG_SCAN_PAGE = 200;

export const listResponses = query({
  args: {
    formId: v.id("forms"),
    filter: filterValidator,
    paginationOpts: paginationOptsValidator,
    /** Newest first (default) or oldest first. Searches are ordered by relevance. */
    order: v.optional(v.union(v.literal("desc"), v.literal("asc"))),
  },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return { page: [], isDone: true, continueCursor: "" };
    const order = args.order ?? "desc";
    const f = args.filter;
    const spam = f.spam ?? false;
    const search = f.search?.trim();
    // Tags are matched after the read (an index can't test array membership), so tag
    // filters scan a wider page; the client keeps loading until it has enough matches.
    const paginationOpts = f.tag ? { ...args.paginationOpts, numItems: Math.max(args.paginationOpts.numItems, TAG_SCAN_PAGE) } : args.paginationOpts;
    const result = search
      ? await ctx.db
          .query("formResponses")
          .withSearchIndex("search_text", (q) => {
            let s = q.search("searchText", search).eq("formId", args.formId).eq("spam", spam);
            if (f.status) s = s.eq("status", f.status);
            if (f.reviewed !== undefined) s = s.eq("reviewed", f.reviewed);
            return s;
          })
          .paginate(paginationOpts)
      : f.status
        ? await ctx.db
            .query("formResponses")
            .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", args.formId).eq("status", f.status!))
            .order(order)
            .filter((q) => (f.reviewed === undefined ? q.eq(q.field("spam"), spam) : q.and(q.eq(q.field("spam"), spam), q.eq(q.field("reviewed"), f.reviewed))))
            .paginate(paginationOpts)
        : await (() => {
            const folder = ctx.db
              .query("formResponses")
              .withIndex("by_formId_and_spam_and_submittedAt", (q) => q.eq("formId", args.formId).eq("spam", spam))
              .order(order);
            return (f.reviewed === undefined ? folder : folder.filter((q) => q.eq(q.field("reviewed"), f.reviewed))).paginate(paginationOpts);
          })();
    const definition = versionCache(ctx, args.formId);
    const page = [];
    for (const r of result.page) {
      if (f.tag && !r.tags.includes(f.tag)) continue;
      page.push({
        _id: r._id,
        status: r.status,
        submittedAt: r.submittedAt,
        updatedAt: r.updatedAt,
        receiptCode: r.receiptCode,
        language: r.language,
        durationMs: r.durationMs,
        reviewed: r.reviewed,
        tags: r.tags,
        spam: r.spam,
        version: r.version,
        editCount: r.editCount ?? 0,
        editedAt: r.editedAt ?? null,
        quizScore: r.quizScore ?? null,
        quizMaxScore: r.quizMaxScore ?? null,
        preview: preview(await definition(r.version), r.answers as Answers),
        hidden: r.hidden ?? null, typedHidden: r.typedHidden ?? null,
      });
    }
    return { ...result, page };
  },
});

export const getResponse = query({
  args: { responseId: v.id("formResponses") },
  handler: async (ctx, args) => {
    const response = await ctx.db.get("formResponses", args.responseId);
    if (!response) return null;
    const access = await getFormIfRole(ctx, response.formId, "viewer");
    if (!access) return null;
    const def = await definitionForResponse(ctx, response);
    // Read current answer references, not the first 50 files across all earlier edits.
    // Published definitions have at most 200 fields and file answers at most five IDs each.
    const uploadIds = new Set<string>();
    for (const field of def?.fields ?? []) {
      const value = response.answers[field.id];
      if (field.type === "file" && Array.isArray(value)) for (const id of value) uploadIds.add(id);
    }
    const uploads: Doc<"formUploads">[] = [];
    for (const raw of [...uploadIds].slice(0, 1000)) {
      const id = ctx.db.normalizeId("formUploads", raw);
      const upload = id ? await ctx.db.get("formUploads", id) : null;
      if (upload?.responseId === response._id && upload.formId === response.formId) uploads.push(upload);
    }
    const files: { _id: Id<"formUploads">; fieldId: string; name: string; size: number; contentType: string; url: string | null }[] = [];
    for (const u of uploads) files.push({ _id: u._id, fieldId: u.fieldId, name: u.name, size: u.size, contentType: u.contentType, url: await ctx.storage.getUrl(u.storageId) });
    const visible = def ? visibleFieldIds(def, response.answers as Answers) : new Set<string>();
    const items = (def?.fields ?? []).filter(isAnswerable).map((field) => {
      const value = (response.answers as Answers)[field.id];
      return {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        state: !visible.has(field.id) ? ("not_applicable" as const) : isEmptyAnswer(value) ? ("skipped" as const) : ("answered" as const),
        text: answerText(field, value),
        scale: scaleInfo(field),
        files: files.filter((file) => file.fieldId === field.id),
      };
    });
    // Earlier versions, oldest first. The response above is always the latest.
    const revisionPage = await ctx.db.query("formResponseRevisions").withIndex("by_responseId_and_revision", (q) => q.eq("responseId", response._id))
      .paginate({ cursor: null, numItems: 50, maximumBytesRead: 2 * 1024 * 1024 });
    const revisions = revisionPage.page.map((rev) => ({
      revision: rev.revision,
      savedAt: rev.savedAt,
      replacedAt: rev.replacedAt,
      language: rev.language,
      items: (def?.fields ?? []).filter(isAnswerable).map((field) => ({ fieldId: field.id, label: field.label, type: field.type, text: answerText(field, (rev.answers as Answers)[field.id]), scale: scaleInfo(field) })),
    }));
    const ending = def?.endings.find((e) => e.id === response.endingId);
    return {
      _id: response._id,
      formId: response.formId,
      status: response.status,
      version: response.version,
      language: response.language,
      receiptCode: response.receiptCode,
      startedAt: response.startedAt,
      submittedAt: response.submittedAt,
      updatedAt: response.updatedAt,
      durationMs: response.durationMs,
      quizScore: response.quizScore ?? null,
      quizMaxScore: response.quizMaxScore ?? null,
      editCount: response.editCount ?? 0,
      editedAt: response.editedAt ?? null,
      revisions,
      revisionsTruncated: !revisionPage.isDone,
      reviewed: response.reviewed,
      tags: response.tags,
      spam: response.spam,
      respondent: response.respondentId ? await displayName(ctx, response.respondentId) : response.live?.nickname ?? null,
      /** Set when the response came from a live game: the player's final rank and game points. */
      live: response.live ? { gameId: response.live.gameId, rank: response.live.rank, points: response.live.points } : null,
      ending: ending ? ending.title || ending.message.slice(0, 80) : null,
      lastFieldId: response.lastFieldId,
      /** Hidden-field values captured from the link, e.g. { source: "instagram" }. */
      hidden: response.hidden ?? null, typedHidden: response.typedHidden ?? null,
      items,
      canEdit: access.role !== "viewer",
      canDelete: access.role === "owner",
    };
  },
});

// ── Bulk actions ────────────────────────────────────────────────────────────

const MAX_BULK = 100;

async function responsesForAction(ctx: MutationCtx, formId: Id<"forms">, ids: Id<"formResponses">[]) {
  if (ids.length > MAX_BULK) throw new Error(`TOO_MANY: Select at most ${MAX_BULK} responses at a time.`);
  const rows: Doc<"formResponses">[] = [];
  for (const id of ids) {
    const row = await ctx.db.get("formResponses", id);
    if (row && row.formId === formId) rows.push(row);
  }
  return rows;
}

export const setReviewed = mutation({
  args: { formId: v.id("forms"), responseIds: v.array(v.id("formResponses")), reviewed: v.boolean() },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireFormRole(ctx, args.formId, "editor");
    const rows = await responsesForAction(ctx, args.formId, args.responseIds);
    for (const r of rows) if (r.reviewed !== args.reviewed) await ctx.db.patch("formResponses", r._id, { reviewed: args.reviewed });
    return rows.length;
  },
});

export const setTags = mutation({
  args: { formId: v.id("forms"), responseIds: v.array(v.id("formResponses")), add: v.optional(v.string()), remove: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireFormRole(ctx, args.formId, "editor");
    const add = args.add?.trim().slice(0, 40);
    const remove = args.remove?.trim();
    const rows = await responsesForAction(ctx, args.formId, args.responseIds);
    for (const r of rows) {
      let tags = r.tags.filter((t) => t !== remove);
      if (add && !tags.includes(add)) tags = [...tags, add].slice(0, 20);
      await ctx.db.patch("formResponses", r._id, { tags });
    }
    return rows.length;
  },
});

export const setSpam = mutation({
  args: { formId: v.id("forms"), responseIds: v.array(v.id("formResponses")), spam: v.boolean() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { identity } = await requireFormRole(ctx, args.formId, "editor");
    const rows = await responsesForAction(ctx, args.formId, args.responseIds);
    let changed = 0;
    for (const r of rows) {
      if (r.spam === args.spam) continue;
      await ctx.db.patch("formResponses", r._id, { spam: args.spam });
      if (r.status === "completed") {
        const def = await definitionForResponse(ctx, r);
        const form = (await ctx.db.get("forms", args.formId))!;
        if (def) await countResponse(ctx, form, r, def, args.spam ? -1 : 1);
      }
      changed++;
    }
    if (changed) await logActivity(ctx, args.formId, identity.subject, args.spam ? "marked as spam" : "restored from spam", `${changed} response${changed === 1 ? "" : "s"}`);
    return changed;
  },
});

/** Remove one claim; legacy aliases keep the shared storage object alive. */
export async function deleteUploadRecord(ctx: MutationCtx, upload: Doc<"formUploads">) {
  await ctx.db.delete("formUploads", upload._id);
  const remaining = await ctx.db.query("formUploads").withIndex("by_storageId", (q) => q.eq("storageId", upload.storageId)).first();
  if (!remaining) await ctx.storage.delete(upload.storageId);
}

/** Each stored document is under 1 MiB; two revisions keep this transaction well below 16 MiB. */
async function drainResponseArtifacts(ctx: MutationCtx, responseId: Id<"formResponses">) {
  const uploads = await ctx.db.query("formUploads").withIndex("by_responseId_and_createdAt", (q) => q.eq("responseId", responseId)).take(20);
  for (const upload of uploads) await deleteUploadRecord(ctx, upload);
  const revisions = await ctx.db.query("formResponseRevisions").withIndex("by_responseId_and_revision", (q) => q.eq("responseId", responseId)).take(2);
  for (const revision of revisions) await ctx.db.delete("formResponseRevisions", revision._id);
  if (uploads.length === 20 || revisions.length === 2) {
    await ctx.scheduler.runAfter(0, internal.formResults.cleanupResponseArtifacts, { responseId });
  }
}

export const cleanupResponseArtifacts = internalMutation({
  args: { responseId: v.id("formResponses") },
  returns: v.null(),
  handler: async (ctx, { responseId }) => {
    // Do not drain a response that still exists; removal and scheduling are atomic.
    if (!(await ctx.db.get("formResponses", responseId))) await drainResponseArtifacts(ctx, responseId);
    return null;
  },
});

/** Counters and response removal are atomic; remaining attachments/history drain asynchronously. */
export async function deleteResponseRecord(ctx: MutationCtx, response: Doc<"formResponses">) {
  if (!(await ctx.db.get("formResponses", response._id))) return;
  const form = await ctx.db.get("forms", response.formId);
  if (form) {
    if (response.status === "completed" && !response.spam) {
      const def = await definitionForResponse(ctx, response);
      if (def) await countResponse(ctx, form, response, def, -1);
    } else if (response.status === "partial") {
      await changeFormCounts(ctx, form, { partials: -1 });
    }
  }
  await ctx.db.delete("formResponses", response._id);
  await drainResponseArtifacts(ctx, response._id);
}

/** The form scope is rechecked for every ID, including continuation batches. */
export const deleteResponseBatch = internalMutation({
  args: { formId: v.id("forms"), responseIds: v.array(v.id("formResponses")) },
  returns: v.number(),
  handler: async (ctx, { formId, responseIds }): Promise<number> => {
    const [id, ...remaining] = responseIds;
    const response = id ? await ctx.db.get("formResponses", id) : null;
    if (response?.formId === formId) await deleteResponseRecord(ctx, response);
    if (remaining.length) await ctx.scheduler.runAfter(0, internal.formResults.deleteResponseBatch, { formId, responseIds: remaining });
    return response?.formId === formId ? 1 : 0;
  },
});

/** Returns accepted distinct deletion requests; continuation IDs are validated by the worker. */
export const deleteResponses = mutation({
  args: { formId: v.id("forms"), responseIds: v.array(v.id("formResponses")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { identity } = await requireFormRole(ctx, args.formId, "owner");
    if (args.responseIds.length > MAX_BULK) throw new Error(`TOO_MANY: Select at most ${MAX_BULK} responses at a time.`);
    const ids = [...new Set(args.responseIds)];
    // Loading all 100 answer documents can exceed the read limit. Remove one now,
    // and accept the remaining IDs for scoped, idempotent scheduled removal.
    const removed: number = await ctx.runMutation(internal.formResults.deleteResponseBatch, { formId: args.formId, responseIds: ids });
    const accepted = removed + Math.max(0, ids.length - 1);
    if (accepted) await logActivity(ctx, args.formId, identity.subject, "requested response deletion", `${accepted}`);
    return accepted;
  },
});

export const listTags = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return [];
    const recent = await ctx.db.query("formResponses").withIndex("by_formId_and_submittedAt", (q) => q.eq("formId", args.formId)).order("desc").take(500);
    return [...new Set(recent.flatMap((r) => r.tags))].sort();
  },
});

// ── Saved views ─────────────────────────────────────────────────────────────

export const listSavedViews = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return [];
    return await ctx.db
      .query("formSavedViews")
      .withIndex("by_formId_and_ownerId", (q) => q.eq("formId", args.formId).eq("ownerId", access.identity.subject))
      .take(50);
  },
});

export const saveView = mutation({
  args: { formId: v.id("forms"), name: v.string(), filter: filterValidator },
  returns: v.id("formSavedViews"),
  handler: async (ctx, args) => {
    const { identity } = await requireFormRole(ctx, args.formId, "viewer");
    const name = args.name.trim();
    if (!name || name.length > 60) throw new Error("INVALID_VIEW: View names need 1–60 characters.");
    const existing = await ctx.db
      .query("formSavedViews")
      .withIndex("by_formId_and_ownerId", (q) => q.eq("formId", args.formId).eq("ownerId", identity.subject))
      .take(51);
    if (existing.length >= 50) throw new Error("VIEW_LIMIT: Keep at most 50 saved views per form.");
    return await ctx.db.insert("formSavedViews", { formId: args.formId, ownerId: identity.subject, name, filter: args.filter, createdAt: Date.now() });
  },
});

export const deleteView = mutation({
  args: { viewId: v.id("formSavedViews") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const view = await ctx.db.get("formSavedViews", args.viewId);
    if (!view) return null;
    const { identity } = await requireFormRole(ctx, view.formId, "viewer");
    if (ownsRecord(view, identity)) await ctx.db.delete("formSavedViews", view._id);
    return null;
  },
});

// ── Analysis ────────────────────────────────────────────────────────────────

/** Responses scanned for per-response analysis; totals come from aggregates. */
const ANALYSIS_SAMPLE = 2000;

interface FieldAnalysis {
  fieldId: string;
  label: string;
  type: FormField["type"];
  answered: number;
  distribution: { id: string; label: string; count: number }[] | null;
  average: number | null;
  /** From the sample: shown but left empty. */
  skipped: number;
  /** From the sample: hidden by logic, so not applicable. */
  notApplicable: number;
  /** From the sample: the response's version did not contain this question. */
  notAsked: number;
  /** Partial responses whose last answer was this question. */
  stoppedAfter: number;
  numberStats: { min: number; max: number; mean: number; median: number; bins: Bin[] } | null;
  /** Date questions: earliest, latest and counts over the range (from the sample). */
  dateStats: DateSpread | null;
  /** Written answers, newest first (from the sample), capped per question (getAnalysis sends TEXT_PREVIEW). */
  texts: { responseId: Id<"formResponses">; text: string; submittedAt: number }[] | null;
  /** Written answers in the sample, including any beyond the cap. */
  textCount: number;
  /** Quiz mode, graded questions: share answered correctly and the most common wrong answer. */
  quiz: { answered: number; correct: number; correctRate: number | null; commonWrong: { label: string; count: number } | null; correctLabels: string[] } | null;
}

/** Written answers returned per question; the full set is in Responses and exports. */
const TEXT_ANSWERS = 200;
/**
 * Written answers per question in the results summary. The page asks getTextAnswers for the rest
 * of one question when someone opens or searches it; sending 200 for every question made a
 * 100-question form's summary about 276 KB for 50 responses.
 */
const TEXT_PREVIEW = 5;
const textTypes: FormField["type"][] = ["text", "textarea", "email", "phone", "url", "time"];

export const getAnalysis = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    return getAnalysisForActor(ctx, access.form, TEXT_PREVIEW);
  },
});

/** Up to TEXT_ANSWERS written answers to one question, newest first, from the same sample as getAnalysis. */
export const getTextAnswers = query({
  args: { formId: v.id("forms"), fieldId: v.string() },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    const form = access.form;
    const def = await reportingDefinition(ctx, form);
    const field = def.fields.find((f) => f.id === args.fieldId);
    if (!field || !textTypes.includes(field.type)) return [];
    const definition = versionCache(ctx, form._id);
    const completed = await ctx.db
      .query("formResponses")
      .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "completed"))
      .order("desc")
      .take(ANALYSIS_SAMPLE);
    const texts: { responseId: Id<"formResponses">; text: string; submittedAt: number }[] = [];
    for (const r of completed) {
      if (r.spam || texts.length >= TEXT_ANSWERS) continue;
      const value = (r.answers as Answers)[args.fieldId];
      if (typeof value !== "string" || !value.trim()) continue;
      const rDef = await definition(r.version);
      if (!rDef || !visibleFieldIds(rDef, r.answers as Answers).has(args.fieldId)) continue;
      texts.push({ responseId: r._id, text: value.slice(0, 2000), submittedAt: r.submittedAt });
    }
    return texts;
  },
});

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * One page of responses for CSV/XLSX/JSON export. The client requests pages
 * until `isDone`, so exports of any size stay within query limits.
 */
export const exportResponses = query({
  args: { formId: v.id("forms"), includePartial: v.boolean(), includeSpam: v.boolean(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    return exportResponsesForActor(ctx, access, args);
  },
});


export async function getAnalysisForActor(ctx: QueryCtx, form: Doc<"forms">, textAnswers = TEXT_ANSWERS) {
    const def = await reportingDefinition(ctx, form);
    const aggRow = await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", form._id)).unique();
    const agg = (aggRow?.counts ?? {}) as Aggregates;

    const fields: FieldAnalysis[] = def.fields.filter(isAnswerable).map((f) => {
      const a = agg[f.id] ?? { answered: 0 };
      let distribution: FieldAnalysis["distribution"] = null;
      if (f.type === "choice" || f.type === "dropdown" || f.type === "multi_choice" || f.type === "ranking") {
        distribution = (f.options ?? []).map((o) => ({ id: o.id, label: o.label, count: a.options?.[o.id] ?? 0 }));
      } else if (f.type === "rating" || f.type === "scale") {
        const lo = f.type === "rating" ? 1 : f.min ?? 1;
        distribution = [];
        const hi = f.max ?? 5;
        for (let n = lo; n <= hi; n += f.type === "scale" ? f.step ?? 1 : 1) {
          const end = f.type === "scale" ? (n === lo ? f.minLabel : n === hi ? f.maxLabel : undefined) : undefined;
          distribution.push({ id: `v${n}`, label: end ? `${n} — ${end}` : String(n), count: a.options?.[`v${n}`] ?? 0 });
        }
      }
      return {
        fieldId: f.id, label: f.label, type: f.type, answered: Math.max(0, a.answered), distribution,
        average: a.sum !== undefined && a.answered > 0 ? a.sum / a.answered : null,
        skipped: 0, notApplicable: 0, notAsked: 0, stoppedAfter: 0, numberStats: null,
        dateStats: null, texts: textTypes.includes(f.type) ? [] : null, textCount: 0, quiz: null,
      };
    });
    const byId = new Map(fields.map((f) => [f.fieldId, f]));

    const definition = versionCache(ctx, form._id);
    const completed = await ctx.db
      .query("formResponses")
      .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "completed"))
      .order("desc")
      .take(ANALYSIS_SAMPLE);
    const numbers = new Map<string, number[]>();
    const dates = new Map<string, string[]>();
    const quizOn = !!def.quiz?.enabled;
    const graded = new Map(def.fields.filter((f) => quizOn && f.quiz?.correctOptionIds.length).map((f) => [f.id, f]));
    const tallies = new Map<string, QuizQuestionTally>([...graded.keys()].map((id) => [id, { answered: 0, correct: 0, wrong: new Map() }]));
    const scores: { score: number; max: number }[] = [];
    const matrix = new Map<string, Record<string, Record<string, number>>>();
    const perDay = new Map<string, number>();
    const endings = new Map<string, number>();
    const languages: Record<string, number> = {};
    const durations: number[] = [];
    let sampled = 0;
    let edited = 0;
    for (const r of completed) {
      if (r.spam) continue;
      sampled++;
      if ((r.editCount ?? 0) > 0) edited++;
      const answers = r.answers as Answers;
      const rDef = await definition(r.version);
      const visible = rDef ? visibleFieldIds(rDef, answers) : new Set<string>();
      const inVersion = new Set(rDef?.fields.map((f) => f.id) ?? []);
      for (const f of fields) {
        const value = answers[f.fieldId];
        if (!inVersion.has(f.fieldId)) f.notAsked++;
        else if (!visible.has(f.fieldId)) f.notApplicable++;
        else if (isEmptyAnswer(value)) f.skipped++;
        if (f.type === "number" && typeof value === "number") { const list = numbers.get(f.fieldId) ?? []; list.push(value); numbers.set(f.fieldId, list); }
        if (f.type === "date" && typeof value === "string") { const list = dates.get(f.fieldId) ?? []; list.push(value); dates.set(f.fieldId, list); }
        if (f.texts && typeof value === "string" && value.trim() && visible.has(f.fieldId)) {
          f.textCount++;
          if (f.texts.length < textAnswers) f.texts.push({ responseId: r._id, text: value.slice(0, 2000), submittedAt: r.submittedAt });
        }
        const key = graded.get(f.fieldId);
        if (key && visible.has(f.fieldId)) {
          const chosen = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : typeof value === "string" ? [value] : [];
          tallyQuizAnswer(tallies.get(f.fieldId)!, chosen, key.quiz!.correctOptionIds, key.type === "multi_choice");
        }
        if (f.type === "matrix" && value && typeof value === "object" && !Array.isArray(value)) {
          const table = matrix.get(f.fieldId) ?? {};
          for (const [row, col] of Object.entries(value)) {
            table[row] = table[row] ?? {};
            table[row][col] = (table[row][col] ?? 0) + 1;
          }
          matrix.set(f.fieldId, table);
        }
      }
      const day = new Date(r.submittedAt).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      if (r.endingId) endings.set(r.endingId, (endings.get(r.endingId) ?? 0) + 1);
      languages[r.language] = (languages[r.language] ?? 0) + 1;
      if (r.durationMs !== undefined) durations.push(r.durationMs);
      if (r.quizScore !== undefined && r.quizMaxScore !== undefined) scores.push({ score: r.quizScore, max: r.quizMaxScore });
    }
    for (const [id, values] of numbers) {
      const f = byId.get(id)!;
      f.numberStats = {
        min: Math.min(...values), max: Math.max(...values), mean: values.reduce((s, n) => s + n, 0) / values.length,
        median: median(values)!, bins: histogram(values),
      };
    }
    for (const [id, values] of dates) byId.get(id)!.dateStats = dateSpread(values);
    for (const [id, tally] of tallies) {
      const f = byId.get(id);
      const field = graded.get(id)!;
      if (!f) continue;
      const label = (optionId: string) => field.options?.find((o) => o.id === optionId)?.label ?? optionId;
      const wrong = mostCommonWrong(tally);
      f.quiz = {
        answered: tally.answered,
        correct: tally.correct,
        correctRate: tally.answered ? tally.correct / tally.answered : null,
        commonWrong: wrong ? { label: wrong.optionIds.map(label).join(", "), count: wrong.count } : null,
        correctLabels: field.quiz!.correctOptionIds.map(label),
      };
    }

    // Branch-aware abandonment: where unfinished respondents stopped.
    const partials = await ctx.db
      .query("formResponses")
      .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "partial"))
      .order("desc")
      .take(ANALYSIS_SAMPLE);
    let stoppedBeforeFirst = 0;
    for (const p of partials) {
      const f = p.lastFieldId ? byId.get(p.lastFieldId) : undefined;
      if (f) f.stoppedAfter++;
      else stoppedBeforeFirst++;
    }

    const medianDuration = median(durations);
    const counts = await readFormCounts(ctx, form);
    const started = counts.responseCount + counts.partialCount;
    return {
      title: form.title,
      collectPartial: form.settings.collectPartial,
      responseCount: counts.responseCount,
      partialCount: counts.partialCount,
      completionRate: form.settings.collectPartial && started > 0 ? counts.responseCount / started : null,
      averageDurationMs: aggRow && aggRow.timedCount > 0 ? aggRow.totalDurationMs / aggRow.timedCount : null,
      medianDurationMs: medianDuration,
      /** Completion times in seconds (from the sample), for the time distribution. */
      durationBins: histogram(durations.map((ms) => Math.round(ms / 1000)), 8),
      sampled,
      editedResponses: edited,
      quiz: quizOn ? scoreSummary(scores) : null,
      quizEnabled: quizOn,
      lastResponseAt: counts.lastResponseAt ?? null,
      sampleLimited: completed.length === ANALYSIS_SAMPLE,
      stoppedBeforeFirst,
      fields,
      matrix: Object.fromEntries(matrix),
      perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
      endings: def.endings.map((e) => ({ id: e.id, title: e.title || e.message.slice(0, 60), count: endings.get(e.id) ?? 0 })),
      languages,
      definition: def,
    };
}


export async function exportResponsesForActor(ctx: QueryCtx, access: { form: Doc<"forms"> }, args: { formId: Id<"forms">; includePartial: boolean; includeSpam: boolean; paginationOpts: import("convex/server").PaginationOptions }) {
    const def = await reportingDefinition(ctx, access.form);
    const result = await ctx.db
      .query("formResponses")
      .withIndex("by_formId_and_submittedAt", (q) => q.eq("formId", args.formId))
      .order("asc")
      .paginate(args.paginationOpts);
    const definition = versionCache(ctx, args.formId);
    const rows = [];
    for (const r of result.page) {
      if (!args.includePartial && r.status === "partial") continue;
      if (!args.includeSpam && r.spam) continue;
      const rDef = (await definition(r.version)) ?? def;
      const visible = visibleFieldIds(rDef, r.answers as Answers);
      const cells: Record<string, string> = {};
      for (const f of rDef.fields) {
        if (!isAnswerable(f)) continue;
        const value = (r.answers as Answers)[f.id];
        if (f.type === "matrix") {
          for (const row of f.rows ?? []) {
            const col = value && typeof value === "object" && !Array.isArray(value) ? value[row.id] : undefined;
            cells[`${f.id}.${row.id}`] = col ? f.options?.find((o) => o.id === col)?.label ?? col : "";
          }
        } else {
          cells[f.id] = !visible.has(f.id) ? "" : answerText(f, value);
        }
      }
      rows.push({
        id: r._id,
        receiptCode: r.receiptCode,
        status: r.status,
        submittedAt: r.submittedAt,
        language: r.language,
        durationSeconds: r.durationMs !== undefined ? Math.round(r.durationMs / 1000) : null,
        version: r.version,
        edited: (r.editCount ?? 0) > 0,
        editCount: r.editCount ?? 0,
        editedAt: r.editedAt ?? null,
        ending: r.endingId ?? null,
        quizScore: r.quizScore ?? null,
        quizMaxScore: r.quizMaxScore ?? null,
        tags: r.tags,
        reviewed: r.reviewed,
        spam: r.spam,
        cells,
        answers: r.answers,
        hidden: { ...(r.hidden ?? {}), ...(r.typedHidden ?? {}) },
      });
    }
    // Columns come from the live definition first, then any question that only older versions had,
    // so answers to a since-removed question still reach the spreadsheet and every page agrees.
    const columns: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    const addColumns = (d: FormDefinition) => {
      for (const f of d.fields) {
        if (!isAnswerable(f)) continue;
        const cols = f.type === "matrix" ? (f.rows ?? []).map((row) => ({ key: `${f.id}.${row.id}`, label: `${f.label} — ${row.label}` })) : [{ key: f.id, label: columnLabel(f) }];
        for (const c of cols) if (!seen.has(c.key)) { seen.add(c.key); columns.push(c); }
      }
    };
    addColumns(def);
    const olderVersions = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", args.formId)).order("desc").take(100);
    for (const row of olderVersions) addColumns(row.definition as FormDefinition);
    // Hidden fields get their own columns after the questions; the current list first, then any a page's rows still carry.
    const hiddenColumns = [...new Set([...(access.form.settings.hiddenFields ?? []), ...(access.form.settings.hiddenParameters ?? []).map(d => d.name), ...rows.flatMap((r) => Object.keys(r.hidden))])];
    return { title: access.form.title, columns, hiddenColumns, rows, isDone: result.isDone, continueCursor: result.continueCursor };
}

/** Immutable form editions plus cohort signals; timing is available for live answers only. */
export const getTeachingInsights = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    const [editions, responses] = await Promise.all([
      ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", args.formId)).order("desc").take(30),
      ctx.db.query("formResponses").withIndex("by_formId_and_status_and_submittedAt", q => q.eq("formId", args.formId).eq("status", "completed")).order("desc").take(201),
    ]);
    const sample = responses.slice(0,200).filter(r => !r.spam);
    const definition = versionCache(ctx, args.formId);
    const variants = new Map<string, { question: QualityQuestion; observations: QualityObservation[] }>();
    let missingSnapshots = 0;
    for (const r of sample) {
      const def = await definition(r.version);
      if (!def) { missingSnapshots++; continue; }
      const answers = r.answers as Answers;
      const grade = gradeQuiz(def, answers);
      if (!grade) continue;
      let liveAnswers: Doc<"liveAnswers">[] = [];
      if (r.live) {
        const player = await ctx.db.query("livePlayers").withIndex("by_gameId_and_nicknameKey", q => q.eq("gameId", r.live!.gameId).eq("nicknameKey", nicknameKey(r.live!.nickname))).first();
        if (player) liveAnswers = await ctx.db.query("liveAnswers").withIndex("by_playerId_and_questionIndex", q => q.eq("playerId", player._id)).take(MAX_LIVE_QUESTIONS);
      }
      // Live question indexes follow only the eligible choice questions, not every form field.
      const liveKeys = questionsFromForm(def).questions.map(q => q.key);
      for (const result of grade.questions) {
        if (r.live && !liveKeys.includes(result.fieldId)) continue;
        const f = def.fields.find(f => f.id === result.fieldId)!;
        const q: QualityQuestion = { id: `${r.version}:${f.id}`, text: f.label, kind: f.type,
          options: f.options?.map(o => o.label) ?? [], answerKey: f.options?.filter(o => f.quiz?.correctOptionIds.includes(o.id)).map(o => o.label) ?? [], points: result.possible, timeLimit: null };
        const variant = variants.get(q.id) ?? { question: q, observations: [] };
        const a = liveAnswers.find(a => a.questionIndex === liveKeys.indexOf(f.id));
        const chosen = answers[f.id];
        const labels = (Array.isArray(chosen) ? chosen : [chosen]).filter((id): id is string => typeof id === "string").map(id => f.options?.find(o => o.id === id)?.label ?? "");
        variant.observations.push({ correct: result.earned === result.possible, seconds: a ? a.timeTakenMs/1000 : null,
          cohortScore: grade.maxScore > 0 ? grade.score/grade.maxScore : 0, wrongChoice: labels.filter(Boolean).join(", ") || null, review: a?.reviewFlag === "too_fast" });
        variants.set(q.id, variant);
      }
    }
    return { sampleCount: sample.length, capped: responses.length > 200, missingSnapshots, pooled: false,
      questions: [...variants.values()].map(v => questionQuality(v.question, v.observations)),
      versions: editions.map(e => ({ key: String(e.version), at: e.publishedAt, attempts: sample.filter(r => r.version === e.version).length,
        questions: e.definition.fields.filter(f => f.quiz?.correctOptionIds.length).map(f => ({ id: f.id, text: f.label, kind: f.type, options: f.options?.map(o => o.label) ?? [], answerKey: f.options?.filter(o => f.quiz!.correctOptionIds.includes(o.id)).map(o => o.label) ?? [], points: f.quiz!.points, timeLimit: null })) })) };
  },
});
