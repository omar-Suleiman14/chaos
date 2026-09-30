import { action } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// Compatibility tombstones for stale clients and in-flight calls.
// Never access providers, storage, quotas, or stored content from these endpoints.

export const runAIQuizGeneration = action({
  args: {
    jobId: v.id("aiJobs"),
    extractedText: v.string(),
    mode: v.union(v.literal("quiz"), v.literal("lecture")),
    quizTitle: v.string(),
    totalQuestions: v.optional(v.number()),
    mcq: v.optional(v.number()),
    multiSelect: v.optional(v.number()),
    trueFalse: v.optional(v.number()),
    written: v.optional(v.number()),
    difficulty: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});
