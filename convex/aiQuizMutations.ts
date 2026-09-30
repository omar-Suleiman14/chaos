import { mutation, query, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// Compatibility tombstones for stale clients and in-flight calls.
// Never access providers, storage, quotas, or stored content from these endpoints.

export const generateUploadUrl = mutation({
  args: {},
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const createAIJob = mutation({
  args: {},
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const cancelAIJob = mutation({
  args: { jobId: v.id("aiJobs") },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const failAIJob = mutation({
  args: {
    jobId: v.id("aiJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const getAIJob = query({
  args: { jobId: v.id("aiJobs") },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const updateAIJob = internalMutation({
  args: {
    jobId: v.id("aiJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("categorizing"),
      v.literal("generating"),
      v.literal("saving"),
      v.literal("done"),
      v.literal("error")
    ),
    step: v.optional(v.string()),
    quizId: v.optional(v.id("quizzes")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});

export const saveGeneratedQuiz = internalMutation({
  args: {
    clerkId: v.string(),
    title: v.string(),
    questions: v.array(v.object({
      type: v.union(v.literal("mcq"), v.literal("true_false"), v.literal("multi_select"), v.literal("written")),
      questionText: v.string(),
      options: v.optional(v.array(v.string())),
      answer: v.optional(v.string()),
      answers: v.optional(v.array(v.string())),
      answerBool: v.optional(v.boolean()),
      keywords: v.optional(v.array(v.string())),
      explanation: v.optional(v.string()),
    })),
  },
  returns: v.null(),
  handler: async () => {
    throw new ConvexError({
      code: "AI_FEATURE_RETIRED",
      message: "AI features have been retired. Your existing quizzes and results are preserved. Use the manual editor.",
    });
  },
});
