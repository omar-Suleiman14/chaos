import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { bankDraft, type BankDraft } from "./questionBankModel";

type Ctx = MutationCtx | QueryCtx;
const MAX_LINKS_PER_QUESTION = 50;
const MAX_LINKS_PER_COURSE = 1000;
const MAX_SELECTION = 100;

/** Require an active, registered account: bank ownership is never inferred from an email. */
async function actorForBank(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}
async function ownedQuestion(ctx: Ctx, questionId: Id<"questionBankItems">) {
  const actor = await actorForBank(ctx);
  const question = await ctx.db.get("questionBankItems", questionId);
  if (!question || question.ownerId !== actor) throw new Error("NOT_FOUND: Question not found.");
  return question;
}
async function ownedCourse(ctx: Ctx, courseId: Id<"learnCollections">, actor: string) {
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || course.ownerId !== actor) throw new Error("NOT_FOUND: Course not found.");
  return course;
}
function cleanTags(values: string[], label: string) {
  if (values.length > 20) throw new Error(`VALIDATION_FAILED: At most 20 ${label} tags are allowed.`);
  const cleaned = values.map(t => t.trim());
  if (cleaned.some(t => !t || t.length > 100) ||
      new Set(cleaned.map(t => t.toLocaleLowerCase())).size !== cleaned.length) {
    throw new Error(`VALIDATION_FAILED: ${label} tags must be distinct, nonempty and at most 100 characters.`);
  }
  return cleaned;
}
export function validateBankDraft(item: BankDraft): BankDraft {
  const prompt = item.prompt.trim();
  if (!prompt || prompt.length > 10_000) throw new Error("VALIDATION_FAILED: Question text must be 1–10,000 characters.");
  if (!Number.isFinite(item.points) || item.points <= 0 || item.points > 100)
    throw new Error("VALIDATION_FAILED: Points must be greater than 0 and at most 100.");
  if ((item.explanation?.length ?? 0) > 10_000 || (item.sampleAnswer?.length ?? 0) > 10_000)
    throw new Error("VALIDATION_FAILED: Explanation and sample answer must be at most 10,000 characters.");
  const ids = item.choices.map(c => c.id);
  if (ids.some(id => !/^[A-Za-z0-9_-]{1,40}$/.test(id)) ||
      new Set(ids).size !== ids.length ||
      item.choices.some(c => !c.text.trim() || c.text.length > 2000)) {
    throw new Error("VALIDATION_FAILED: Use unique choice IDs and nonempty choice text.");
  }
  if (item.correctChoiceIds.length !== new Set(item.correctChoiceIds).size)
    throw new Error("VALIDATION_FAILED: Duplicate correct answers.");
  if (item.kind === "single_choice" || item.kind === "multiple_choice") {
    if (item.choices.length < 2 || item.choices.length > 12 ||
        !item.correctChoiceIds.length ||
        (item.kind === "single_choice" && item.correctChoiceIds.length !== 1) ||
        item.correctChoiceIds.some(id => !ids.includes(id)))
      throw new Error("VALIDATION_FAILED: Choice questions need 2–12 options and valid answer keys.");
  } else if (item.kind === "true_false") {
    if (item.choices.length || item.correctChoiceIds.length !== 1 ||
        !["true", "false"].includes(item.correctChoiceIds[0]))
      throw new Error("VALIDATION_FAILED: True/false questions require a true or false answer.");
  } else if (item.choices.length || item.correctChoiceIds.length) {
    throw new Error("VALIDATION_FAILED: Written questions cannot have choice answer keys.");
  }
  return {
    ...item, prompt,
    choices: item.choices.map(c => ({ id: c.id, text: c.text.trim() })),
    correctChoiceIds: [...item.correctChoiceIds],
    ...(item.sampleAnswer !== undefined ? { sampleAnswer: item.sampleAnswer.trim() } : {}),
    ...(item.explanation !== undefined ? { explanation: item.explanation.trim() } : {}),
    topics: cleanTags(item.topics, "topic"),
    terms: cleanTags(item.terms, "term"),
    outcomes: cleanTags(item.outcomes, "outcome"),
  };
}

export const create = mutation({
  args: { item: bankDraft },
  returns: v.id("questionBankItems"),
  handler: async (ctx, { item }) => {
    const ownerId = await actorForBank(ctx);
    const now = Date.now();
    return ctx.db.insert("questionBankItems", {
      ownerId, ...validateBankDraft(item), revision: 0, createdAt: now, updatedAt: now,
    });
  },
});
export const get = query({
  args: { questionId: v.id("questionBankItems") },
  handler: (ctx, { questionId }) => ownedQuestion(ctx, questionId),
});
export const listMine = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.union(v.literal("draft"), v.literal("ready"), v.literal("archived"))) },
  handler: async (ctx, { paginationOpts, status }) => {
    const ownerId = await actorForBank(ctx);
    if (!Number.isSafeInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50)
      throw new Error("VALIDATION_FAILED: Page size must be 1–50.");
    return status
      ? ctx.db.query("questionBankItems").withIndex("by_owner_status_updated", q => q.eq("ownerId", ownerId).eq("status", status)).order("desc").paginate(paginationOpts)
      : ctx.db.query("questionBankItems").withIndex("by_owner_updated", q => q.eq("ownerId", ownerId)).order("desc").paginate(paginationOpts);
  },
});
export const update = mutation({
  args: { questionId: v.id("questionBankItems"), expectedRevision: v.number(), item: bankDraft },
  returns: v.number(),
  handler: async (ctx, { questionId, expectedRevision, item }) => {
    const row = await ownedQuestion(ctx, questionId);
    if (row.revision !== expectedRevision) throw new Error("REVISION_CONFLICT: Question changed; reload before saving.");
    const next = validateBankDraft(item);
    await ctx.db.patch("questionBankItems", row._id, { ...next, revision: row.revision + 1, updatedAt: Date.now() });
    return row.revision + 1;
  },
});
export const archive = mutation({
  args: { questionId: v.id("questionBankItems") },
  returns: v.null(),
  handler: async (ctx, { questionId }) => {
    const question = await ownedQuestion(ctx, questionId);
    if (question.status !== "archived")
      await ctx.db.patch("questionBankItems", questionId, { status: "archived", revision: question.revision + 1, updatedAt: Date.now() });
    return null;
  },
});

/** A scope is only a classification link, never an authorization grant. */
export const addScope = mutation({
  args: {
    questionId: v.id("questionBankItems"), courseId: v.id("learnCollections"),
    moduleId: v.optional(v.string()), lessonId: v.optional(v.id("lessons")),
  },
  returns: v.id("questionBankLinks"),
  handler: async (ctx, { questionId, courseId, moduleId, lessonId }) => {
    const question = await ownedQuestion(ctx, questionId);
    const course = await ownedCourse(ctx, courseId, question.ownerId);
    if (course.archived) throw new Error("COURSE_ARCHIVED: Restore the course before tagging questions.");
    const outline = course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : []);
    if (lessonId && !outline.includes(lessonId))
      throw new Error("NOT_FOUND: Lecture is not in this course.");
    const module = moduleId ? course.modules?.find(m => m.id === moduleId) : undefined;
    if (moduleId && !module) throw new Error("NOT_FOUND: Module not found.");
    if (lessonId && module && ![...module.lessonIds, ...(module.sections ?? []).flatMap(s => s.lessonIds)].includes(lessonId))
      throw new Error("VALIDATION_FAILED: Lecture does not belong to the selected module.");
    const scopeKey = JSON.stringify([courseId, moduleId ?? null, lessonId ?? null]);
    const prior = await ctx.db.query("questionBankLinks")
      .withIndex("by_question_scope", q => q.eq("questionId", questionId).eq("scopeKey", scopeKey)).unique();
    if (prior) return prior._id;
    const [questionLinks, courseLinks] = await Promise.all([
      ctx.db.query("questionBankLinks").withIndex("by_question", q => q.eq("questionId", questionId)).take(MAX_LINKS_PER_QUESTION),
      ctx.db.query("questionBankLinks").withIndex("by_course", q => q.eq("courseId", courseId)).take(MAX_LINKS_PER_COURSE),
    ]);
    if (questionLinks.length >= MAX_LINKS_PER_QUESTION || courseLinks.length >= MAX_LINKS_PER_COURSE)
      throw new Error("LIMIT_REACHED: Question or course scope limit reached.");
    return ctx.db.insert("questionBankLinks", {
      ownerId: question.ownerId, questionId, courseId,
      ...(moduleId ? { moduleId } : {}), ...(lessonId ? { lessonId } : {}),
      scopeKey, createdAt: Date.now(),
    });
  },
});
export const listScopes = query({
  args: { questionId: v.id("questionBankItems") },
  handler: async (ctx, { questionId }) => {
    await ownedQuestion(ctx, questionId);
    return ctx.db.query("questionBankLinks").withIndex("by_question", q => q.eq("questionId", questionId)).take(MAX_LINKS_PER_QUESTION);
  },
});
export const removeScope = mutation({
  args: { scopeId: v.id("questionBankLinks") },
  returns: v.null(),
  handler: async (ctx, { scopeId }) => {
    const actor = await actorForBank(ctx);
    const scope = await ctx.db.get("questionBankLinks", scopeId);
    if (!scope || scope.ownerId !== actor) throw new Error("NOT_FOUND: Scope not found.");
    const question = await ctx.db.get("questionBankItems", scope.questionId);
    if (!question || question.ownerId !== actor) throw new Error("NOT_FOUND: Scope not found.");
    await ctx.db.delete("questionBankLinks", scopeId);
    return null;
  },
});

function matchesAny(values: string[], search: string[] | undefined) {
  if (!search?.length) return true;
  const candidate = new Set(values.map(v => v.toLocaleLowerCase()));
  return search.some(v => candidate.has(v.trim().toLocaleLowerCase()));
}
function safeFilter(values: string[] | undefined, name: string) {
  if (values && (values.length > 20 || values.some(v => !v.trim() || v.length > 100)))
    throw new Error(`VALIDATION_FAILED: Invalid ${name} filter.`);
  return values;
}

/**
 * Private exam-builder selection API. All predicates are evaluated server-side.
 * Never expose this endpoint via public course metadata, student APIs, or student MCP.
 * An exam must persist a versioned snapshot before it is assigned to students.
 */
export const selectForExam = query({
  args: {
    courseId: v.id("learnCollections"),
    moduleIds: v.optional(v.array(v.string())),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    topics: v.optional(v.array(v.string())),
    terms: v.optional(v.array(v.string())),
    outcomes: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await actorForBank(ctx);
    const course = await ownedCourse(ctx, args.courseId, actor);
    const limit = args.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SELECTION)
      throw new Error("VALIDATION_FAILED: Selection size must be 1–100.");
    for (const [name, values] of [["module", args.moduleIds], ["topic", args.topics], ["term", args.terms], ["outcome", args.outcomes]] as const)
      safeFilter(values, name);
    if (args.lessonIds && (args.lessonIds.length > 30 ||
      args.lessonIds.some(id => !(course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : [])).includes(id))))
      throw new Error("NOT_FOUND: Invalid lecture filter.");
    if (args.moduleIds?.some(id => !course.modules?.some(m => m.id === id)))
      throw new Error("NOT_FOUND: Invalid module filter.");
    const links = await ctx.db.query("questionBankLinks")
      .withIndex("by_course", q => q.eq("courseId", course._id)).take(MAX_LINKS_PER_COURSE + 1);
    if (links.length > MAX_LINKS_PER_COURSE)
      throw new Error("LIMIT_REACHED: Too many course questions; narrow the bank before selecting.");
    const unique = new Map<string, Doc<"questionBankItems">>();
    for (const link of links) {
      if (link.ownerId !== actor ||
        (args.moduleIds?.length && (!link.moduleId || !args.moduleIds.includes(link.moduleId))) ||
        (args.lessonIds?.length && (!link.lessonId || !args.lessonIds.includes(link.lessonId)))) continue;
      const item = await ctx.db.get("questionBankItems", link.questionId);
      if (!item || item.ownerId !== actor || item.status !== "ready" ||
        !matchesAny(item.topics, args.topics) ||
        !matchesAny(item.terms, args.terms) ||
        !matchesAny(item.outcomes, args.outcomes)) continue;
      unique.set(item._id, item);
    }
    const questions = [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || (a._id < b._id ? -1 : 1));
    return { questions: questions.slice(0, limit), hasMore: questions.length > limit };
  },
});
