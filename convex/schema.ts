import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============ USERS ============
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    username: v.string(),
    imageUrl: v.optional(v.string()),
    isBanned: v.optional(v.boolean()),
    isElevated: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_username", ["username"]),

  // ============ TEACHER SETTINGS (Auto Settings) ============
  teacherSettings: defineTable({
    clerkId: v.string(),
    defaultMcqTimer: v.optional(v.number()),       // seconds, default 60
    defaultWrittenTimer: v.optional(v.number()),    // seconds, default 300
    defaultPointsPerQuestion: v.optional(v.number()), // default 10
    halfMarkThreshold: v.optional(v.number()),      // percentage, default 50
    randomizeQuestions: v.optional(v.boolean()),     // default false
    randomizeOptions: v.optional(v.boolean()),       // default false
    showCorrectAnswers: v.optional(v.boolean()),     // default true
    showExplanations: v.optional(v.boolean()),       // default true
    displayMode: v.optional(v.string()),             // "score" | "pass_fail"
    passingThreshold: v.optional(v.number()),        // 0-100, default 50
  }).index("by_clerkId", ["clerkId"]),

  // ============ QUIZZES ============
  quizzes: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    slug: v.string(),             // URL-safe slug (unique per creator)
    creatorId: v.string(),        // clerkId
    creatorUsername: v.string(),   // cached for URL routing
    isPublished: v.boolean(),
    tags: v.optional(v.array(v.string())),
    groupName: v.optional(v.string()),
    timePerQuestion: v.optional(v.number()),
    coverColor: v.optional(v.string()),
    randomizeQuestions: v.optional(v.boolean()),
    randomizeOptions: v.optional(v.boolean()),
    showCorrectAnswers: v.optional(v.boolean()),
    showExplanations: v.optional(v.boolean()),
    displayMode: v.optional(v.string()),             // "score" | "pass_fail"
    passingThreshold: v.optional(v.number()),        // 0-100
    isBanned: v.optional(v.boolean()),
    isElevated: v.optional(v.boolean()),
    isAiGenerated: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creator", ["creatorId"])
    .index("by_slug", ["slug"])
    .index("by_creator_slug", ["creatorUsername", "slug"]),

  // ============ QUESTIONS ============
  questions: defineTable({
    quizId: v.id("quizzes"),
    type: v.union(
      v.literal("mcq"),
      v.literal("true_false"),
      v.literal("multi_select"),
      v.literal("written")
    ),
    questionText: v.string(),
    options: v.optional(v.array(v.string())),
    // Answers stored server-side only — never sent to client
    correctAnswer: v.optional(v.string()),
    correctAnswers: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    explanation: v.optional(v.string()),
    points: v.number(),
    timeLimit: v.optional(v.number()),
    hint: v.optional(v.string()),
    order: v.number(),
  }).index("by_quiz", ["quizId"]),

  // ============ QUIZ SUBMISSIONS ============
  quizSessions: defineTable({
    quizId: v.id("quizzes"),
    playerName: v.string(),
    status: v.optional(v.union(
      v.literal("in_progress"),
      v.literal("completed")
    )),
    score: v.number(),
    totalPoints: v.number(),
    answers: v.array(
      v.object({
        questionId: v.id("questions"),
        answer: v.string(),
        isCorrect: v.boolean(),
        pointsEarned: v.number(),
        timeTaken: v.optional(v.number()),
      })
    ),
    completedAt: v.optional(v.number()),
    startedAt: v.number(),
  })
    .index("by_quiz", ["quizId"])
    .index("by_quiz_score", ["quizId", "score"]),

  // ============ AI JOBS ============
  aiJobs: defineTable({
    clerkId: v.string(),
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
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  // ============ GLOBAL CONFIGURATION ============
  globalConfig: defineTable({
    aiLimitPopupText: v.optional(v.string()),
    playerLimitErrorText: v.optional(v.string()),
    defaultMcqTimer: v.optional(v.number()),
    defaultWrittenTimer: v.optional(v.number()),
    defaultPointsPerQuestion: v.optional(v.number()),
    halfMarkThreshold: v.optional(v.number()),
    randomizeQuestions: v.optional(v.boolean()),
    randomizeOptions: v.optional(v.boolean()),
    showCorrectAnswers: v.optional(v.boolean()),
    showExplanations: v.optional(v.boolean()),
    displayMode: v.optional(v.string()),             // "score" | "pass_fail"
    passingThreshold: v.optional(v.number()),        // 0-100, default 50
  }),
});
