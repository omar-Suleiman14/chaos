import { v } from "convex/values";
export const metricsValidator = v.object({
  users: v.number(),
  forms: v.number(),
  quizzes: v.number(),
  pro: v.number(),
  restricted: v.number(),
  liveForms: v.number(),
  liveQuizzes: v.number(),
  responses: v.number(),
  partials: v.number(),
  completedAttempts: v.number(),
  attempts: v.number(),
  activeTodayQuizzes: v.optional(v.number()),
});
export const emptyMetrics = {
  users: 0,
  forms: 0,
  quizzes: 0,
  pro: 0,
  restricted: 0,
  liveForms: 0,
  liveQuizzes: 0,
  responses: 0,
  partials: 0,
  completedAttempts: 0,
  attempts: 0,
  activeTodayQuizzes: 0,
};
