import { readFormCounts } from "./formCounts";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { gradeQuiz } from "./formQuiz";
import { requireActiveUser } from "./authz";
import { teamOrEmailCheck } from "./businessAccess";
import {
  assertNow,
  DAY,
  PRACTICE_LIMITS,
  practiceReference,
  practiceState,
  summarizeEvidence,
} from "./learnPracticeModel";

type ReadCtx = QueryCtx;

function validateConcepts(conceptIds: Id<"learnConcepts">[]) {
  if (
    !conceptIds.length ||
    conceptIds.length > PRACTICE_LIMITS.concepts ||
    new Set(conceptIds).size !== conceptIds.length
  )
    throw new Error(`Use 1-${PRACTICE_LIMITS.concepts} unique concepts`);
}
export async function recentEvidence(
  ctx: ReadCtx,
  userId: string,
  conceptId: Id<"learnConcepts">,
  now: number,
) {
  return ctx.db
    .query("learnPracticeEvidence")
    .withIndex("by_userId_and_conceptId_and_answeredAt", (q) =>
      q
        .eq("userId", userId)
        .eq("conceptId", conceptId)
        .gte("answeredAt", Math.max(0, now - 30 * DAY))
        .lte("answeredAt", now),
    )
    .order("desc")
    .take(PRACTICE_LIMITS.recentEvidence);
}

/** Additive, idempotent version-specific mapping. Only the form owner may map.
 * Historical published snapshots remain mappable; drafts never are.
 */
export const mapField = mutation({
  args: {
    formId: v.id("forms"),
    version: v.number(),
    fieldId: v.string(),
    conceptId: v.id("learnConcepts"),
  },
  returns: v.id("learnPracticeMappings"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const form = await ctx.db.get("forms", args.formId);
    if (!form || form.ownerId !== identity.subject)
      throw new Error("Form owner required");
    if (!Number.isSafeInteger(args.version) || args.version < 1)
      throw new Error("Invalid published version");
    const version = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) =>
        q.eq("formId", args.formId).eq("version", args.version),
      )
      .unique();
    const field = version?.definition.fields.find((f) => f.id === args.fieldId);
    if (
      !version?.definition.quiz?.enabled ||
      !field?.quiz?.correctOptionIds.length ||
      !Number.isFinite(field.quiz.points) ||
      field.quiz.points <= 0 ||
      !["choice", "dropdown", "multi_choice"].includes(field.type)
    )
      throw new Error("Published graded quiz field required");
    if (!(await ctx.db.get("learnConcepts", args.conceptId)))
      throw new Error("Existing concept required");
    const existing = await ctx.db
      .query("learnPracticeMappings")
      .withIndex("by_formId_and_version_and_fieldId_and_conceptId", (q) =>
        q
          .eq("formId", args.formId)
          .eq("version", args.version)
          .eq("fieldId", args.fieldId)
          .eq("conceptId", args.conceptId),
      )
      .unique();
    if (existing) return existing._id;
    const mappings = await ctx.db
      .query("learnPracticeMappings")
      .withIndex("by_formId_and_version_and_fieldId_and_conceptId", (q) =>
        q.eq("formId", args.formId).eq("version", args.version),
      )
      .take(PRACTICE_LIMITS.mappingsPerVersion);
    if (mappings.length >= PRACTICE_LIMITS.mappingsPerVersion)
      throw new Error("Version mapping limit reached");
    return ctx.db.insert("learnPracticeMappings", {
      ...args,
      ownerId: identity.subject,
    });
  },
});

/** Explicit opt-in ingestion. Re-ingest after a response edit to replace evidence.
 * No scores, correctness, answers, user IDs or legacy quizSession IDs are accepted.
 */
export const ingestResponse = mutation({
  args: { formResponseId: v.id("formResponses") },
  returns: v.object({ evidenceCount: v.number() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const response = await ctx.db.get("formResponses", args.formResponseId);
    if (
      !response ||
      response.respondentId !== identity.subject ||
      response.status !== "completed"
    )
      throw new Error("Own authenticated completed response required");
    const version = await ctx.db
      .query("formVersions")
      .withIndex("by_formId_and_version", (q) =>
        q.eq("formId", response.formId).eq("version", response.version),
      )
      .unique();
    if (!version) throw new Error("Matching immutable form version required");
    const grade = gradeQuiz(version.definition, response.answers);
    if (!grade) throw new Error("Published quiz response required");
    const mappings = await ctx.db
      .query("learnPracticeMappings")
      .withIndex("by_formId_and_version_and_fieldId_and_conceptId", (q) =>
        q.eq("formId", response.formId).eq("version", response.version),
      )
      .take(PRACTICE_LIMITS.mappingsPerVersion + 1);
    const previous = await ctx.db
      .query("learnPracticeEvidence")
      .withIndex(
        "by_userId_and_formResponseId_and_fieldId_and_conceptId",
        (q) =>
          q
            .eq("userId", identity.tokenIdentifier)
            .eq("formResponseId", response._id),
      )
      .take(PRACTICE_LIMITS.mappingsPerVersion + 1);
    if (
      mappings.length > PRACTICE_LIMITS.mappingsPerVersion ||
      previous.length > PRACTICE_LIMITS.mappingsPerVersion
    )
      throw new Error("Version evidence limit exceeded");
    const kept = new Set<string>();
    let evidenceCount = 0;
    for (const mapping of mappings) {
      const question = grade.questions.find(
        (q) => q.fieldId === mapping.fieldId,
      );
      // Hidden, skipped, missing answers and invalid/zero-point grades are not evidence.
      const answer = response.answers[mapping.fieldId];
      if (
        !question ||
        !Number.isFinite(question.possible) ||
        question.possible <= 0 ||
        answer === undefined ||
        answer === "" ||
        (Array.isArray(answer) && !answer.length) ||
        !(await ctx.db.get("learnConcepts", mapping.conceptId))
      )
        continue;
      const key = JSON.stringify([mapping.fieldId, mapping.conceptId]);
      kept.add(key);
      const data = {
        userId: identity.tokenIdentifier,
        formResponseId: response._id,
        formId: response.formId,
        version: response.version,
        fieldId: mapping.fieldId,
        conceptId: mapping.conceptId,
        earned: question.earned,
        possible: question.possible,
        // Edits do not turn an old attempt into a new or more recent attempt.
        answeredAt: response.submittedAt,
        responseUpdatedAt: response.updatedAt,
      };
      const existing = previous.find(
        (e) =>
          e.fieldId === mapping.fieldId && e.conceptId === mapping.conceptId,
      );
      if (existing) {
        if (
          existing.earned !== data.earned ||
          existing.possible !== data.possible ||
          existing.responseUpdatedAt !== data.responseUpdatedAt ||
          existing.version !== data.version
        )
          await ctx.db.patch("learnPracticeEvidence", existing._id, data);
      } else await ctx.db.insert("learnPracticeEvidence", data);
      evidenceCount++;
    }
    // Editing branching answers can hide formerly answered fields; remove their stale evidence.
    for (const row of previous)
      if (!kept.has(JSON.stringify([row.fieldId, row.conceptId])))
        await ctx.db.delete("learnPracticeEvidence", row._id);
    return { evidenceCount };
  },
});

export const conceptStates = query({
  args: { conceptIds: v.array(v.id("learnConcepts")), now: v.number() },
  returns: v.array(practiceState),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    assertNow(args.now);
    validateConcepts(args.conceptIds);
    return Promise.all(
      args.conceptIds.map(async (conceptId) =>
        summarizeEvidence(
          conceptId,
          await recentEvidence(
            ctx,
            identity.tokenIdentifier,
            conceptId,
            args.now,
          ),
          args.now,
        ),
      ),
    );
  },
});

/** Eligibility suggestions, never permission grants: standard respond enforcement
 * remains authoritative at load and submission. Initial safe scope is owned,
 * unscheduled assessments only; no clock-dependent plan exemptions or shared/public
 * discovery or code-pass support. References target the CURRENT publication and
 * still need the normal respondent flow. No definitions, keys or answers leave here.
 * Recent-answer avoidance uses the bounded ingested evidence window.
 * At most six forms are hydrated per call. Bounded pools can underfill; selection is not an exhaustive recommendation.
 */
export const selectPractice = query({
  args: {
    conceptIds: v.array(v.id("learnConcepts")),
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(practiceReference),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    assertNow(args.now);
    validateConcepts(args.conceptIds);
    const limit = args.limit ?? 5;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > PRACTICE_LIMITS.selection
    )
      throw new Error("Invalid selection limit");
    const config = await ctx.db
      .query("globalConfig")
      .withIndex("by_creation_time")
      .first();
    // A caller clock must never extend a plan entitlement. Apply the platform
    // cap conservatively to every plan; respond remains the collection authority.
    const platformCap = config?.formResponseLimit ?? 1000;
    const candidates = new Map<string, typeof practiceReference.type>();
    // Cache checks per form so a large mapping set cannot amplify response/owner reads.
    const permissible = new Map<string, boolean>();
    const forms = new Map<string, Doc<"forms"> | null>();
    const versions = new Map<string, Doc<"formVersions"> | null>();
    for (const conceptId of args.conceptIds) {
      const rows = await recentEvidence(
        ctx,
        identity.tokenIdentifier,
        conceptId,
        args.now,
      );
      if (summarizeEvidence(conceptId, rows, args.now).state !== "weak")
        continue;
      if (!(await ctx.db.get("learnConcepts", conceptId))) continue;
      const recentFields = new Set(
        rows
          .filter((e) => e.answeredAt >= args.now - 7 * DAY)
          .map((e) => JSON.stringify([e.formId, e.version, e.fieldId])),
      );
      const mappings = await ctx.db
        .query("learnPracticeMappings")
        .withIndex("by_ownerId_and_conceptId", (q) =>
          q.eq("ownerId", identity.subject).eq("conceptId", conceptId),
        )
        .order("desc")
        .take(PRACTICE_LIMITS.candidatesPerConcept);
      for (const mapping of mappings) {
        if (!forms.has(mapping.formId)) {
          if (forms.size >= PRACTICE_LIMITS.forms) continue;
          forms.set(mapping.formId, await ctx.db.get("forms", mapping.formId));
        }
        const form = forms.get(mapping.formId);
        if (
          !form ||
          form.ownerId !== identity.subject ||
          form.publishedVersion !== mapping.version
        )
          continue;
        let allowed = permissible.get(form._id);
        if (allowed === undefined) {
          const ownCap = form.settings.responseLimit ?? null;
          const cap =
            ownCap === null ? platformCap : Math.min(platformCap, ownCap);
          allowed =
            form.status === "live" &&
            !form.isBanned &&
            // Schedule eligibility is not materialized. A client-provided clock
            // cannot authorize a scheduled form, so omit it from this initial scope.
            form.settings.opensAt === undefined &&
            form.settings.closesAt === undefined &&
            form.settings.access !== "code" &&
            (form.settings.access !== "signed_in" ||
              (await teamOrEmailCheck(ctx, form.settings, identity)) === "ok") &&
            (cap === null || (await readFormCounts(ctx, form)).responseCount < cap);
          if (allowed && form.settings.onePerPerson) {
            const prior = await ctx.db
              .query("formResponses")
              .withIndex("by_formId_and_respondentId_and_status", (q) =>
                q
                  .eq("formId", form._id)
                  .eq("respondentId", identity.subject)
                  .eq("status", "completed"),
              )
              .first();
            allowed = !prior;
          }
          permissible.set(form._id, allowed);
        }
        if (!allowed) continue;
        if (!versions.has(form._id))
          versions.set(
            form._id,
            await ctx.db
              .query("formVersions")
              .withIndex("by_formId_and_version", (q) =>
                q.eq("formId", form._id).eq("version", mapping.version),
              )
              .unique(),
          );
        const version = versions.get(form._id);
        const field = version?.definition.fields.find(
          (f) => f.id === mapping.fieldId,
        );
        if (
          !version?.definition.quiz?.enabled ||
          !field?.quiz?.correctOptionIds.length ||
          field.quiz.points <= 0
        )
          continue;
        const key = JSON.stringify([
          form._id,
          mapping.version,
          mapping.fieldId,
        ]);
        const candidate = candidates.get(key);
        if (candidate) {
          candidate.conceptIds.push(conceptId);
          candidate.recentlyAnswered ||= recentFields.has(key);
        } else
          candidates.set(key, {
            formId: form._id,
            version: mapping.version,
            fieldId: mapping.fieldId,
            conceptIds: [conceptId],
            recentlyAnswered: recentFields.has(key),
          });
      }
    }
    return [...candidates.values()]
      .sort((a, b) => Number(a.recentlyAnswered) - Number(b.recentlyAnswered))
      .slice(0, limit);
  },
});

/** Explainable review suggestions, computed from server-graded independent attempts.
 * No confidence label establishes mastery. Suggestions never grant quiz access.
 */
export const reviewSchedule = query({
  args: { conceptIds: v.array(v.id("learnConcepts")) },
  returns: v.array(v.object({ conceptId: v.id("learnConcepts"), dueAt: v.union(v.number(), v.null()), due: v.boolean(), intervalDays: v.number(), attempts: v.number(), accuracy: v.union(v.number(), v.null()), reason: v.string() })),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    validateConcepts(args.conceptIds);
    const now = Date.now();
    const suggestions = [];
    for (const conceptId of args.conceptIds) {
      if (!(await ctx.db.get("learnConcepts", conceptId))) throw new Error("Concept not found");
      const rows = await recentEvidence(ctx, identity.tokenIdentifier, conceptId, now);
      const state = summarizeEvidence(conceptId, rows, now);
      const intervalDays = state.attempts < 3 || (state.accuracy ?? 0) < .7 ? 1 : state.accuracy! < .85 ? 3 : 7;
      const dueAt = state.lastAnsweredAt === null ? null : state.lastAnsweredAt + intervalDays * DAY;
      suggestions.push({ conceptId, dueAt, due: dueAt !== null && dueAt <= now, intervalDays, attempts: state.attempts, accuracy: state.accuracy, reason: state.lastAnsweredAt === null ? "No recent server-graded evidence; start practice before scheduling review." : `${intervalDays}-day review interval from ${state.attempts} independent attempts and ${Math.round(state.accuracy! * 100)}% average accuracy. This is a review heuristic, not mastery.` });
    }
    return suggestions.sort((a, b) => Number(b.due) - Number(a.due) || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
  },
});
