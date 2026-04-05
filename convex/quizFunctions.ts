import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// Server-side admin list — the ONLY source of truth for admin access
const ADMIN_EMAILS = ["support@chaos.fail", "khomod14@gmail.com"];

async function requireAdmin(ctx: any): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const email = (identity.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    throw new Error("Forbidden: admin access required");
  }
}

// ============================================================
// USER FUNCTIONS
// ============================================================

export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      // Update fields if changed
      const updates: Record<string, unknown> = {};
      if (identity.name && identity.name !== existing.name) updates.name = identity.name;
      if (identity.email && identity.email !== existing.email) updates.email = identity.email;
      if (identity.pictureUrl && identity.pictureUrl !== existing.imageUrl) updates.imageUrl = identity.pictureUrl;

      const newUsername = identity.nickname?.toLowerCase().replace(/[^a-z0-9_.-]+/g, "");
      if (newUsername && newUsername !== existing.username) {
        updates.username = newUsername;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, updates);

        // Update all quizzes to reflect the new username url
        if (updates.username) {
          const quizzes = await ctx.db
            .query("quizzes")
            .withIndex("by_creator", (q) => q.eq("creatorId", identity.subject))
            .collect();
          for (const quiz of quizzes) {
            await ctx.db.patch(quiz._id, { creatorUsername: newUsername });
          }
        }
      }
      return existing._id;
    }

    const username = "user" + Math.floor(10000 + Math.random() * 90000);

    const displayName =
      identity.nickname ||
      identity.name ||
      identity.givenName ||
      "Anonymous";

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: displayName,
      email: identity.email || "",
      username,
      imageUrl: identity.pictureUrl,
      createdAt: Date.now(),
    });
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const newUsername = args.username.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "");
    if (newUsername.length < 3) throw new Error("Username too short");
    
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", newUsername))
      .first();
    if (existing && existing._id !== user._id) {
      throw new Error("Username already taken");
    }

    await ctx.db.patch(user._id, { username: newUsername });

    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_creator", (q) => q.eq("creatorId", identity.subject))
      .collect();
    for (const quiz of quizzes) {
      await ctx.db.patch(quiz._id, { creatorUsername: newUsername });
    }

    return true;
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
  },
});

// ============================================================
// TEACHER SETTINGS
// ============================================================

export const getTeacherSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const settings = await ctx.db
      .query("teacherSettings")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    // Return defaults if no settings exist
    return {
      defaultMcqTimer: settings?.defaultMcqTimer ?? 60,
      defaultWrittenTimer: settings?.defaultWrittenTimer ?? 300,
      defaultPointsPerQuestion: settings?.defaultPointsPerQuestion ?? 10,
      halfMarkThreshold: settings?.halfMarkThreshold ?? 50,
      randomizeQuestions: settings?.randomizeQuestions ?? false,
      randomizeOptions: settings?.randomizeOptions ?? false,
      showCorrectAnswers: settings?.showCorrectAnswers ?? true,
      showExplanations: settings?.showExplanations ?? true,
      displayMode: settings?.displayMode ?? "score",
      passingThreshold: settings?.passingThreshold ?? 50,
    };
  },
});

export const updateTeacherSettings = mutation({
  args: {
    defaultMcqTimer: v.optional(v.number()),
    defaultWrittenTimer: v.optional(v.number()),
    defaultPointsPerQuestion: v.optional(v.number()),
    halfMarkThreshold: v.optional(v.number()),
    randomizeQuestions: v.optional(v.boolean()),
    randomizeOptions: v.optional(v.boolean()),
    showCorrectAnswers: v.optional(v.boolean()),
    showExplanations: v.optional(v.boolean()),
    displayMode: v.optional(v.string()),
    passingThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("teacherSettings")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) updates[key] = value;
      }
      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("teacherSettings", {
        clerkId: identity.subject,
        ...args,
      });
    }
  },
});

// ============================================================
// QUIZ FUNCTIONS
// ============================================================

export const createQuiz = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    groupName: v.optional(v.string()),
    timePerQuestion: v.optional(v.number()),
    coverColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get user for username
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    const username = user?.username || identity.subject;

    // Inherit teacher settings as defaults
    const teacherSettings = await ctx.db
      .query("teacherSettings")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    const baseSlug = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check uniqueness of slug for this creator
    const globalConfig = await ctx.db.query("globalConfig").first() || ({} as any);

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

    return await ctx.db.insert("quizzes", {
      title: args.title,
      description: args.description,
      groupName: args.groupName,
      slug,
      creatorId: identity.subject,
      creatorUsername: username,
      isPublished: false,
      timePerQuestion: args.timePerQuestion || globalConfig.defaultMcqTimer || 30,
      coverColor: args.coverColor || "#22c55e",
      randomizeQuestions: teacherSettings?.randomizeQuestions ?? globalConfig.randomizeQuestions ?? false,
      randomizeOptions: teacherSettings?.randomizeOptions ?? globalConfig.randomizeOptions ?? false,
      showCorrectAnswers: teacherSettings?.showCorrectAnswers ?? globalConfig.showCorrectAnswers ?? true,
      showExplanations: teacherSettings?.showExplanations ?? globalConfig.showExplanations ?? true,
      isElevated: user?.isElevated ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateQuiz = mutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    groupName: v.optional(v.string()),
    timePerQuestion: v.optional(v.number()),
    coverColor: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    randomizeQuestions: v.optional(v.boolean()),
    randomizeOptions: v.optional(v.boolean()),
    showCorrectAnswers: v.optional(v.boolean()),
    showExplanations: v.optional(v.boolean()),
    displayMode: v.optional(v.string()),
    passingThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Quiz not found or unauthorized");
    }

    const { quizId, ...rest } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) updates[key] = value;
    }

    // If slug changed, validate uniqueness
    if (updates.slug && updates.slug !== quiz.slug) {
      const existing = await ctx.db
        .query("quizzes")
        .withIndex("by_creator_slug", (q) =>
          q.eq("creatorUsername", quiz.creatorUsername).eq("slug", updates.slug as string)
        )
        .first();
      if (existing && existing._id !== quizId) {
        throw new Error("Slug already taken");
      }
    }

    await ctx.db.patch(quizId, updates);
  },
});

export const deleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Quiz not found or unauthorized");
    }

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();
    for (const question of questions) {
      await ctx.db.delete(question._id);
    }

    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(args.quizId);
  },
});

export const getMyQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_creator", (q) => q.eq("creatorId", identity.subject))
      .collect();

    if (quizzes.length === 0) return [];

    // Batch-fetch all questions and sessions for this creator's quizzes
    const [allQuestions, allSessions] = await Promise.all([
      Promise.all(quizzes.map((quiz) =>
        ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).collect()
      )),
      Promise.all(quizzes.map((quiz) =>
        ctx.db.query("quizSessions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).collect()
      )),
    ]);

    const enriched = quizzes.map((quiz, i) => {
      const questions = allQuestions[i];
      const completedSessions = allSessions[i].filter((s) => s.status === "completed");
      const avgScore =
        completedSessions.length > 0
          ? completedSessions.reduce((sum, s) => sum + (s.totalPoints > 0 ? (s.score / s.totalPoints) * 100 : 0), 0) /
            completedSessions.length
          : 0;

      return {
        ...quiz,
        questionCount: questions.length,
        sessionCount: completedSessions.length,
        avgScore: Math.round(avgScore),
      };
    });

    return enriched.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getQuiz = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    // Only the creator or an admin can see unpublished quizzes
    if (!quiz.isPublished) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return null;
      const email = (identity.email || "").toLowerCase();
      const isOwner = quiz.creatorId === identity.subject;
      const isAdmin = ADMIN_EMAILS.includes(email);
      if (!isOwner && !isAdmin) return null;
    }

    return quiz;
  },
});

export const getQuizBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quizzes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getQuizByUsernameSlug = query({
  args: { username: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quizzes")
      .withIndex("by_creator_slug", (q) =>
        q.eq("creatorUsername", args.username).eq("slug", args.slug)
      )
      .first();
  },
});

export const validateSlug = mutation({
  args: { slug: v.string(), quizId: v.optional(v.id("quizzes")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return false;

    const existing = await ctx.db
      .query("quizzes")
      .withIndex("by_creator_slug", (q) =>
        q.eq("creatorUsername", user.username).eq("slug", args.slug)
      )
      .first();

    if (!existing) return true;
    if (args.quizId && existing._id === args.quizId) return true;
    return false;
  },
});

// ============================================================
// QUESTION FUNCTIONS
// ============================================================

export const addQuestion = mutation({
  args: {
    quizId: v.id("quizzes"),
    type: v.union(
      v.literal("mcq"),
      v.literal("true_false"),
      v.literal("multi_select"),
      v.literal("written")
    ),
    questionText: v.string(),
    options: v.optional(v.array(v.string())),
    correctAnswer: v.optional(v.string()),
    correctAnswers: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    explanation: v.optional(v.string()),
    points: v.number(),
    timeLimit: v.optional(v.number()),
    hint: v.optional(v.string()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Quiz not found or unauthorized");
    }

    return await ctx.db.insert("questions", {
      quizId: args.quizId,
      type: args.type,
      questionText: args.questionText,
      options: args.options,
      correctAnswer: args.correctAnswer,
      correctAnswers: args.correctAnswers,
      keywords: args.keywords,
      explanation: args.explanation,
      points: args.points,
      timeLimit: args.timeLimit,
      hint: args.hint,
      order: args.order,
    });
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    type: v.optional(
      v.union(
        v.literal("mcq"),
        v.literal("true_false"),
        v.literal("multi_select"),
        v.literal("written")
      )
    ),
    questionText: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    correctAnswer: v.optional(v.string()),
    correctAnswers: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    explanation: v.optional(v.string()),
    points: v.optional(v.number()),
    timeLimit: v.optional(v.number()),
    hint: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const quiz = await ctx.db.get(question.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const { questionId, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) cleanUpdates[key] = value;
    }

    await ctx.db.patch(args.questionId, cleanUpdates);
  },
});

export const deleteQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const quiz = await ctx.db.get(question.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.questionId);
  },
});

export const getQuestions = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();

    return questions.sort((a, b) => a.order - b.order);
  },
});

// ============================================================
// QUIZ PLAYER — Safe queries (NO answers sent to client)
// ============================================================

export const getQuizForPlayer = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return null;

    // SECURITY CHECK: If unpublished, only the creator or an admin can access questions
    if (!quiz.isPublished) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return null;
      const email = (identity.email || "").toLowerCase();
      const isOwner = quiz.creatorId === identity.subject;
      const isAdmin = ADMIN_EMAILS.includes(email);
      if (!isOwner && !isAdmin) return null;
    }

    // Fetch creator and questions in parallel
    const [creator, questions] = await Promise.all([
      ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId)).first(),
      ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", args.quizId)).collect(),
    ]);

    // NEVER send answers/keywords to client
    const safeQuestions = questions
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        _id: q._id,
        type: q.type,
        questionText: q.questionText,
        options: q.options,
        points: q.points,
        timeLimit: q.timeLimit,
        order: q.order,
      }));

    // Short-circuit: only fetch fallback settings if quiz doesn't have all fields defined
    const quizHasAllSettings = quiz.displayMode !== undefined &&
      quiz.passingThreshold !== undefined &&
      quiz.showCorrectAnswers !== undefined &&
      quiz.showExplanations !== undefined &&
      quiz.randomizeQuestions !== undefined &&
      quiz.randomizeOptions !== undefined;

    let teacherSettings: any = null;
    let globalConfig: any = null;
    if (!quizHasAllSettings) {
      [teacherSettings, globalConfig] = await Promise.all([
        ctx.db.query("teacherSettings").withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId)).first(),
        ctx.db.query("globalConfig").first(),
      ]);
    }

    const displayMode = quiz.displayMode ?? teacherSettings?.displayMode ?? globalConfig?.displayMode ?? "score";
    const passingThreshold = quiz.passingThreshold ?? teacherSettings?.passingThreshold ?? globalConfig?.passingThreshold ?? 50;
    const showCorrectAnswers = quiz.showCorrectAnswers ?? teacherSettings?.showCorrectAnswers ?? globalConfig?.showCorrectAnswers ?? true;
    const showExplanations = quiz.showExplanations ?? teacherSettings?.showExplanations ?? globalConfig?.showExplanations ?? true;
    const randomizeQuestions = quiz.randomizeQuestions ?? teacherSettings?.randomizeQuestions ?? globalConfig?.randomizeQuestions ?? false;
    const randomizeOptions = quiz.randomizeOptions ?? teacherSettings?.randomizeOptions ?? globalConfig?.randomizeOptions ?? true;

    return {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      isPublished: quiz.isPublished,
      coverColor: quiz.coverColor,
      creatorName: creator?.name || "Unknown",
      creatorUsername: quiz.creatorUsername,
      showCorrectAnswers,
      showExplanations,
      randomizeQuestions,
      randomizeOptions,
      displayMode,
      passingThreshold,
      questions: safeQuestions,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
    };
  },
});

// Start a quiz session
export const startQuizSession = mutation({
  args: {
    quizId: v.id("quizzes"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    // Sanitize name
    const name = args.playerName.trim().replace(/<[^>]*>/g, "").substring(0, 100);
    if (!name) throw new Error("Name is required");

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || !quiz.isPublished) throw new Error("Quiz not available");

    // Enforce 100-play cap unless the quiz itself or the creator is elevated
    const isQuizElevated = quiz.isElevated === true;
    let isCreatorElevated = false;
    if (!isQuizElevated) {
      const creator = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
        .first();
      isCreatorElevated = creator?.isElevated === true;
    }

    if (!isQuizElevated && !isCreatorElevated) {
      // Only fetch up to 101 sessions to check the cap — no need to load all
      const sessions = await ctx.db
        .query("quizSessions")
        .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
        .take(500);
      const completedCount = sessions.filter((s) => s.status === "completed").length;
      if (completedCount >= 100) {
        const globalConfig = await ctx.db.query("globalConfig").first();
        const errorMessage = globalConfig?.playerLimitErrorText || "This quiz has reached its maximum allocated session capacity. Please contact the quiz creator to allocate additional capacity.";
        throw new Error(errorMessage);
      }
    }

    return await ctx.db.insert("quizSessions", {
      quizId: args.quizId,
      playerName: name,
      status: "in_progress",
      score: 0,
      totalPoints: 0,
      answers: [],
      startedAt: Date.now(),
    });
  },
});

// Grade a single answer — server-side only
export const gradeAnswer = mutation({
  args: {
    sessionId: v.id("quizSessions"),
    questionId: v.id("questions"),
    answer: v.string(),
    timeTaken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "in_progress") {
      throw new Error("Session not found or already completed");
    }

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    // Get teacher settings for half mark threshold
    const quiz = await ctx.db.get(session.quizId);
    let halfMarkThreshold = 50;
    if (quiz) {
      const settings = await ctx.db
        .query("teacherSettings")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
        .first();
      if (settings?.halfMarkThreshold) {
        halfMarkThreshold = settings.halfMarkThreshold;
      }
    }

    let isCorrect = false;
    let pointsEarned = 0;
    const rawAnswer = args.answer.trim();

    switch (question.type) {
      case "mcq":
      case "true_false": {
        isCorrect =
          rawAnswer.toLowerCase() ===
          (question.correctAnswer || "").toLowerCase().trim();
        pointsEarned = isCorrect ? question.points : 0;
        break;
      }
      case "multi_select": {
        const selected = rawAnswer
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .sort();
        const correct = (question.correctAnswers || [])
          .map((s) => s.toLowerCase().trim())
          .sort();
        isCorrect = JSON.stringify(selected) === JSON.stringify(correct);
        pointsEarned = isCorrect ? question.points : 0;
        break;
      }
      case "written": {
        const answerLower = rawAnswer.toLowerCase();
        const keywords = question.keywords || [];
        if (keywords.length === 0) {
          // No keywords set = auto full marks
          isCorrect = true;
          pointsEarned = question.points;
        } else {
          const matched = keywords.filter((kw) =>
            answerLower.includes(kw.toLowerCase().trim())
          );
          const ratio = matched.length / keywords.length;
          pointsEarned = Math.round(question.points * ratio);
          isCorrect = ratio >= 1.0;
        }
        break;
      }
    }

    // Update session
    const newAnswers = [
      ...session.answers,
      {
        questionId: args.questionId,
        answer: rawAnswer,
        isCorrect,
        pointsEarned,
        timeTaken: args.timeTaken,
      },
    ];

    const newScore = session.score + pointsEarned;
    const newTotalPoints = session.totalPoints + question.points;

    await ctx.db.patch(args.sessionId, {
      answers: newAnswers,
      score: newScore,
      totalPoints: newTotalPoints,
    });

    // Return result — never return correct answer or keywords
    return {
      isCorrect,
      pointsEarned,
      totalPointsPossible: question.points,
      // Only reveal correct answer if quiz settings allow
      correctAnswer: quiz?.showCorrectAnswers !== false
        ? (question.type === "mcq" || question.type === "true_false"
          ? question.correctAnswer
          : question.type === "multi_select"
            ? question.correctAnswers?.join(", ")
            : undefined)
        : undefined,
      explanation: quiz?.showExplanations !== false ? question.explanation : undefined,
    };
  },
});

// Complete a quiz session
export const completeQuizSession = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "in_progress") throw new Error("Session already completed");

    await ctx.db.patch(args.sessionId, {
      status: "completed",
      completedAt: Date.now(),
    });

    return {
      score: session.score,
      totalPoints: session.totalPoints,
      answers: session.answers,
    };
  },
});

// Legacy bulk submit (kept for compatibility)
export const submitQuizSession = mutation({
  args: {
    quizId: v.id("quizzes"),
    playerName: v.string(),
    answers: v.array(
      v.object({
        questionId: v.id("questions"),
        answer: v.string(),
        timeTaken: v.optional(v.number()),
      })
    ),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error("Quiz not found");
    if (!quiz.isPublished) throw new Error("Quiz not available");

    // Enforce play cap (same logic as startQuizSession)
    const isQuizElevated = quiz.isElevated === true;
    let isCreatorElevated = false;
    if (!isQuizElevated) {
      const creator = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
        .first();
      isCreatorElevated = creator?.isElevated === true;
    }
    if (!isQuizElevated && !isCreatorElevated) {
      const sessions = await ctx.db
        .query("quizSessions")
        .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
        .take(500);
      if (sessions.filter((s) => s.status === "completed").length >= 100) {
        const globalConfig = await ctx.db.query("globalConfig").first();
        throw new Error(globalConfig?.playerLimitErrorText || "This quiz has reached its maximum allocated session capacity.");
      }
    }

    let totalScore = 0;
    let totalPoints = 0;

    const gradedAnswers = await Promise.all(
      args.answers.map(async (ans) => {
        const question = await ctx.db.get(ans.questionId);
        if (!question)
          return {
            questionId: ans.questionId,
            answer: ans.answer,
            isCorrect: false,
            pointsEarned: 0,
            timeTaken: ans.timeTaken,
          };

        totalPoints += question.points;
        let isCorrect = false;
        let pointsEarned = 0;

        switch (question.type) {
          case "mcq":
          case "true_false":
            isCorrect =
              ans.answer.toLowerCase().trim() ===
              (question.correctAnswer || "").toLowerCase().trim();
            pointsEarned = isCorrect ? question.points : 0;
            break;
          case "multi_select": {
            const selected = ans.answer
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .sort();
            const correct = (question.correctAnswers || [])
              .map((s) => s.toLowerCase())
              .sort();
            isCorrect = JSON.stringify(selected) === JSON.stringify(correct);
            pointsEarned = isCorrect ? question.points : 0;
            break;
          }
          case "written": {
            const userAnswer = ans.answer.toLowerCase().trim();
            const keywords = question.keywords || [];
            const matched = keywords.filter((kw) =>
              userAnswer.includes(kw.toLowerCase())
            );
            const ratio = keywords.length > 0 ? matched.length / keywords.length : 0;
            pointsEarned = Math.round(question.points * ratio);
            isCorrect = ratio >= 1;
            break;
          }
        }

        totalScore += pointsEarned;
        return {
          questionId: ans.questionId,
          answer: ans.answer,
          isCorrect,
          pointsEarned,
          timeTaken: ans.timeTaken,
        };
      })
    );

    const name = args.playerName.trim().replace(/<[^>]*>/g, "").substring(0, 100);

    const sessionId = await ctx.db.insert("quizSessions", {
      quizId: args.quizId,
      playerName: name,
      status: "completed",
      score: totalScore,
      totalPoints,
      answers: gradedAnswers,
      startedAt: args.startedAt,
      completedAt: Date.now(),
    });

    return { sessionId, score: totalScore, totalPoints, answers: gradedAnswers };
  },
});

// ============================================================
// STATS & SESSIONS
// ============================================================

export const getQuizSessions = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) return [];

    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();

    return sessions
      .filter((s) => s.status === "completed")
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  },
});

export const getSessionDetail = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // Verify the caller owns the quiz this session belongs to
    const quiz = await ctx.db.get(session.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      // Also allow admins
      const email = (identity.email || "").toLowerCase();
      if (!ADMIN_EMAILS.includes(email)) return null;
    }

    // Get question details for the breakdown
    const questionDetails = await Promise.all(
      session.answers.map(async (ans) => {
        const q = await ctx.db.get(ans.questionId);
        return {
          ...ans,
          questionText: q?.questionText || "Deleted question",
          questionType: q?.type || "mcq",
          totalPoints: q?.points || 0,
          correctAnswer: q?.correctAnswer,
          correctAnswers: q?.correctAnswers,
        };
      })
    );

    return {
      ...session,
      answerDetails: questionDetails,
    };
  },
});

// Score override for teachers
export const overrideScore = mutation({
  args: {
    sessionId: v.id("quizSessions"),
    questionId: v.id("questions"),
    newPoints: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const quiz = await ctx.db.get(session.quizId);
    if (!quiz || quiz.creatorId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const updatedAnswers = session.answers.map((ans) => {
      if (ans.questionId === args.questionId) {
        return { ...ans, pointsEarned: args.newPoints };
      }
      return ans;
    });

    const newScore = updatedAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);

    await ctx.db.patch(args.sessionId, {
      answers: updatedAnswers,
      score: newScore,
    });
  },
});

export const getQuizLeaderboard = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) return [];

    // SECURITY CHECK: If unpublished, only creator or admin can view leaderboard
    if (!quiz.isPublished) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return [];
      const email = (identity.email || "").toLowerCase();
      const isOwner = quiz.creatorId === identity.subject;
      const isAdmin = ADMIN_EMAILS.includes(email);
      if (!isOwner && !isAdmin) return [];
    }

    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();

    return sessions
      .filter((s) => s.status === "completed")
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((s) => ({
        playerName: s.playerName,
        score: s.score,
        totalPoints: s.totalPoints,
        completedAt: s.completedAt,
      }));
  },
});

// ============================================================
// ADMIN FUNCTIONS
// ============================================================

export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = (identity.email || "").toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return null;
    const allUsers = await ctx.db.query("users").collect();
    const allQuizzes = await ctx.db.query("quizzes").collect();
    const allSessions = await ctx.db.query("quizSessions").collect();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const activeTodayQuizzes = allQuizzes.filter(
      (q) => q.isPublished && q.updatedAt >= todayTimestamp
    );

    return {
      totalUsers: allUsers.length,
      totalQuizzes: allQuizzes.length,
      totalSubmissions: allSessions.filter((s) => s.status === "completed").length,
      activeToday: activeTodayQuizzes.length,
    };
  },
});

export const getAdminUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const email = (identity.email || "").toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return [];

    // Batch-fetch all data once instead of N+1 per user
    const [users, allQuizzes, allSessions] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("quizzes").collect(),
      ctx.db.query("quizSessions").collect(),
    ]);

    // Build lookup maps
    const quizzesByCreator = new Map<string, typeof allQuizzes>();
    for (const quiz of allQuizzes) {
      const arr = quizzesByCreator.get(quiz.creatorId) || [];
      arr.push(quiz);
      quizzesByCreator.set(quiz.creatorId, arr);
    }

    const completedSessionsByQuiz = new Map<string, number>();
    for (const session of allSessions) {
      if (session.status === "completed") {
        completedSessionsByQuiz.set(
          session.quizId,
          (completedSessionsByQuiz.get(session.quizId) || 0) + 1
        );
      }
    }

    return users.map((user) => {
      const userQuizzes = quizzesByCreator.get(user.clerkId) || [];
      let totalSubmissions = 0;
      for (const quiz of userQuizzes) {
        totalSubmissions += completedSessionsByQuiz.get(quiz._id) || 0;
      }

      return {
        ...user,
        quizCount: userQuizzes.length,
        aiQuizCount: userQuizzes.filter(q => q.isAiGenerated).length,
        submissionCount: totalSubmissions,
        isElevated: user.isElevated ?? false,
      };
    });
  },
});

export const getAdminQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const email = (identity.email || "").toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return [];

    // Batch-fetch all data once instead of N+1 per quiz
    const [quizzes, allUsers, allSessions, allQuestions] = await Promise.all([
      ctx.db.query("quizzes").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("quizSessions").collect(),
      ctx.db.query("questions").collect(),
    ]);

    // Build lookup maps
    const usersByClerkId = new Map<string, string>();
    for (const user of allUsers) {
      usersByClerkId.set(user.clerkId, user.name);
    }

    const completedSessionsByQuiz = new Map<string, number>();
    for (const session of allSessions) {
      if (session.status === "completed") {
        completedSessionsByQuiz.set(
          session.quizId,
          (completedSessionsByQuiz.get(session.quizId) || 0) + 1
        );
      }
    }

    const questionCountByQuiz = new Map<string, number>();
    for (const question of allQuestions) {
      questionCountByQuiz.set(
        question.quizId,
        (questionCountByQuiz.get(question.quizId) || 0) + 1
      );
    }

    const enriched = quizzes.map((quiz) => ({
      ...quiz,
      creatorName: usersByClerkId.get(quiz.creatorId) || "Unknown",
      sessionCount: completedSessionsByQuiz.get(quiz._id) || 0,
      questionCount: questionCountByQuiz.get(quiz._id) || 0,
      isElevated: quiz.isElevated ?? false,
    }));

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminToggleUserBan = mutation({
  args: { clerkId: v.string(), ban: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch(user._id, { isBanned: args.ban });
    }
  },
});

export const adminToggleUserElevation = mutation({
  args: { clerkId: v.string(), elevate: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch(user._id, { isElevated: args.elevate });

      // Propagate to all their quizzes
      const quizzes = await ctx.db
        .query("quizzes")
        .withIndex("by_creator", (q) => q.eq("creatorId", args.clerkId))
        .collect();
      for (const quiz of quizzes) {
        await ctx.db.patch(quiz._id, { isElevated: args.elevate });
      }
    }
  },
});

export const adminToggleQuizElevation = mutation({
  args: { quizId: v.id("quizzes"), elevate: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.quizId, { isElevated: args.elevate });
  },
});

export const adminToggleQuizBan = mutation({
  args: { quizId: v.id("quizzes"), ban: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.quizId, { isBanned: args.ban });
  },
});

export const adminDeleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();
    for (const question of questions) {
      await ctx.db.delete(question._id);
    }

    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(args.quizId);
  },
});

// ============================================================
// GLOBAL CONFIGURATION
// ============================================================

export const getGlobalConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("globalConfig").first();
  },
});

export const updateGlobalConfig = mutation({
  args: {
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
    displayMode: v.optional(v.string()),
    passingThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const existing = await ctx.db.query("globalConfig").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("globalConfig", args);
    }
  },
});
