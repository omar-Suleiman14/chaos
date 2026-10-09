import { v } from "convex/values";

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
