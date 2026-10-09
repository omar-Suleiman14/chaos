import { recordStudent } from "./studentRoster";
import { getAuthIdentity } from "./authIdentity";

import { homeworkUploadAccess } from "./homeworkUploadAccess";
import { hasPro } from "./authz";
import { planLimits } from "../lib/planCatalog";
import { v } from "convex/values";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  aggregateDelta, checkAnswers, searchTextFor, selectEnding,
} from "./formLogic";
import type { Aggregates, Answers, FormDefinition } from "./formLogic";
import { answersValidator, languageValidator } from "./formModel";
import { scheduleState } from "./formSchedule";
import { UNLOCK_WINDOW_MS, unlockBudgets } from "./accessCodeBudget";
import { assertRateAvailable, consumeRate, notify, randomCode, randomHex, sha256Hex } from "./serverUtils";
import { ruleHolds, visibleFieldIds } from "./formLogic";
import { gradeQuiz, publicQuizDefinition, quizReview } from "./formQuiz";
import { emitWebhookEvent, formResponseData } from "./webhookEvents";
import { releasedDefinition, releasedFieldIds, nextFieldReleaseAt, releasedAnswers, assertReleasedAnswers } from "./formRelease";
import { captureHidden, captureTypedHidden } from "./formRespondent";
import { teamOrEmailCheck } from "./businessAccess";
import { changeFormCounts, readFormCounts } from "./formCounts";

const quizReviewValidator = v.union(v.null(), v.array(v.object({ fieldId: v.string(), earned: v.number(), possible: v.number(), correctOptionIds: v.array(v.string()), explanation: v.optional(v.string()) })));

export const DEFAULT_FORM_RESPONSE_LIMIT = planLimits.free.responsesPerForm;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const UPLOAD_PATH = "/forms/upload";
const RESUME_TTL_MS =30 * 24 * 60 * 60 * 1000;
/** Submissions faster than this are flagged for spam review, never discarded. */
const MIN_HUMAN_MS = 2500;

type Ctx = QueryCtx | MutationCtx;

/** JSON with object keys sorted, so stored answers (whose key order the database does not keep) compare equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function formByShareId(ctx: Ctx, shareId: string) {
  return await ctx.db.query("forms").withIndex("by_shareId", (q) => q.eq("shareId", shareId)).unique();
}

async function currentVersion(ctx: Ctx, form: Doc<"forms">) {
  if (form.publishedVersion === undefined) return null;
  return await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!))
    .unique();
}

/** Response cap: per-form setting, else the platform limit unless the owner is elevated. */
export async function responseCap(ctx: Ctx, form: Doc<"forms">, now?: number): Promise<number | null> {
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", form.ownerId)).first();
  const config = await ctx.db.query("globalConfig").first();
  const platform = hasPro(owner, now) ? planLimits.pro.responsesPerForm : config?.formResponseLimit ?? DEFAULT_FORM_RESPONSE_LIMIT;
  const own = form.settings.responseLimit ?? null;
  if (platform === null) return own;
  return own === null ? platform : Math.min(own, platform);
}

async function ownerOf(ctx: Ctx, form: Doc<"forms">) {
  return await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", form.ownerId)).first();
}

export async function ownerBanned(ctx: Ctx, form: Doc<"forms">) {
  const owner = await ownerOf(ctx, form);
  return !!(form.isBanned || owner?.isBanned || owner?.suspendedUntil);
}

/** Access passes: "grant_" + random hex, valid for one form for 12 hours. */
const GRANT_PREFIX = "grant_";
const GRANT_TTL_MS = 12 * 3_600_000;

/**
 * True when `grant` is a live pass for this form. Raw codes are never accepted here:
 * a query cannot count failures, so codes are only checked by `unlockForm`.
 */
async function accessCodeMatches(ctx: QueryCtx | MutationCtx, form: Doc<"forms">, grant: string | undefined) {
  if (!form.settings.accessCodeHash || !grant?.startsWith(GRANT_PREFIX)) return false;
  const tokenHash = await sha256Hex(grant);
  const pass = await ctx.db.query("formAccessGrants").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
  return !!pass && pass.formId === form._id && pass.accessCodeHash === form.settings.accessCodeHash && pass.expiresAt > Date.now();
}

export const getPublicForm = query({
  args: { shareId: v.string(), accessCode: v.optional(v.string()), editToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const form = await formByShareId(ctx, args.shareId);
    if (!form || form.status === "draft" || form.status === "archived" || (await ownerBanned(ctx, form))) {
      return { state: "unavailable" as const };
    }
    const version = await currentVersion(ctx, form);
    if (!version) return { state: "unavailable" as const };
    const def = version.definition;
    const schedule = { opensAt: form.settings.opensAt ?? null, closesAt: form.settings.closesAt ?? null, timezone: form.settings.timezone ?? null };
    // Branding is hidden only while the owner still has Pro; a lapsed plan brings it back.
    const hideBranding = !!form.settings.hideBranding && hasPro(await ownerOf(ctx, form), Date.now());
    const base = { title: def.title, translations: def.translations, defaultLanguage: def.defaultLanguage, languages: def.languages, theme: def.theme, allowIndexing: form.settings.allowIndexing, hideBranding };
    // A valid edit link may keep working after closing when the creator allowed it; new responses stay blocked.
    const editingClosed = !!args.editToken && form.settings.allowEditAfterSubmit && !!form.settings.allowEditAfterClose && !!(await responseForEditToken(ctx, form, args.editToken));
    const now = Date.now();
    const when = scheduleState(form.settings, now);
    if (!editingClosed) {
      if (form.status === "closed") return { state: "closed" as const, ...base, message: form.settings.closedMessage ?? null, ...schedule, reason: "manual" as const };
      if (when === "not_open") return { state: "not_open" as const, ...base, message: form.settings.closedMessage ?? null, ...schedule };
      if (when === "closed") return { state: "closed" as const, ...base, message: form.settings.closedMessage ?? null, ...schedule, reason: "scheduled" as const };
    }
    const cap = await responseCap(ctx, form);
    if (!editingClosed && cap !== null && (await readFormCounts(ctx, form)).responseCount >= cap) return { state: "full" as const, ...base, message: form.settings.closedMessage ?? null };
    const identity = await getAuthIdentity(ctx);
    if (form.settings.access === "signed_in" && !identity) return { state: "sign_in" as const, ...base };
    if (form.settings.access === "signed_in") {
      const check = await teamOrEmailCheck(ctx, form.settings, identity);
      // The allow-list stays private; the respondent only learns which account they used.
      if (check !== "ok") return { state: "restricted" as const, ...base, reason: check, email: identity?.email ?? null };
    }
    if (form.settings.access === "code" && !(await accessCodeMatches(ctx, form, args.accessCode))) {
      return { state: "code" as const, ...base, invalidCode: !!args.accessCode };
    }
    let alreadyResponded = false;
    if (identity && form.settings.onePerPerson) {
      const prior = await ctx.db
        .query("formResponses")
        .withIndex("by_formId_and_respondentId_and_status", (q) => q.eq("formId", form._id).eq("respondentId", identity.subject).eq("status", "completed"))
        .first();
      alreadyResponded = !!prior;
    }
    return {
      state: "open" as const,
      ...base,
      shareId: form.shareId,
      version: version.version,
      definition: publicQuizDefinition(releasedDefinition(def as FormDefinition, now)),
      nextFieldReleaseAt: nextFieldReleaseAt(def as FormDefinition, now),
      serverTime: now,
      ...schedule,
      allowEditAfterClose: !!form.settings.allowEditAfterClose,
      closedMessage: form.settings.closedMessage ?? null,
      collectPartial: form.settings.collectPartial,
      allowResumeLink: form.settings.allowResumeLink,
      allowEditAfterSubmit: form.settings.allowEditAfterSubmit,
      showReceipt: form.settings.showReceipt,
      hiddenFields: [...(form.settings.hiddenFields ?? []), ...(form.settings.hiddenParameters ?? []).map(d => d.name)],
      signedIn: !!identity,
      // Anonymous/code forms deliberately do not link answers to an account.
      responseIdentityLinked: form.settings.access === "signed_in",
      alreadyResponded,
    };
  },
});

async function responseForEditToken(ctx: Ctx, form: Doc<"forms">, editToken: string) {
  if (!/^[a-f0-9]{32,128}$/.test(editToken)) return null;
  const tokenHash = await sha256Hex(editToken);
  const response = await ctx.db
    .query("formResponses")
    .withIndex("by_formId_and_editTokenHash", (q) => q.eq("formId", form._id).eq("editTokenHash", tokenHash))
    .unique();
  return response && response.status === "completed" ? response : null;
}

/**
 * Collection rules, always evaluated on the server in UTC. `edit` marks a
 * respondent changing an earlier submission: the closing time, a manual close
 * and the opening time only stop that when the creator did not allow editing
 * after closing (`allowEditAfterClose`).
 */
/**
 * Checks an access code and hands back a 12-hour pass for the form. A wrong code returns normally
 * (so its count is kept) and spends the requester's budgets; once a budget is spent the requester
 * gets RATE_LIMITED until the window ends, before the code is checked, so a locked guesser learns
 * nothing.
 */
export const unlockForm = mutation({
  args: { shareId: v.string(), code: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), grant: v.string() }), v.object({ ok: v.literal(false) })),
  handler: async (ctx, args) => {
    const form = await formByShareId(ctx, args.shareId);
    if (!form || form.settings.access !== "code" || !form.settings.accessCodeHash) return { ok: false as const };
    const identity = await getAuthIdentity(ctx);
    const budgets = await unlockBudgets(form._id, form.settings.accessCodeHash, identity?.subject ?? null);
    for (const { key, limit } of budgets) await assertRateAvailable(ctx, key, limit, UNLOCK_WINDOW_MS);
    const code = args.code.trim().slice(0, 100);
    if (!code || (await sha256Hex(`${form._id}:${code}`)) !== form.settings.accessCodeHash) {
      for (const { key, limit } of budgets) await consumeRate(ctx, key, limit, UNLOCK_WINDOW_MS);
      return { ok: false as const };
    }
    const grant = `${GRANT_PREFIX}${randomHex(32)}`;
    await ctx.db.insert("formAccessGrants", { formId: form._id, tokenHash: await sha256Hex(grant), accessCodeHash: form.settings.accessCodeHash, expiresAt: Date.now() + GRANT_TTL_MS });
    return { ok: true as const, grant };
  },
});

async function assertCanCollect(ctx: MutationCtx, form: Doc<"forms"> | null, accessCode: string | undefined, options: { edit?: boolean } = {}) {
  if (!form || form.status === "draft" || form.status === "archived" || (await ownerBanned(ctx, form))) {
    throw new Error("FORM_UNAVAILABLE: This form is not available.");
  }
  const skipClosing = !!options.edit && !!form.settings.allowEditAfterClose;
  if (form.status === "closed" && !skipClosing) throw new Error("FORM_CLOSED: This form is no longer accepting responses.");
  const when = scheduleState(form.settings, Date.now());
  if (when === "not_open" && !skipClosing) throw new Error("FORM_NOT_OPEN: This form is not open yet.");
  if (when === "closed" && !skipClosing) throw new Error("FORM_CLOSED: This form closed and is no longer accepting responses.");
  const identity = await getAuthIdentity(ctx);
  if (form.settings.access === "signed_in" && !identity) throw new Error("SIGN_IN_REQUIRED: Sign in to respond to this form.");
  if (form.settings.access === "signed_in") {
    const check = await teamOrEmailCheck(ctx, form.settings, identity);
    if (check === "unverified") throw new Error("EMAIL_UNVERIFIED: Sign in with a verified email address to respond to this form.");
    if (check === "not_allowed") throw new Error(form.settings.audienceTeamId ? "TEAM_ONLY: Only members of this team can respond." : "EMAIL_NOT_ALLOWED: This form only accepts responses from certain email addresses.");
  }
  if (form.settings.access === "code" && !(await accessCodeMatches(ctx, form, accessCode))) throw new Error("ACCESS_CODE_REQUIRED: Enter the access code for this form.");
  return { form, identity };
}

async function resolveUploads(ctx: MutationCtx, formId: Id<"forms">, answers: Answers, def: FormDefinition, responseId?: Id<"formResponses">) {
  const ids = new Set<string>();
  const docs: Doc<"formUploads">[] = [];
  for (const f of def.fields) {
    if (f.type !== "file") continue;
    const value = answers[f.id];
    if (!Array.isArray(value)) continue;
    for (const raw of value) {
      const id = ctx.db.normalizeId("formUploads", raw);
      const upload = id ? await ctx.db.get("formUploads", id) : null;
      if (upload && !upload.homeworkAttemptId && upload.formId === formId && upload.fieldId === f.id && (!upload.responseId || upload.responseId === responseId)) {
        ids.add(raw);
        docs.push(upload);
      }
    }
  }
  return { ids, docs };
}

async function adjustAggregates(ctx: MutationCtx, formId: Id<"forms">, def: FormDefinition, answers: Answers, sign: 1 | -1, durationMs?: number) {
  const agg = await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", formId)).unique();
  const counts = aggregateDelta(def, answers, sign, (agg?.counts ?? {}) as Aggregates);
  const timed = durationMs !== undefined ? 1 : 0;
  if (agg) {
    await ctx.db.patch("formAggregates", agg._id, {
      counts,
      totalDurationMs: Math.max(0, agg.totalDurationMs + sign * (durationMs ?? 0)),
      timedCount: Math.max(0, agg.timedCount + sign * timed),
    });
  } else {
    await ctx.db.insert("formAggregates", { formId, counts, totalDurationMs: Math.max(0, durationMs ?? 0), timedCount: timed });
  }
}

/** Counters and aggregates for a completed, non-spam response entering or leaving the totals. */
export async function countResponse(ctx: MutationCtx, form: Doc<"forms">, response: Doc<"formResponses">, def: FormDefinition, sign: 1 | -1) {
  await adjustAggregates(ctx, form._id, def, response.answers as Answers, sign, response.durationMs);
  await changeFormCounts(ctx, form, { responses: sign, ...(sign === 1 ? { lastResponseAt: Date.now() } : {}) });
}

export async function definitionForResponse(ctx: Ctx, response: Doc<"formResponses">): Promise<FormDefinition | null> {
  const version = await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_version", (q) => q.eq("formId", response.formId).eq("version", response.version))
    .unique();
  return (version?.definition as FormDefinition) ?? null;
}

function validationFailure(errors: Record<string, string>): never {
  throw new Error("VALIDATION_FAILED: " + JSON.stringify(errors));
}

async function afterCompletion(ctx: MutationCtx, form: Doc<"forms">, response: Doc<"formResponses">, def: FormDefinition) {
  const cap = await responseCap(ctx, form, Date.now());
  // countResponse ran first, so this already includes the new response.
  const count = (await readFormCounts(ctx, form)).responseCount;
  if (form.settings.notifyOnResponse) {
    await notify(ctx, form.ownerId, "response", `New response to “${form.title}” (${count} total).`, `response:${response._id}`, form._id);
  }
  const visible = visibleFieldIds(def, response.answers as Answers);
  for (const rule of form.settings.notifyRules ?? []) {
    if (ruleHolds(rule.rule, response.answers as Answers, visible, def)) {
      await notify(ctx, form.ownerId, "rule", `“${form.title}”: ${rule.message}`, `rule:${rule.id}:${response._id}`, form._id);
    }
  }
  if (cap !== null) {
    if (count >= cap) await notify(ctx, form.ownerId, "limit", `“${form.title}” reached its limit of ${cap} responses and stopped collecting. No submissions were discarded.`, `limit:${form._id}:${cap}:full`, form._id);
    else if (count >= Math.ceil(cap * 0.8)) await notify(ctx, form.ownerId, "limit", `“${form.title}” has used ${count} of ${cap} responses. Collection stops at the limit.`, `limit:${form._id}:${cap}:warn`, form._id);
  }
}

export const submitResponse = mutation({
  args: {
    shareId: v.string(),
    submissionKey: v.string(),
    answers: answersValidator,
    language: languageValidator,
    /** true = final submission; false = save partial progress (only when the form collects partials). */
    final: v.boolean(),
    startedAt: v.optional(v.number()),
    accessCode: v.optional(v.string()),
    /** Client-generated secret for edit-after-submit; only its hash is stored. */
    editToken: v.optional(v.string()),
    resumeToken: v.optional(v.string()),
    lastFieldId: v.optional(v.string()),
    honeypot: v.optional(v.string()),
    /** Hidden-field values read from the link; undeclared names are dropped on the server. */
    hidden: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.object({
    responseId: v.id("formResponses"),
    status: v.union(v.literal("completed"), v.literal("partial")),
    receiptCode: v.string(),
    endingId: v.union(v.string(), v.null()),
    duplicate: v.boolean(),
    quizScore: v.union(v.number(), v.null()),
    quizMaxScore: v.union(v.number(), v.null()),
    /** Final quiz submissions: each graded question with its key, for the respondent's own review. */
    quizReview: v.optional(quizReviewValidator),
  }),
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9-]{8,100}$/.test(args.submissionKey)) throw new Error("INVALID_SUBMISSION: Missing submission key.");
    if (args.editToken !== undefined && !/^[a-f0-9]{32,128}$/.test(args.editToken)) throw new Error("INVALID_SUBMISSION: Invalid edit token.");
    if (JSON.stringify(args.answers).length > 400_000) throw new Error("PAYLOAD_TOO_LARGE: These answers are too large.");
    if (args.hidden && JSON.stringify(args.hidden).length > 50_000) throw new Error("PAYLOAD_TOO_LARGE: These link parameters are too large.");
    const form = await formByShareId(ctx, args.shareId);
    if (!form) throw new Error("FORM_UNAVAILABLE: This form is not available.");

    const existing = await ctx.db
      .query("formResponses")
      .withIndex("by_formId_and_submissionKey", (q) => q.eq("formId", form._id).eq("submissionKey", args.submissionKey))
      .unique();
    // Account-bound submissions require the same account even on retries.
    // Anonymous submissions continue to use their private submission key.
    if (existing?.respondentId) {
      const identity = await getAuthIdentity(ctx);
      if (identity?.subject !== existing.respondentId) throw new Error("SUBMISSION_UNAUTHORIZED: This submission belongs to another respondent.");
    }
    // Idempotent retry: a completed submission is returned unchanged, so a
    // lost confirmation never creates a second response.
    if (existing && existing.status === "completed") {
      const done = await definitionForResponse(ctx, existing);
      const review = done ? quizReview(done, gradeQuiz(done, existing.answers as Answers)) : null;
      return { responseId: existing._id, status: existing.status, receiptCode: existing.receiptCode, endingId: existing.endingId ?? null, duplicate: true, quizScore: existing.quizScore ?? null, quizMaxScore: existing.quizMaxScore ?? null, quizReview: review };
    }

    const { identity } = await assertCanCollect(ctx, form, args.accessCode);
    if (!args.final && !form.settings.collectPartial) throw new Error("PARTIAL_DISABLED: This form does not store unfinished answers.");
    const respondentKey = identity?.subject ?? (args.submissionKey ? (await sha256Hex(args.submissionKey)).slice(0, 16) : "anon");
    await consumeRate(ctx, `${args.final ? "submit" : "partial"}:${form._id}`, args.final ? 120 : 600, 60_000);
    await consumeRate(ctx, `${args.final ? "submit" : "partial"}:${form._id}:${respondentKey}`, args.final ? 15 : 45, 60_000);

    if (!args.final && !existing) {
      const partials = await ctx.db
        .query("formResponses")
        .withIndex("by_formId_and_status_and_submittedAt", (q) => q.eq("formId", form._id).eq("status", "partial"))
        .take(500);
      if (partials.length >= 500) throw new Error("FORM_FULL: Maximum unfinished responses reached for this form.");
    }

    const version = existing
      ? await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", existing.version)).unique()
      : await currentVersion(ctx, form);
    if (!version) throw new Error("FORM_UNAVAILABLE: This form is not available.");
    assertReleasedAnswers(version.definition as FormDefinition, args.answers, Date.now());
    const def = releasedDefinition(version.definition as FormDefinition, Date.now());

    if (args.final) {
      const cap = await responseCap(ctx, form, Date.now());
      if (cap !== null && (await readFormCounts(ctx, form)).responseCount >= cap) throw new Error("FORM_FULL: This form has reached its response limit. Your answers were not submitted; the organiser has been told the form is full.");
    }
    if (identity && form.settings.onePerPerson && args.final) {
      const prior = await ctx.db
        .query("formResponses")
        .withIndex("by_formId_and_respondentId_and_status", (q) => q.eq("formId", form._id).eq("respondentId", identity.subject).eq("status", "completed"))
        .first();
      if (prior) throw new Error("ALREADY_RESPONDED: You have already responded to this form.");
    }

    const uploads = await resolveUploads(ctx, form._id, args.answers, def, existing?._id);
    const checked = checkAnswers(def, args.answers, { partial: !args.final, fileIds: uploads.ids });
    if (Object.keys(checked.errors).length) validationFailure(checked.errors);

    const now = Date.now();
    const startedAt = args.startedAt !== undefined && args.startedAt <= now && args.startedAt > now - 7 * 86_400_000 ? args.startedAt : undefined;
    const durationMs = args.final && startedAt !== undefined ? now - startedAt : undefined;
    const spam = !!args.honeypot?.trim() || (args.final && durationMs !== undefined && durationMs < MIN_HUMAN_MS);
    const status = args.final ? ("completed" as const) : ("partial" as const);
    const ending = args.final ? selectEnding(def, checked.answers) : null;
    const grade = args.final ? gradeQuiz(def, checked.answers) : null;
    const record = {
      answers: checked.answers,
      language: args.language,
      status,
      updatedAt: now,
      submittedAt: now,
      durationMs,
      endingId: ending?.id,
      lastFieldId: args.lastFieldId?.slice(0, 80),
      searchText: searchTextFor(def, checked.answers),
      spam,
      editTokenHash: args.editToken ? await sha256Hex(args.editToken) : existing?.editTokenHash,
      quizScore: grade?.score,
      quizMaxScore: grade?.maxScore,
      // Stored beside answers, so a parameter named like a question never replaces its answer.
      hidden: captureHidden(form.settings.hiddenFields, args.hidden) ?? existing?.hidden,
      typedHidden: captureTypedHidden(form.settings.hiddenParameters, args.hidden ?? (existing?.typedHidden ? Object.fromEntries(Object.entries(existing.typedHidden).map(([k, value]) => [k, String(value)])) : undefined), !args.final) ?? existing?.typedHidden,
    };

    let responseId: Id<"formResponses">;
    let receiptCode: string;
    if (existing) {
      await ctx.db.patch("formResponses", existing._id, record);
      responseId = existing._id;
      receiptCode = existing.receiptCode;
      if (args.final) await changeFormCounts(ctx, form, { partials: -1 });
    } else {
      receiptCode = randomCode(8).toUpperCase();
      responseId = await ctx.db.insert("formResponses", {
        ...record,
        formId: form._id,
        version: version.version,
        submissionKey: args.submissionKey,
        // Only forms that require sign-in link an answer to an account. A signed-in person answering
        // a public or access-code form stays anonymous to the creator, as the privacy policy says.
        respondentId: form.settings.access === "signed_in" ? identity?.subject : undefined,
        receiptCode,
        startedAt: startedAt ?? now,
        reviewed: false,
        tags: [],
      });
      if (!args.final) await changeFormCounts(ctx, form, { partials: 1 });
    }
    for (const upload of uploads.docs) if (!upload.responseId) await ctx.db.patch("formUploads", upload._id, { responseId });

    if (args.final) {
      const response = (await ctx.db.get("formResponses", responseId))!;
      if (!spam) {
        await recordStudent(ctx, { authorId: form.ownerId, studentId: response.respondentId, guestKey: String(responseId), context: form.title });
        await countResponse(ctx, form, response, def, 1);
        await afterCompletion(ctx, form, response, def);
        await emitWebhookEvent(ctx, form.ownerId, "response.completed", `form_${form._id}`, () => formResponseData(form, response, def));
      }
      if (args.resumeToken) {
        const hash = await sha256Hex(args.resumeToken);
        const resume = await ctx.db.query("formResumeDrafts").withIndex("by_formId_and_tokenHash", (q) => q.eq("formId", form._id).eq("tokenHash", hash)).unique();
        if (resume) await ctx.db.delete("formResumeDrafts", resume._id);
      }
    }
    return { responseId, status, receiptCode, endingId: ending?.id ?? null, duplicate: false, quizScore: grade?.score ?? null, quizMaxScore: grade?.maxScore ?? null, quizReview: quizReview(def, grade) };
  },
});

/** Edit-after-submit: the respondent proves ownership with their private edit token. */
export const getSubmissionForEdit = query({
  args: { shareId: v.string(), editToken: v.string() },
  handler: async (ctx, args) => {
    const form = await formByShareId(ctx, args.shareId);
    if (!form || !form.settings.allowEditAfterSubmit || form.status === "draft" || form.status === "archived" || (await ownerBanned(ctx, form))) return null;
    if (!form.settings.allowEditAfterClose && (form.status !== "live" || scheduleState(form.settings, Date.now()) !== "open")) return null;
    const response = await responseForEditToken(ctx, form, args.editToken);
    if (!response) return null;
    const def = await definitionForResponse(ctx, response);
    if (!def) return null;
    return { answers: releasedAnswers(def, response.answers as Answers, Date.now()), language: response.language, definition: publicQuizDefinition(releasedDefinition(def, Date.now())), receiptCode: response.receiptCode, submittedAt: response.submittedAt, editCount: response.editCount ?? 0 };
  },
});

export const updateSubmission = mutation({
  args: { shareId: v.string(), editToken: v.string(), answers: answersValidator, language: languageValidator, accessCode: v.optional(v.string()) },
  returns: v.object({ receiptCode: v.string(), endingId: v.union(v.string(), v.null()), quizScore: v.union(v.number(), v.null()), quizMaxScore: v.union(v.number(), v.null()), quizReview: v.optional(quizReviewValidator) }),
  handler: async (ctx, args) => {
    const form = await formByShareId(ctx, args.shareId);
    if (!form?.settings.allowEditAfterSubmit) throw new Error("EDIT_DISABLED: This form does not allow editing responses.");
    await assertCanCollect(ctx, form, args.accessCode, { edit: true });
    await consumeRate(ctx, `edit:${form._id}`, 120, 60_000);
    const response = await responseForEditToken(ctx, form, args.editToken);
    if (!response) throw new Error("RESPONSE_NOT_FOUND: This edit link is no longer valid.");
    const def = await definitionForResponse(ctx, response);
    if (!def) throw new Error("RESPONSE_NOT_FOUND: This edit link is no longer valid.");
    const uploads = await resolveUploads(ctx, form._id, args.answers, def, response._id);
    assertReleasedAnswers(def, args.answers, Date.now());
    const available = releasedDefinition(def, Date.now());
    const checked = checkAnswers(available, args.answers, { fileIds: uploads.ids });
    if (Object.keys(checked.errors).length) validationFailure(checked.errors);
    const ending = selectEnding(available, checked.answers);
    const grade = gradeQuiz(available, checked.answers);
    // An unchanged resubmission is not an edit: no history entry, no notification.
    if (args.language === response.language && stableJson(checked.answers) === stableJson(response.answers)) {
      return { receiptCode: response.receiptCode, endingId: ending?.id ?? null, quizScore: grade?.score ?? null, quizMaxScore: grade?.maxScore ?? null, quizReview: quizReview(available, grade) };
    }
    if (!response.spam) await adjustAggregates(ctx, form._id, def, response.answers as Answers, -1);
    const now = Date.now();
    const revision = (response.editCount ?? 0) + 1;
    // Keep what this edit replaces. The response row holds the latest version; revisions are append-only.
    await ctx.db.insert("formResponseRevisions", {
      formId: form._id, responseId: response._id, revision,
      answers: response.answers, language: response.language, endingId: response.endingId,
      quizScore: response.quizScore, quizMaxScore: response.quizMaxScore,
      savedAt: response.updatedAt, replacedAt: now,
    });
    await ctx.db.patch("formResponses", response._id, { answers: checked.answers, language: args.language, updatedAt: now, editCount: revision, editedAt: now, endingId: ending?.id, searchText: searchTextFor(def, checked.answers), reviewed: false, quizScore: grade?.score, quizMaxScore: grade?.maxScore });
    if (!response.spam) await adjustAggregates(ctx, form._id, def, checked.answers, 1);
    for (const upload of uploads.docs) if (!upload.responseId) await ctx.db.patch("formUploads", upload._id, { responseId: response._id });
    await notify(ctx, form.ownerId, "response", `A respondent edited their response to “${form.title}”.`, `edit:${response._id}:${Date.now() - (Date.now() % 3_600_000)}`, form._id);
    return { receiptCode: response.receiptCode, endingId: ending?.id ?? null, quizScore: grade?.score ?? null, quizMaxScore: grade?.maxScore ?? null, quizReview: quizReview(available, grade) };
  },
});

// ── Private resume links (not visible to the creator) ───────────────────────

export const saveResumeDraft = mutation({
  args: { shareId: v.string(), token: v.string(), answers: answersValidator, language: languageValidator, accessCode: v.optional(v.string()) },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{32,128}$/.test(args.token)) throw new Error("INVALID_TOKEN: Invalid resume token.");
    const form = await formByShareId(ctx, args.shareId);
    const { form: live } = await assertCanCollect(ctx, form, args.accessCode);
    const tokenHash = await sha256Hex(args.token);
    await consumeRate(ctx, `resume:${live._id}`, 300, 60_000);
    await consumeRate(ctx, `resume:${live._id}:${tokenHash.slice(0, 16)}`, 15, 60_000);
    const version = await currentVersion(ctx, live);
    if (!version) throw new Error("FORM_UNAVAILABLE: This form is not available.");
    // Keep only well-formed answers; files are never stored in resume copies.
    assertReleasedAnswers(version.definition as FormDefinition, args.answers, Date.now());
    const def = releasedDefinition(version.definition as FormDefinition, Date.now());
    const checked = checkAnswers(def, args.answers, { partial: true, fileIds: new Set() });
    if (JSON.stringify(checked.answers).length > 400_000) throw new Error("PAYLOAD_TOO_LARGE: These answers are too large.");
    const expiresAt = Date.now() + RESUME_TTL_MS;
    const existing = await ctx.db.query("formResumeDrafts").withIndex("by_formId_and_tokenHash", (q) => q.eq("formId", live._id).eq("tokenHash", tokenHash)).unique();
    if (!existing) {
      const activeDrafts = await ctx.db.query("formResumeDrafts").withIndex("by_formId_and_tokenHash", (q) => q.eq("formId", live._id)).take(500);
      if (activeDrafts.length >= 500) throw new Error("CAP_REACHED: Resume drafts limit reached for this form.");
    }
    const record = { answers: checked.answers, language: args.language, version: version.version, expiresAt, updatedAt: Date.now() };
    const draftId = existing?._id ?? await ctx.db.insert("formResumeDrafts", { formId: live._id, tokenHash, ...record });
    if (existing) await ctx.db.patch("formResumeDrafts", draftId, record);
    // Refreshes extend the same link; an older expiry job must not erase the refreshed copy.
    if (!existing) await ctx.scheduler.runAt(expiresAt, internal.respond.expireResumeDraft, { draftId });
    return { expiresAt };
  },
});

export const getResumeDraft = query({
  args: { shareId: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const form = await formByShareId(ctx, args.shareId);
    if (!form || !/^[a-f0-9]{32,128}$/.test(args.token)) return null;
    const tokenHash = await sha256Hex(args.token);
    const draft = await ctx.db
      .query("formResumeDrafts")
      .withIndex("by_formId_and_tokenHash", (q) => q.eq("formId", form._id).eq("tokenHash", tokenHash))
      .unique();
    if (!draft || draft.expiresAt <= Date.now()) return null;
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", draft.version)).unique();
    if (!version) return null;
    return { answers: releasedAnswers(version.definition as FormDefinition, draft.answers as Answers, Date.now()), language: draft.language, version: draft.version, updatedAt: draft.updatedAt, expiresAt: draft.expiresAt };
  },
});

/** Deletes at the expiry boundary, invalidating subscriptions without waiting for the cron. */
export const expireResumeDraft = internalMutation({
  args: { draftId: v.id("formResumeDrafts") },
  returns: v.null(),
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get("formResumeDrafts", draftId);
    if (!draft) return null;
    if (draft.expiresAt <= Date.now()) await ctx.db.delete("formResumeDrafts", draftId);
    else await ctx.scheduler.runAt(draft.expiresAt, internal.respond.expireResumeDraft, { draftId });
    return null;
  },
});

// ── Controlled uploads ──────────────────────────────────────────────────────

async function fileFieldFor(ctx: MutationCtx, shareId: string, fieldId: string, accessCode: string | undefined) {
  const form = await formByShareId(ctx, shareId);
  const { form: live } = await assertCanCollect(ctx, form, accessCode);
  const version = await currentVersion(ctx, live);
  const field = version?.definition.fields.find((f) => f.id === fieldId && f.type === "file");
  if (version && !releasedFieldIds(version.definition as FormDefinition, Date.now()).has(fieldId)) throw new Error("FIELD_NOT_RELEASED: This question is not available yet.");
  if (!field) throw new Error("INVALID_FIELD: This question does not accept files.");
  return live;
}

const UPLOAD_TICKET_MS = 10 * 60_000;
const uploadResult = v.object({ uploadId: v.id("formUploads"), name: v.string(), size: v.number() });

/**
 * Issues a single-use upload URL on the controlled HTTP endpoint. Files never go to a
 * raw storage URL, so every stored respondent file has a matching formUploads row.
 */
export const generateUploadUrl = mutation({
  args: { shareId: v.string(), fieldId: v.string(), accessCode: v.optional(v.string()), clientToken: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const form = await fileFieldFor(ctx, args.shareId, args.fieldId, args.accessCode);
    const identity = await getAuthIdentity(ctx);
    const uploaderKey = identity?.subject ?? (args.clientToken ? (await sha256Hex(args.clientToken)).slice(0, 16) : "anon");
    await consumeRate(ctx, `upload:${form._id}`, 300, 60_000);
    await consumeRate(ctx, `upload:${form._id}:${uploaderKey}`, 100, 60_000);
    const token = randomHex(24);
    await ctx.db.insert("formUploadTickets", {
      formId: form._id, fieldId: args.fieldId, uploadKey: randomHex(12),
      tokenHash: await sha256Hex(token), expiresAt: Date.now() + UPLOAD_TICKET_MS,
    });
    return `${env.CONVEX_SITE_URL}${UPLOAD_PATH}?ticket=${token}`;
  },
});

async function liveTicket(ctx: Ctx, token: string, now: number) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const ticket = await ctx.db.query("formUploadTickets").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
  if (!Number.isFinite(now) || !ticket || ticket.expiresAt <= now) return null;
  if (ticket.homeworkAttemptId) {
    try {
      const { form, version } = await homeworkUploadAccess(ctx, ticket.homeworkAttemptId, now);
      if (form._id !== ticket.formId || !releasedDefinition(version.definition, now).fields.some(f => f.id === ticket.fieldId && f.type === "file")) return null;
      return ticket;
    } catch { return null; }
  }
  const form = await ctx.db.get("forms", ticket.formId);
  if (!form || form.status !== "live" || await ownerBanned(ctx, form) || scheduleState(form.settings, now) !== "open") return null;
  const version = await currentVersion(ctx, form);
  if (!version?.definition.fields.some((field) => field.id === ticket.fieldId && field.type === "file")) return null;
  if (!releasedFieldIds(version.definition as FormDefinition, Date.now()).has(ticket.fieldId)) return null;
  return ticket;
}

/** Validates the upload before the endpoint reads or stores the body. */
export const checkUploadTicket = internalQuery({
  args: { token: v.string(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { token, now }) => (await liveTicket(ctx, token, now)) !== null,
});

/** Consumes the ticket and records a file the endpoint itself stored. */
/* oxlint-disable eslint/no-control-regex -- Control characters are deliberately matched to sanitise untrusted text and URLs. */
export const recordUpload = internalMutation({
  args: { token: v.string(), storageId: v.id("_storage"), name: v.string(), contentType: v.string(), size: v.number() },
  returns: uploadResult,
  handler: async (ctx, args) => {
    const ticket = await liveTicket(ctx, args.token, Date.now());
    if (!ticket) throw new Error("UPLOAD_TICKET_INVALID: This upload link expired. Try again.");
    await ctx.db.delete("formUploadTickets", ticket._id);
    const form = await ctx.db.get("forms", ticket.formId);
    if (!form || form.status === "archived") throw new Error("FORM_UNAVAILABLE: This form is not available.");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size || (metadata.contentType !== undefined && metadata.contentType !== args.contentType) || uploadRejection(args.contentType, args.size)) throw new Error("UPLOAD_INVALID: Invalid stored file");
    const name = args.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || "upload";
    const uploadId = await ctx.db.insert("formUploads", {
      formId: ticket.formId, storageId: args.storageId, uploadKey: ticket.uploadKey, fieldId: ticket.fieldId,
      ...(ticket.homeworkAttemptId ? { homeworkAttemptId: ticket.homeworkAttemptId } : {}),
      name, contentType: args.contentType, size: args.size, createdAt: Date.now(),
    });
    return { uploadId, name, size: args.size };
  },
});
/* oxlint-enable eslint/no-control-regex */

/** Shared limits for the HTTP endpoint. */
export function uploadRejection(contentType: string, size: number): string | null {
  if (size > MAX_UPLOAD_BYTES) return "UPLOAD_TOO_LARGE: Files can be at most 10 MB.";
  if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) return "UPLOAD_MISSING: The file is empty.";
  if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) return "UPLOAD_TYPE: Upload a PDF, image, text, CSV, Word or Excel file.";
  return null;
}
