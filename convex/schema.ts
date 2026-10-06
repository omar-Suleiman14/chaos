import { docsTables } from "./docsModel";
import { businessTables } from "./businessModel";
import { indexNowTables } from "./indexNowModel";
import { quizForkTables } from "./quizForkModel";
import { discussionTables } from "./learnDiscussionModel";
import { proposalTables } from "./lessonProposalModel";
import { publicationAuditTables } from "./learnPublicationAuditModel";
import { personalTables } from "./learnPersonalModel";
import { observabilityTables } from "./observabilityModel";
import { liveTeamTables } from "./liveTeamModel";
import { homeworkTables } from "./homeworkModel";
import { sourceModerationTables } from "./learnSourceModerationModel";
import { practiceTables } from "./learnPracticeModel";
import { communityTables } from "./learnCommunityModel";
import { assetTables } from "./learnAssetModel";
import { curriculumTables } from "./curriculumModel";
import { folderTables } from "./folderModel";
import { learnTables } from "./learnModel";
import { metricsValidator } from "./adminModel";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { quizSnapshot, savedQuestion } from "./quizModel";
import { formTables } from "./formModel";
import { integrationTables } from "./integrationModel";
import { webhookTables } from "./webhookModel";
import { liveTables } from "./liveModel";
import { glossaryTables } from "./lessonGlossaryModel";

export default defineSchema({
  authorStudents: defineTable({ authorId: v.string(), key: v.string(), studentId: v.optional(v.string()), guestName: v.optional(v.string()), context: v.string(), publicVisible: v.boolean(), publicHidden: v.optional(v.boolean()), updatedAt: v.number() }).index("by_author_key", ["authorId", "key"]).index("by_author_updated", ["authorId", "updatedAt"]).index("by_author_public_updated", ["authorId", "publicVisible", "updatedAt"]),
  /** A learner who pressed Start on a course: a signed-in account or a device-scoped guest. Feeds the author's course analytics. */
  courseEnrollments: defineTable({ courseId: v.id("learnCollections"), ownerId: v.string(), key: v.string(), studentId: v.optional(v.string()), guestName: v.optional(v.string()), completedLessonIds: v.array(v.id("lessons")), lastLessonId: v.optional(v.id("lessons")), enrolledAt: v.number(), updatedAt: v.number(), completedAt: v.optional(v.number()) }).index("by_course_key", ["courseId", "key"]).index("by_course_updated", ["courseId", "updatedAt"]),
  authorStudentCounts: defineTable({ authorId: v.string(), count: v.number() }).index("by_author", ["authorId"]),
  authIdentityBindings: defineTable({ externalActorId: v.string(), actorId: v.string(), tokenIdentifier: v.string() }).index("by_externalActorId", ["externalActorId"]).index("by_actorId", ["actorId"]),
  ...docsTables,
  ...businessTables,
  ...indexNowTables,
  ...learnTables,
  ...discussionTables,
  ...proposalTables,
  ...publicationAuditTables,
  ...personalTables,
  ...quizForkTables,
  ...observabilityTables,
  ...liveTeamTables,
  ...homeworkTables,
  ...sourceModerationTables,
  ...practiceTables,
  ...communityTables,
  ...assetTables,
  ...curriculumTables,
  ...folderTables,
  ...formTables,
  ...integrationTables,
  ...webhookTables,
  ...liveTables,
  ...glossaryTables,

  adminMetrics: defineTable({ key: v.string(), counts: metricsValidator, pending: metricsValidator, running: v.boolean(), startedAt: v.number(), completedAt: v.optional(v.number()), phase: v.union(v.literal("users"), v.literal("forms"), v.literal("quizzes"), v.literal("quizSessions")), cursor: v.union(v.string(), v.null()) }).index("by_key", ["key"]),
  adminBulkJobs: defineTable({ actorId: v.string(), plan: v.union(v.literal("free"), v.literal("pro")), reason: v.string(), cutoff: v.number(), processed: v.number(), done: v.boolean() }),
  /** Admin accounts. Managed only with `npx convex run admin:grantAdmin` / `admin:revokeAdmin`. */
  admins: defineTable({
    clerkId: v.string(),
    /** For people reading the table; access is decided by clerkId only. */
    email: v.string(),
    grantedAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),
  adminAudit: defineTable({
    actorId: v.string(), action: v.string(), target: v.string(), reason: v.string(), createdAt: v.number(),
  }).index("by_target", ["target"]),
  crmContacts: defineTable({
    name: v.string(), email: v.string(), organization: v.string(),
    userId: v.optional(v.id("users")),
    stage: v.union(v.literal("new"), v.literal("contacted"), v.literal("active"), v.literal("closed")),
    owner: v.string(), source: v.string(), nextFollowUp: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_email", ["email"]).index("by_stage", ["stage"]).index("by_follow_up", ["nextFollowUp"]).searchIndex("search_name", { searchField: "name", filterFields: ["stage"] }),
  crmNotes: defineTable({ contactId: v.id("crmContacts"), body: v.string(), actorId: v.string(), createdAt: v.number() }).index("by_contact", ["contactId"]),
  /**
   * Namespace reservations; retained even when an account is removed. A name left behind that
   * never appeared in a public link gets `expiresAt` and is released after a grace period
   * (convex/usernameModel.ts); names that did stay reserved, up to a cap per account.
   */
  usernameAliases: defineTable({
    username: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index("by_username", ["username"]).index("by_ownerId", ["ownerId"]).index("by_expiresAt", ["expiresAt"]),
  publicAuthorAssets: defineTable({ assetId: v.string(), table: v.union(v.literal("forms"), v.literal("quizzes"), v.literal("lessons"), v.literal("learnCollections")), ownerId: v.string() }).index("by_assetId", ["assetId"]).index("by_ownerId", ["ownerId"]),

  // ============ USERS ============
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    username: v.string(),
    /** True once the person picks a username; sign-in sync then stops overwriting it. */
    usernameChosen: v.optional(v.boolean()),
    /** Recent username changes (newest last), for the change rate limit. */
    usernameChangedAt: v.optional(v.array(v.number())),
    imageUrl: v.optional(v.string()),
    /** Number of currently public, indexed publications; maintained by authorIndex.ts. */
    publicAuthorAssets: v.optional(v.number()),
    /** Opt out of public author directories; direct published links stay available. */
    hideFromAuthorLists: v.optional(v.boolean()),
    /** Public student Cards are enabled unless the account opts out. */
    hideStudentCards: v.optional(v.boolean()),
    /** Member card colour theme index (lib/memberCard.ts CARD_THEMES). */
    cardStyle: v.optional(v.number()),
    cardAvatarSeed: v.optional(v.string()),
    cardOnboardingPending: v.optional(v.boolean()),
    cardOnboardingCompletedAt: v.optional(v.number()),
    profileNameChosen: v.optional(v.boolean()),
    isBanned: v.optional(v.boolean()),
    creationMonth: v.optional(v.string()),
    monthlyCreations: v.optional(v.number()),
    suspendedUntil: v.optional(v.number()),
    moderationReason: v.optional(v.string()),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
    planExpiresAt: v.optional(v.number()),
    // Legacy entitlement retained until an explicit plan is assigned.
    isElevated: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_username", ["username"])
    .index("by_publicAuthorAssets", ["publicAuthorAssets"])
    .index("by_email", ["email"])
    .index("by_planExpiresAt", ["planExpiresAt"])
    .index("by_suspendedUntil", ["suspendedUntil"]).searchIndex("search_name", { searchField: "name", filterFields: [] })
    .searchIndex("search_email", { searchField: "email", filterFields: [] }),

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
    disableAnimations: v.optional(v.boolean()),      // default false
  }).index("by_clerkId", ["clerkId"]),

  // ============ QUIZZES ============
  quizzes: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    slug: v.string(),             // URL-safe slug (unique per creator)
    creatorId: v.string(),        // clerkId
    creatorUsername: v.string(),   // cached for URL routing
    isPublished: v.boolean(),
    archived: v.optional(v.boolean()),
    publishedSnapshot: v.optional(quizSnapshot),
    // Draft revision (updatedAt) last published; later edits are unpublished changes.
    publishedAt: v.optional(v.number()),
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
    disableAnimations: v.optional(v.boolean()),
    // Question pool: each attempt draws this many questions from the published set.
    poolSize: v.optional(v.number()),
    // "manual" withholds scores and correctness until the creator releases results.
    resultRelease: v.optional(v.union(v.literal("immediate"), v.literal("manual"))),
    resultsReleasedAt: v.optional(v.number()),
    isBanned: v.optional(v.boolean()),
    // Snapshot/override used to bypass the respondent cap for this quiz.
    isElevated: v.optional(v.boolean()),
    isAiGenerated: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- sorted by _creationTime; removing it needs a migration
    .index("by_creator", ["creatorId"])
    .index("by_creator_archived", ["creatorId", "archived"])
    .index("by_creator_createdAt", ["creatorId", "createdAt"])
    .index("by_slug", ["slug"])
    .index("by_creator_slug", ["creatorUsername", "slug"])
    .searchIndex("search_title", { searchField: "title", filterFields: [] }),

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
    deletedAt: v.optional(v.number()),
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
    questionSnapshot: v.optional(v.array(savedQuestion)),
    totalPoints: v.number(),
    answers: v.array(
      v.object({
        questionId: v.id("questions"),
        answer: v.string(),
        isCorrect: v.boolean(),
        pointsEarned: v.number(),
        originalPointsEarned: v.optional(v.number()),
        reviewedAt: v.optional(v.number()),
        reviewedBy: v.optional(v.string()),
        timeTaken: v.optional(v.number()),
      })
    ),
    completedAt: v.optional(v.number()),
    startedAt: v.number(),
    /** Attempts saved from a live game (convex/live.ts). */
    source: v.optional(v.literal("live")),
    liveGameId: v.optional(v.id("liveGames")),
  })
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- sorted by _creationTime; removing it needs a migration
    .index("by_quiz", ["quizId"])
    .index("by_quiz_started", ["quizId", "startedAt"])
    .index("by_quiz_score", ["quizId", "score"])
    // Completed attempts only: counts, averages, leaderboards and results read this range, so
    // answers landing on in-progress attempts neither get read nor re-run those subscriptions.
    .index("by_quizId_and_status_and_score", ["quizId", "status", "score"]),

  // ============ AI JOBS (inert) ============
  // Chaos no longer runs AI. Kept so historical rows stay valid; nothing creates or reads jobs.
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
    disableAnimations: v.optional(v.boolean()),
    formResponseLimit: v.optional(v.number()),       // per-form cap for non-elevated owners
    integrationReadRatePerMinute: v.optional(v.number()),  // per connection; overrides CHAOS_API_READ_RATE_PER_MINUTE
    integrationWriteRatePerMinute: v.optional(v.number()), // per connection; overrides CHAOS_API_WRITE_RATE_PER_MINUTE
  }),
});
