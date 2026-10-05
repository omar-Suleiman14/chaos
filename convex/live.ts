import { recordStudent } from "./studentRoster";
import { businessMember } from "./businessAccess";
import { getAuthIdentity } from "./authIdentity";
// Live games: a host runs a quiz on a shared screen; players join with a PIN and
// answer on their phones. See convex/liveLogic.ts for the pure rules.
//
// Guarantees:
//  - The server owns the clock. Answers after questionEndsAt are rejected, and a
//    scheduled mutation reveals the question when time is up.
//  - Correct answers never reach players (or the projected host screen) before the
//    reveal: every view is built per state, and scores change only at the reveal.
//  - Players are anonymous: a random browser token whose SHA-256 is stored. Host-only
//    functions require the host's Clerk identity.
//  - When the game ends, each player's answers become an ordinary response of the
//    form (or an attempt of the old quiz), marked as coming from this game.

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { hasPro, requireActiveUser, requireFormRole } from "./authz";
import { consumeRate, notify, randomCode, sha256Hex } from "./serverUtils";
import { languageValidator, themeValidator } from "./formModel";
import { liveStateValidator } from "./liveModel";
import type { Answers, FormDefinition, FormTheme } from "./formLogic";
import { searchTextFor, selectEnding } from "./formLogic";
import { gradeQuiz } from "./formQuiz";
import { countResponse, ownerBanned, responseCap } from "./respond";
import { emitQuizAttemptEvent, emitWebhookEvent, formResponseData } from "./webhookEvents";
import {
  answerPoints, cleanChoice, cleanNickname, DEFAULT_BREAK, DEFAULT_TIME_LIMIT, MAX_BREAK, MIN_BREAK, START_COUNTDOWN_MS, FREE_PLAYER_LIMIT, IDLE_EXPIRY_MS, isCorrectAnswer,
  isValidPin, legacyAnswerText, MAX_LIVE_QUESTIONS, MAX_TIME_LIMIT, MIN_TIME_LIMIT, nicknameKey, nicknameProblem,
  PRO_PLAYER_LIMIT, questionsFromForm, questionsFromLegacy, rankScores, streakBonus,
} from "./liveLogic";
import type { LegacyQuestionLike, LiveQuestion } from "./liveLogic";

type Ctx = QueryCtx | MutationCtx;
type Game = Doc<"liveGames">;
type Player = Doc<"livePlayers">;

const TOKEN = /^[a-f0-9]{32,128}$/;
const ACTIVE_STATES = ["lobby", "question", "reveal", "leaderboard"] as const;
/** Active memberships have their own index; kicked history never occupies capacity or scoring slots. */
const PLAYER_READ_CAP = PRO_PLAYER_LIMIT + 1;
const ANSWER_SHARDS = 16;
const ANSWER_CHECK_INTERVAL = 1_000;

// ── Helpers ────────────────────────────────────────────────────────────────

async function requireHost(ctx: MutationCtx, gameId: Id<"liveGames">): Promise<Game> {
  const { identity } = await requireActiveUser(ctx);
  return requireHostForAccount(ctx, identity.subject, gameId);
}

/** Only public wrappers or verified internal MCP transport supply this account id. */
async function requireActiveAccount(ctx: Ctx, userId: string) {
  const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first();
  if (user?.isBanned || user?.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED: This account is read-only.");
  return user;
}

async function requireHostForAccount(ctx: MutationCtx, userId: string, gameId: Id<"liveGames">) {
  await requireActiveAccount(ctx, userId);
  const game = await ctx.db.get("liveGames", gameId);
  if (!game || game.hostId !== userId) throw new Error("LIVE_NOT_FOUND: This game was not found, or you are not its host.");
  return game;
}

async function activeGameByPin(ctx: Ctx, pin: string): Promise<Game | null> {
  for (const state of ACTIVE_STATES) {
    const game = await ctx.db.query("liveGames").withIndex("by_pin_and_state", (q) => q.eq("pin", pin).eq("state", state)).first();
    if (game) return game;
  }
  return null;
}

function randomPin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

async function playersOf(ctx: Ctx, gameId: Id<"liveGames">, limit = PLAYER_READ_CAP): Promise<Player[]> {
  return await ctx.db.query("livePlayers").withIndex("by_gameId_and_kicked_and_score", (q) => q.eq("gameId", gameId).eq("kicked", false)).order("desc").take(limit);
}

async function playerByToken(ctx: Ctx, gameId: Id<"liveGames">, token: string): Promise<Player | null> {
  if (!TOKEN.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  return await ctx.db.query("livePlayers").withIndex("by_gameId_and_tokenHash", (q) => q.eq("gameId", gameId).eq("tokenHash", tokenHash)).unique();
}

async function answersFor(ctx: Ctx, gameId: Id<"liveGames">, questionIndex: number, players: Player[]) {
  const rows = await Promise.all(players.map((player) => ctx.db.query("liveAnswers")
    .withIndex("by_gameId_and_questionIndex_and_playerId", (q) => q.eq("gameId", gameId).eq("questionIndex", questionIndex).eq("playerId", player._id)).unique()));
  return rows.filter((row): row is Doc<"liveAnswers"> => row !== null);
}

function answerShard(player: Player) { return parseInt(player.tokenHash.slice(0, 2), 16) % ANSWER_SHARDS; }

async function changeAnswerCount(ctx: MutationCtx, gameId: Id<"liveGames">, questionIndex: number, shard: number, delta: number) {
  const row = await ctx.db.query("liveAnswerCounts").withIndex("by_gameId_and_questionIndex_and_shard", (q) => q.eq("gameId", gameId).eq("questionIndex", questionIndex).eq("shard", shard)).unique();
  if (row) await ctx.db.patch("liveAnswerCounts", row._id, { count: Math.max(0, row.count + delta) });
  else await ctx.db.insert("liveAnswerCounts", { gameId, questionIndex, shard, count: Math.max(0, delta) });
}

async function answerCount(ctx: Ctx, game: Game) {
  const rows = await ctx.db.query("liveAnswerCounts").withIndex("by_gameId_and_questionIndex_and_shard", (q) => q.eq("gameId", game._id).eq("questionIndex", game.questionIndex)).take(ANSWER_SHARDS);
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/** Lazily initialize rooms already running when this code was deployed. */
async function ensureAnswerCounts(ctx: MutationCtx, game: Game) {
  if (game.answerCounterQuestion === game.questionIndex) return;
  const players = await playersOf(ctx, game._id);
  const answers = await answersFor(ctx, game._id, game.questionIndex, players);
  const counts = Array<number>(ANSWER_SHARDS).fill(0);
  const answered = new Set(answers.map((a) => a.playerId));
  for (const player of players) if (answered.has(player._id)) counts[answerShard(player)]++;
  for (const [shard, count] of counts.entries()) if (count) await changeAnswerCount(ctx, game._id, game.questionIndex, shard, count);
  await ctx.db.patch("liveGames", game._id, { answerCounterQuestion: game.questionIndex, activePlayerCount: players.length });
  await ctx.scheduler.runAfter(ANSWER_CHECK_INTERVAL, internal.live.checkAllAnswered, { gameId: game._id, questionIndex: game.questionIndex, coalesced: true });
}

async function startQuestion(ctx: MutationCtx, game: Game, index: number) {
  const now = Date.now();
  const endsAt = now + game.settings.timeLimitSec * 1000;
  await ctx.db.patch("liveGames", game._id, { state: "question", questionIndex: index, answerCounterQuestion: index, questionStartedAt: now, questionEndsAt: endsAt, phaseEndsAt: undefined, startsAt: undefined, lastActivityAt: now });
  await ctx.scheduler.runAt(endsAt, internal.live.timeUp, { gameId: game._id, questionIndex: index });
  await ctx.scheduler.runAfter(ANSWER_CHECK_INTERVAL, internal.live.checkAllAnswered, { gameId: game._id, questionIndex: index, coalesced: true });
}

/** Closes the current question: applies points and streaks, then ranks everyone. */
async function revealQuestion(ctx: MutationCtx, game: Game) {
  if (game.state !== "question") return;
  const qi = game.questionIndex;
  const players = await playersOf(ctx, game._id);
  const answers = await answersFor(ctx, game._id, qi, players);
  const byPlayer = new Map(answers.map((a) => [a.playerId, a]));
  const updated = players.map((p) => {
    const answer = byPlayer.get(p._id);
    const correct = !!answer?.correct;
    const streak = correct ? p.streak + 1 : 0;
    const bonus = correct ? streakBonus(streak) : 0;
    const points = correct ? answer!.points + bonus : 0;
    return { p, streak, bonus, points, correct, score: p.score + points };
  });
  for (const r of rankScores(updated)) {
    await ctx.db.patch("livePlayers", r.p._id, {
      score: r.score, streak: r.streak, correctCount: r.p.correctCount + (r.correct ? 1 : 0), rank: r.rank,
      lastQuestionIndex: qi, lastCorrect: r.correct, lastPoints: r.points, lastBonus: r.bonus,
    });
  }
  const phaseEndsAt = await scheduleAutoStep(ctx, game, "reveal", qi);
  await ctx.db.patch("liveGames", game._id, { state: "reveal", phaseEndsAt, lastActivityAt: Date.now() });
}

/** With autoplay on, schedules the step that leaves an answer or leaderboard screen. */
async function scheduleAutoStep(ctx: MutationCtx, game: Game, from: "reveal" | "leaderboard", questionIndex: number) {
  if (!game.settings.autoAdvance) return undefined;
  const at = Date.now() + (game.settings.breakSec ?? DEFAULT_BREAK) * 1000;
  await ctx.scheduler.runAt(at, internal.live.autoStep, { gameId: game._id, from, questionIndex });
  return at;
}

/** Starts the 5-4-3-2-1 in the lobby; a running countdown is left alone. */
async function beginCountdown(ctx: MutationCtx, game: Game) {
  if (game.state !== "lobby" || game.startsAt) return;
  const startsAt = Date.now() + START_COUNTDOWN_MS;
  await ctx.db.patch("liveGames", game._id, { startsAt, lastActivityAt: Date.now() });
  await ctx.scheduler.runAt(startsAt, internal.live.countdownDone, { gameId: game._id, startsAt });
}

/** One step: lobby → question → reveal → leaderboard → next question … → ended. */
async function stepGame(ctx: MutationCtx, game: Game) {
  switch (game.state) {
    case "lobby": {
      const players = await playersOf(ctx, game._id);
      if (!players.length) throw new Error("LIVE_NO_PLAYERS: Wait for at least one player to join.");
      await ctx.db.patch("liveGames", game._id, { activePlayerCount: players.length });
      await startQuestion(ctx, game, 0);
      break;
    }
    case "question":
      await revealQuestion(ctx, game);
      break;
    case "reveal": {
      const phaseEndsAt = await scheduleAutoStep(ctx, game, "leaderboard", game.questionIndex);
      await ctx.db.patch("liveGames", game._id, { state: "leaderboard", phaseEndsAt, lastActivityAt: Date.now() });
      break;
    }
    case "leaderboard":
      if (game.questionIndex + 1 < game.questions.length) await startQuestion(ctx, game, game.questionIndex + 1);
      else await endGame(ctx, game, "finished");
      break;
  }
}

async function endGame(ctx: MutationCtx, game: Game, reason: "finished" | "host" | "idle") {
  if (game.state === "ended") return;
  const now = Date.now();
  await ctx.db.patch("liveGames", game._id, { state: "ended", phaseEndsAt: undefined, endedAt: now, endedReason: reason, lastActivityAt: now, resultsStatus: "saving", savedResponses: 0, unsavedResponses: 0 });
  await ctx.scheduler.runAfter(0, internal.live.saveResults, { gameId: game._id, cursor: null });
}

function publicQuestion(q: LiveQuestion) {
  return { text: q.text, kind: q.kind, options: q.options, image: q.image ?? null };
}

// ── Clock ──────────────────────────────────────────────────────────────────

/**
 * The server's clock, so phones and the host screen can correct for their own clock
 * skew. A mutation rather than a query: query results are cached and would not
 * re-read the time.
 */
export const serverNow = mutation({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});

// ── Host ───────────────────────────────────────────────────────────────────

export const createGame = mutation({
  args: {
    formId: v.optional(v.id("forms")),
    quizId: v.optional(v.id("quizzes")),
    language: v.optional(languageValidator),
    theme: v.optional(themeValidator),
    timeLimitSec: v.optional(v.number()),
    showAnswerLabels: v.optional(v.boolean()),
    autoAdvance: v.optional(v.boolean()),
    breakSec: v.optional(v.number()),
    startWhenPlayers: v.optional(v.number()),
    teamId: v.optional(v.id("businessTeams")),
  },
  returns: v.id("liveGames"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return createGameForAccount(ctx, identity.subject, args);
  },
});

export async function createGameForAccount(ctx: MutationCtx, userId: string, args: { formId?: Id<"forms">; quizId?: Id<"quizzes">; teamId?: Id<"businessTeams">; language?: "en" | "ar"; theme?: FormTheme; timeLimitSec?: number; showAnswerLabels?: boolean; autoAdvance?: boolean; breakSec?: number; startWhenPlayers?: number }) {
  if (!!args.formId === !!args.quizId) throw new Error("LIVE_INVALID: Choose one quiz to host.");
  const timeLimitSec = args.timeLimitSec ?? DEFAULT_TIME_LIMIT;
  validateTimeLimit(timeLimitSec);
  const breakSec = args.breakSec ?? DEFAULT_BREAK;
  validateBreak(breakSec);
  if (args.startWhenPlayers !== undefined) validateStartTarget(args.startWhenPlayers);
  const user = await requireActiveAccount(ctx, userId);
  const now = Date.now();
  await consumeRate(ctx, `live-create:${userId}`, 30, 3_600_000);

  let title = "";
  let questions: LiveQuestion[] = [];
  let skipped = 0;
  let language = args.language ?? "en";
  let formVersion: number | undefined;
  let theme = args.theme;
  // Team-only: chosen by the host, or carried over from a team-only quiz.
  let audienceTeamId = args.teamId;
  if (audienceTeamId && !await businessMember(ctx, audienceTeamId, userId)) throw new Error("TEAM_ACCESS_REQUIRED: You can only host for a team you belong to.");
  if (args.formId) {
    const form = await ctx.db.get("forms", args.formId);
    if (!form) throw new Error("FORM_NOT_FOUND: Form not found or you do not have access.");
    if (form.ownerId !== userId) {
      const identity = await getAuthIdentity(ctx);
      if (identity?.subject !== userId) throw new Error("FORM_NOT_FOUND: Form not found or you do not have access.");
      await requireFormRole(ctx, args.formId, "editor");
    }
    if (form.status === "archived" || form.publishedVersion === undefined || (await ownerBanned(ctx, form))) {
      throw new Error("LIVE_NOT_PUBLISHED: Publish this quiz before hosting it live.");
    }
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
    if (!version) throw new Error("LIVE_NOT_PUBLISHED: Publish this quiz before hosting it live.");
    const def = version.definition as FormDefinition;
    theme ??= def.theme;
    if (!def.quiz?.enabled) throw new Error("LIVE_NOT_QUIZ: Turn on Quiz mode and publish before hosting live.");
    language = args.language && def.languages.includes(args.language) ? args.language : def.defaultLanguage;
    ({ questions, skipped } = questionsFromForm(def, language));
    title = def.title || form.title;
    formVersion = version.version;
    if (form.settings.access === "signed_in" && form.settings.audienceTeamId) audienceTeamId ??= form.settings.audienceTeamId;
  } else {
    const quiz = await ctx.db.get("quizzes", args.quizId!);
    if (!quiz || quiz.creatorId !== userId) throw new Error("Quiz not found or unauthorized");
    if (quiz.archived || !quiz.isPublished || quiz.isBanned) throw new Error("LIVE_NOT_PUBLISHED: Publish this quiz before hosting it live.");
    let list: LegacyQuestionLike[] = quiz.publishedSnapshot?.questions ?? [];
    if (!quiz.publishedSnapshot) {
      const rows = await ctx.db.query("questions").withIndex("by_quiz", (q) => q.eq("quizId", quiz._id)).take(500);
      list = rows.filter((q) => q.deletedAt === undefined).sort((a, b) => a.order - b.order);
    }
    ({ questions, skipped } = questionsFromLegacy(list));
    title = quiz.publishedSnapshot?.title || quiz.title;
  }
  if (!questions.length) {
    throw new Error("LIVE_NO_QUESTIONS: Live games need choice questions with two to four options and a correct answer.");
  }

  let pin = "";
  for (let attempt = 0; attempt < 20 && !pin; attempt++) {
    const candidate = randomPin();
    if (!(await activeGameByPin(ctx, candidate))) pin = candidate;
  }
  if (!pin) throw new Error("LIVE_BUSY: Too many games are running. Try again in a moment.");

  return await ctx.db.insert("liveGames", {
    hostId: userId,
    formId: args.formId,
    formVersion,
    quizId: args.quizId,
    title: title.slice(0, 200),
    theme,
    appearance: args.theme ? "theme" : "apple",
    pin,
    state: "lobby",
    questionIndex: -1,
    questions: questions.slice(0, MAX_LIVE_QUESTIONS),
    skippedQuestions: skipped,
    settings: { timeLimitSec, maxPlayers: hasPro(user, now) ? PRO_PLAYER_LIMIT : FREE_PLAYER_LIMIT, language, showAnswerLabels: args.showAnswerLabels ?? true, autoAdvance: args.autoAdvance ?? true, breakSec, startWhenPlayers: args.startWhenPlayers || undefined },
    lastActivityAt: now,
    createdAt: now,
    activePlayerCount: 0,
    ...(audienceTeamId ? { audienceTeamId } : {}),
  });
}
/** 0 turns auto-start off. */
export function validateStartTarget(players: number) {
  if (!Number.isInteger(players) || players < 0 || players > PRO_PLAYER_LIMIT) {
    throw new Error(`LIVE_INVALID: Choose between 0 and ${PRO_PLAYER_LIMIT} players.`);
  }
}

function validateTimeLimit(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < MIN_TIME_LIMIT || seconds > MAX_TIME_LIMIT) {
    throw new Error(`LIVE_INVALID: Choose between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} seconds.`);
  }
}

/** Theme and phone layout are agreed before starting, so all players see the same choices. */
export const setGameSettings = mutation({
  args: { gameId: v.id("liveGames"), appearance: v.optional(v.union(v.literal("apple"),v.literal("theme"))), theme: v.optional(themeValidator), timeLimitSec: v.optional(v.number()), showAnswerLabels: v.optional(v.boolean()), startWhenPlayers: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return setGameSettingsForAccount(ctx, identity.subject, args);
  },
});

export async function setGameSettingsForAccount(ctx: MutationCtx, userId: string, args: { gameId: Id<"liveGames">; appearance?: "apple" | "theme"; theme?: FormTheme; timeLimitSec?: number; showAnswerLabels?: boolean; startWhenPlayers?: number }) {
  const game = await requireHostForAccount(ctx, userId, args.gameId);
  if (game.state !== "lobby") throw new Error("LIVE_STARTED: Change game settings before starting.");
  if (args.timeLimitSec !== undefined) validateTimeLimit(args.timeLimitSec);
  if (args.startWhenPlayers !== undefined) validateStartTarget(args.startWhenPlayers);
  const startWhenPlayers = args.startWhenPlayers === undefined ? game.settings.startWhenPlayers : args.startWhenPlayers || undefined;
  const settings = { ...game.settings, timeLimitSec: args.timeLimitSec ?? game.settings.timeLimitSec, showAnswerLabels: args.showAnswerLabels ?? game.settings.showAnswerLabels ?? true, startWhenPlayers };
  await ctx.db.patch("liveGames", game._id, { ...(args.theme ? { theme: args.theme } : {}), ...(args.appearance || args.theme ? { appearance: args.appearance ?? "theme" as const } : {}), settings, lastActivityAt: Date.now() });
  // A target that is already met starts the countdown straight away.
  if (startWhenPlayers && (await playersOf(ctx, game._id, startWhenPlayers)).length >= startWhenPlayers) await beginCountdown(ctx, { ...game, settings });
  return null;
}
export const setTimeLimit = mutation({
  args: { gameId: v.id("liveGames"), seconds: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireHost(ctx, args.gameId);
    if (game.state === "ended") throw new Error("LIVE_ENDED: This game has ended.");
    if (game.state === "question") throw new Error("LIVE_STARTED: Wait until the current question ends to change its timer.");
    validateTimeLimit(args.seconds);
    await ctx.db.patch("liveGames", game._id, { settings: { ...game.settings, timeLimitSec: args.seconds }, lastActivityAt: Date.now() });
    return null;
  },
});

/**
 * Moves the game one step: lobby → question → reveal → leaderboard → next question … → ended.
 * `from` and `questionIndex` make a double press harmless: a stale step does nothing.
 */
export const advance = mutation({
  args: {
    gameId: v.id("liveGames"),
    from: v.union(v.literal("lobby"), v.literal("question"), v.literal("reveal"), v.literal("leaderboard")),
    questionIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return advanceGameForAccount(ctx, identity.subject, args);
  },
});

export async function advanceGameForAccount(ctx: MutationCtx, userId: string, args: { gameId: Id<"liveGames">; from: "lobby" | "question" | "reveal" | "leaderboard"; questionIndex: number }) {
  const game = await requireHostForAccount(ctx, userId, args.gameId);
  if (game.state !== args.from || game.questionIndex !== args.questionIndex) return null;
  await stepGame(ctx, game);
  return null;
}

/**
 * Autoplay on/off and the break length. Allowed at any time before the end, so the host can
 * pause on an answer or leaderboard and resume later.
 */
/** Host: start the lobby countdown, or cancel it. */
export const setCountdown = mutation({
  args: { gameId: v.id("liveGames"), running: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireHost(ctx, args.gameId);
    if (game.state !== "lobby") return null;
    if (!args.running) {
      await ctx.db.patch("liveGames", game._id, { startsAt: undefined, lastActivityAt: Date.now() });
      return null;
    }
    if (!(await playersOf(ctx, game._id, 1)).length) throw new Error("LIVE_NO_PLAYERS: Wait for at least one player to join.");
    await beginCountdown(ctx, game);
    return null;
  },
});

export const setAutoplay = mutation({
  args: { gameId: v.id("liveGames"), autoAdvance: v.optional(v.boolean()), breakSec: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return setAutoplayForAccount(ctx, identity.subject, args);
  },
});

export function validateBreak(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < MIN_BREAK || seconds > MAX_BREAK) {
    throw new Error(`LIVE_INVALID: Choose a break between ${MIN_BREAK} and ${MAX_BREAK} seconds.`);
  }
}

export async function setAutoplayForAccount(ctx: MutationCtx, userId: string, args: { gameId: Id<"liveGames">; autoAdvance?: boolean; breakSec?: number }) {
  const game = await requireHostForAccount(ctx, userId, args.gameId);
  if (game.state === "ended") throw new Error("LIVE_ENDED: This game has ended.");
  if (args.breakSec !== undefined) validateBreak(args.breakSec);
  const settings = { ...game.settings, autoAdvance: args.autoAdvance ?? !!game.settings.autoAdvance, breakSec: args.breakSec ?? game.settings.breakSec ?? DEFAULT_BREAK };
  const next = { ...game, settings };
  // Resuming (or a new break length) restarts the countdown on the screen being shown.
  const phaseEndsAt = game.state === "reveal" || game.state === "leaderboard" ? await scheduleAutoStep(ctx, next, game.state, game.questionIndex) : undefined;
  await ctx.db.patch("liveGames", game._id, { settings, phaseEndsAt, lastActivityAt: Date.now() });
  return null;
}
export const endGameNow = mutation({
  args: { gameId: v.id("liveGames") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return endGameForAccount(ctx, identity.subject, args.gameId);
  },
});

export async function endGameForAccount(ctx: MutationCtx, userId: string, gameId: Id<"liveGames">) {
  const game = await requireHostForAccount(ctx, userId, gameId);
  await endGame(ctx, game, "host");
  return null;
}

export const kickPlayer = mutation({
  args: { gameId: v.id("liveGames"), playerId: v.id("livePlayers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireHost(ctx, args.gameId);
    const player = await ctx.db.get("livePlayers", args.playerId);
    if (!player || player.gameId !== game._id) throw new Error("LIVE_NOT_FOUND: That player is not in this game.");
    if (player.kicked) return null;
    if (game.state === "question") await ensureAnswerCounts(ctx, game);
    const active = (await playersOf(ctx, game._id)).length;
    if (game.state === "question") {
      const answer = await ctx.db.query("liveAnswers").withIndex("by_gameId_and_questionIndex_and_playerId", (q) => q.eq("gameId", game._id).eq("questionIndex", game.questionIndex).eq("playerId", player._id)).unique();
      if (answer) await changeAnswerCount(ctx, game._id, game.questionIndex, answerShard(player), -1);
    }
    await ctx.db.patch("livePlayers", player._id, { kicked: true });
    await ctx.db.patch("liveGames", game._id, { activePlayerCount: Math.max(0, active - 1) });
    return null;
  },
});

/** Everything the host screen shows. Answer keys only after each reveal. */
export const hostView = query({
  args: { gameId: v.id("liveGames") },
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!identity || !game || game.hostId !== identity.subject) return null;
    // During answering, only the small standing preview and shard counts change.
    // Old rooms without counters fall back to the full active roster until initialized.
    const countedQuestion = game.state === "question" && game.answerCounterQuestion === game.questionIndex && game.activePlayerCount !== undefined;
    const players = await playersOf(ctx, game._id, countedQuestion ? 10 : PLAYER_READ_CAP);
    const question = game.questions[game.questionIndex] as LiveQuestion | undefined;
    const revealed = game.state === "reveal" || game.state === "leaderboard" || game.state === "ended";
    let answeredCount = 0;
    let distribution: Record<string, number> | null = null;
    if (question && game.state !== "lobby") {
      answeredCount = game.answerCounterQuestion === game.questionIndex ? await answerCount(ctx, game) : (await answersFor(ctx, game._id, game.questionIndex, players)).length;
      if (revealed) {
        const counted = await answersFor(ctx, game._id, game.questionIndex, players);
        distribution = Object.fromEntries(question.options.map((o) => [o.id, 0]));
        for (const a of counted) for (const id of a.answer) distribution[id] = (distribution[id] ?? 0) + 1;
      }
    }
    const ranked = players.map((p) => ({ _id: p._id, nickname: p.nickname, score: p.score, rank: p.rank ?? 1, streak: p.streak }));
    return {
      _id: game._id,
      title: game.title,
      pin: game.pin,
      state: game.state,
      questionIndex: game.questionIndex,
      questionCount: game.questions.length,
      showAnswerLabels: game.settings.showAnswerLabels ?? true,
      questionStartedAt: game.questionStartedAt ?? null,
      questionEndsAt: game.questionEndsAt ?? null,
      phaseEndsAt: game.phaseEndsAt ?? null,
      startsAt: game.startsAt ?? null,
      settings: game.settings,
      appearance: game.appearance ?? "theme",
      theme: game.theme ?? null,
      skippedQuestions: game.skippedQuestions,
      formId: game.formId ?? null,
      quizId: game.quizId ?? null,
      resultsStatus: game.resultsStatus ?? null,
      savedResponses: game.savedResponses ?? 0,
      unsavedResponses: game.unsavedResponses ?? 0,
      endedReason: game.endedReason ?? null,
      playerCount: countedQuestion ? game.activePlayerCount! : players.length,
      // Lobby shows everyone; later screens need the top of the table only.
      players: game.state === "lobby" ? ranked.slice(0, game.settings.maxPlayers) : ranked.slice(0, 10),
      answeredCount,
      question: question ? { ...publicQuestion(question), correct: revealed ? question.correct : null } : null,
      distribution,
    };
  },
});

/** The host's recent games, newest first, for the Games history list. */
export const myGames = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("liveGames"), title: v.string(), state: liveStateValidator, createdAt: v.number(), endedAt: v.union(v.number(), v.null()),
    formId: v.union(v.id("forms"), v.null()), quizId: v.union(v.id("quizzes"), v.null()), questionCount: v.number(),
    players: v.union(v.number(), v.null()), savedResponses: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const games = await ctx.db.query("liveGames").withIndex("by_hostId_and_createdAt", (q) => q.eq("hostId", identity.subject)).order("desc").take(30);
    const visible = await Promise.all(games.map(async g => g.formId && (await ctx.db.get("forms", g.formId))?.status === "archived" ? null : g));
    return visible.filter(g => g !== null).map((g) => ({
      _id: g._id, title: g.title, state: g.state, createdAt: g.createdAt, endedAt: g.endedAt ?? null,
      formId: g.formId ?? null, quizId: g.quizId ?? null, questionCount: g.questions.length,
      players: g.activePlayerCount ?? null, savedResponses: g.savedResponses ?? 0,
    }));
  },
});

// ── Players ────────────────────────────────────────────────────────────────

export const joinGame = mutation({
  args: { pin: v.string(), nickname: v.string(), token: v.string() },
  returns: v.union(
    v.object({ status: v.literal("joined"), gameId: v.id("liveGames"), nickname: v.string() }),
    v.object({ status: v.literal("not_found") }),
  ),
  handler: async (ctx, args) => {
    if (!TOKEN.test(args.token)) throw new Error("LIVE_INVALID: Reload the page and try again.");
    const pin = args.pin.replace(/\s+/g, "");
    if (!isValidPin(pin)) return { status: "not_found" as const };
    const game = await activeGameByPin(ctx, pin);
    if (!game) {
      // Returned, not thrown, so the counter write that slows PIN guessing is kept.
      await consumeRate(ctx, `live-miss:${pin.slice(0, 2)}`, 60, 60_000);
      return { status: "not_found" as const };
    }
    if (game.audienceTeamId) {
      const identity = await getAuthIdentity(ctx);
      if (!identity || !await businessMember(ctx, game.audienceTeamId, identity.subject)) throw new Error("LIVE_TEAM_ONLY: Only members of this team can join. Sign in with your team account.");
    }
    const tokenHash = await sha256Hex(args.token);
    const existing = await ctx.db.query("livePlayers").withIndex("by_gameId_and_tokenHash", (q) => q.eq("gameId", game._id).eq("tokenHash", tokenHash)).unique();
    if (existing) {
      if (existing.kicked) throw new Error("LIVE_KICKED: The host removed you from this game.");
      return { status: "joined" as const, gameId: game._id, nickname: existing.nickname };
    }
    await consumeRate(ctx, `live-join:${game._id}`, 300, 60_000);
    await consumeRate(ctx, `live-join:${game._id}:${tokenHash.slice(0, 16)}`, 10, 60_000);
    const nickname = cleanNickname(args.nickname);
    const problem = nicknameProblem(nickname);
    if (problem === "empty") throw new Error("NICKNAME_EMPTY: Enter a nickname.");
    if (problem === "too_long") throw new Error("NICKNAME_TOO_LONG: Use at most 20 characters.");
    if (problem === "characters") throw new Error("NICKNAME_CHARACTERS: Use letters, numbers, spaces and . _ - ' only.");
    if (problem === "blocked") throw new Error("NICKNAME_BLOCKED: Choose a different nickname.");
    const key = nicknameKey(nickname);
    const taken = await ctx.db.query("livePlayers").withIndex("by_gameId_and_nicknameKey", (q) => q.eq("gameId", game._id).eq("nicknameKey", key)).first();
    if (taken) throw new Error("NICKNAME_TAKEN: Someone already has that nickname. Choose another.");
    const active = (await playersOf(ctx, game._id)).length;
    if (active >= game.settings.maxPlayers) throw new Error(`LIVE_FULL: This game is full (${game.settings.maxPlayers} players).`);
    await ctx.db.insert("livePlayers", {
      gameId: game._id, nickname, nicknameKey: key, tokenHash, score: 0, streak: 0, correctCount: 0, kicked: false, joinedAt: Date.now(),
    });
    await recordStudent(ctx, { authorId: game.hostId, guestKey: `live:${game._id}:${tokenHash}`, guestName: nickname, context: game.title });
    await ctx.db.patch("liveGames", game._id, { activePlayerCount: active + 1 });
    const target = game.settings.startWhenPlayers;
    if (game.state === "lobby" && target && active + 1 >= target) await beginCountdown(ctx, game);
    return { status: "joined" as const, gameId: game._id, nickname };
  },
});

/** What one phone may know right now. Built per state; answer keys only after the reveal. */
export const playerView = query({
  args: { gameId: v.id("liveGames"), token: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game) return { state: "missing" as const };
    const player = await playerByToken(ctx, game._id, args.token);
    if (!player) return { state: game.state === "ended" ? ("missing" as const) : ("unknown" as const) };
    if (player.kicked) return { state: "kicked" as const };
    const base = {
      title: game.title,
      appearance: game.appearance ?? "apple",
      theme: game.theme ?? null,
      showAnswerLabels: game.settings.showAnswerLabels ?? true,
      nickname: player.nickname,
      questionIndex: game.questionIndex,
      questionCount: game.questions.length,
    };
    const question = game.questions[game.questionIndex] as LiveQuestion | undefined;
    const mine = question
      ? await ctx.db
        .query("liveAnswers")
        .withIndex("by_gameId_and_questionIndex_and_playerId", (q) => q.eq("gameId", game._id).eq("questionIndex", game.questionIndex).eq("playerId", player._id))
        .unique()
      : null;
    // Score and rank are written only at reveals, so they never leak the current answer.
    const standing = { score: player.score, rank: player.rank ?? null, streak: player.streak };
    switch (game.state) {
      case "lobby":
        return { state: "lobby" as const, ...base, startsAt: game.startsAt ?? null };
      case "question":
        return {
          state: "question" as const, ...base,
          question: publicQuestion(question!),
          startedAt: game.questionStartedAt!, endsAt: game.questionEndsAt!,
          answered: !!mine, myAnswer: mine?.answer ?? null,
        };
      case "reveal":
      case "leaderboard": {
        const fresh = player.lastQuestionIndex === game.questionIndex;
        return {
          state: game.state, ...base, ...standing,
          question: { ...publicQuestion(question!), correct: question!.correct },
          myAnswer: mine?.answer ?? null,
          correct: fresh ? !!player.lastCorrect : false,
          points: fresh ? player.lastPoints ?? 0 : 0,
          bonus: fresh ? player.lastBonus ?? 0 : 0,
        };
      }
      case "ended": {
        const top = (await playersOf(ctx, game._id)).slice(0, 3).map((p) => ({ nickname: p.nickname, score: p.score, rank: p.rank ?? 1 }));
        return { state: "ended" as const, ...base, ...standing, podium: top, correctCount: player.correctCount };
      }
    }
  },
});

export const submitAnswer = mutation({
  args: { gameId: v.id("liveGames"), token: v.string(), questionIndex: v.number(), optionIds: v.array(v.string()) },
  returns: v.object({ status: v.union(v.literal("received"), v.literal("already")) }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game) throw new Error("LIVE_NOT_FOUND: This game has ended.");
    if (game.state !== "question" || game.questionIndex !== args.questionIndex) throw new Error("LIVE_CLOSED: This question is closed.");
    if (game.questionEndsAt === undefined || game.questionStartedAt === undefined || now > game.questionEndsAt) throw new Error("LIVE_TOO_LATE: Time was up before your answer arrived.");
    const player = await playerByToken(ctx, game._id, args.token);
    if (!player) throw new Error("LIVE_NOT_JOINED: Join the game first.");
    if (player.kicked) throw new Error("LIVE_KICKED: The host removed you from this game.");
    const existing = await ctx.db
      .query("liveAnswers")
      .withIndex("by_gameId_and_questionIndex_and_playerId", (q) => q.eq("gameId", game._id).eq("questionIndex", game.questionIndex).eq("playerId", player._id))
      .unique();
    if (existing) return { status: "already" as const };
    await consumeRate(ctx, `live-answer:${player._id}`, 30, 60_000);
    const question = game.questions[game.questionIndex] as LiveQuestion;
    const choice = cleanChoice(question, args.optionIds.slice(0, 10));
    if (!choice) throw new Error("LIVE_BAD_ANSWER: Choose one of the answers.");
    const correct = isCorrectAnswer(question, choice);
    const timeTakenMs = now - game.questionStartedAt;
    await ensureAnswerCounts(ctx, game);
    await ctx.db.insert("liveAnswers", {
      gameId: game._id, playerId: player._id, questionIndex: game.questionIndex, answer: choice, correct,
      points: answerPoints(correct, timeTakenMs, game.questionEndsAt - game.questionStartedAt),
      timeTakenMs, answeredAt: now,
    });
    // Sixteen independent counters avoid one shared write for every simultaneous answer.
    await changeAnswerCount(ctx, game._id, game.questionIndex, answerShard(player), 1);
    // Deliberately says nothing about correctness.
    return { status: "received" as const };
  },
});

// ── Scheduled steps ────────────────────────────────────────────────────────

export const timeUp = internalMutation({
  args: { gameId: v.id("liveGames"), questionIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (game && game.state === "question" && game.questionIndex === args.questionIndex) await revealQuestion(ctx, game);
    return null;
  },
});

/** Autoplay step; stale jobs (paused, resumed, or already moved on by the host) do nothing. */
/** Ends the lobby countdown; a cancelled or restarted countdown leaves a stale job that does nothing. */
export const countdownDone = internalMutation({
  args: { gameId: v.id("liveGames"), startsAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game || game.state !== "lobby" || game.startsAt !== args.startsAt) return null;
    if (!(await playersOf(ctx, game._id, 1)).length) {
      await ctx.db.patch("liveGames", game._id, { startsAt: undefined });
      return null;
    }
    await stepGame(ctx, game);
    return null;
  },
});

export const autoStep = internalMutation({
  args: { gameId: v.id("liveGames"), from: v.union(v.literal("reveal"), v.literal("leaderboard")), questionIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game || game.state !== args.from || game.questionIndex !== args.questionIndex) return null;
    if (!game.settings.autoAdvance || !game.phaseEndsAt || game.phaseEndsAt > Date.now()) return null;
    await stepGame(ctx, game);
    return null;
  },
});

export const checkAllAnswered = internalMutation({
  args: { gameId: v.id("liveGames"), questionIndex: v.number(), coalesced: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game || game.state !== "question" || game.questionIndex !== args.questionIndex) return null;
    const activeCount = game.activePlayerCount ?? (await playersOf(ctx, game._id)).length;
    const answered = game.answerCounterQuestion === game.questionIndex ? await answerCount(ctx, game) : (await answersFor(ctx, game._id, args.questionIndex, await playersOf(ctx, game._id))).length;
    if (activeCount > 0 && answered >= activeCount) await revealQuestion(ctx, game);
    // Jobs queued by the older per-answer implementation may still run after a deploy.
    // They check once; only the new single chain schedules its successor.
    else if (args.coalesced && game.questionEndsAt && Date.now() + ANSWER_CHECK_INTERVAL < game.questionEndsAt) {
      await ctx.scheduler.runAfter(ANSWER_CHECK_INTERVAL, internal.live.checkAllAnswered, args);
    }
    return null;
  },
});

/** Ends games nobody has advanced for three hours, which also frees their PINs. */
export const expireIdle = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_EXPIRY_MS;
    for (const state of ACTIVE_STATES) {
      const stale = await ctx.db.query("liveGames").withIndex("by_state_and_lastActivityAt", (q) => q.eq("state", state).lt("lastActivityAt", cutoff)).take(50);
      for (const game of stale) await endGame(ctx, game, "idle");
    }
    return null;
  },
});

const SAVE_BATCH = 25;

/** Writes each player's answers as a normal form response (or old quiz attempt), a batch at a time. */
export const saveResults = internalMutation({
  args: { gameId: v.id("liveGames"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("liveGames", args.gameId);
    if (!game || game.state !== "ended") return null;
    const page = await ctx.db
      .query("livePlayers")
      .withIndex("by_gameId_and_score", (q) => q.eq("gameId", game._id))
      .order("desc")
      .paginate({ numItems: SAVE_BATCH, cursor: args.cursor });
    let saved = 0;
    let unsaved = 0;
    for (const player of page.page) {
      if (player.kicked) continue;
      const answers = await ctx.db.query("liveAnswers").withIndex("by_playerId_and_questionIndex", (q) => q.eq("playerId", player._id)).take(MAX_LIVE_QUESTIONS + 1);
      if (!answers.length) continue;
      const ok = game.formId ? await saveFormResponse(ctx, game, player, answers) : await saveQuizAttempt(ctx, game, player, answers);
      if (ok) saved++;
      else unsaved++;
    }
    const fresh = (await ctx.db.get("liveGames", game._id))!;
    const done = page.isDone;
    await ctx.db.patch("liveGames", game._id, {
      savedResponses: (fresh.savedResponses ?? 0) + saved,
      unsavedResponses: (fresh.unsavedResponses ?? 0) + unsaved,
      ...(done ? { resultsStatus: "saved" as const } : {}),
    });
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.live.saveResults, { gameId: game._id, cursor: page.continueCursor });
    } else {
      const total = (fresh.savedResponses ?? 0) + saved;
      const ownerId = game.formId ? (await ctx.db.get("forms", game.formId))?.ownerId : game.hostId;
      if (ownerId && total > 0) {
        await notify(ctx, ownerId, "response", `Live game “${game.title}” ended. ${total} player response${total === 1 ? "" : "s"} saved to Results.`, `live:${game._id}`, game.formId);
      }
    }
    return null;
  },
});

async function saveFormResponse(ctx: MutationCtx, game: Game, player: Player, answers: Doc<"liveAnswers">[]): Promise<boolean> {
  const form = await ctx.db.get("forms", game.formId!);
  if (!form || game.formVersion === undefined) return false;
  const submissionKey = `live-${player._id}`;
  const duplicate = await ctx.db.query("formResponses").withIndex("by_formId_and_submissionKey", (q) => q.eq("formId", form._id).eq("submissionKey", submissionKey)).unique();
  if (duplicate) return true;
  const cap = await responseCap(ctx, form, Date.now());
  if (cap !== null && form.responseCount >= cap) return false;
  const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", game.formVersion!)).unique();
  if (!version) return false;
  const def = version.definition as FormDefinition;
  const values: Answers = {};
  for (const a of answers) {
    const question = game.questions[a.questionIndex] as LiveQuestion | undefined;
    if (!question) continue;
    values[question.key] = question.kind === "multi" ? a.answer : a.answer[0];
  }
  const grade = gradeQuiz(def, values);
  const now = Date.now();
  const responseId = await ctx.db.insert("formResponses", {
    formId: form._id,
    version: version.version,
    status: "completed",
    answers: values,
    language: game.settings.language,
    submissionKey,
    receiptCode: randomCode(8).toUpperCase(),
    startedAt: player.joinedAt,
    submittedAt: now,
    updatedAt: now,
    endingId: selectEnding(def, values)?.id,
    reviewed: false,
    quizScore: grade?.score,
    quizMaxScore: grade?.maxScore,
    tags: ["live"],
    spam: false,
    searchText: `${player.nickname} \n ${searchTextFor(def, values)}`.slice(0, 16000),
    source: "live",
    live: { gameId: game._id, nickname: player.nickname, rank: player.rank ?? 1, points: player.score },
  });
  const response = (await ctx.db.get("formResponses", responseId))!;
  await countResponse(ctx, form, response, def, 1);
  await emitWebhookEvent(ctx, form.ownerId, "response.completed", `form_${form._id}`, () => formResponseData(form, response, def));
  return true;
}

async function saveQuizAttempt(ctx: MutationCtx, game: Game, player: Player, answers: Doc<"liveAnswers">[]): Promise<boolean> {
  const quiz = await ctx.db.get("quizzes", game.quizId!);
  if (!quiz) return false;
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", quiz.creatorId)).first();
  const unlimited = owner?.plan !== undefined ? hasPro(owner, Date.now()) : quiz.isElevated || hasPro(owner, Date.now());
  if (!unlimited) {
    // Same 100-attempt cap as startQuizSession.
    const completed = await ctx.db.query("quizSessions").withIndex("by_quizId_and_status_and_score", (q) => q.eq("quizId", quiz._id).eq("status", "completed")).take(FREE_PLAYER_LIMIT);
    if (completed.length >= FREE_PLAYER_LIMIT) return false;
  }
  const byIndex = new Map(answers.map((a) => [a.questionIndex, a]));
  const rows: Doc<"quizSessions">["answers"] = [];
  let score = 0;
  let total = 0;
  const keys = new Set<string>();
  game.questions.forEach((question, index) => {
    total += question.points ?? 0;
    keys.add(question.key);
    const a = byIndex.get(index);
    if (!a) return;
    const questionId = ctx.db.normalizeId("questions", question.key);
    if (!questionId) return;
    const earned = a.correct ? question.points ?? 0 : 0;
    score += earned;
    rows.push({ questionId, answer: legacyAnswerText(question, a.answer), isCorrect: a.correct, pointsEarned: earned, timeTaken: Math.round(a.timeTakenMs / 1000) });
  });
  const snapshot = quiz.publishedSnapshot?.questions.filter((q) => keys.has(q._id));
  const sessionId = await ctx.db.insert("quizSessions", {
    quizId: quiz._id,
    playerName: player.nickname,
    status: "completed",
    score,
    totalPoints: total,
    answers: rows,
    ...(snapshot?.length ? { questionSnapshot: snapshot } : {}),
    startedAt: player.joinedAt,
    completedAt: Date.now(),
    source: "live",
    liveGameId: game._id,
  });
  await emitQuizAttemptEvent(ctx, sessionId, "response.completed");
  return true;
}
