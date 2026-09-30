// One-off, re-runnable data repairs for rows written by older versions.
//
// Nothing here runs automatically. An operator starts a repair with
// `npx convex run migrations:backfillSessionStatus '{"dryRun":true}'`, reads the counts, then
// runs it again without dryRun. Each function works one page at a time, so call it again with the
// returned `continueCursor` until `isDone` is true. Every repair is idempotent: a second run over
// the same data changes nothing. See docs/migrations.md for what each one does and how to undo it.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const pageArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  batchSize: v.optional(v.number()),
  /** Count what would change without writing. */
  dryRun: v.optional(v.boolean()),
};
const pageResult = v.object({
  scanned: v.number(),
  changed: v.number(),
  /** Ids of the rows that were (or, with dryRun, would be) changed, for the rollback record. */
  changedIds: v.array(v.string()),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
});

function pageSize(n: number | undefined): number {
  return Math.min(200, Math.max(1, Math.floor(n ?? 100)));
}

/**
 * Sessions saved before `status` existed have none. The indexed reads (library counts, results,
 * leaderboard, player limit) only see `status: "completed"`, so those attempts were invisible.
 * A session with `completedAt` was finished; one without it was still in progress.
 */
export const backfillSessionStatus = internalMutation({
  args: pageArgs,
  returns: pageResult,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("quizSessions").paginate({ numItems: pageSize(args.batchSize), cursor: args.cursor ?? null });
    const changedIds: string[] = [];
    for (const s of page.page) {
      if (s.status !== undefined) continue;
      changedIds.push(s._id);
      if (!args.dryRun) await ctx.db.patch("quizSessions", s._id, { status: s.completedAt !== undefined ? "completed" : "in_progress" });
    }
    return { scanned: page.page.length, changed: changedIds.length, changedIds, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor };
  },
});

type QuestionShape = Pick<Doc<"questions">, "type" | "options" | "correctAnswer" | "correctAnswers" | "keywords">;

/**
 * The old editor rewrote `type` to "mcq" on save, leaving the answer data of the real type behind.
 * Only unambiguous cases are repaired:
 *  - "mcq" with several correctAnswers and options is a multi-select question;
 *  - "mcq" or "true_false" with keywords, no options and no correctAnswer is a written question.
 * Anything else is left alone. Only `type` changes; no answer data is removed.
 */
export function repairedQuestionType(q: QuestionShape): QuestionShape["type"] | null {
  if (q.type === "mcq" && (q.correctAnswers?.length ?? 0) > 1 && (q.options?.length ?? 0) > 0) return "multi_select";
  if ((q.type === "mcq" || q.type === "true_false") && (q.keywords?.length ?? 0) > 0 && !q.options?.length && !q.correctAnswer) return "written";
  return null;
}

/** Repairs corrupted question types on live questions and on the frozen published copy. */
export const repairQuestionTypes = internalMutation({
  args: pageArgs,
  returns: pageResult,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("questions").paginate({ numItems: pageSize(args.batchSize), cursor: args.cursor ?? null });
    const changedIds: string[] = [];
    for (const q of page.page) {
      const fixed = repairedQuestionType(q);
      if (!fixed) continue;
      changedIds.push(q._id);
      if (!args.dryRun) await ctx.db.patch("questions", q._id, { type: fixed });
    }
    // Published copies live on the quiz row; a player reads these, not the live questions.
    const quizIds = new Set<Id<"quizzes">>(page.page.map((q) => q.quizId));
    for (const quizId of quizIds) {
      const quiz = await ctx.db.get("quizzes", quizId);
      if (!quiz?.publishedSnapshot) continue;
      let touched = false;
      const questions = quiz.publishedSnapshot.questions.map((sq) => {
        const fixed = repairedQuestionType(sq);
        if (!fixed) return sq;
        touched = true;
        changedIds.push(`snapshot:${sq._id}`);
        return { ...sq, type: fixed };
      });
      if (touched && !args.dryRun) await ctx.db.patch("quizzes", quiz._id, { publishedSnapshot: { ...quiz.publishedSnapshot, questions } });
    }
    return { scanned: page.page.length, changed: changedIds.length, changedIds, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor };
  },
});
