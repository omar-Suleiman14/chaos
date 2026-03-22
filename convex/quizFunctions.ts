import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

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

    const baseName =
      identity.nickname ||
      identity.givenName ||
      identity.name?.split(" ")[0] ||
      identity.email?.split("@")[0] ||
      "user";

    const username = identity.nickname
      ? identity.nickname.toLowerCase().replace(/[^a-z0-9_.-]+/g, "")
      : baseName.toLowerCase().replace(/[^a-z0-9_.-]+/g, "") + Math.floor(Math.random() * 1000);

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

    const baseSlug = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check uniqueness of slug for this creator
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
      timePerQuestion: args.timePerQuestion || 30,
      coverColor: args.coverColor || "#22c55e",
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

    const enriched = await Promise.all(
      quizzes.map(async (quiz) => {
        const questions = await ctx.db
          .query("questions")
          .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
          .collect();
        const sessions = await ctx.db
          .query("quizSessions")
          .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
          .collect();
        const completedSessions = sessions.filter((s) => s.status === "completed");
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
      })
    );

    return enriched.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getQuiz = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.quizId);
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

    // Get creator name
    const creator = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
      .first();

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();

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

    return {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      isPublished: quiz.isPublished,
      coverColor: quiz.coverColor,
      creatorName: creator?.name || "Unknown",
      creatorUsername: quiz.creatorUsername,
      showCorrectAnswers: quiz.showCorrectAnswers ?? true,
      showExplanations: quiz.showExplanations ?? true,
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
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

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

    // Admin check done client-side via env var
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

    const users = await ctx.db.query("users").collect();

    const enriched = await Promise.all(
      users.map(async (user) => {
        const quizzes = await ctx.db
          .query("quizzes")
          .withIndex("by_creator", (q) => q.eq("creatorId", user.clerkId))
          .collect();

        let totalSubmissions = 0;
        for (const quiz of quizzes) {
          const sessions = await ctx.db
            .query("quizSessions")
            .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
            .collect();
          totalSubmissions += sessions.filter((s) => s.status === "completed").length;
        }

        return {
          ...user,
          quizCount: quizzes.length,
          submissionCount: totalSubmissions,
        };
      })
    );

    return enriched;
  },
});

export const getAdminQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const quizzes = await ctx.db.query("quizzes").collect();

    const enriched = await Promise.all(
      quizzes.map(async (quiz) => {
        const creator = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
          .first();
        const sessions = await ctx.db
          .query("quizSessions")
          .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
          .collect();

        return {
          ...quiz,
          creatorName: creator?.name || "Unknown",
          sessionCount: sessions.filter((s) => s.status === "completed").length,
        };
      })
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminToggleUserBan = mutation({
  args: { clerkId: v.string(), ban: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch(user._id, { isBanned: args.ban });
    }
  },
});

export const adminToggleQuizBan = mutation({
  args: { quizId: v.id("quizzes"), ban: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await ctx.db.patch(args.quizId, { isBanned: args.ban });
  },
});

export const adminDeleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

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
