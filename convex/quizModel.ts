import { v } from "convex/values";
import type { Infer } from "convex/values";

export const quizQuestionFields = {
  type: v.union(v.literal("mcq"), v.literal("true_false"), v.literal("multi_select"), v.literal("written")),
  questionText: v.string(), options: v.optional(v.array(v.string())),
  correctAnswer: v.optional(v.string()), correctAnswers: v.optional(v.array(v.string())),
  keywords: v.optional(v.array(v.string())), explanation: v.optional(v.string()),
  points: v.number(), timeLimit: v.optional(v.number()), hint: v.optional(v.string()), order: v.number(),
};
export const savedQuestion = v.object({ _id: v.id("questions"), ...quizQuestionFields });
export const quizSnapshot = v.object({
  title: v.string(), description: v.optional(v.string()),
  questions: v.array(savedQuestion),
});
export type QuizQuestion = Infer<typeof savedQuestion>;

export function publicationErrors(title: string, questions: Omit<QuizQuestion, "_id">[]): string[] {
  const errors: string[] = [];
  if (!title.trim()) errors.push("Enter a title.");
  if (!questions.length) errors.push("Add at least one question.");
  if (questions.length > 200) errors.push("A quiz can contain at most 200 questions.");
  for (const [i, q] of questions.entries()) {
    const prefix = `Question ${i + 1}: `;
    if (!q.questionText.trim()) errors.push(prefix + "enter the question text.");
    if (!Number.isFinite(q.points) || q.points < 1) errors.push(prefix + "points must be a finite number of at least 1.");
    if (q.timeLimit !== undefined && (!Number.isFinite(q.timeLimit) || q.timeLimit <= 0)) errors.push(prefix + "timer must be positive.");
    if (q.type === "mcq" || q.type === "multi_select") {
      const options = q.options ?? [];
      if (options.length < 2 || options.some(o => !o.trim()) || new Set(options.map(o => o.trim().toLowerCase())).size !== options.length) errors.push(prefix + "provide at least two distinct, nonempty options.");
      if (q.type === "mcq" && (!q.correctAnswer || !options.includes(q.correctAnswer))) errors.push(prefix + "select a valid correct answer.");
      if (q.type === "multi_select" && (!q.correctAnswers?.length || q.correctAnswers.some(a => !options.includes(a)) || new Set(q.correctAnswers).size !== q.correctAnswers.length)) errors.push(prefix + "select valid, distinct correct answers.");
    }
    if (q.type === "true_false" && !["true", "false"].includes(q.correctAnswer?.toLowerCase() ?? "")) errors.push(prefix + "select True or False.");
    // Written questions without keywords keep their existing behaviour (full
    // marks, adjustable by manual review), so keywords stay optional.
    if (q.type === "written" && q.keywords?.some(k => !k.trim())) errors.push(prefix + "remove empty grading keywords.");
  }
  return errors;
}
