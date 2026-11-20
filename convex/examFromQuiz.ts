// Library "Exams" tab: every exam the creator owns across courses, and a
// one-step "make an exam from a published quiz" flow. Reuses the same
// builder, seal and settings operations as the course Exam builder page.
import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { getAuthIdentity } from "./authIdentity";
import { preparePublishedQuizForExam } from "./examQuizImport";
import { validateBankDraft } from "./questionBank";
import type { BankDraft } from "./questionBankModel";
import { validatePlan, forMcpSetSelections } from "./examBuilder";
import { forMcpSealDraft } from "./examRuntime";
import { forMcpSaveForDraft } from "./examSettings";
import { examSettings } from "./examSettingsModel";
import { createCourse } from "./courses";

type Definition = Doc<"formVersions">["definition"];
type Field = Definition["fields"][number];
const MAX_EXAM_QUESTIONS = 100;
const MAX_COURSE_LINKS = 1000;

/** Status of one exam in the creator's library. */
export type ExamStage = "draft" | "sealed" | "ready" | "assigned" | "open";

/** All exams the signed-in creator owns, newest first, with release status. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    return identity ? listOwnedExams(ctx, identity.subject) : [];
  },
});

/** Shared by the Exams tab and the MCP `list_my_exams` tool. */
export async function listOwnedExams(ctx: QueryCtx, ownerId: string) {
    const drafts = await ctx.db.query("examBuilderDrafts")
      .withIndex("by_owner_course_updated", q => q.eq("ownerId", ownerId)).take(200);
    const courses = new Map<Id<"learnCollections">, Doc<"learnCollections"> | null>();
    const rows = [];
    for (const draft of drafts) {
      if (!courses.has(draft.courseId)) courses.set(draft.courseId, await ctx.db.get("learnCollections", draft.courseId));
      const course = courses.get(draft.courseId);
      if (!course || course.ownerId !== ownerId || course.communityState === "removed") continue;
      const release = await ctx.db.query("examReleases").withIndex("by_draft", q => q.eq("draftId", draft._id)).unique();
      const snapshot = release ? await ctx.db.get("examSnapshots", release.activeSnapshotId) : null;
      const stage: ExamStage = !release ? "draft"
        : release.studentEntryEnabled ? "open"
        : release.assignmentActive ? "assigned"
        : release.preparedForAudience ? "ready" : "sealed";
      rows.push({
        draftId: draft._id, title: draft.title, courseId: course._id, courseTitle: course.metadata.title,
        courseArchived: !!course.archived, targetCount: draft.targetCount, selectedCount: draft.selections.length,
        updatedAt: Math.max(draft.updatedAt, release?.updatedAt ?? 0), stage,
        sealedVersion: snapshot?.version ?? null,
        sealedIsCurrent: !!snapshot && snapshot.draftRevision === draft.revision,
        questionCount: snapshot?.questions.length ?? draft.targetCount,
        totalPoints: snapshot?.totalPoints ?? null,
        durationMinutes: release?.settings?.durationMinutes ?? null,
        settingsSaved: !!release?.settings,
      });
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Convert one quiz question, or explain why it cannot be an exam question. */
function convertQuestion(definition: Definition, field: Field): BankDraft | null {
  try {
    const [entry] = preparePublishedQuizForExam({ ...definition, fields: [field] },
      [{ id: "q", kind: "course", key: "", count: 1, points: 1 }]);
    const item = validateBankDraft(entry.item);
    // Choice/dropdown quiz questions with more than one key become multiple-answer questions.
    if (item.kind === "single_choice" && item.correctChoiceIds.length !== 1) return null;
    return item;
  } catch { return null; }
}

/**
 * Which published quiz questions can become exam questions. Pure, so the
 * Exams tab can show "12 of 14 questions can be used" before creating anything.
 */
export function quizExamCandidates(definition: Definition) {
  const questions = definition.fields.filter(f => f.type !== "section" && f.type !== "statement");
  const items: BankDraft[] = [];
  let skipped = 0;
  for (const field of questions) {
    const item = convertQuestion(definition, field);
    if (item) items.push(item); else skipped++;
  }
  return { items: items.slice(0, MAX_EXAM_QUESTIONS), skipped: skipped + Math.max(0, items.length - MAX_EXAM_QUESTIONS), total: questions.length };
}

async function publishedQuiz(ctx: MutationCtx, formId: Id<"forms">, ownerId: string) {
  const form = await ctx.db.get("forms", formId);
  if (!form || form.ownerId !== ownerId || form.isBanned ||
      !form.publishedVersion || !["live", "closed"].includes(form.status))
    throw new Error("NOT_FOUND: Publish the quiz before making an exam from it.");
  const published = await ctx.db.query("formVersions")
    .withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!))
    .unique();
  if (!published) throw new Error("NOT_FOUND: Published quiz version unavailable.");
  if (!published.definition.quiz?.enabled) throw new Error("NOT_A_QUIZ: Only graded quizzes can become exams. Turn the form into a quiz, mark the correct answers, publish it, then try again.");
  return { form, definition: published.definition };
}

/**
 * Make a complete course exam from a published quiz in one transaction:
 * copy its questions into the course question bank, build the exam, and
 * (by default) seal it and save its settings so it is ready to assign.
 * Never assigns the exam or opens student entry.
 */
const createArgs = {
  sourceFormId: v.id("forms"),
  courseId: v.optional(v.id("learnCollections")),
  /** Used when no courseId is given: a new course is created for the exam. */
  newCourseTitle: v.optional(v.string()),
  title: v.optional(v.string()),
  settings: v.optional(examSettings),
  seal: v.optional(v.boolean()),
};
type CreateArgs = { sourceFormId: Id<"forms">; courseId?: Id<"learnCollections">; newCourseTitle?: string; title?: string; settings?: Infer<typeof examSettings>; seal?: boolean };

/** Shared by the Library Exams tab and the MCP `create_exam_from_quiz` tool. */
export async function createExamFromQuiz(ctx: MutationCtx, args: CreateArgs, ownerId: string) {
    if (await creatorRestricted(ctx, ownerId)) throw new Error("FORBIDDEN: Account restricted.");
    const { form, definition } = await publishedQuiz(ctx, args.sourceFormId, ownerId);
    const { items, skipped } = quizExamCandidates(definition);
    if (!items.length)
      throw new Error("NO_EXAM_QUESTIONS: This quiz has no choice questions with answer keys. Exams need single- or multiple-answer questions with correct answers marked.");

    const courseId = args.courseId ?? await createCourse(ctx, { title: args.newCourseTitle?.trim() || form.title, language: definition.defaultLanguage }, ownerId);
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course || course.ownerId !== ownerId || course.communityState === "removed")
      throw new Error("NOT_FOUND: Course not found.");
    if (course.archived) throw new Error("COURSE_ARCHIVED: Restore the course before adding exams.");

    const existing = await ctx.db.query("questionBankLinks")
      .withIndex("by_course_module", q => q.eq("courseId", course._id)).take(MAX_COURSE_LINKS + 1);
    if (existing.length + items.length > MAX_COURSE_LINKS)
      throw new Error("LIMIT_REACHED: This course's question bank is full. Choose another course.");

    // Exam points are per allocation; keep the quiz's value when every question shares it.
    const points = [...new Set(items.map(i => i.points))];
    const mixedPoints = points.length > 1;
    const allocation = { id: "whole_course", kind: "course" as const, key: "", count: items.length, points: mixedPoints ? 1 : points[0] };
    const title = validatePlan(course, (args.title ?? form.title).trim().slice(0, 200) || "Untitled exam", items.length, [allocation]);

    const now = Date.now();
    const topic = form.title.trim().slice(0, 100);
    const selections = [];
    for (const item of items) {
      const questionId = await ctx.db.insert("questionBankItems", {
        ...item, topics: topic ? [topic] : [], ownerId, revision: 0, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("questionBankLinks", {
        ownerId, questionId, courseId: course._id,
        scopeKey: JSON.stringify([course._id, null, null]), createdAt: now,
      });
      selections.push({ questionId, allocationId: allocation.id });
    }
    const draftId = await ctx.db.insert("examBuilderDrafts", {
      ownerId, courseId: course._id, title, targetCount: items.length,
      allocations: [allocation], selections: [], revision: 0, createdAt: now, updatedAt: now,
    });
    const revision = await forMcpSetSelections(ctx, { draftId, expectedRevision: 0, selections }, ownerId);

    let sealed = false;
    if (args.seal !== false) {
      await forMcpSealDraft(ctx, { draftId, expectedRevision: revision }, ownerId);
      sealed = true;
      if (args.settings) await forMcpSaveForDraft(ctx, { draftId, expectedRevision: 0, settings: args.settings }, ownerId);
    }
    return { draftId, courseId: course._id, imported: items.length, skipped, mixedPoints, sealed };
}

/**
 * Make a complete course exam from a published quiz in one transaction:
 * copy its questions into the course question bank, build the exam, and
 * (by default) seal it and save its settings so it is ready to assign.
 * Never assigns the exam or opens student entry.
 */
export const createFromQuiz = mutation({
  args: createArgs,
  returns: v.object({
    draftId: v.id("examBuilderDrafts"), courseId: v.id("learnCollections"),
    imported: v.number(), skipped: v.number(), mixedPoints: v.boolean(), sealed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    return createExamFromQuiz(ctx, args, identity.subject);
  },
});

/** How many questions of a published quiz can become exam questions (for the Exams tab). */
export const quizReadiness = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    const identity = await getAuthIdentity(ctx);
    return identity ? quizExamReadiness(ctx, formId, identity.subject) : null;
  },
});

/** Shared by the Exams tab and the MCP `check_quiz_for_exam` tool. Null when not an owned, published, graded quiz. */
export async function quizExamReadiness(ctx: QueryCtx, formId: Id<"forms">, ownerId: string) {
    const form = await ctx.db.get("forms", formId);
    if (!form || form.ownerId !== ownerId || !form.publishedVersion) return null;
    const published = await ctx.db.query("formVersions")
      .withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!))
      .unique();
    if (!published?.definition.quiz?.enabled) return null;
    const { items, skipped, total } = quizExamCandidates(published.definition);
    return { title: form.title, usable: items.length, skipped, total, mixedPoints: new Set(items.map(i => i.points)).size > 1 };
}
