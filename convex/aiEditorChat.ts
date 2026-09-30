import { action } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// Compatibility tombstones for stale clients and in-flight calls.
// Never access providers, storage, quotas, or stored content from these endpoints.

export const editQuizWithAI = action({
  args: {
    quizId: v.id("quizzes"),
    quizTitle: v.string(),
    questions: v.array(v.object({
      type: v.union(v.literal("mcq"), v.literal("true_false")),
      questionText: v.string(),
      options: v.array(v.string()),
      correctAnswer: v.string(),
      explanation: v.string(),
      points: v.number(),
      timeLimit: v.number(),
    })),
    message: v.string(),
  },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});
