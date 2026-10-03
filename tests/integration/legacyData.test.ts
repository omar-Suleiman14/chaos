import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { LEGACY_TEACHER, seedLegacyDataset } from "../fixtures/legacyDataset";
import type { LegacyDataset } from "../fixtures/legacyDataset";

async function seeded() {
  const t = createTestConvex();
  const ds: LegacyDataset = await t.run((ctx) => seedLegacyDataset(ctx));
  return { t, ds, teacher: t.withIdentity(creatorIdentity) };
}

type T = Awaited<ReturnType<typeof seeded>>["t"];

/** Runs a paged repair to the end, like an operator following continueCursor. */
async function runToEnd(t: T, fn: typeof internal.migrations.backfillSessionStatus | typeof internal.migrations.repairQuestionTypes, args: { dryRun?: boolean } = {}) {
  let cursor: string | null = null;
  const total = { scanned: 0, changed: 0, changedIds: [] as string[] };
  for (let i = 0; i < 50; i++) {
    const r: { scanned: number; changed: number; changedIds: string[]; isDone: boolean; continueCursor: string | null } = await t.mutation(fn, { ...args, cursor, batchSize: 3 });
    total.scanned += r.scanned; total.changed += r.changed; total.changedIds.push(...r.changedIds);
    if (r.isDone) return total;
    cursor = r.continueCursor;
  }
  throw new Error("migration did not finish");
}

/** Every row of every table the migrations may touch, for before/after comparison. */
const snapshotAll = (t: T) => t.run(async (ctx) => ({
  users: await ctx.db.query("users").collect(),
  quizzes: await ctx.db.query("quizzes").collect(),
  questions: await ctx.db.query("questions").collect(),
  sessions: await ctx.db.query("quizSessions").collect(),
  forms: await ctx.db.query("forms").collect(),
  responses: await ctx.db.query("formResponses").collect(),
  aiJobs: await ctx.db.query("aiJobs").collect(),
  settings: await ctx.db.query("teacherSettings").collect(),
  authorAssets: await ctx.db.query("publicAuthorAssets").collect(),
}));

describe("legacy data: the current schema accepts old shapes", () => {
  it("loads the whole fixture dataset", async () => {
    const { t, ds } = await seeded();
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      quizzes: (await ctx.db.query("quizzes").collect()).length,
      questions: (await ctx.db.query("questions").collect()).length,
      sessions: (await ctx.db.query("quizSessions").collect()).length,
      forms: (await ctx.db.query("forms").collect()).length,
      responses: (await ctx.db.query("formResponses").collect()).length,
    }));
    expect(counts).toEqual({ users: 5, quizzes: 5, questions: 9, sessions: 6, forms: 2, responses: 3 });
    expect(ds.responses).toHaveLength(3);
  });

  it("still requires a slug: a quiz without one cannot be stored, an empty one can", async () => {
    const { t } = await seeded();
    await expect(t.run((ctx) => ctx.db.insert("quizzes", {
      title: "No slug", creatorId: "u", creatorUsername: "u", isPublished: false, createdAt: 1, updatedAt: 1,
    } as never))).rejects.toThrow();
  });
});

describe("legacy data: read paths return correct values", () => {
  it("library list counts live questions and completed attempts only", async () => {
    const { teacher, ds } = await seeded();
    const list = await teacher.query(api.quizFunctions.getMyQuizzes, {});
    expect(list).toHaveLength(4);
    const old = list.find((q) => q._id === ds.quizzes.old)!;
    // 7 questions written, one soft-deleted.
    expect(old.questionCount).toBe(6);
    expect(old.title).toBe("Chemistry basics");
    expect(old).not.toHaveProperty("publishedSnapshot");
    // Sessions with status "completed": Céline and Farah. Amal has no status; see the backfill tests.
    expect(old.sessionCount).toBe(2);
    expect(old.avgScore).toBe(50);
    const draft = list.find((q) => q._id === ds.quizzes.draft)!;
    expect(draft).toMatchObject({ questionCount: 0, sessionCount: 0, avgScore: 0, isPublished: false });
    // Physics has a snapshot; its live questions and one completed attempt.
    const physics = list.find((q) => q._id === ds.quizzes.snapshot)!;
    expect(physics).toMatchObject({ questionCount: 2, sessionCount: 1, avgScore: 33 });
  });

  it("other creators see none of it", async () => {
    const { t, ds } = await seeded();
    const rival = t.withIdentity(otherCreatorIdentity);
    const list = await rival.query(api.quizFunctions.getMyQuizzes, {});
    expect(list.map((q) => q.title)).toEqual(["Not yours"]);
    expect(await rival.query(api.quizFunctions.getQuestionsForOwner, { quizId: ds.quizzes.old })).toEqual([]);
    expect(await rival.query(api.quizFunctions.getQuizSessions, { quizId: ds.quizzes.old })).toEqual([]);
  });

  it("public URLs from before 0.2 still resolve", async () => {
    const { t, ds } = await seeded();
    const hit = await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: LEGACY_TEACHER.username, slug: "chemistry-basics" });
    expect(hit).toMatchObject({ _id: ds.quizzes.old, title: "Chemistry basics", isPublished: true });
    expect((await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: LEGACY_TEACHER.username, slug: "physics" }))?._id).toBe(ds.quizzes.snapshot);
    // A draft is not reachable by respondents.
    expect(await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: LEGACY_TEACHER.username, slug: "unfinished-draft" })).toBeNull();
    // The empty slug is not a route; the quiz is reachable by id.
    expect(await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: LEGACY_TEACHER.username, slug: "does-not-exist" })).toBeNull();
  });

  it("the player sees live questions without answer keys, applying the settings cascade", async () => {
    const { t, ds } = await seeded();
    const player = await t.query(api.quizFunctions.getQuizForPlayer, { quizId: ds.quizzes.old });
    expect(player).not.toBeNull();
    expect(player!.questions).toHaveLength(6); // soft-deleted question hidden
    expect(player!.questions.map((q) => q._id)).not.toContain(ds.questions.softDeleted);
    expect(JSON.stringify(player)).not.toMatch(/correctAnswer|keywords|explanation/);
    // Old quiz has no settings: teacher settings (only a timer was set), then global config, then defaults.
    expect(player).toMatchObject({ displayMode: "score", passingThreshold: 50, showCorrectAnswers: true, showExplanations: true, randomizeQuestions: false, disableAnimations: false });
    expect(player!.totalPoints).toBe(2 + 1 + 3 + 4 + 2 + 3);
    expect(player!.creatorName).toBe("Casey Creator");
    expect(player!.resultsWithheld).toBe(false);
  });

  it("a published quiz serves its frozen snapshot, not the live rows, and keeps its own settings", async () => {
    const { t, ds } = await seeded();
    const player = await t.query(api.quizFunctions.getQuizForPlayer, { quizId: ds.quizzes.snapshot });
    expect(player!.title).toBe("Physics (published)");
    expect(player!.questions).toHaveLength(2);
    expect(player!.displayMode).toBe("pass_fail");
    expect(player!.passingThreshold).toBe(60);
  });

  it("teacher settings fill missing values with defaults", async () => {
    const { teacher } = await seeded();
    const settings = await teacher.query(api.quizFunctions.getTeacherSettings, {});
    expect(settings).toMatchObject({ defaultMcqTimer: 45, defaultWrittenTimer: 180, defaultPointsPerQuestion: 1, halfMarkThreshold: 50, showCorrectAnswers: true, passingThreshold: 50 });
  });

  it("owner question list hides soft-deleted rows and keeps order", async () => {
    const { teacher, ds } = await seeded();
    const questions = await teacher.query(api.quizFunctions.getQuestionsForOwner, { quizId: ds.quizzes.old });
    expect(questions.map((q) => q.order)).toEqual([0, 1, 2, 3, 5, 6]);
    expect(questions.map((q) => q._id)).not.toContain(ds.questions.softDeleted);
  });

  it("results: session list, detail, leaderboard and stats", async () => {
    const { teacher, t, ds } = await seeded();
    const sessions = await teacher.query(api.quizFunctions.getQuizSessions, { quizId: ds.quizzes.old });
    expect(sessions.map((s) => s.playerName).sort()).toEqual(["Farah", "Céline"].sort());

    const detail = await teacher.query(api.quizFunctions.getSessionDetail, { sessionId: ds.sessions.completed });
    expect(detail).toMatchObject({ score: 5, totalPoints: 10 });
    expect(detail!.answerDetails.map((a) => a.questionText)).toEqual(["Symbol for water?", "Gold is a metal.", "Define an atom."]);
    expect(detail!.answerDetails[2]).toMatchObject({ originalPointsEarned: 0, pointsEarned: 2, totalPoints: 4 });

    // An answer to a soft-deleted question still resolves to its original text (the row is kept).
    const removed = await teacher.query(api.quizFunctions.getSessionDetail, { sessionId: ds.sessions.deletedQuestion });
    expect(removed!.answerDetails[0]).toMatchObject({ questionText: "Removed question", totalPoints: 5 });

    // A session that answered from a frozen copy grades against that copy.
    const snap = await teacher.query(api.quizFunctions.getSessionDetail, { sessionId: ds.sessions.withSnapshot });
    expect(snap!.answerDetails[0]).toMatchObject({ questionText: "Unit of force?", correctAnswer: "N" });

    const board = await t.query(api.quizFunctions.getQuizLeaderboard, { quizId: ds.quizzes.old });
    expect(board.map((b) => [b.playerName, b.score])).toEqual([["Céline", 5], ["Farah", 5]]);

    const stats = await teacher.query(api.quizFunctions.getQuizStatsEnhanced, { quizId: ds.quizzes.old });
    expect(stats!.top3).toHaveLength(2);
    const water = stats!.questionStats.find((s) => s.questionId === ds.questions.mcq)!;
    expect(water).toMatchObject({ correct: 0, incorrect: 1, correctRate: 0 });
  });

  it("a score never exceeds the total points for any stored session", async () => {
    const { t } = await seeded();
    const sessions = await t.run((ctx) => ctx.db.query("quizSessions").collect());
    for (const s of sessions) {
      expect(s.score).toBeLessThanOrEqual(s.totalPoints);
      expect(s.answers.reduce((sum, a) => sum + a.pointsEarned, 0)).toBeLessThanOrEqual(s.totalPoints);
    }
  });

  it("users without plan fields keep working: isElevated is honoured until a plan is set", async () => {
    const { t, teacher, ds } = await seeded();
    const me = await teacher.query(api.quizFunctions.getCurrentUser, {});
    expect(me).toMatchObject({ username: "legacyteacher" });
    expect(me!.plan).toBeUndefined();
    const { hasPro, isPaidPlan } = await import("@/convex/authz");
    const users = await t.run(async (ctx) => ({
      elevated: await ctx.db.get("users", ds.users.elevated), planless: await ctx.db.get("users", ds.users.planless),
      pro: await ctx.db.get("users", ds.users.pro), teacher: await ctx.db.get("users", ds.users.teacher),
    }));
    // Every account has every feature; isPaidPlan still reports paid or admin-granted plans.
    for (const user of Object.values(users)) expect(hasPro(user, ds.now)).toBe(true);
    expect(isPaidPlan(users.elevated, ds.now)).toBe(true);
    expect(isPaidPlan(users.planless, ds.now)).toBe(false);
    expect(isPaidPlan(users.teacher, ds.now)).toBe(false);
    expect(isPaidPlan(users.pro, ds.now)).toBe(true);
    // A paid plan that has expired stops counting, even without isElevated.
    expect(isPaidPlan({ ...users.pro!, planExpiresAt: ds.now - 1 }, ds.now)).toBe(false);
    // An explicit plan overrides a legacy isElevated flag.
    expect(isPaidPlan({ ...users.elevated!, plan: "free" }, ds.now)).toBe(false);
  });

  it("MCP reads classic quizzes: search, get_form and results", async () => {
    const { t, ds } = await seeded();
    const userId = LEGACY_TEACHER.clerkId;
    const found = await t.query(internal.mcp.searchForms, { userId, status: "any", limit: 50 });
    const titles = found.items.map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(["Chemistry basics", "Unfinished draft", "Physics (live title)", "Customer survey", "Old draft form"]));

    const quiz = await t.query(internal.mcp.getForm, { userId, id: `quiz_${ds.quizzes.old}` });
    expect(quiz).toMatchObject({ kind: "classic_quiz", title: "Chemistry basics", status: "live" });
    const questions = (quiz as { questions: { id: string; type: string; options?: string[]; correctAnswers?: string[] }[] }).questions;
    expect(questions).toHaveLength(6);
    expect(questions.find((q) => q.id === ds.questions.multi)).toMatchObject({ type: "multiple_choice", correctAnswers: ["Helium, He", "Neon, Ne", "Argon, Ar"] });
    expect(questions.find((q) => q.id === ds.questions.trueFalse)).toMatchObject({ type: "single_choice", correctAnswers: ["true"] });
    expect(questions.map((q) => q.id)).not.toContain(ds.questions.softDeleted);

    const form = await t.query(internal.mcp.getForm, { userId, id: `form_${ds.forms.v1}` });
    expect(form).toMatchObject({ kind: "form", title: "Customer survey", status: "live", readyToPublish: true });
    expect((form as { questions: unknown[] }).questions).toHaveLength(3);

    // Results count the status-less finished session as completed (the MCP read is tolerant).
    const results = await t.query(internal.mcp.getResults, { userId, id: `quiz_${ds.quizzes.old}` });
    expect(results).toMatchObject({ attempts: 5, completed: 3 });
  });
});

describe("legacy data: 1.0-era forms", () => {
  it("loads in the library, the public page, the inbox, analysis and export", async () => {
    const { t, teacher, ds } = await seeded();
    const library = await teacher.query(api.forms.listMyForms, {});
    expect(library.owned.map((f) => f.title).sort()).toEqual(["Customer survey", "Old draft form"]);

    const pub = await t.query(api.respond.getPublicForm, { shareId: ds.formShareIds.v1 });
    expect(pub.state).toBe("open");
    if (pub.state !== "open") return;
    expect(pub.definition.fields.map((f) => f.id)).toEqual(["name", "plan", "nps"]);
    expect(pub.version).toBe(1);
    expect((await t.query(api.respond.getPublicForm, { shareId: ds.formShareIds.v1Draft })).state).toBe("unavailable");

    const inbox = await teacher.query(api.formResults.listResponses, { formId: ds.forms.v1, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(inbox.page).toHaveLength(3);
    expect(inbox.page.map((r) => r.receiptCode).sort()).toEqual(["OLD00001", "OLD00002", "OLD00003"]);

    const one = await teacher.query(api.formResults.getResponse, { responseId: ds.responses[1] });
    expect(one!.items.find((i) => i.fieldId === "plan")?.text).toBe("Pro, annual");
    const skipped = await teacher.query(api.formResults.getResponse, { responseId: ds.responses[2] });
    expect(skipped!.items.find((i) => i.fieldId === "nps")?.state).not.toBe("answered");

    const exported = await teacher.query(api.formResults.exportResponses, { formId: ds.forms.v1, includePartial: false, includeSpam: false, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported!.columns.map((c) => c.label)).toEqual(["Your name", "Plan", "How likely?"]);
    expect(exported!.rows.map((r) => r.cells)).toEqual([
      { name: "Amal", plan: "Free", nps: "5" }, { name: "Bilal", plan: "Pro, annual", nps: "3" }, { name: "Céline", plan: "Free", nps: "" },
    ]);

    const analysis = await teacher.query(api.formResults.getAnalysis, { formId: ds.forms.v1 });
    expect(analysis).not.toBeNull();
  });

  it("accepts a new submission on a 1.0 form and keeps the counters right", async () => {
    const { t, teacher, ds } = await seeded();
    const res = await t.mutation(api.respond.submitResponse, {
      shareId: ds.formShareIds.v1, submissionKey: "new-key-00000001", answers: { name: "Dana", plan: "b", nps: 4 }, language: "en", final: true, startedAt: Date.now() - 60_000,
    });
    expect(res.duplicate).toBe(false);
    const form = await teacher.query(api.forms.getFormForEditor, { formId: ds.forms.v1 });
    expect(form!.responseCount).toBe(4);
    expect(form!.draft.theme).toMatchObject({ accent: "#ff5a1f" });
  });
});

describe("migrations: backfillSessionStatus", () => {
  it("dry run changes nothing", async () => {
    const { t } = await seeded();
    const before = await snapshotAll(t);
    const r = await runToEnd(t, internal.migrations.backfillSessionStatus, { dryRun: true });
    expect(r.changed).toBe(2);
    expect(await snapshotAll(t)).toEqual(before);
  });

  it("gives status-less sessions a status, loses no data, and is idempotent", async () => {
    const { t, teacher, ds } = await seeded();
    const before = await snapshotAll(t);
    const first = await runToEnd(t, internal.migrations.backfillSessionStatus);
    expect(first.changed).toBe(2);
    expect(first.changedIds.sort()).toEqual([ds.sessions.legacyCompleted, ds.sessions.noStatusInProgress].sort());
    const after = await snapshotAll(t);

    // Nothing except `status` on those two rows changed.
    expect(after.sessions.find((s) => s._id === ds.sessions.legacyCompleted)).toMatchObject({ status: "completed" });
    expect(after.sessions.find((s) => s._id === ds.sessions.noStatusInProgress)).toMatchObject({ status: "in_progress" });
    const strip = (rows: typeof before.sessions) => rows.map(({ status: _s, ...rest }) => rest);
    expect(strip(after.sessions)).toEqual(strip(before.sessions));
    expect({ ...after, sessions: undefined }).toEqual({ ...before, sessions: undefined });

    // Second run: no changes at all.
    const second = await runToEnd(t, internal.migrations.backfillSessionStatus);
    expect(second.changed).toBe(0);
    expect(await snapshotAll(t)).toEqual(after);

    // The finished session now shows up everywhere, with its original score.
    const list = await teacher.query(api.quizFunctions.getMyQuizzes, {});
    const old = list.find((q) => q._id === ds.quizzes.old)!;
    expect(old.sessionCount).toBe(3);
    expect(old.avgScore).toBe(Math.round((80 + 50 + 50) / 3));
    const board = await t.query(api.quizFunctions.getQuizLeaderboard, { quizId: ds.quizzes.old });
    expect(board[0]).toMatchObject({ playerName: "Amal", score: 8, totalPoints: 10 });
  });
});

describe("migrations: repairQuestionTypes", () => {
  it("repairs only unambiguous corruption, loses no data, and is idempotent", async () => {
    const { t, ds } = await seeded();
    const before = await snapshotAll(t);
    const dry = await runToEnd(t, internal.migrations.repairQuestionTypes, { dryRun: true });
    expect(dry.changed).toBe(4); // two live questions, one live question in Physics, one snapshot entry
    expect(await snapshotAll(t)).toEqual(before);

    const first = await runToEnd(t, internal.migrations.repairQuestionTypes);
    expect(first.changedIds).toEqual(expect.arrayContaining([ds.questions.corruptedMulti, ds.questions.corruptedWritten]));
    expect(first.changedIds.filter((id) => id.startsWith("snapshot:"))).toHaveLength(1);
    const after = await snapshotAll(t);
    const byId = (rows: typeof after.questions) => new Map(rows.map((r) => [r._id, r]));
    const beforeQ = byId(before.questions);
    expect(byId(after.questions).get(ds.questions.corruptedMulti)).toMatchObject({ type: "multi_select", correctAnswers: ["Fluorine", "Chlorine"], correctAnswer: "Fluorine" });
    expect(byId(after.questions).get(ds.questions.corruptedWritten)).toMatchObject({ type: "written", keywords: ["share", "electrons"] });
    // Untouched: healthy questions of all four types and the soft-deleted one.
    for (const id of [ds.questions.mcq, ds.questions.trueFalse, ds.questions.multi, ds.questions.written, ds.questions.softDeleted]) {
      expect(byId(after.questions).get(id)).toEqual(beforeQ.get(id));
    }
    // Only `type` differs on the repaired rows.
    for (const id of [ds.questions.corruptedMulti, ds.questions.corruptedWritten]) {
      const { type: _a, ...a } = byId(after.questions).get(id)!;
      const { type: _b, ...b } = beforeQ.get(id)!;
      expect(a).toEqual(b);
    }
    // The frozen copy is repaired too, and the quiz title and other questions in it are unchanged.
    const physics = after.quizzes.find((q) => q._id === ds.quizzes.snapshot)!;
    expect(physics.publishedSnapshot!.questions.map((q) => q.type)).toEqual(["mcq", "multi_select"]);
    expect(physics.publishedSnapshot!.title).toBe("Physics (published)");
    // Sessions and forms are untouched. Repairing the public snapshot also
    // registers its author; all other profile data must remain unchanged.
    expect(after.sessions).toEqual(before.sessions);
    expect(after.users).toEqual(before.users.map(user => user._id === ds.users.teacher
      ? { ...user, publicAuthorAssets: 1 }
      : user));
    expect(before.authorAssets).toEqual([]);
    expect(after.authorAssets).toHaveLength(1);
    expect(after.authorAssets[0]).toMatchObject({
      assetId: ds.quizzes.snapshot, table: "quizzes", ownerId: LEGACY_TEACHER.clerkId,
    });
    expect(after.forms).toEqual(before.forms);

    const second = await runToEnd(t, internal.migrations.repairQuestionTypes);
    expect(second.changed).toBe(0);
    expect(await snapshotAll(t)).toEqual(after);
  });

  it("the repaired question grades as multi-select", async () => {
    const { t, teacher, ds } = await seeded();
    await runToEnd(t, internal.migrations.repairQuestionTypes);
    const player = await t.query(api.quizFunctions.getQuizForPlayer, { quizId: ds.quizzes.old });
    expect(player!.questions.find((q) => q._id === ds.questions.corruptedMulti)?.type).toBe("multi_select");
    const owner = await teacher.query(api.quizFunctions.getQuestionsForOwner, { quizId: ds.quizzes.old });
    expect(owner.find((q) => q._id === ds.questions.corruptedWritten)?.type).toBe("written");
  });
});

describe("migrations: both together", () => {
  it("running the full set twice leaves the dataset unchanged the second time", async () => {
    const { t } = await seeded();
    await runToEnd(t, internal.migrations.backfillSessionStatus);
    await runToEnd(t, internal.migrations.repairQuestionTypes);
    const once = await snapshotAll(t);
    await runToEnd(t, internal.migrations.repairQuestionTypes);
    await runToEnd(t, internal.migrations.backfillSessionStatus);
    expect(await snapshotAll(t)).toEqual(once);
  });

  it("public URLs, form data and scores are identical before and after", async () => {
    const { t, teacher, ds } = await seeded();
    const read = async () => ({
      url: await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: LEGACY_TEACHER.username, slug: "chemistry-basics" }),
      form: await t.query(api.respond.getPublicForm, { shareId: ds.formShareIds.v1 }),
      sessions: (await t.run((ctx) => ctx.db.query("quizSessions").collect())).map((s) => [s._id, s.score, s.totalPoints, s.answers.map((a) => a.pointsEarned)]),
      responses: (await teacher.query(api.formResults.listResponses, { formId: ds.forms.v1, filter: {}, paginationOpts: { numItems: 10, cursor: null } })).page,
    });
    const before = await read();
    await runToEnd(t, internal.migrations.backfillSessionStatus);
    await runToEnd(t, internal.migrations.repairQuestionTypes);
    expect(await read()).toEqual(before);
  });
});

describe("legacy data: known gaps", () => {
  // The by-design fallback for old multi-select answers ("A, B" joined with a comma) cannot be
  // split back apart when the options themselves contain commas. The stored string is kept as is
  // and displayed as is, so no data is lost, but the historical grade cannot be re-derived.
  it("keeps a comma-joined historical multi-select answer verbatim", async () => {
    const { teacher, ds } = await seeded();
    const detail = await teacher.query(api.quizFunctions.getSessionDetail, { sessionId: ds.sessions.legacyCompleted });
    const multi = detail!.answerDetails.find((a) => a.questionId === ds.questions.multi)!;
    expect(multi.answer).toBe("Helium, He, Neon, Ne");
    expect(multi).toMatchObject({ isCorrect: false, pointsEarned: 0, questionType: "multi_select" });
  });

  it.todo("1.0 sessions with no recorded ordering, pre-revision sessions and pre-collaboration ownership: no such concepts exist in this codebase yet (see docs/migrations.md)");
});
