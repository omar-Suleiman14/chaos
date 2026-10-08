/**
 * One-time retirement of classic quizzes (docs/classic-quiz-retirement.md).
 *
 *   npx convex run classicQuizMigration:start
 *
 * Three stages, each a chain of small batches, all safe to re-run:
 *   1. convert  every classic quiz into a quiz form owned by the same creator (questions, answer keys,
 *               marks, explanations; written answers become long-text questions). Published quizzes are
 *               published as version 1, archived ones archived, held ones held.
 *   2. repoint  lesson quiz blocks (drafts, published versions, recovery copies), lesson attachments,
 *               course modules (draft and published), folders and past live games to the new forms.
 *   3. purge    delete the classic quiz tables' rows: quizzes, questions, attempts, fork snapshots and
 *               lineage, author-index rows and classic quiz settings.
 * Past attempts and scores on classic quizzes are not carried over. `status` reports progress.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { checkDefinition, type FormDefinition } from "./formLogic";
import { toDefinition } from "./mcpContract";
import { quizFormQuestion } from "./integrationContract";
import { authorDb, changeCount } from "./authorIndex";
import { defaultFormSettings } from "./formModel";
import { randomCode } from "./serverUtils";

const BATCH = 25;
const stage = v.union(v.literal("convert"), v.literal("repoint"), v.literal("purge"));
type Stage = "convert" | "repoint" | "purge";
/** The tables each stage walks, in order. */
const REPOINT = ["lessons", "lessonVersions", "lessonDraftRecovery", "lessonAssessments", "learnCollections", "collectionVersions", "folderMembers", "liveGames"] as const;
const PURGE = ["questions", "quizSessions", "quizForkSnapshots", "quizForkLineage", "publicAuthorAssets", "aiJobs", "teacherSettings", "quizzes"] as const;

type QuestionShape = Pick<Doc<"questions">, "type" | "options" | "correctAnswer" | "correctAnswers" | "keywords">;

/**
 * The old editor rewrote `type` to "mcq" on save, leaving the answer data of the real type behind.
 * Only unambiguous cases are repaired before converting: "mcq" with several correctAnswers and
 * options is a multi-select question; "mcq" or "true_false" with keywords, no options and no
 * correctAnswer is a written question.
 */
export function repairedQuestionType(q: QuestionShape): QuestionShape["type"] {
  if (q.type === "mcq" && (q.correctAnswers?.length ?? 0) > 1 && (q.options?.length ?? 0) > 0) return "multi_select";
  if ((q.type === "mcq" || q.type === "true_false") && (q.keywords?.length ?? 0) > 0 && !q.options?.length && !q.correctAnswer) return "written";
  return q.type;
}

async function definitionFor(ctx: MutationCtx, quiz: Doc<"quizzes">): Promise<FormDefinition> {
  const live = await ctx.db.query("questions").withIndex("by_quiz_deleted_order", (q) => q.eq("quizId", quiz._id).eq("deletedAt", undefined)).take(200);
  const source = live.length ? live : quiz.publishedSnapshot?.questions ?? [];
  return toDefinition({ title: quiz.title.slice(0, 200) || "Untitled quiz", description: quiz.description?.slice(0, 5000), quizMode: true, questions: source.slice(0, 200).map((q) => quizFormQuestion({ ...q, type: repairedQuestionType(q) })) });
}

async function uniqueShareId(ctx: MutationCtx) {
  for (;;) {
    const shareId = randomCode(10).toLowerCase();
    if (!(await ctx.db.query("forms").withIndex("by_shareId", (q) => q.eq("shareId", shareId)).first())) return shareId;
  }
}

/** Creates (and, when the quiz was live, publishes) the quiz form for one classic quiz. */
async function convertOne(ctx: MutationCtx, quiz: Doc<"quizzes">) {
  if (await ctx.db.query("classicQuizConversions").withIndex("by_quizId", (q) => q.eq("quizId", quiz._id)).unique()) return;
  const definition = await definitionFor(ctx, quiz);
  const now = Date.now();
  const formId = await authorDb(ctx).insert("forms", {
    ownerId: quiz.creatorId, title: definition.title, shareId: await uniqueShareId(ctx), status: "draft", draft: definition, draftRevision: 1,
    settings: defaultFormSettings, responseCount: 0, partialCount: 0, source: { kind: "import", label: "Classic quiz" },
    ...(quiz.groupName ? { groupName: quiz.groupName } : {}), ...(quiz.isBanned ? { isBanned: true } : {}), createdAt: quiz.createdAt, updatedAt: now,
  });
  await ctx.db.insert("formAggregates", { formId, counts: {}, totalDurationMs: 0, timedCount: 0 });
  // Live classic quizzes stay live, if the converted questions publish cleanly; otherwise the creator finishes the draft.
  if (quiz.isPublished && !quiz.isBanned && !checkDefinition(definition).errors.length) {
    await ctx.db.insert("formVersions", { formId, version: 1, definition, publishedAt: now, publishedBy: quiz.creatorUsername || "Chaos", draftRevision: 1 });
    await authorDb(ctx).patch("forms", formId, { status: "live", publishedVersion: 1, publishedRevision: 1 });
  }
  if (quiz.archived) await authorDb(ctx).patch("forms", formId, { status: "archived" });
  await ctx.db.insert("classicQuizConversions", { quizId: quiz._id, formId, username: quiz.creatorUsername.toLowerCase(), slug: quiz.slug, convertedAt: now });
}

async function formFor(ctx: MutationCtx, quizId: string): Promise<Id<"forms"> | null> {
  return (await ctx.db.query("classicQuizConversions").withIndex("by_quizId", (q) => q.eq("quizId", quizId)).unique())?.formId ?? null;
}

type Block = { type: string; asset?: { kind: string; id: string } } & Record<string, unknown>;
/** Re-points quiz blocks in a lesson document; quiz blocks whose quiz is gone are dropped. */
async function repointDocument(ctx: MutationCtx, document: { schemaVersion: 1; blocks: Block[] }) {
  let changed = false;
  const blocks: Block[] = [];
  for (const block of document.blocks) {
    if (block.type !== "quiz" || block.asset?.kind !== "quiz") { blocks.push(block); continue; }
    changed = true;
    const formId = await formFor(ctx, block.asset.id);
    if (formId) blocks.push({ ...block, asset: { kind: "form", id: formId } });
  }
  return changed ? { ...document, blocks } : null;
}

/** Course module assessments ({kind, id}) re-pointed; missing quizzes are dropped. */
async function repointModules<M extends { assessments: { kind: "form" | "quiz"; id: string }[] }>(ctx: MutationCtx, modules: M[] | undefined): Promise<M[] | null> {
  if (!modules?.some((m) => m.assessments.some((a) => a.kind === "quiz"))) return null;
  const out: M[] = [];
  for (const m of modules) {
    const assessments: M["assessments"] = [];
    for (const a of m.assessments) {
      if (a.kind !== "quiz") { assessments.push(a); continue; }
      const formId = await formFor(ctx, a.id);
      if (formId && !assessments.some((x) => x.kind === "form" && x.id === formId)) assessments.push({ kind: "form", id: formId });
    }
    out.push({ ...m, assessments });
  }
  return out;
}

async function repointRow(ctx: MutationCtx, table: (typeof REPOINT)[number], row: Record<string, unknown> & { _id: string }) {
  const db = authorDb(ctx) as unknown as { patch: (t: string, id: string, v: Record<string, unknown>) => Promise<void>; delete: (t: string, id: string) => Promise<void> };
  if (table === "lessons") { const draft = await repointDocument(ctx, row.draft as never); if (draft) await db.patch(table, row._id, { draft }); return; }
  if (table === "lessonVersions" || table === "lessonDraftRecovery") { const document = await repointDocument(ctx, row.document as never); if (document) await ctx.db.patch(table as "lessonVersions", row._id as Id<"lessonVersions">, { document } as never); return; }
  if (table === "lessonAssessments" || table === "folderMembers") {
    const asset = row.asset as { kind: string; id: string };
    if (asset.kind !== "quiz") return;
    const formId = await formFor(ctx, asset.id);
    if (formId) await ctx.db.patch(table as "lessonAssessments", row._id as Id<"lessonAssessments">, { asset: { kind: "form", id: formId } } as never);
    else await ctx.db.delete(table as "lessonAssessments", row._id as Id<"lessonAssessments">);
    return;
  }
  if (table === "learnCollections" || table === "collectionVersions") {
    const modules = await repointModules(ctx, row.modules as never);
    if (modules) await (table === "learnCollections" ? db.patch(table, row._id, { modules }) : ctx.db.patch("collectionVersions", row._id as Id<"collectionVersions">, { modules } as never));
    return;
  }
  if (table === "liveGames" && row.quizId) {
    // Past games keep their own question snapshot; they now point at the converted quiz form.
    const formId = await formFor(ctx, row.quizId as string);
    await ctx.db.patch("liveGames", row._id as Id<"liveGames">, { quizId: undefined, ...(formId ? { formId } : {}) });
  }
}

async function purgeRow(ctx: MutationCtx, table: (typeof PURGE)[number], row: Record<string, unknown> & { _id: string }) {
  if (table === "publicAuthorAssets") {
    if (row.table !== "quizzes") return;
    await ctx.db.delete("publicAuthorAssets", row._id as Id<"publicAuthorAssets">);
    await changeCount(ctx, row.ownerId as string, -1);
    return;
  }
  if (table === "aiJobs") { if (row.quizId) await ctx.db.patch("aiJobs", row._id as Id<"aiJobs">, { quizId: undefined }); return; }
  if (table === "quizForkLineage") {
    const refs = [row.asset, row.parent, row.root, row.parentVersion, row.rootVersion] as { kind: string }[];
    if (refs.some((r) => r.kind === "quiz")) await ctx.db.delete("quizForkLineage", row._id as Id<"quizForkLineage">);
    return;
  }
  await ctx.db.delete(table as "quizzes", row._id as Id<"quizzes">);
}

/** One batch of one stage; schedules the next batch, the next table, or the next stage. */
export const step = internalMutation({
  args: { stage, table: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tables: readonly string[] = args.stage === "convert" ? ["quizzes"] : args.stage === "repoint" ? REPOINT : PURGE;
    const table = tables[args.table];
    if (!table) {
      const next: Stage | null = args.stage === "convert" ? "repoint" : args.stage === "repoint" ? "purge" : null;
      if (next) await ctx.scheduler.runAfter(0, internal.classicQuizMigration.step, { stage: next, table: 0, cursor: null });
      else console.log("classicQuizMigration: done");
      return null;
    }
    const page = await ctx.db.query(table as "quizzes").paginate({ numItems: BATCH, cursor: args.cursor });
    for (const row of page.page) {
      if (args.stage === "convert") await convertOne(ctx, row);
      else if (args.stage === "repoint") await repointRow(ctx, table as (typeof REPOINT)[number], row as never);
      else await purgeRow(ctx, table as (typeof PURGE)[number], row as never);
    }
    await ctx.scheduler.runAfter(0, internal.classicQuizMigration.step, page.isDone ? { stage: args.stage, table: args.table + 1, cursor: null } : { stage: args.stage, table: args.table, cursor: page.continueCursor });
    return null;
  },
});

/** Starts the retirement from the first stage. Re-running resumes harmlessly: converted quizzes are skipped. */
export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => { await ctx.scheduler.runAfter(0, internal.classicQuizMigration.step, { stage: "convert", table: 0, cursor: null }); return null; },
});

/** How far the retirement got: classic quizzes left, conversions made. */
export const status = internalQuery({
  args: {},
  returns: v.object({ quizzesLeft: v.number(), conversions: v.number() }),
  handler: async (ctx) => ({
    quizzesLeft: (await ctx.db.query("quizzes").take(1000)).length,
    conversions: (await ctx.db.query("classicQuizConversions").take(10000)).length,
  }),
});
