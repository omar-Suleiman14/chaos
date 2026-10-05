import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { lessonAccessForActor } from "./lessons";
import { requireLearnActor } from "./mcpLearn";
import { GLOSSARY_LIMITS as L, glossaryEntry, type GlossaryEntry } from "./lessonGlossaryModel";

const key = (term: string) => term.trim().toLocaleLowerCase();
const invalid = (message: string): never => { throw new Error(`VALIDATION_FAILED: ${message}`); };
const clean = (value: string | undefined, max: number, field: string) => {
  const text = value?.trim();
  if (text && text.length > max) invalid(`${field} is limited to ${max} characters.`);
  return text || undefined;
};
function normalize(entry: GlossaryEntry): GlossaryEntry {
  const term = clean(entry.term, L.term, "term") ?? invalid("Every entry needs a term.");
  const definition = clean(entry.definition, L.definition, "definition") ?? invalid(`Give a definition for "${term}".`);
  const aliases = [...new Set((entry.aliases ?? []).map(a => clean(a, L.term, "alias")).filter((a): a is string => !!a && key(a) !== key(term)))];
  if (aliases.length > L.aliases) invalid(`At most ${L.aliases} aliases per term.`);
  const language = clean(entry.language, L.language, "language");
  if (language && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) invalid("language must be a language code such as ar or fr.");
  const out: GlossaryEntry = { term, definition };
  if (aliases.length) out.aliases = aliases;
  const translation = clean(entry.translation, L.translation, "translation"), explanation = clean(entry.explanation, L.explanation, "explanation"), pronunciation = clean(entry.pronunciation, L.pronunciation, "pronunciation");
  if (translation) out.translation = translation;
  if (explanation) out.explanation = explanation;
  if (language) out.language = language;
  if (pronunciation) out.pronunciation = pronunciation;
  return out;
}
async function current(ctx: QueryCtx, lessonId: Id<"lessons">) {
  return ctx.db.query("lessonGlossaries").withIndex("by_lessonId", q => q.eq("lessonId", lessonId)).unique();
}
/** Merges entries by term (case-insensitive) unless replace is set, then drops removed terms. */
export async function saveGlossaryForActor(ctx: MutationCtx, actor: string, lessonId: Id<"lessons">, args: { entries: GlossaryEntry[]; remove?: string[]; replace?: boolean }) {
  await lessonAccessForActor(ctx, actor, lessonId, true);
  const prior = await current(ctx, lessonId);
  const merged = new Map((args.replace ? [] : prior?.entries ?? []).map(e => [key(e.term), e]));
  for (const entry of args.entries.map(normalize)) merged.set(key(entry.term), entry);
  for (const term of args.remove ?? []) merged.delete(key(term));
  const entries = [...merged.values()];
  if (entries.length > L.entries) invalid(`At most ${L.entries} glossary terms per lesson.`);
  if (prior) await ctx.db.patch("lessonGlossaries", prior._id, { entries, updatedAt: Date.now() });
  else if (entries.length) await ctx.db.insert("lessonGlossaries", { lessonId, entries, updatedAt: Date.now() });
  return entries;
}

/** Readers see the glossary of any lesson they can read; anything else gets an empty list. */
export const get = query({ args: { lessonId: v.string() }, returns: v.array(glossaryEntry), handler: async (ctx, args) => {
  const lessonId = ctx.db.normalizeId("lessons", args.lessonId);
  if (!lessonId) return [];
  try { await lessonAccessForActor(ctx, (await getAuthIdentity(ctx))?.subject ?? null, lessonId); } catch { return []; }
  return (await current(ctx, lessonId))?.entries ?? [];
} });
export const save = mutation({ args: { lessonId: v.id("lessons"), entries: v.array(glossaryEntry) }, returns: v.null(), handler: async (ctx, args) => {
  await saveGlossaryForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args.lessonId, { entries: args.entries, replace: true });
  return null;
} });

function mcpLessonId(ctx: QueryCtx, id: string) {
  return ctx.db.normalizeId("lessons", id) ?? (() => { throw new Error("NOT_FOUND: Lesson not found; use an ID returned by Chaos tools."); })();
}
export const mcpSet = internalMutation({ args: { userId: v.string(), lessonId: v.string(), terms: v.array(glossaryEntry), remove: v.optional(v.array(v.string())), replace: v.optional(v.boolean()) }, returns: v.object({ terms: v.array(v.string()) }), handler: async (ctx, args) => {
  const entries = await saveGlossaryForActor(ctx, await requireLearnActor(ctx, args.userId), mcpLessonId(ctx, args.lessonId), { entries: args.terms, remove: args.remove, replace: args.replace });
  return { terms: entries.map(e => e.term) };
} });
export const mcpGet = internalQuery({ args: { userId: v.string(), lessonId: v.string() }, returns: v.object({ entries: v.array(glossaryEntry) }), handler: async (ctx, args) => {
  const lessonId = mcpLessonId(ctx, args.lessonId);
  await lessonAccessForActor(ctx, await requireLearnActor(ctx, args.userId), lessonId);
  return { entries: (await current(ctx, lessonId))?.entries ?? [] };
} });
