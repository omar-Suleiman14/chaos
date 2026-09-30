/**
 * A realistic dataset in the shapes older versions of Chaos wrote (0.2 to 0.4 quizzes, 1.0-era
 * forms). Everything is inserted straight into the tables, the way already-stored production rows
 * exist, so nothing here goes through today's mutations. The current schema must accept every row,
 * and the app must read every one of them correctly.
 *
 * Deliberately awkward rows are flagged with a `// LEGACY:` comment.
 */
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

type Ctx = GenericMutationCtx<DataModel>;

const DAY = 86_400_000;

export const LEGACY_TEACHER = { clerkId: creatorIdentity.subject, username: "legacyteacher" };

export interface LegacyDataset {
  now: number;
  users: { teacher: Id<"users">; elevated: Id<"users">; planless: Id<"users">; pro: Id<"users"> };
  quizzes: { old: Id<"quizzes">; draft: Id<"quizzes">; snapshot: Id<"quizzes">; settingsless: Id<"quizzes">; deletedTarget: Id<"quizzes"> };
  questions: {
    mcq: Id<"questions">; trueFalse: Id<"questions">; multi: Id<"questions">; written: Id<"questions">;
    softDeleted: Id<"questions">; corruptedMulti: Id<"questions">; corruptedWritten: Id<"questions">;
  };
  sessions: {
    legacyCompleted: Id<"quizSessions">; noStatusInProgress: Id<"quizSessions">; completed: Id<"quizSessions">;
    inProgress: Id<"quizSessions">; withSnapshot: Id<"quizSessions">; deletedQuestion: Id<"quizSessions">;
  };
  forms: { v1: Id<"forms">; v1Draft: Id<"forms"> };
  formShareIds: { v1: string; v1Draft: string };
  responses: Id<"formResponses">[];
}

/** A 1.0 form definition: no `quiz`, no `translations`, a minimal theme, no logic. */
const v1Definition = {
  schemaVersion: 1,
  title: "Customer survey",
  description: "",
  defaultLanguage: "en" as const,
  languages: ["en" as const],
  presentation: "page" as const,
  fields: [
    { id: "name", type: "text" as const, label: "Your name", required: true },
    { id: "plan", type: "choice" as const, label: "Plan", required: true, options: [{ id: "a", label: "Free" }, { id: "b", label: "Pro, annual" }] },
    { id: "nps", type: "rating" as const, label: "How likely?", required: false, max: 5 },
  ],
  endings: [{ id: "end", title: "Thanks", message: "Thank you." }],
  theme: { accent: "#ff5a1f", background: "plain" as const, font: "sans" as const, radius: "small" as const },
};

const v1Settings = {
  access: "public" as const, onePerPerson: false, allowEditAfterSubmit: false, showReceipt: true,
  collectPartial: false, allowResumeLink: true, allowIndexing: false, notifyOnResponse: true, requireApproval: false,
};

export async function seedLegacyDataset(ctx: Ctx): Promise<LegacyDataset> {
  const now = Date.now();
  const old = now - 400 * DAY;

  // ── Users ──
  const teacher = await ctx.db.insert("users", {
    // LEGACY: only the original required fields. No plan, no usage counters, no usernameChosen.
    clerkId: LEGACY_TEACHER.clerkId, name: "Casey Creator", email: creatorIdentity.email, username: LEGACY_TEACHER.username, createdAt: old,
  });
  const elevated = await ctx.db.insert("users", {
    // LEGACY: 0.2 gave every new user isElevated: true. No plan field.
    clerkId: "user_elevated_v02", name: "Early Adopter", email: "early@example.com", username: "early", isElevated: true, createdAt: old,
  });
  const planless = await ctx.db.insert("users", {
    clerkId: "user_planless", name: "Plain Person", email: "plain@example.com", username: "plain", createdAt: old,
  });
  const pro = await ctx.db.insert("users", {
    clerkId: "user_pro_v04", name: "Paid Person", email: "paid@example.com", username: "paid",
    plan: "pro", planExpiresAt: now + 30 * DAY, creationMonth: "2026-01", monthlyCreations: 3, usernameChosen: true, createdAt: old,
  });

  // ── Settings ──
  // LEGACY: a teacher who only ever changed one setting.
  await ctx.db.insert("teacherSettings", { clerkId: LEGACY_TEACHER.clerkId, defaultMcqTimer: 45 });
  // LEGACY: a global config from before the defaults were added.
  await ctx.db.insert("globalConfig", { playerLimitErrorText: "Full up." });

  // ── Quizzes ──
  const oldQuiz = await ctx.db.insert("quizzes", {
    // LEGACY: published, no publishedSnapshot/publishedAt, no settings, no tags, no isAiGenerated.
    title: "Chemistry basics", description: "Grade 9", slug: "chemistry-basics", creatorId: LEGACY_TEACHER.clerkId, creatorUsername: LEGACY_TEACHER.username,
    isPublished: true, createdAt: old, updatedAt: old + DAY,
  });
  const draftQuiz = await ctx.db.insert("quizzes", {
    title: "Unfinished draft", slug: "unfinished-draft", creatorId: LEGACY_TEACHER.clerkId, creatorUsername: LEGACY_TEACHER.username,
    isPublished: false, createdAt: old + 2 * DAY, updatedAt: old + 2 * DAY,
  });
  const settingsless = await ctx.db.insert("quizzes", {
    // LEGACY: an empty slug. The schema still requires the field, so "no slug" is stored as "".
    title: "Slugless quiz", slug: "", creatorId: LEGACY_TEACHER.clerkId, creatorUsername: LEGACY_TEACHER.username,
    isPublished: true, createdAt: old + 3 * DAY, updatedAt: old + 3 * DAY,
  });
  const deletedTarget = await ctx.db.insert("quizzes", {
    title: "Deleted later", slug: "deleted-later", creatorId: LEGACY_TEACHER.clerkId, creatorUsername: LEGACY_TEACHER.username,
    isPublished: false, createdAt: old, updatedAt: old,
  });

  // ── Questions on the old quiz ──
  const q = (fields: Record<string, unknown>) => ({ quizId: oldQuiz, ...fields });
  const mcq = await ctx.db.insert("questions", q({ type: "mcq", questionText: "Symbol for water?", options: ["H2O", "CO2", "O2", "NaCl"], correctAnswer: "H2O", points: 2, order: 0 }) as never);
  const trueFalse = await ctx.db.insert("questions", q({ type: "true_false", questionText: "Gold is a metal.", correctAnswer: "true", points: 1, order: 1 }) as never);
  const multi = await ctx.db.insert("questions", q({
    // LEGACY: options that contain commas, the thing the old comma-joined answer encoding broke on.
    type: "multi_select", questionText: "Pick the noble gases.", options: ["Helium, He", "Neon, Ne", "Oxygen, O", "Argon, Ar"],
    correctAnswers: ["Helium, He", "Neon, Ne", "Argon, Ar"], points: 3, order: 2,
  }) as never);
  const written = await ctx.db.insert("questions", q({ type: "written", questionText: "Define an atom.", keywords: ["nucleus", "electron"], points: 4, order: 3 }) as never);
  const softDeleted = await ctx.db.insert("questions", q({
    // LEGACY: soft-deleted; still answered by an old session, must not appear anywhere new.
    type: "mcq", questionText: "Removed question", options: ["x", "y"], correctAnswer: "x", points: 5, order: 4, deletedAt: old + 5 * DAY,
  }) as never);
  const corruptedMulti = await ctx.db.insert("questions", q({
    // LEGACY: editor round-trip defect: a multi-select question saved as "mcq".
    type: "mcq", questionText: "Pick the halogens.", options: ["Fluorine", "Chlorine", "Sodium"], correctAnswer: "Fluorine",
    correctAnswers: ["Fluorine", "Chlorine"], points: 2, order: 5,
  }) as never);
  const corruptedWritten = await ctx.db.insert("questions", q({
    // LEGACY: editor round-trip defect: a written question saved as "mcq", keywords left behind.
    type: "mcq", questionText: "Describe a covalent bond.", keywords: ["share", "electrons"], points: 3, order: 6,
  }) as never);

  // A published quiz that carries a frozen copy of its questions (0.3+), including a corrupted one.
  const snapshot = await ctx.db.insert("quizzes", {
    title: "Physics (live title)", slug: "physics", creatorId: LEGACY_TEACHER.clerkId, creatorUsername: LEGACY_TEACHER.username,
    isPublished: true, publishedAt: now - 10 * DAY, tags: ["physics"], groupName: "Science", displayMode: "pass_fail", passingThreshold: 60,
    createdAt: old, updatedAt: now - 5 * DAY,
  });
  const snapQuestion = await ctx.db.insert("questions", { quizId: snapshot, type: "mcq", questionText: "Unit of force?", options: ["N", "J"], correctAnswer: "N", points: 1, order: 0 });
  const snapCorrupt = await ctx.db.insert("questions", {
    quizId: snapshot, type: "mcq", questionText: "Pick the vectors.", options: ["Velocity", "Mass", "Force"], correctAnswer: "Velocity", correctAnswers: ["Velocity", "Force"], points: 2, order: 1,
  });
  await ctx.db.patch("quizzes", snapshot, {
    publishedSnapshot: {
      title: "Physics (published)",
      questions: [
        { _id: snapQuestion, type: "mcq", questionText: "Unit of force?", options: ["N", "J"], correctAnswer: "N", points: 1, order: 0 },
        { _id: snapCorrupt, type: "mcq", questionText: "Pick the vectors.", options: ["Velocity", "Mass", "Force"], correctAnswer: "Velocity", correctAnswers: ["Velocity", "Force"], points: 2, order: 1 },
      ],
    },
  });

  // ── Sessions ──
  const legacyCompleted = await ctx.db.insert("quizSessions", {
    // LEGACY: no status at all, but finished (has completedAt). 8 of 10 points.
    quizId: oldQuiz, playerName: "Amal", score: 8, totalPoints: 10, startedAt: old + 10 * DAY, completedAt: old + 10 * DAY + 60_000,
    answers: [
      { questionId: mcq, answer: "H2O", isCorrect: true, pointsEarned: 2 },
      { questionId: trueFalse, answer: "true", isCorrect: true, pointsEarned: 1 },
      // LEGACY: comma-joined multi-select answer where the options themselves contain commas.
      { questionId: multi, answer: "Helium, He, Neon, Ne", isCorrect: false, pointsEarned: 0 },
      { questionId: written, answer: "The nucleus has protons and an electron cloud", isCorrect: true, pointsEarned: 4 },
    ],
  });
  const noStatusInProgress = await ctx.db.insert("quizSessions", {
    // LEGACY: no status, never finished.
    quizId: oldQuiz, playerName: "Bilal", score: 0, totalPoints: 10, startedAt: old + 11 * DAY, answers: [],
  });
  const completed = await ctx.db.insert("quizSessions", {
    quizId: oldQuiz, playerName: "Céline", status: "completed", score: 5, totalPoints: 10, startedAt: old + 12 * DAY, completedAt: old + 12 * DAY + 90_000,
    answers: [
      { questionId: mcq, answer: "CO2", isCorrect: false, pointsEarned: 0, timeTaken: 12 },
      { questionId: trueFalse, answer: "true", isCorrect: true, pointsEarned: 1, timeTaken: 5 },
      { questionId: written, answer: "smallest unit", isCorrect: false, pointsEarned: 2, originalPointsEarned: 0, reviewedAt: old + 13 * DAY, reviewedBy: LEGACY_TEACHER.clerkId },
    ],
  });
  const inProgress = await ctx.db.insert("quizSessions", {
    quizId: oldQuiz, playerName: "Dev", status: "in_progress", score: 0, totalPoints: 10, startedAt: now - 1000, answers: [],
  });
  const withSnapshot = await ctx.db.insert("quizSessions", {
    quizId: snapshot, playerName: "Eli", status: "completed", score: 1, totalPoints: 3, startedAt: now - 3 * DAY, completedAt: now - 3 * DAY + 30_000,
    questionSnapshot: [{ _id: snapQuestion, type: "mcq", questionText: "Unit of force?", options: ["N", "J"], correctAnswer: "N", points: 1, order: 0 }],
    answers: [{ questionId: snapQuestion, answer: "N", isCorrect: true, pointsEarned: 1 }],
  });
  const deletedQuestion = await ctx.db.insert("quizSessions", {
    // LEGACY: answered a question that was soft-deleted afterwards.
    quizId: oldQuiz, playerName: "Farah", status: "completed", score: 5, totalPoints: 10, startedAt: old + 14 * DAY, completedAt: old + 14 * DAY + 45_000,
    answers: [{ questionId: softDeleted, answer: "x", isCorrect: true, pointsEarned: 5 }],
  });

  // ── AI jobs ──
  await ctx.db.insert("aiJobs", { clerkId: LEGACY_TEACHER.clerkId, status: "done", quizId: oldQuiz, createdAt: old });
  await ctx.db.insert("aiJobs", { clerkId: LEGACY_TEACHER.clerkId, status: "error", error: "Model unavailable", createdAt: old });
  // LEGACY: a job that points at a quiz that has since been deleted.
  await ctx.db.insert("aiJobs", { clerkId: LEGACY_TEACHER.clerkId, status: "done", quizId: deletedTarget, createdAt: old });
  await ctx.db.delete("quizzes", deletedTarget);

  // ── 1.0-era forms ──
  const v1ShareId = "legacyv1share";
  const v1 = await ctx.db.insert("forms", {
    ownerId: LEGACY_TEACHER.clerkId, title: "Customer survey", shareId: v1ShareId, status: "live", draft: v1Definition, draftRevision: 3,
    settings: v1Settings, publishedVersion: 1, publishedRevision: 3, responseCount: 3, partialCount: 0, createdAt: old, updatedAt: old + DAY,
  });
  await ctx.db.insert("formVersions", { formId: v1, version: 1, definition: v1Definition, publishedAt: old + DAY, publishedBy: LEGACY_TEACHER.clerkId, draftRevision: 3 });
  const v1DraftShare = "legacyv1draft";
  const v1Draft = await ctx.db.insert("forms", {
    ownerId: LEGACY_TEACHER.clerkId, title: "Old draft form", shareId: v1DraftShare, status: "draft", draft: { ...v1Definition, title: "Old draft form" }, draftRevision: 1,
    settings: v1Settings, responseCount: 0, partialCount: 0, createdAt: old, updatedAt: old,
  });
  const response = (n: number, answers: Record<string, string | number>, extra: Record<string, unknown> = {}) => ({
    formId: v1, version: 1, status: "completed" as const, answers, language: "en" as const, submissionKey: `legacy-key-${n}-0000`,
    receiptCode: `OLD0000${n}`, startedAt: old + n * 1000, submittedAt: old + n * 1000 + 30_000, updatedAt: old + n * 1000 + 30_000,
    reviewed: false, tags: [] as string[], spam: false, searchText: "", ...extra,
  });
  const responses = [
    await ctx.db.insert("formResponses", response(1, { name: "Amal", plan: "a", nps: 5 }, { searchText: "Amal Free" })),
    await ctx.db.insert("formResponses", response(2, { name: "Bilal", plan: "b", nps: 3 }, { searchText: "Bilal Pro, annual" })),
    // LEGACY: optional rating left unanswered.
    await ctx.db.insert("formResponses", response(3, { name: "Céline", plan: "a" }, { searchText: "Céline Free" })),
  ];
  await ctx.db.insert("formAggregates", {
    formId: v1, totalDurationMs: 0, timedCount: 0,
    counts: { name: { answered: 3 }, plan: { answered: 3, options: { a: 2, b: 1 } }, nps: { answered: 2, options: { v5: 1, v3: 1 }, sum: 8 } },
  });

  // A second creator with one quiz, to prove nothing crosses over.
  await ctx.db.insert("users", { clerkId: otherCreatorIdentity.subject, name: "Riley", email: otherCreatorIdentity.email, username: "rival", createdAt: old });
  await ctx.db.insert("quizzes", { title: "Not yours", slug: "not-yours", creatorId: otherCreatorIdentity.subject, creatorUsername: "rival", isPublished: true, createdAt: old, updatedAt: old });

  return {
    now,
    users: { teacher, elevated, planless, pro },
    quizzes: { old: oldQuiz, draft: draftQuiz, snapshot, settingsless, deletedTarget },
    questions: { mcq, trueFalse, multi, written, softDeleted, corruptedMulti, corruptedWritten },
    sessions: { legacyCompleted, noStatusInProgress, completed, inProgress, withSnapshot, deletedQuestion },
    forms: { v1, v1Draft },
    formShareIds: { v1: v1ShareId, v1Draft: v1DraftShare },
    responses,
  };
}
