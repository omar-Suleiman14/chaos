import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { examAllocation, examSelection } from "./examBuilderModel";

type Ctx = QueryCtx | MutationCtx;
type Course = Doc<"learnCollections">;
type Allocation = Infer<typeof examAllocation>;
type Selection = Infer<typeof examSelection>;
type Entry = { question: Doc<"questionBankItems">; links: Doc<"questionBankLinks">[] };
const MAX_LINKS = 1000;
const MAX_QUESTIONS = 100;
const MAX_ROWS = 30;

async function actor(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}
async function courseOwned(ctx: Ctx, courseId: Id<"learnCollections">, ownerId: string) {
  const row = await ctx.db.get("learnCollections", courseId);
  if (!row || row.ownerId !== ownerId || row.communityState === "removed")
    throw new Error("NOT_FOUND: Course not found.");
  return row;
}
async function draftOwned(ctx: Ctx, draftId: Id<"examBuilderDrafts">) {
  const ownerId = await actor(ctx);
  const row = await ctx.db.get("examBuilderDrafts", draftId);
  if (!row || row.ownerId !== ownerId) throw new Error("NOT_FOUND: Exam draft not found.");
  const course = await courseOwned(ctx, row.courseId, ownerId);
  return { row, course, ownerId };
}
function outline(course: Course) {
  return course.lessonIds ?? course.items.flatMap(i => i.kind === "lesson" ? [i.id] : []);
}
function isInModule(course: Course, moduleId: string, lessonId: Id<"lessons">) {
  const mod = course.modules?.find(m => m.id === moduleId);
  return !!mod && [...mod.lessonIds, ...(mod.sections ?? []).flatMap(s => s.lessonIds)].includes(lessonId);
}
function validatePlan(course: Course, title: string, targetCount: number, allocations: Allocation[]) {
  if (!title.trim() || title.trim().length > 200) throw new Error("VALIDATION_FAILED: Give the exam a title (up to 200 characters).");
  if (!Number.isSafeInteger(targetCount) || targetCount < 1 || targetCount > MAX_QUESTIONS)
    throw new Error("VALIDATION_FAILED: Exam target must be 1–100 questions.");
  if (!allocations.length || allocations.length > MAX_ROWS)
    throw new Error("VALIDATION_FAILED: Use 1–30 syllabus allocations.");
  const keys = new Set<string>();
  let planned = 0;
  const lessons = outline(course);
  for (const a of allocations) {
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(a.id) || !Number.isSafeInteger(a.count) ||
        a.count < 1 || a.count > MAX_QUESTIONS || !Number.isFinite(a.points) ||
        a.points <= 0 || a.points > 100 || Math.round(a.points * 100) !== a.points * 100)
      throw new Error("VALIDATION_FAILED: Use valid allocation IDs, counts and point weights (0.01–100).");
    if (a.kind === "course" && a.key !== "") throw new Error("VALIDATION_FAILED: Whole-course allocation has no key.");
    if (a.kind === "module" && !course.modules?.some(m => m.id === a.key))
      throw new Error("NOT_FOUND: Module is no longer part of this course.");
    if (a.kind === "lecture" && !lessons.includes(a.key as Id<"lessons">))
      throw new Error("NOT_FOUND: Lecture is no longer part of this course.");
    if (a.kind === "topic" && (!a.key.trim() || a.key.length > 100 || a.key !== a.key.trim()))
      throw new Error("VALIDATION_FAILED: Enter a topic tag (up to 100 characters).");
    const key = JSON.stringify([a.kind, a.key.toLocaleLowerCase()]);
    if (keys.has(key) || keys.has("id:" + a.id))
      throw new Error("VALIDATION_FAILED: Each syllabus allocation must be unique.");
    keys.add(key); keys.add("id:" + a.id);
    planned += a.count;
  }
  if (planned > targetCount) throw new Error("VALIDATION_FAILED: Allocated questions exceed the exam target.");
  return title.trim();
}
/** Single bounded course read; duplicate scope links never multiply question availability. */
async function loadPool(ctx: Ctx, course: Course, ownerId: string): Promise<Entry[]> {
  const links = await ctx.db.query("questionBankLinks")
    .withIndex("by_course_module", q => q.eq("courseId", course._id)).take(MAX_LINKS + 1);
  if (links.length > MAX_LINKS) throw new Error("LIMIT_REACHED: Course exceeds 1,000 question scope links.");
  const allowedLessons = new Set(outline(course));
  const mapped = new Map<Id<"questionBankItems">, Doc<"questionBankLinks">[]>();
  for (const link of links) {
    if (link.ownerId !== ownerId || (link.lessonId && !allowedLessons.has(link.lessonId)) ||
        (link.moduleId && !course.modules?.some(m => m.id === link.moduleId)) ||
        (link.lessonId && link.moduleId && !isInModule(course, link.moduleId, link.lessonId))) continue;
    const existing = mapped.get(link.questionId) ?? [];
    existing.push(link); mapped.set(link.questionId, existing);
  }
  const entries: Entry[] = [];
  for (const [questionId, questionLinks] of mapped) {
    const question = await ctx.db.get("questionBankItems", questionId);
    if (question && question.ownerId === ownerId && question.status === "ready")
      entries.push({ question, links: questionLinks });
  }
  return entries.sort((a, b) => b.question.updatedAt - a.question.updatedAt ||
    a.question._id.localeCompare(b.question._id));
}
function matches(entry: Entry, allocation: Allocation) {
  switch (allocation.kind) {
    case "course": return true;
    case "module": return entry.links.some(l => l.moduleId === allocation.key);
    case "lecture": return entry.links.some(l => l.lessonId === allocation.key);
    case "topic": return entry.question.topics.some(t => t.toLocaleLowerCase() === allocation.key.toLocaleLowerCase());
  }
}
function eligibleByRow(pool: Entry[], allocations: Allocation[]) {
  return allocations.map(a => pool.filter(e => matches(e, a)));
}
/** Augmenting-path matching avoids falsely reporting shortages when allocations overlap. */
function assignDistinct(allocations: Allocation[], groups: Entry[][]) {
  const slots = allocations.flatMap((a, index) => Array.from({ length: a.count }, () => index));
  slots.sort((a, b) => groups[a].length - groups[b].length || a - b);
  const holders = new Map<string, number>();
  const trySlot = (slot: number, seen: Set<string>): boolean => {
    for (const entry of groups[slots[slot]]) {
      const id = entry.question._id;
      if (seen.has(id)) continue;
      seen.add(id);
      const prior = holders.get(id);
      if (prior === undefined || trySlot(prior, seen)) {
        holders.set(id, slot);
        return true;
      }
    }
    return false;
  };
  for (let slot = 0; slot < slots.length; slot++)
    if (!trySlot(slot, new Set())) return null;
  const selected: Selection[] = [];
  for (const [id, slot] of holders)
    selected.push({ questionId: id as Id<"questionBankItems">, allocationId: allocations[slots[slot]].id });
  const index = new Map(allocations.map((a, i) => [a.id, i]));
  return selected.sort((a, b) => (index.get(a.allocationId) ?? 0) - (index.get(b.allocationId) ?? 0) ||
    a.questionId.localeCompare(b.questionId));
}
function validateSelections(selections: Selection[], allocations: Allocation[], groups: Entry[][], targetCount: number) {
  if (selections.length > targetCount || selections.length > MAX_QUESTIONS)
    throw new Error("VALIDATION_FAILED: Too many selected questions.");
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const s of selections) {
    if (seen.has(s.questionId)) throw new Error("VALIDATION_FAILED: Duplicate question selection.");
    seen.add(s.questionId);
    const i = allocations.findIndex(a => a.id === s.allocationId);
    if (i < 0 || !groups[i].some(e => e.question._id === s.questionId))
      throw new Error("NOT_FOUND: Question is not eligible for this syllabus allocation.");
    const n = (counts.get(s.allocationId) ?? 0) + 1;
    if (n > allocations[i].count) throw new Error("VALIDATION_FAILED: Syllabus allocation is full.");
    counts.set(s.allocationId, n);
  }
}
function requireEditable(course: Course) {
  if (course.archived) throw new Error("COURSE_ARCHIVED: Restore the course before editing exams.");
}
function verifyRevision(expectedRevision: number, revision: number) {
  if (expectedRevision !== revision) throw new Error("REVISION_CONFLICT: Exam changed; reload before saving.");
}

export const listDrafts = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const ownerId = await actor(ctx);
    await courseOwned(ctx, courseId, ownerId);
    return ctx.db.query("examBuilderDrafts")
      .withIndex("by_owner_course_updated", q => q.eq("ownerId", ownerId).eq("courseId", courseId))
      .order("desc").take(100);
  },
});
export const getDraft = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => (await draftOwned(ctx, draftId)).row,
});
export const createDraft = mutation({
  args: { courseId: v.id("learnCollections"), title: v.optional(v.string()) },
  returns: v.id("examBuilderDrafts"),
  handler: async (ctx, { courseId, title }) => {
    const ownerId = await actor(ctx);
    const course = await courseOwned(ctx, courseId, ownerId);
    requireEditable(course);
    const now = Date.now();
    return ctx.db.insert("examBuilderDrafts", {
      ownerId, courseId, title: validatePlan(course, title ?? "Untitled exam", 10,
        [{ id: "whole_course", kind: "course", key: "", count: 10, points: 1 }]),
      targetCount: 10,
      allocations: [{ id: "whole_course", kind: "course", key: "", count: 10, points: 1 }],
      selections: [], revision: 0, createdAt: now, updatedAt: now,
    });
  },
});
export const savePlan = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number(),
    title: v.string(), targetCount: v.number(), allocations: v.array(examAllocation) },
  returns: v.number(),
  handler: async (ctx, { draftId, expectedRevision, title, targetCount, allocations }) => {
    const { row, course } = await draftOwned(ctx, draftId);
    requireEditable(course);
    verifyRevision(expectedRevision, row.revision);
    const cleanTitle = validatePlan(course, title, targetCount, allocations);
    const changed = JSON.stringify(allocations) !== JSON.stringify(row.allocations) ||
      targetCount !== row.targetCount;
    await ctx.db.patch("examBuilderDrafts", draftId, {
      title: cleanTitle, targetCount, allocations,
      ...(changed ? { selections: [] } : {}),
      revision: row.revision + 1, updatedAt: Date.now(),
    });
    return row.revision + 1;
  },
});
export const setSelections = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number(),
    selections: v.array(examSelection) },
  returns: v.number(),
  handler: async (ctx, { draftId, expectedRevision, selections }) => {
    const { row, course, ownerId } = await draftOwned(ctx, draftId);
    requireEditable(course);
    verifyRevision(expectedRevision, row.revision);
    validatePlan(course, row.title, row.targetCount, row.allocations);
    const groups = eligibleByRow(await loadPool(ctx, course, ownerId), row.allocations);
    validateSelections(selections, row.allocations, groups, row.targetCount);
    await ctx.db.patch("examBuilderDrafts", draftId, {
      selections, revision: row.revision + 1, updatedAt: Date.now(),
    });
    return row.revision + 1;
  },
});
export const autoFill = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number() },
  returns: v.number(),
  handler: async (ctx, { draftId, expectedRevision }) => {
    const { row, course, ownerId } = await draftOwned(ctx, draftId);
    requireEditable(course);
    verifyRevision(expectedRevision, row.revision);
    validatePlan(course, row.title, row.targetCount, row.allocations);
    if (row.allocations.reduce((sum, a) => sum + a.count, 0) !== row.targetCount)
      throw new Error("VALIDATION_FAILED: Allocate all target questions before auto-selection.");
    const groups = eligibleByRow(await loadPool(ctx, course, ownerId), row.allocations);
    const selections = assignDistinct(row.allocations, groups);
    if (!selections) throw new Error("INSUFFICIENT_QUESTIONS: Not enough distinct ready questions across these allocations.");
    validateSelections(selections, row.allocations, groups, row.targetCount);
    await ctx.db.patch("examBuilderDrafts", draftId, {
      selections, revision: row.revision + 1, updatedAt: Date.now(),
    });
    return row.revision + 1;
  },
});
export const preview = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const { row, course, ownerId } = await draftOwned(ctx, draftId);
    const pool = await loadPool(ctx, course, ownerId);
    const groups = eligibleByRow(pool, row.allocations);
    const valid = row.selections.filter(s => row.allocations.some((a, i) =>
      a.id === s.allocationId && groups[i].some(e => e.question._id === s.questionId)));
    const selectedById = new Map(pool.map(e => [e.question._id, e.question]));
    return {
      courseTitle: course.metadata.title,
      modules: (course.modules ?? []).map(m => ({ id: m.id, title: m.title })),
      lectures: await Promise.all(outline(course).map(async id => ({
        id, title: (await ctx.db.get("lessons", id))?.metadata.title ?? "Untitled lecture",
      }))),
      topics: [...new Set(pool.flatMap(e => e.question.topics))].sort((a, b) => a.localeCompare(b)).slice(0, 200),
      readyQuestions: pool.length,
      rows: row.allocations.map((a, i) => ({
        allocationId: a.id, available: groups[i].length, requested: a.count,
        selected: valid.filter(s => s.allocationId === a.id).length,
      })),
      plannedCount: row.allocations.reduce((sum, a) => sum + a.count, 0),
      feasible: assignDistinct(row.allocations, groups) !== null,
      selected: row.selections.map(s => {
        const q = selectedById.get(s.questionId);
        const a = row.allocations.find(a => a.id === s.allocationId);
        return { ...s, valid: valid.some(v => v.questionId === s.questionId && v.allocationId === s.allocationId),
          prompt: q?.prompt ?? "Question removed", kind: q?.kind ?? "written",
          points: a?.points ?? 0, revision: q?.revision ?? -1 };
      }),
    };
  },
});
export const candidates = query({
  args: { draftId: v.id("examBuilderDrafts"), allocationId: v.string(),
    offset: v.optional(v.number()) },
  handler: async (ctx, { draftId, allocationId, offset = 0 }) => {
    const { row, course, ownerId } = await draftOwned(ctx, draftId);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_LINKS)
      throw new Error("VALIDATION_FAILED: Invalid page offset.");
    const allocation = row.allocations.find(a => a.id === allocationId);
    if (!allocation) throw new Error("NOT_FOUND: Allocation not found.");
    const pool = await loadPool(ctx, course, ownerId);
    const eligible = pool.filter(e => matches(e, allocation));
    return {
      total: eligible.length,
      nextOffset: offset + 30 < eligible.length ? offset + 30 : null,
      questions: eligible.slice(offset, offset + 30).map(e => ({
        questionId: e.question._id, prompt: e.question.prompt,
        kind: e.question.kind, points: e.question.points,
        selected: row.selections.some(s => s.questionId === e.question._id),
        selectedHere: row.selections.some(s => s.questionId === e.question._id && s.allocationId === allocationId),
      })),
    };
  },
});
export const removeDraft = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, { draftId, expectedRevision }) => {
    const { row, course } = await draftOwned(ctx, draftId);
    requireEditable(course);
    verifyRevision(expectedRevision, row.revision);
    await ctx.db.delete("examBuilderDrafts", draftId);
    return null;
  },
});
