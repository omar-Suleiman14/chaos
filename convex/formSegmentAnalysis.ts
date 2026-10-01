import { v, type Infer } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getFormIfRole } from "./authz";
import { isAnswerable, isEmptyAnswer, visibleFieldIds, type Answers, type FormDefinition } from "./formLogic";

/** Fixed newest-response window, not arbitrary filters/pages: avoids exposing tiny page cohorts. */
const SAMPLE = 500;
const MIN_CELL = 5;
const nullableNumber = v.union(v.number(), v.null());
const dimension = v.union(
  v.object({ kind: v.literal("choice"), fieldId: v.string() }),
  v.object({ kind: v.literal("number"), fieldId: v.string(), boundaries: v.array(v.number()) }),
  v.object({ kind: v.literal("status") }),
  v.object({ kind: v.literal("language") }),
  v.object({ kind: v.literal("hidden_parameter"), name: v.string(), values: v.array(v.union(v.string(), v.number(), v.boolean())) }),
);
type Dimension = Infer<typeof dimension>;
const evidence = v.object({ windowLimit: v.number(), windowLimited: v.boolean(), minimumCell: v.number(), version: v.number() });

async function load(ctx: QueryCtx, formId: Id<"forms">, version: number) {
  const access = await getFormIfRole(ctx, formId, "viewer");
  if (!access) return null;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("INVALID_VERSION");
  const snapshot = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", formId).eq("version", version)).unique();
  if (!snapshot) throw new Error("VERSION_NOT_FOUND");
  const window = await ctx.db.query("formResponses").withIndex("by_formId_and_spam_and_submittedAt", q => q.eq("formId", formId).eq("spam", false)).order("desc").take(SAMPLE + 1);
  return { def: snapshot.definition as FormDefinition, rows: window.slice(0, SAMPLE).filter(r => r.version === version), evidence: { windowLimit: SAMPLE, windowLimited: window.length > SAMPLE, minimumCell: MIN_CELL, version } };
}

function buckets(def: FormDefinition, d: Dimension) {
  if (d.kind === "hidden_parameter") {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(d.name) || d.values.length < 1 || d.values.length > 20 || d.values.some(v => typeof v === "string" && v.length > 500 || typeof v === "number" && !Number.isFinite(v)) || new Set(d.values.map(v => JSON.stringify(v))).size !== d.values.length) throw new Error("INVALID_DIMENSION: Use 1–20 distinct parameter values");
    return d.values.map(value => JSON.stringify(value));
  }
  if (d.kind === "status") return ["completed", "partial"];
  if (d.kind === "language") return ["en", "ar"];
  const field = def.fields.find(f => f.id === d.fieldId);
  if (!field) throw new Error("FIELD_NOT_FOUND");
  if (d.kind === "choice") {
    if (!["choice", "dropdown"].includes(field.type) || !field.options?.length || field.options.length > 20) throw new Error("INVALID_DIMENSION: Use a single-choice field with at most 20 options.");
    return field.options.map(o => o.id);
  }
  if (!["number", "scale", "rating"].includes(field.type) || d.boundaries.length < 1 || d.boundaries.length > 10 || d.boundaries.some((n, i) => !Number.isFinite(n) || (i > 0 && n <= d.boundaries[i - 1]))) throw new Error("INVALID_DIMENSION: Numeric boundaries must be finite and strictly increasing (1–10).");
  return Array.from({ length: d.boundaries.length + 1 }, (_, i) => `bin:${i}`);
}

function bucket(d: Dimension, r: { status: string; language: string; answers: Answers; hidden?: Record<string, string>; typedHidden?: Record<string, string | number | boolean> }, visible: Set<string>): string {
  if (d.kind === "hidden_parameter") {
    const value = r.typedHidden?.[d.name] ?? r.hidden?.[d.name];
    return value === undefined ? "missing" : JSON.stringify(value);
  }
  if (d.kind === "status") return r.status;
  if (d.kind === "language") return r.language;
  if (!visible.has(d.fieldId)) return "not_applicable";
  const value = r.answers[d.fieldId];
  if (isEmptyAnswer(value)) return "missing";
  if (d.kind === "choice") return typeof value === "string" ? value : "invalid";
  return typeof value === "number" && Number.isFinite(value) ? `bin:${d.boundaries.filter(n => value >= n).length}` : "invalid";
}

/** Entire matrix withheld if any nonzero cell is small; totals cannot reveal suppressed cells by subtraction.
 * Counts are response records, not unique people. This is suppression, not differential privacy.
 */
export const crossTab = query({
  args: { formId: v.id("forms"), version: v.number(), segment: dimension, compare: dimension },
  returns: v.union(v.null(), v.object({ evidence, suppressed: v.boolean(), cells: v.array(v.object({ segment: v.string(), comparison: v.string(), count: v.number(), withinSegmentRate: v.number() })) })),
  handler: async (ctx, args) => {
    const data = await load(ctx, args.formId, args.version);
    if (!data) return null;
    const a = [...buckets(data.def, args.segment), "missing", "not_applicable", "invalid"];
    const b = [...buckets(data.def, args.compare), "missing", "not_applicable", "invalid"];
    const counts = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const r of data.rows) {
      const visible = visibleFieldIds(data.def, r.answers as Answers);
      let x = bucket(args.segment, r, visible), y = bucket(args.compare, r, visible);
      if (!a.includes(x)) x = "invalid";
      if (!b.includes(y)) y = "invalid";
      const key = JSON.stringify([x, y]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      totals.set(x, (totals.get(x) ?? 0) + 1);
    }
    const suppressed = data.rows.length < MIN_CELL || [...counts.values()].some(n => n < MIN_CELL);
    const cells = suppressed ? [] : [...counts].map(([key, count]) => {
      const [segment, comparison] = JSON.parse(key) as [string, string];
      return { segment, comparison, count, withinSegmentRate: count / totals.get(segment)! };
    });
    return { evidence: data.evidence, suppressed, cells };
  },
});

const funnelField = v.object({ fieldId: v.string(), suppressed: v.boolean(), eligible: nullableNumber, hidden: nullableNumber, answered: nullableNumber, completedSkipped: nullableNumber, stoppedAfter: nullableNumber, inferredReachedUnanswered: nullableNumber, notReached: nullableNumber, unknownProgress: nullableNumber });

/** Reconstructs eligibility using the response's immutable definition and current saved answers.
 * Reach is inferred from lastFieldId, not browser impressions or measured navigation events.
 */
export const funnel = query({
  args: { formId: v.id("forms"), version: v.number() },
  returns: v.union(v.null(), v.object({ evidence, completed: nullableNumber, partial: nullableNumber, progression: v.literal("inferred_from_saved_answers"), fields: v.array(funnelField) })),
  handler: async (ctx, args) => {
    const data = await load(ctx, args.formId, args.version);
    if (!data) return null;
    const fields = data.def.fields.filter(isAnswerable);
    const state = fields.map(f => ({ fieldId: f.id, suppressed: false, eligible: 0, hidden: 0, answered: 0, completedSkipped: 0, stoppedAfter: 0, inferredReachedUnanswered: 0, notReached: 0, unknownProgress: 0 }));
    for (const r of data.rows) {
      const visible = visibleFieldIds(data.def, r.answers as Answers);
      const path = fields.filter(f => visible.has(f.id));
      const last = path.findIndex(f => f.id === r.lastFieldId);
      for (const s of state) {
        if (!visible.has(s.fieldId)) { s.hidden++; continue; }
        s.eligible++;
        if (!isEmptyAnswer(r.answers[s.fieldId])) s.answered++;
        else if (r.status === "completed") s.completedSkipped++;
        else if (last < 0) s.unknownProgress++;
        else if (path.findIndex(f => f.id === s.fieldId) <= last) s.inferredReachedUnanswered++;
        else s.notReached++;
        if (r.status === "partial" && r.lastFieldId === s.fieldId) s.stoppedAfter++;
      }
    }
    // Global complementary suppression also prevents subtraction across adjacent funnel stages.
    const unsafe = data.rows.length < MIN_CELL || state.some(s => Object.entries(s).some(([k, n]) => k !== "fieldId" && typeof n === "number" && n > 0 && n < MIN_CELL));
    const completed = data.rows.filter(r => r.status === "completed").length;
    const partial = data.rows.length - completed;
    const hide = unsafe || (completed > 0 && completed < MIN_CELL) || (partial > 0 && partial < MIN_CELL);
    return { evidence: data.evidence, completed: hide ? null : completed, partial: hide ? null : partial, progression: "inferred_from_saved_answers" as const, fields: state.map(s => hide ? { fieldId: s.fieldId, suppressed: true, eligible: null, hidden: null, answered: null, completedSkipped: null, stoppedAfter: null, inferredReachedUnanswered: null, notReached: null, unknownProgress: null } : s) };
  },
});
