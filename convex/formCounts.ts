import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export interface FormCounts { responseCount: number; partialCount: number; lastResponseAt?: number }

const onForm = (form: Doc<"forms">): FormCounts => ({ responseCount: form.responseCount, partialCount: form.partialCount, lastResponseAt: form.lastResponseAt });

async function counterRow(ctx: QueryCtx, form: Doc<"forms">) {
  return await ctx.db.query("formCounters").withIndex("by_formId", (q) => q.eq("formId", form._id)).unique();
}

/**
 * A form's response counts. They live in formCounters once a response has been counted since that
 * table was added; older forms keep their counts on the form until then. A form that was never
 * published has no responses, so it skips the lookup.
 */
export async function readFormCounts(ctx: QueryCtx, form: Doc<"forms">): Promise<FormCounts> {
  if (form.publishedVersion === undefined) return onForm(form);
  const row = await counterRow(ctx, form);
  return row ? { responseCount: row.responseCount, partialCount: row.partialCount, lastResponseAt: row.lastResponseAt } : onForm(form);
}

/** Adds to a form's counts without touching the form document. Returns the new counts. */
export async function changeFormCounts(ctx: MutationCtx, form: Doc<"forms">, change: { responses?: number; partials?: number; lastResponseAt?: number }): Promise<FormCounts> {
  const row = await counterRow(ctx, form);
  const base = row ?? onForm(form);
  const next: FormCounts = {
    responseCount: Math.max(0, base.responseCount + (change.responses ?? 0)),
    partialCount: Math.max(0, base.partialCount + (change.partials ?? 0)),
    lastResponseAt: change.lastResponseAt ?? base.lastResponseAt,
  };
  if (row) await ctx.db.patch("formCounters", row._id, next);
  else await ctx.db.insert("formCounters", { formId: form._id, ownerId: form.ownerId, ...next });
  return next;
}

/**
 * Many forms of one owner with their current counts, reading the owner's counters in one range
 * instead of one lookup per form. Forms owned by someone else are looked up one by one.
 */
export async function withOwnerFormCounts(ctx: QueryCtx, ownerId: string, forms: Doc<"forms">[]): Promise<Doc<"forms">[]> {
  if (!forms.some((form) => form.publishedVersion !== undefined)) return forms;
  const rows = await ctx.db.query("formCounters").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000);
  const byForm = new Map(rows.map((row) => [row.formId as string, row]));
  return await Promise.all(forms.map(async (form) => {
    if (form.ownerId !== ownerId || rows.length === 1000) return await withFormCounts(ctx, form);
    const row = byForm.get(form._id);
    return row ? { ...form, responseCount: row.responseCount, partialCount: row.partialCount, lastResponseAt: row.lastResponseAt } : form;
  }));
}

/** The form with its current counts in place of the ones stored on it, for code that reads form.responseCount. */
export async function withFormCounts(ctx: QueryCtx, form: Doc<"forms">): Promise<Doc<"forms">> {
  if (form.publishedVersion === undefined) return form;
  return { ...form, ...(await readFormCounts(ctx, form)) };
}
