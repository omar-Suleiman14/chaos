import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────
// FILE UPLOAD URL
// ─────────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─────────────────────────────────────────────────────────────
// JOB MANAGEMENT
// ─────────────────────────────────────────────────────────────

export const createAIJob = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;

    // Check elevation status
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (!user?.isElevated) {
      // Count AI quizzes created this calendar month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const thisMonthJobs = await ctx.db
        .query("aiJobs")
        .filter((q) =>
          q.and(
            q.eq(q.field("clerkId"), clerkId),
            q.eq(q.field("status"), "done"),
            q.gte(q.field("createdAt"), startOfMonth)
          )
        )
        .collect();

      if (thisMonthJobs.length >= 5) {
        throw new Error(
          "Monthly limit reached. You can generate up to 5 AI quizzes per month. Upgrade to an elevated account for unlimited access."
        );
      }
    }

    return await ctx.db.insert("aiJobs", {
      clerkId,
      status: "pending",
      step: "Queued...",
      createdAt: Date.now(),
    });
  },
});

export const cancelAIJob = mutation({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.clerkId !== identity.subject) throw new Error("Not found");
    // Only cancel if still in progress
    if (job.status !== "done" && job.status !== "error") {
      await ctx.db.patch(args.jobId, {
        status: "error",
        step: "Cancelled",
        error: "Cancelled by user.",
      });
    }
  },
});

export const getAIJob = query({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const job = await ctx.db.get(args.jobId);
    if (!job || job.clerkId !== identity.subject) return null;
    return job;
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
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    await ctx.db.patch(jobId, updates);
  },
});

// ─────────────────────────────────────────────────────────────
// SAVE GENERATED QUIZ (internal mutation)
// ─────────────────────────────────────────────────────────────

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
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new Error("User not found");

    const username = user.username;
    const baseSlug = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ai-quiz";

    let slug = baseSlug;
    let counter = 0;
    while (true) {
      const existing = await ctx.db
        .query("quizzes")
        .withIndex("by_creator_slug", (q) =>
          q.eq("creatorUsername", username).eq("slug", slug)
        )
        .first();
      if (!existing) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    const quizId = await ctx.db.insert("quizzes", {
      title: args.title,
      slug,
      creatorId: args.clerkId,
      creatorUsername: username,
      isPublished: true,
      timePerQuestion: 60,
      coverColor: "#6366f1",
      randomizeQuestions: true,
      randomizeOptions: true,
      isElevated: user.isElevated ?? false,
      isAiGenerated: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (let i = 0; i < args.questions.length; i++) {
      const q = args.questions[i];
      await ctx.db.insert("questions", {
        quizId,
        type: q.type,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.type === "true_false"
          ? (q.answerBool ? "True" : "False")
          : q.answer,
        correctAnswers: q.answers,
        keywords: q.keywords,
        explanation: q.explanation,
        points: 1,
        timeLimit: 30,
        order: i,
      });
    }

    return quizId;
  },
});
