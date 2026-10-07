import { recordStudent } from "./studentRoster";
import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { setOwnedUsername } from "./links";
import { reserveUsername, usernameOwner } from "./usernameModel";
import { consumeCreation } from "./plans";
import { DEFAULT_HALF_MARK_THRESHOLD, clampThreshold, gradeMulti, gradeSingle, gradeWritten, parseMultiAnswer } from "./grading";
import { internal } from "./_generated/api";
import { grantPlan, usersForActor, contentForActor } from "./admin";
import { paginationOptsValidator } from "convex/server";
import { creatorRestricted, hasPro, verifiedIdentityEmail } from "./authz";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Doc } from "./_generated/dataModel";
import { publicationErrors, quizQuestionFields } from "./quizModel";
import { emitQuizAttemptEvent, emitQuizStatusEvent } from "./webhookEvents";
import { consumeRate } from "./serverUtils";
import {
  canViewQuizAsRespondent,
  getQuizIfOwner,
  getQuizIfOwnerOrAdmin,
  getSessionIfOwnerOrAdmin,
  isAdmin,
  requireActiveUser,
  requireAdmin,
  requireQuestionOwner,
  requireQuizOwner,
  requireSessionOwner,
} from "./authz";

/**
 * A quiz's completed attempts, oldest first (the order the by_quiz index gives).
 * Reads only completed rows through the status index, bounded to 500 to prevent unbounded reads.
 */
async function completedSessions(ctx: QueryCtx, quizId: Id<"quizzes">, limit = 500): Promise<Doc<"quizSessions">[]> {
  const rows = await ctx.db
    .query("quizSessions")
    .withIndex("by_quizId_and_status_and_score", (q) => q.eq("quizId", quizId).eq("status", "completed"))
    .take(limit);
  return rows.sort((a, b) => a._creationTime - b._creationTime);
}

// Server-side admin list — the ONLY source of truth for admin access
// ============================================================
// USER FUNCTIONS
// ============================================================

/** Attach form invitations sent to this email before the person signed in. */
async function linkPendingInvites(ctx: MutationCtx, userId: string, email: string | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return;
  const invites = await ctx.db
    .query("formCollaborators")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .take(100);
  for (const invite of invites) {
    if (!invite.userId) await ctx.db.patch("formCollaborators", invite._id, { userId });
  }
}

export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) throw new Error("Not authenticated");
    await linkPendingInvites(ctx, identity.subject, verifiedIdentityEmail(identity));

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      // Authentication profile sync must not become a write bypass for a
      // moderated account. Banned creators keep read access to their data.
      if (existing.isBanned || existing.suspendedUntil) return existing._id;

      // Update fields if changed
      const updates: Record<string, unknown> = {};
      if (!existing.profileNameChosen && identity.name && identity.name !== existing.name) updates.name = identity.name;
      if (identity.email && identity.email !== existing.email) updates.email = identity.email;
      if (identity.pictureUrl && identity.pictureUrl !== existing.imageUrl) updates.imageUrl = identity.pictureUrl;

      // Identity-provider sync must not rename public URLs or rewrite historical quizzes.
      await reserveUsername(ctx, existing.username, existing.clerkId);
      if (Object.keys(updates).length > 0) await ctx.db.patch("users", existing._id, updates);
      return existing._id;
    }

    return await insertNewUser(ctx, {
      clerkId: identity.subject,
      name: identity.nickname || identity.name || identity.givenName || "Anonymous",
      email: identity.email || "",
      imageUrl: identity.pictureUrl,
    });
  },
});

/** First sign-in, from the web app or from a connected app such as ChatGPT. */
export async function insertNewUser(ctx: MutationCtx, profile: { clerkId: string; name: string; email: string; imageUrl?: string }) {
  const planExpiresAt = Date.now() + 30 * 86_400_000;
  let username = "";
  // Bounded retry; indexed reads participate in the transaction's uniqueness checks.
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = "user" + Math.floor(10000 + Math.random() * 90000);
    if (await usernameOwner(ctx, candidate) === null) { username = candidate; break; }
  }
  if (!username) throw new Error("USERNAME_UNAVAILABLE: Please retry account setup.");
  await reserveUsername(ctx, username, profile.clerkId);
  const userId = await ctx.db.insert("users", {
    clerkId: profile.clerkId,
    name: profile.name,
    email: profile.email,
    username,
    imageUrl: profile.imageUrl,
    cardOnboardingPending: true,
    // Every new account receives one 30-day Pro trial.
    plan: "pro",
    planExpiresAt,
    isElevated: true,
    isBanned: false,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAt(planExpiresAt, internal.admin.expirePlan, { userId, expiresAt: planExpiresAt });
  return userId;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

export const setUsername = mutation({
  args: { username: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await setOwnedUsername(ctx, args);
    return true;
  },
});

// ============================================================
// TEACHER SETTINGS
// ============================================================

export const getTeacherSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;

    const settings = await ctx.db
      .query("teacherSettings")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    // Return defaults if no settings exist
    return {
      defaultMcqTimer: settings?.defaultMcqTimer ?? 60,
      defaultWrittenTimer: settings?.defaultWrittenTimer ?? 180,
      defaultPointsPerQuestion: settings?.defaultPointsPerQuestion ?? 1,
      halfMarkThreshold: settings?.halfMarkThreshold ?? 50,
      randomizeQuestions: settings?.randomizeQuestions ?? false,
      randomizeOptions: settings?.randomizeOptions ?? false,
      showCorrectAnswers: settings?.showCorrectAnswers ?? true,
      showExplanations: settings?.showExplanations ?? true,
      displayMode: settings?.displayMode ?? "score",
      passingThreshold: settings?.passingThreshold ?? 50,
      disableAnimations: settings?.disableAnimations ?? false,
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
    disableAnimations: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);

    const existing = await ctx.db
      .query("teacherSettings")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) updates[key] = value;
      }
      await ctx.db.patch("teacherSettings", existing._id, updates);
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
    const { identity, user } = await requireActiveUser(ctx);

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
    const globalConfig = await ctx.db.query("globalConfig").first();

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

    await consumeCreation(ctx, identity.subject);
    return await authorDb(ctx).insert("quizzes", {
      title: args.title,
      description: args.description,
      groupName: args.groupName,
      slug,
      creatorId: identity.subject,
      creatorUsername: username,
      isPublished: false,
      timePerQuestion: args.timePerQuestion || globalConfig?.defaultMcqTimer || 60,
      coverColor: args.coverColor || "#22c55e",
      randomizeQuestions: teacherSettings?.randomizeQuestions ?? globalConfig?.randomizeQuestions ?? false,
      randomizeOptions: teacherSettings?.randomizeOptions ?? globalConfig?.randomizeOptions ?? false,
      showCorrectAnswers: teacherSettings?.showCorrectAnswers ?? globalConfig?.showCorrectAnswers ?? true,
      showExplanations: teacherSettings?.showExplanations ?? globalConfig?.showExplanations ?? true,
      disableAnimations: teacherSettings?.disableAnimations ?? globalConfig?.disableAnimations ?? false,
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
    disableAnimations: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const quiz = await requireQuizOwner(ctx, args.quizId);

    if (args.isPublished === true) {
      if (quiz.archived) throw new Error("QUIZ_ARCHIVED: Restore this quiz before publishing.");
      if (quiz.isBanned) throw new Error("CONTENT_HELD: This quiz is held by an administrator.");
      const questions = await draftQuestions(ctx, args.quizId);
      const errors = publicationErrors(args.title ?? quiz.title, questions);
      if (errors.length) throw new Error("PUBLICATION_BLOCKED:\n" + errors.join("\n"));
      await authorDb(ctx).patch("quizzes", quiz._id, { publishedAt: Math.max(Date.now(), quiz.updatedAt + 1), publishedSnapshot: {
        title: args.title ?? quiz.title,
        description: args.description ?? quiz.description,
        questions: questions.map(snapshotQuestion),
      } });
    } else {
      await preservePublishedQuiz(ctx, quiz);
    }

    const { quizId, ...rest } = args;
    const updates: Record<string, unknown> = { updatedAt: Math.max(Date.now(), quiz.updatedAt + 1) };
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

    await authorDb(ctx).patch("quizzes", quizId, updates);
  },
});

/**
 * Permanently delete a quiz and everything whose lifetime is the quiz's.
 * Questions and sessions are removed, AI jobs are retained for generation
 * history/quota accounting but detached so no job points at a missing quiz.
 * Callers authorize the operation before entering this helper.
 */
async function cascadeDeleteQuiz(ctx: MutationCtx, quizId: Id<"quizzes">) {
  const quiz = await ctx.db.get("quizzes", quizId);
  if (!quiz) return;

  const questions = await ctx.db
    .query("questions")
    .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
    .take(200);
  for (const question of questions) {
    await ctx.db.delete("questions", question._id);
  }

  const sessions = await ctx.db
    .query("quizSessions")
    .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
    .take(200);
  for (const session of sessions) {
    await ctx.db.delete("quizSessions", session._id);
  }

  const aiJobs = await ctx.db
    .query("aiJobs")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
    .take(50);
  for (const job of aiJobs) {
    if (job.quizId === quizId) {
      await ctx.db.patch("aiJobs", job._id, { quizId: undefined });
    }
  }

  await authorDb(ctx).delete("quizzes", quizId);
}

export const getQuizDeletionImpact = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await getQuizIfOwner(ctx, args.quizId);
    if (!quiz) return null;

    const [questions, completed] = await Promise.all([
      ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", args.quizId)).collect(),
      completedSessions(ctx, args.quizId),
    ]);

    return {
      title: quiz.title,
      questionCount: questions.filter((q) => q.deletedAt === undefined).length,
      responseCount: completed.length,
    };
  },
});

export const deleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    await requireQuizOwner(ctx, args.quizId);
    await cascadeDeleteQuiz(ctx, args.quizId);
  },
});

export const getMyQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];

    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_creator", (q) => q.eq("creatorId", identity.subject))
      .collect();

    if (quizzes.length === 0) return [];

    // Batch-fetch questions and completed attempts for this creator's quizzes. In-progress
    // attempts are skipped by the index, so live play doesn't re-run the library.
    const [allQuestions, allCompleted] = await Promise.all([
      Promise.all(quizzes.map((quiz) =>
        ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).collect()
      )),
      Promise.all(quizzes.map((quiz) => completedSessions(ctx, quiz._id))),
    ]);

    const enriched = quizzes.map((quiz, i) => {
      const questions = allQuestions[i].filter((q) => q.deletedAt === undefined);
      const completed = allCompleted[i];
      const avgScore =
        completed.length > 0
          ? completed.reduce((sum, s) => sum + (s.totalPoints > 0 ? (s.score / s.totalPoints) * 100 : 0), 0) /
            completed.length
          : 0;
      // Lists never show the frozen published copy; leaving it out keeps the payload small.
      const { publishedSnapshot: _snapshot, ...row } = quiz;

      return {
        ...row,
        questionCount: questions.length,
        sessionCount: completed.length,
        avgScore: Math.round(avgScore),
      };
    });

    return enriched.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getQuiz = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    return await getQuizIfOwnerOrAdmin(ctx, args.quizId);
  },
});

export const getQuizForOwner = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    return await getQuizIfOwner(ctx, args.quizId);
  },
});

export const getQuizByUsernameSlug = query({
  args: { username: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const quiz = await ctx.db
      .query("quizzes")
      .withIndex("by_creator_slug", (q) =>
        q.eq("creatorUsername", args.username).eq("slug", args.slug)
      )
      .first();
    if (!quiz || !(await canViewQuizAsRespondent(ctx, quiz))) return null;
    return {
      _id: quiz._id,
      title: quiz.title,
      slug: quiz.slug,
      creatorUsername: quiz.creatorUsername,
      isPublished: quiz.isPublished,
    };
  },
});

export const validateSlug = mutation({
  args: { slug: v.string(), quizId: v.optional(v.id("quizzes")) },
  handler: async (ctx, args) => {
    const { user } = await requireActiveUser(ctx);

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

function snapshotQuestion(q: Doc<"questions">) {
  const { quizId: _quizId, _creationTime: _created, deletedAt: _deleted, ...question } = q;
  return question;
}

async function draftQuestions(ctx: MutationCtx, quizId: Id<"quizzes">) {
  const rows = await ctx.db.query("questions").withIndex("by_quiz", q => q.eq("quizId", quizId)).take(1000);
  if (rows.length === 1000) throw new Error("QUESTION_LIMIT: Archive size requires maintenance before editing.");
  return rows.filter(q => q.deletedAt === undefined).sort((a,b) => a.order - b.order);
}

async function preservePublishedQuiz(ctx: MutationCtx, quiz: Doc<"quizzes">) {
  if (quiz.isPublished && !quiz.publishedSnapshot) {
    await authorDb(ctx).patch("quizzes", quiz._id, { publishedAt: quiz.publishedAt ?? quiz.updatedAt, publishedSnapshot: {
      title: quiz.title, description: quiz.description,
      questions: (await draftQuestions(ctx, quiz._id)).map(snapshotQuestion),
    } });
  }
}

const quizSettingsFields = {
  slug: v.optional(v.string()),
  groupName: v.optional(v.string()),
  randomizeQuestions: v.optional(v.boolean()),
  randomizeOptions: v.optional(v.boolean()),
  showCorrectAnswers: v.optional(v.boolean()),
  showExplanations: v.optional(v.boolean()),
  passingThreshold: v.optional(v.number()),
  disableAnimations: v.optional(v.boolean()),
  poolSize: v.optional(v.number()),
  resultRelease: v.optional(v.union(v.literal("immediate"), v.literal("manual"))),
};

/** Scores and correctness are hidden from respondents until the creator releases them. */
function resultsWithheld(quiz: Doc<"quizzes"> | null): boolean {
  return quiz?.resultRelease === "manual" && quiz.resultsReleasedAt === undefined;
}

function poolErrors(poolSize: number | undefined, questionCount: number): string[] {
  if (poolSize === undefined) return [];
  if (!Number.isInteger(poolSize) || poolSize < 1) return ["The question pool size must be a whole number of at least 1."];
  if (poolSize > questionCount) return [`The question pool draws ${poolSize} questions but the quiz has ${questionCount}.`];
  return [];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function assertSlugAvailable(ctx: MutationCtx, quiz: Doc<"quizzes">, slug: string) {
  if (slug === quiz.slug) return;
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) {
    throw new Error("INVALID_SLUG: Use lowercase letters, numbers and single hyphens.");
  }
  const existing = await ctx.db
    .query("quizzes")
    .withIndex("by_creator_slug", (q) => q.eq("creatorUsername", quiz.creatorUsername).eq("slug", slug))
    .first();
  if (existing && existing._id !== quiz._id) throw new Error("SLUG_TAKEN: That URL is already used by another quiz.");
}

/**
 * Atomically replace the editable draft: metadata, settings and the ordered
 * question list. Published quizzes keep serving `publishedSnapshot` until the
 * creator publishes again, so respondents never see a half-edited quiz.
 */
export const saveQuizDraft = mutation({
  args: {
    quizId: v.id("quizzes"), expectedUpdatedAt: v.optional(v.number()),
    title: v.string(), description: v.optional(v.string()),
    ...quizSettingsFields,
    questions: v.array(v.object({ id: v.optional(v.id("questions")), ...quizQuestionFields })),
  },
  returns: v.object({ updatedAt: v.number(), questionIds: v.array(v.id("questions")) }),
  handler: async (ctx, args) => {
    const quiz = await requireQuizOwner(ctx, args.quizId);
    if (args.expectedUpdatedAt !== undefined && args.expectedUpdatedAt !== quiz.updatedAt) throw new Error("DRAFT_CONFLICT: This quiz changed elsewhere. Your local draft is preserved; reload before overwriting.");
    if (args.questions.length > 200 || args.title.length > 500 || (args.description?.length ?? 0) > 10000) throw new Error("DRAFT_LIMIT: Quiz exceeds the supported size.");
    if (args.passingThreshold !== undefined && (!Number.isFinite(args.passingThreshold) || args.passingThreshold < 0 || args.passingThreshold > 100)) throw new Error("DRAFT_LIMIT: Passing threshold must be between 0 and 100.");
    if ((args.groupName?.length ?? 0) > 200) throw new Error("DRAFT_LIMIT: Group name is too long.");
    if (args.poolSize !== undefined && (!Number.isInteger(args.poolSize) || args.poolSize < 0 || args.poolSize > 200)) throw new Error("DRAFT_LIMIT: Pool size must be a whole number up to 200.");
    if (args.slug !== undefined) await assertSlugAvailable(ctx, quiz, args.slug);
    const existing = await draftQuestions(ctx, quiz._id);
    await preservePublishedQuiz(ctx, quiz);
    const retained = new Set<string>();
    const questionIds: Id<"questions">[] = [];
    for (const [order, input] of args.questions.entries()) {
      const { id, ...fields } = input;
      if (!Number.isFinite(fields.points) || fields.questionText.length > 10000 || (fields.options?.length ?? 0) > 100) throw new Error("DRAFT_LIMIT: Invalid question size or points.");
      if (id) {
        if (retained.has(id) || !existing.some(q => q._id === id)) throw new Error("INVALID_QUESTION: Question does not belong to this draft or is duplicated.");
        retained.add(id);
        // Replace optional fields too, so switching type does not retain old answers.
        await ctx.db.replace("questions", id, { quizId: quiz._id, ...fields, order });
        questionIds.push(id);
      } else {
        questionIds.push(await ctx.db.insert("questions", { quizId: quiz._id, ...fields, order }));
      }
    }
    for (const q of existing) if (!retained.has(q._id)) await ctx.db.patch("questions", q._id, { deletedAt: Date.now() });
    const updatedAt = Math.max(Date.now(), quiz.updatedAt + 1);
    const { quizId: _quizId, expectedUpdatedAt: _expected, questions: _questions, ...metadata } = args;
    const patch: Record<string, unknown> = { updatedAt, title: args.title, description: args.description };
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) patch[key] = value;
    }
    if (args.groupName === "") patch.groupName = undefined;
    // 0 turns the pool off.
    if (args.poolSize === 0) patch.poolSize = undefined;
    await authorDb(ctx).patch("quizzes", quiz._id, patch);
    return { updatedAt, questionIds };
  },
});

/** Validate the saved draft and make it the version respondents receive. */
export const publishQuiz = mutation({
  args: { quizId: v.id("quizzes"), expectedUpdatedAt: v.optional(v.number()) },
  returns: v.object({ updatedAt: v.number(), publishedAt: v.number() }),
  handler: async (ctx, args) => {
    const quiz = await requireQuizOwner(ctx, args.quizId);
    if (quiz.archived) throw new Error("QUIZ_ARCHIVED: Restore this quiz before publishing.");
    if (quiz.isBanned) throw new Error("CONTENT_HELD: This quiz is held by an administrator.");
    if (args.expectedUpdatedAt !== undefined && args.expectedUpdatedAt !== quiz.updatedAt) {
      throw new Error("DRAFT_CONFLICT: This quiz changed elsewhere. Reload before publishing.");
    }
    const questions = await draftQuestions(ctx, quiz._id);
    const errors = [...publicationErrors(quiz.title, questions), ...poolErrors(quiz.poolSize, questions.length)];
    if (errors.length) throw new Error("PUBLICATION_BLOCKED:\n" + errors.join("\n"));
    const updatedAt = Math.max(Date.now(), quiz.updatedAt + 1);
    await authorDb(ctx).patch("quizzes", quiz._id, {
      isPublished: true,
      publishedAt: updatedAt,
      updatedAt,
      publishedSnapshot: { title: quiz.title, description: quiz.description, questions: questions.map(snapshotQuestion) },
    });
    await emitQuizStatusEvent(ctx, quiz._id, "form.published");
    return { updatedAt, publishedAt: updatedAt };
  },
});

/** Stop accepting new attempts. The last published version is retained. */
export const unpublishQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const quiz = await requireQuizOwner(ctx, args.quizId);
    await preservePublishedQuiz(ctx, quiz);
    const updatedAt = Math.max(Date.now(), quiz.updatedAt + 1);
    await authorDb(ctx).patch("quizzes", quiz._id, { isPublished: false, updatedAt, publishedAt: quiz.publishedAt ?? updatedAt });
    if (quiz.isPublished) await emitQuizStatusEvent(ctx, quiz._id, "form.closed");
    return { updatedAt };
  },
});

/** Retain questions, snapshots and attempts; restoring never republishes the quiz. */
export const setQuizArchived = mutation({
  args: { quizId: v.id("quizzes"), archived: v.boolean() },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, { quizId, archived }) => {
    const quiz = await requireQuizOwner(ctx, quizId);
    if (!!quiz.archived === archived) return { updatedAt: quiz.updatedAt };
    await preservePublishedQuiz(ctx, quiz);
    const updatedAt = Math.max(Date.now(), quiz.updatedAt + 1);
    await authorDb(ctx).patch("quizzes", quizId, { archived, isPublished: false, updatedAt });
    if (quiz.isPublished) await emitQuizStatusEvent(ctx, quizId, "form.closed");
    return { updatedAt };
  },
});

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
    const quiz = await requireQuizOwner(ctx, args.quizId);
    await preservePublishedQuiz(ctx, quiz);
    if (!Number.isFinite(args.points)) throw new Error("Points must be finite.");
    await authorDb(ctx).patch("quizzes", quiz._id, { updatedAt: Math.max(Date.now(), quiz.updatedAt + 1) });

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
    const { quiz } = await requireQuestionOwner(ctx, args.questionId);
    await preservePublishedQuiz(ctx, quiz);
    await authorDb(ctx).patch("quizzes", quiz._id, { updatedAt: Math.max(Date.now(), quiz.updatedAt + 1) });

    const { questionId, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) cleanUpdates[key] = value;
    }

    // Enforce minimum 1 point
    if (cleanUpdates.points !== undefined && (cleanUpdates.points as number) < 1) {
      throw new Error("Questions must be worth at least 1 mark.");
    }

    await ctx.db.patch("questions", args.questionId, cleanUpdates);
  },
});

export const deleteQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const { quiz } = await requireQuestionOwner(ctx, args.questionId);
    await preservePublishedQuiz(ctx, quiz);
    await authorDb(ctx).patch("quizzes", quiz._id, { updatedAt: Math.max(Date.now(), quiz.updatedAt + 1) });
    // Questions are soft-deleted so historical session answers can still
    // resolve the original prompt and grading data. The row is hard-deleted
    // only when its entire quiz (and those sessions) is deleted.
    await ctx.db.patch("questions", args.questionId, { deletedAt: Date.now() });
  },
});

/**
 * Full question documents for creator tooling.
 *
 * These rows contain grading data (correctAnswer, correctAnswers, keywords,
 * hint, and explanation) and must never be used by respondent clients. The
 * editor, print view, and admin UI are the intended consumers.
 */
export const getQuestionsForOwner = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await getQuizIfOwnerOrAdmin(ctx, args.quizId);
    if (!quiz) return [];
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .collect();

    return questions
      .filter((q) => q.deletedAt === undefined)
      .sort((a, b) => a.order - b.order);
  },
});

// ============================================================
// QUIZ PLAYER — Safe queries (NO answers sent to client)
// ============================================================

export const getQuizForPlayer = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) return null;
    if (!(await canViewQuizAsRespondent(ctx, quiz))) return null;

    // Fetch creator and questions in parallel
    const [creator, allQuestions] = await Promise.all([
      ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId)).first(),
      ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", args.quizId)).collect(),
    ]);

    const questions = quiz.publishedSnapshot?.questions ?? allQuestions.filter((q) => q.deletedAt === undefined);

    // SECURITY BOUNDARY: respondents receive an allow-list projection.
    // New question fields stay private by default unless they are deliberately
    // added here. Never spread the stored question document into this object.
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

    let teacherSettings: Doc<"teacherSettings"> | null = null;
    let globalConfig: Doc<"globalConfig"> | null = null;
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
    const disableAnimations = quiz.disableAnimations ?? teacherSettings?.disableAnimations ?? globalConfig?.disableAnimations ?? false;

    return {
      _id: quiz._id,
      title: quiz.publishedSnapshot?.title ?? quiz.title,
      description: quiz.publishedSnapshot?.description ?? quiz.description,
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
      disableAnimations,
      questions: safeQuestions,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
      // With a pool, each attempt answers `questionCount` of the questions.
      questionCount: quiz.poolSize !== undefined ? Math.min(quiz.poolSize, safeQuestions.length) : safeQuestions.length,
      usesPool: quiz.poolSize !== undefined && quiz.poolSize < safeQuestions.length,
      resultsWithheld: resultsWithheld(quiz),
    };
  },
});

// ============================================================
// RESPONDENT SESSION LIMITS
// ============================================================

/** Draw a random subset for this attempt, kept in authoring order. */
function drawPool<T extends { order: number }>(questions: T[], poolSize: number | undefined): T[] {
  if (poolSize === undefined || poolSize >= questions.length) return questions;
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, poolSize).sort((a, b) => a.order - b.order);
}

const SESSION_RATE_LIMIT = 30;
const SESSION_RATE_WINDOW_MS = 60_000;
const MAX_ANSWER_LENGTH = 5_000;
const MAX_ANSWERS_PER_SESSION = 200;
const MAX_NAME_LENGTH = 100;

function normalizePlayerName(raw: string): string {
  const withoutMarkup = raw.replace(/<[^>]*>/g, "");
  const printable = Array.from(withoutMarkup)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code <= 0x1f) return false;
      if (code >= 0x7f && code <= 0x9f) return false;
      if (code >= 0x200b && code <= 0x200f) return false;
      if (code >= 0x202a && code <= 0x202e) return false;
      if (code === 0xfeff) return false;
      return true;
    })
    .join("");

  return Array.from(printable.replace(/\s+/g, " ").trim()).slice(0, MAX_NAME_LENGTH).join("").trim();
}

// Start a quiz session
export const startQuizSession = mutation({
  args: {
    quizId: v.id("quizzes"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizePlayerName(args.playerName);
    if (!name) throw new Error("NAME_REQUIRED: Enter a name to start.");

    const quiz = await ctx.db.get("quizzes", args.quizId);
    // Missing, unpublished, banned and restricted look the same, so a quiz ID doesn't reveal private state.
    if (!quiz || quiz.archived || !quiz.isPublished || quiz.isBanned || await creatorRestricted(ctx, quiz.creatorId)) {
      throw new Error("QUIZ_UNAVAILABLE: This quiz isn't available.");
    }

    // Enforce 100-player limit for non-elevated quizzes
    const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", quiz.creatorId)).first();
    if (!(owner?.plan !== undefined ? hasPro(owner, Date.now()) : quiz.isElevated || hasPro(owner, Date.now()))) {
      const PLAYER_LIMIT = 100;
      const completedCount = (await ctx.db
        .query("quizSessions")
        .withIndex("by_quizId_and_status_and_score", (q) => q.eq("quizId", args.quizId).eq("status", "completed"))
        .take(PLAYER_LIMIT)).length;

      if (completedCount >= PLAYER_LIMIT) {
        const config = await ctx.db.query("globalConfig").first();
        throw new Error(
          `RESPONDENT_LIMIT: ${config?.playerLimitErrorText?.trim() || "This quiz has reached its maximum number of players."}`
        );
      }
    }

    const now = Date.now();
    const identity = await getAuthIdentity(ctx);
    const playerKey = identity?.subject ?? name.trim().toLowerCase();
    await consumeRate(ctx, `quiz:start:${args.quizId}:${playerKey}`, 10, 60_000);

    const activeSessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q) => q.eq("quizId", args.quizId))
      .filter((q) => q.eq(q.field("status"), "in_progress"))
      .take(20);
    const playerActive = activeSessions.filter((s) => s.playerName.trim().toLowerCase() === name.trim().toLowerCase());
    if (playerActive.length >= 5) {
      throw new Error("CAP_REACHED: You have too many in-progress attempts for this quiz. Finish or wait before starting a new one.");
    }

    const recent = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz_started", (q) =>
        q.eq("quizId", args.quizId).gte("startedAt", now - SESSION_RATE_WINDOW_MS)
      )
      .take(SESSION_RATE_LIMIT);

    if (recent.length >= SESSION_RATE_LIMIT) {
      throw new Error(
        "RATE_LIMITED: Too many people are starting this quiz at once. Wait a moment and try again."
      );
    }

    return await ctx.db.insert("quizSessions", {
      quizId: args.quizId,
      playerName: name,
      status: "in_progress",
      score: 0,
      totalPoints: 0,
      answers: [],
      questionSnapshot: drawPool(quiz.publishedSnapshot?.questions ?? (await draftQuestions(ctx, quiz._id)).map(snapshotQuestion), quiz.poolSize),
      startedAt: now,
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
    const session = await ctx.db.get("quizSessions", args.sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND: This attempt no longer exists.");
    if (session.source === "live") throw new Error("SESSION_CLOSED: Use the live game to answer this attempt.");
    if (session.status !== "in_progress") {
      throw new Error("SESSION_CLOSED: This attempt is already completed.");
    }

    const storedQuestion = await ctx.db.get("questions", args.questionId);
    const question = session.questionSnapshot?.find(q => q._id === args.questionId) ?? (session.questionSnapshot ? null : storedQuestion);
    if (!question) throw new Error("QUESTION_NOT_FOUND: That question no longer exists.");
    if (!storedQuestion || storedQuestion.quizId !== session.quizId) {
      throw new Error("QUESTION_NOT_IN_QUIZ: That question is not part of this quiz.");
    }

    const existingAnswer = session.answers.find((answer) => answer.questionId === args.questionId);
    const sessionQuiz = await ctx.db.get("quizzes", session.quizId);
    // Unpublishing or moderation stops attempts already in progress.
    if (!sessionQuiz || sessionQuiz.archived || !sessionQuiz.isPublished || sessionQuiz.isBanned) throw new Error("QUIZ_UNAVAILABLE: This quiz isn't available.");
    const withheld = resultsWithheld(sessionQuiz);
    if (existingAnswer && withheld) {
      return { isCorrect: false, pointsEarned: 0, totalPointsPossible: question.points, alreadyAnswered: true, withheld: true, correctAnswer: undefined, explanation: undefined };
    }
    if (existingAnswer) {
      return {
        isCorrect: existingAnswer.isCorrect,
        pointsEarned: existingAnswer.pointsEarned,
        totalPointsPossible: question.points,
        alreadyAnswered: true,
        correctAnswer: undefined,
        explanation: undefined,
      };
    }

    if (args.answer.length > MAX_ANSWER_LENGTH) {
      throw new Error("ANSWER_TOO_LONG: That answer is too long to submit.");
    }
    if (session.answers.length >= MAX_ANSWERS_PER_SESSION) {
      throw new Error("TOO_MANY_ANSWERS: This attempt has submitted too many answers.");
    }

    const activeQuiz = await ctx.db.get("quizzes", session.quizId);
    if (!activeQuiz || activeQuiz.archived || activeQuiz.isBanned || await creatorRestricted(ctx, activeQuiz.creatorId)) throw new Error("QUIZ_UNAVAILABLE");

    // Resolve creator/global settings for grading and post-answer reveal rules.
    const quiz = await ctx.db.get("quizzes", session.quizId);
    let halfMarkThreshold = DEFAULT_HALF_MARK_THRESHOLD;
    let teacherSettings = null;
    let globalConfig = null;
    if (quiz) {
      [teacherSettings, globalConfig] = await Promise.all([
        ctx.db
          .query("teacherSettings")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId))
          .first(),
        ctx.db.query("globalConfig").first(),
      ]);
      halfMarkThreshold = clampThreshold(teacherSettings?.halfMarkThreshold);
    }

    const showCorrectAnswers =
      quiz?.showCorrectAnswers ??
      teacherSettings?.showCorrectAnswers ??
      globalConfig?.showCorrectAnswers ??
      true;
    const showExplanations =
      quiz?.showExplanations ??
      teacherSettings?.showExplanations ??
      globalConfig?.showExplanations ??
      true;

    let isCorrect = false;
    let pointsEarned = 0;
    const rawAnswer = args.answer.trim();

    switch (question.type) {
      case "mcq":
      case "true_false": {
        ({ isCorrect, points: pointsEarned } = gradeSingle(rawAnswer, question.correctAnswer, question.points));
        break;
      }
      case "multi_select": {
        ({ isCorrect, points: pointsEarned } = gradeMulti(parseMultiAnswer(rawAnswer), question.correctAnswers ?? [], question.points));
        break;
      }
      case "written": {
        ({ isCorrect, points: pointsEarned } = gradeWritten(rawAnswer, question.keywords ?? [], question.points, halfMarkThreshold));
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

    await ctx.db.patch("quizSessions", args.sessionId, {
      answers: newAnswers,
      score: newScore,
      totalPoints: newTotalPoints,
    });

    if (withheld) {
      return { isCorrect: false, pointsEarned: 0, totalPointsPossible: question.points, alreadyAnswered: false, withheld: true, correctAnswer: undefined, explanation: undefined };
    }

    // Return result — never return correct answer or keywords
    return {
      isCorrect,
      pointsEarned,
      totalPointsPossible: question.points,
      // Only reveal correct answer if quiz settings allow
      correctAnswer: showCorrectAnswers
        ? (question.type === "mcq" || question.type === "true_false"
          ? question.correctAnswer
          : question.type === "multi_select"
            ? question.correctAnswers?.join(", ")
            : undefined)
        : undefined,
      correctAnswers: showCorrectAnswers && question.type === "multi_select" ? question.correctAnswers : undefined,
      explanation: showExplanations ? question.explanation : undefined,
      alreadyAnswered: false,
    };
  },
});

// Complete a quiz session
export const completeQuizSession = mutation({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("quizSessions", args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.source === "live") throw new Error("SESSION_CLOSED: Use the live game to complete this attempt.");

    const activeQuiz = await ctx.db.get("quizzes", session.quizId);
    if (!activeQuiz || activeQuiz.archived || activeQuiz.isBanned || await creatorRestricted(ctx, activeQuiz.creatorId)) throw new Error("QUIZ_UNAVAILABLE");
    // A newly completed snapshot attempt includes unanswered questions in its
    // denominator. Existing completed scores and legacy attempts stay intact.
    const totalPoints = session.status === "in_progress" && session.questionSnapshot
      ? session.questionSnapshot.reduce((sum, question) => sum + question.points, 0)
      : session.totalPoints;
    if (session.status === "in_progress") {
      await ctx.db.patch("quizSessions", args.sessionId, { status: "completed", totalPoints, completedAt: Date.now() });
      await recordStudent(ctx, { authorId: activeQuiz.creatorId, guestKey: String(session._id), guestName: session.playerName, context: activeQuiz.title });
      await emitQuizAttemptEvent(ctx, args.sessionId, "response.completed");
    }
    // Idempotent: a repeated call returns the stored result.
    if (resultsWithheld(await ctx.db.get("quizzes", session.quizId))) {
      return { withheld: true as const, score: 0, totalPoints, answers: [] };
    }
    return {
      withheld: false as const,
      score: session.score,
      totalPoints,
      answers: session.answers,
    };
  },
});

/** Questions drawn for an attempt (pool quizzes); ids only, no answers. */
export const getAttemptQuestionIds = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("quizSessions", args.sessionId);
    if (!session?.questionSnapshot) return null;
    return session.questionSnapshot.map((q) => q._id);
  },
});

/** A respondent's own result, once the creator has released results. */
export const getAttemptResult = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("quizSessions", args.sessionId);
    if (!session || session.status !== "completed") return null;
    const quiz = await ctx.db.get("quizzes", session.quizId);
    if (!quiz) return null;
    if (resultsWithheld(quiz)) return { released: false as const };
    return { released: true as const, score: session.score, totalPoints: session.totalPoints };
  },
});

export const setResultsReleased = mutation({
  args: { quizId: v.id("quizzes"), released: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const quiz = await requireQuizOwner(ctx, args.quizId);
    await authorDb(ctx).patch("quizzes", quiz._id, { resultsReleasedAt: args.released ? Date.now() : undefined });
    return null;
  },
});

// ============================================================
// STATS & SESSIONS
// ============================================================

export const getQuizSessions = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await getQuizIfOwner(ctx, args.quizId);
    if (!quiz) return [];

    const sessions = await completedSessions(ctx, args.quizId);
    return sessions.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  },
});

export const getSessionDetail = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const owned = await getSessionIfOwnerOrAdmin(ctx, args.sessionId);
    if (!owned) return null;
    const { session } = owned;

    // Get question details for the breakdown
    const questionDetails = await Promise.all(
      session.answers.map(async (ans) => {
        // Grade against the version the respondent actually answered.
        const q = session.questionSnapshot?.find((s) => s._id === ans.questionId) ?? (await ctx.db.get("questions", ans.questionId));
        return {
          ...ans,
          questionText: q?.questionText || "Deleted question",
          questionType: q?.type || "mcq",
          totalPoints: q?.points || 0,
          correctAnswer: q?.correctAnswer,
          correctAnswers: q?.correctAnswers,
          keywords: q?.keywords,
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
    const { session } = await requireSessionOwner(ctx, args.sessionId);
    const { identity } = await requireActiveUser(ctx);
    const question = session.questionSnapshot?.find((q) => q._id === args.questionId) ?? (await ctx.db.get("questions", args.questionId));
    if (!question) throw new Error("QUESTION_NOT_FOUND: That question no longer exists.");
    if (!Number.isFinite(args.newPoints) || args.newPoints < 0 || args.newPoints > question.points) {
      throw new Error(`INVALID_POINTS: Award between 0 and ${question.points} marks.`);
    }
    if (!session.answers.some((ans) => ans.questionId === args.questionId)) {
      throw new Error("ANSWER_NOT_FOUND: This respondent did not answer that question.");
    }

    // Manual grading keeps the automatic grade so reviewers can see and revert it.
    const updatedAnswers = session.answers.map((ans) => {
      if (ans.questionId === args.questionId) {
        return {
          ...ans,
          originalPointsEarned: ans.originalPointsEarned ?? ans.pointsEarned,
          pointsEarned: args.newPoints,
          isCorrect: args.newPoints >= question.points,
          reviewedAt: Date.now(),
          reviewedBy: identity.subject,
        };
      }
      return ans;
    });

    const newScore = updatedAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);

    await ctx.db.patch("quizSessions", args.sessionId, {
      answers: updatedAnswers,
      score: newScore,
    });
    const before = session.answers.find((a) => a.questionId === args.questionId)?.pointsEarned ?? 0;
    await emitQuizAttemptEvent(ctx, args.sessionId, "response.graded", { questionId: args.questionId, points: args.newPoints, previousPoints: before });
  },
});

export const getQuizLeaderboard = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) return [];

    if (!(await canViewQuizAsRespondent(ctx, quiz))) return [];
    // Scores stay private until the creator releases results; only the owner or an admin sees them before that.
    if (resultsWithheld(quiz) && !(await getQuizIfOwnerOrAdmin(ctx, quiz._id))) return [];

    // Find the cutoff, then fetch only enough oldest tied attempts to fill the
    // board. Reading every tie can exceed transaction limits on popular quizzes.
    const LIMIT = 20;
    const completed = (quizId: Id<"quizzes">) =>
      ctx.db.query("quizSessions").withIndex("by_quizId_and_status_and_score", (q) => q.eq("quizId", quizId).eq("status", "completed"));
    const top = await completed(args.quizId).order("desc").take(LIMIT);
    const cutoff = top.length === LIMIT ? top[LIMIT - 1].score : undefined;
    const aboveCutoff = cutoff === undefined ? top : top.filter((s) => s.score > cutoff);
    const tied = cutoff === undefined ? [] : await ctx.db
      .query("quizSessions")
      .withIndex("by_quizId_and_status_and_score", (q) => q.eq("quizId", args.quizId).eq("status", "completed").eq("score", cutoff))
      .order("asc")
      .take(LIMIT - aboveCutoff.length);
    const byId = new Map([...aboveCutoff, ...tied].map((s) => [s._id, s]));

    return [...byId.values()]
      .sort((a, b) => b.score - a.score || a._creationTime - b._creationTime)
      .slice(0, LIMIT)
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

export const getIsAdmin = query({
  args: {},
  handler: async (ctx) => {
    // Presentation helper only. Every privileged operation still calls requireAdmin.
    return await isAdmin(ctx);
  },
});

/** Legacy admin names now share the bounded inventory and cached analytics paths. */
export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db.query("adminMetrics").withIndex("by_key", q => q.eq("key", "platform")).unique();
    const ready = snapshot?.completedAt != null;
    return {
      totalUsers: ready ? snapshot.counts.users : null,
      totalQuizzes: ready ? snapshot.counts.quizzes : null,
      totalSubmissions: ready ? snapshot.counts.completedAttempts : null,
      activeToday: ready && !snapshot.running && new Date(snapshot.startedAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
        ? snapshot.counts.activeTodayQuizzes ?? null : null,
      completedAt: snapshot?.completedAt ?? null,
      refreshing: snapshot?.running ?? false,
    };
  },
});

const adminPageArgs = { paginationOpts: v.optional(paginationOptsValidator) };
function adminPage(options: { numItems: number; cursor: string | null } | undefined) {
  if (options && (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 50)) {
    throw new Error("Page size must be 1-50");
  }
  return options ?? { numItems: 25, cursor: null };
}
export const getAdminUsers = query({
  args: adminPageArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return usersForActor(ctx, { paginationOpts: adminPage(args.paginationOpts) });
  },
});
export const getAdminQuizzes = query({
  args: adminPageArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return contentForActor(ctx, { kind: "quizzes", paginationOpts: adminPage(args.paginationOpts) });
  },
});

export const adminToggleUserBan = mutation({
  args: { clerkId: v.string(), ban: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch("users", user._id, { isBanned: args.ban });
    }
  },
});

export const adminToggleUserElevation = mutation({
  args: { clerkId: v.string(), elevate: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      // User elevation is manually granted by an administrator and removes
      // respondent and response caps on the user's quizzes and forms.
      await grantPlan(ctx, user, args.elevate ? "pro" : "free");

      // Propagate to all their quizzes
      const quizzes = await ctx.db
        .query("quizzes")
        .withIndex("by_creator", (q) => q.eq("creatorId", args.clerkId))
        .collect();
      for (const quiz of quizzes) {
        await authorDb(ctx).patch("quizzes", quiz._id, { isElevated: args.elevate });
      }
    }
  },
});

export const adminToggleQuizElevation = mutation({
  args: { quizId: v.id("quizzes"), elevate: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await authorDb(ctx).patch("quizzes", args.quizId, { isElevated: args.elevate });
  },
});

export const adminToggleQuizBan = mutation({
  args: { quizId: v.id("quizzes"), ban: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await authorDb(ctx).patch("quizzes", args.quizId, { isBanned: args.ban });
  },
});

export const adminDeleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await cascadeDeleteQuiz(ctx, args.quizId);
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
    disableAnimations: v.optional(v.boolean()),
    formResponseLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.formResponseLimit !== undefined && (!Number.isInteger(args.formResponseLimit) || args.formResponseLimit < 1)) {
      throw new Error("INVALID_CONFIG: The form response limit must be a whole number of at least 1.");
    }

    const existing = await ctx.db.query("globalConfig").first();
    if (existing) {
      await ctx.db.patch("globalConfig", existing._id, args);
    } else {
      await ctx.db.insert("globalConfig", args);
    }
  },
});

// ============================================================
// ANALYTICS — PERCENTILE & ENHANCED STATS
// ============================================================

export const getPlayerPercentile = query({
  args: { sessionId: v.id("quizSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("quizSessions", args.sessionId);
    if (!session || session.status !== "completed") return null;
    // A standing among other people's scores is a result too; withhold it with the scores.
    if (resultsWithheld(await ctx.db.get("quizzes", session.quizId))) return null;

    const completed = await completedSessions(ctx, session.quizId);
    if (completed.length <= 1) return null;

    const myPct = session.totalPoints > 0 ? session.score / session.totalPoints : 0;
    const beatCount = completed.filter((s) => {
      const theirPct = s.totalPoints > 0 ? s.score / s.totalPoints : 0;
      return myPct > theirPct;
    }).length;

    // Exclude self from the "others" count
    const others = completed.length - 1;
    if (others === 0) return null;
    return Math.round((beatCount / others) * 100);
  },
});

export const getQuizStatsEnhanced = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await getQuizIfOwner(ctx, args.quizId);
    if (!quiz) return null;

    const [completed, allQuestions] = await Promise.all([
      completedSessions(ctx, args.quizId),
      ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", args.quizId)).collect(),
    ]);

    const questions = allQuestions.filter((q) => q.deletedAt === undefined);

    // Top 3
    const top3 = [...completed]
      .sort((a, b) => {
        const aPct = a.totalPoints > 0 ? a.score / a.totalPoints : 0;
        const bPct = b.totalPoints > 0 ? b.score / b.totalPoints : 0;
        return bPct - aPct;
      })
      .slice(0, 3)
      .map((s) => ({
        playerName: s.playerName,
        score: s.score,
        totalPoints: s.totalPoints,
        completedAt: s.completedAt,
      }));

    // Per-question stats
    const questionMap = new Map(questions.map((q) => [q._id as string, { questionText: q.questionText, type: q.type, correct: 0, incorrect: 0 }]));

    for (const session of completed) {
      const countedQuestionIds = new Set<string>();
      for (const ans of session.answers) {
        const qId = ans.questionId as string;
        if (countedQuestionIds.has(qId)) continue;
        countedQuestionIds.add(qId);
        const stat = questionMap.get(qId);
        if (stat) {
          if (ans.isCorrect) stat.correct++;
          else stat.incorrect++;
        }
      }
    }

    const questionStats = questions
      .sort((a, b) => a.order - b.order)
      .map((q) => {
        const stat = questionMap.get(q._id as string) || { correct: 0, incorrect: 0 };
        const total = stat.correct + stat.incorrect;
        return {
          questionId: q._id,
          questionText: q.questionText,
          type: q.type,
          correct: stat.correct,
          incorrect: stat.incorrect,
          correctRate: total > 0 ? Math.round((stat.correct / total) * 100) : null,
        };
      });

    return { top3, questionStats };
  },
});
