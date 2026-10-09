// MCP-only wrappers. userId comes from the secret-protected transport after
// Clerk OAuth verification, never from an MCP tool's input schema. Live helpers
// are plain shared functions; no registered-function handlers or fake auth ctx.
import { v } from "convex/values";
import { env, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hasPro } from "./authz";
import { applyThemePatch, parseGameDraftInput, parseThemePatch, themeView } from "./mcpContract";
import { emptyDefinition } from "./formLogic";
import type { FormDefinition, FormTheme } from "./formLogic";
import { languageValidator } from "./formModel";
import { liveStateValidator } from "./liveModel";
import { createGameForAccount, setAutoplayForAccount, setGameSettingsForAccount, advanceGameForAccount, endGameForAccount } from "./live";
import { DEFAULT_BREAK } from "./liveLogic";

type Ctx = QueryCtx | MutationCtx;
const step = v.union(v.literal("lobby"), v.literal("question"), v.literal("reveal"), v.literal("leaderboard"));
const nullableString = v.union(v.string(), v.null());
const gameOutput = v.object({
  id: v.string(), kind: v.literal("live_game"), title: v.string(), state: liveStateValidator,
  sourceId: nullableString, pin: v.string(), hostUrl: v.string(), joinUrl: nullableString,
  questionIndex: v.number(), questionCount: v.number(), skippedQuestions: v.number(),
  questionEndsAt: v.union(v.number(), v.null()),
  settings: v.object({ timeLimitSec: v.number(), showAnswerLabels: v.boolean(), maxPlayers: v.number(), language: languageValidator, autoAdvance: v.boolean(), breakSec: v.number(), startWhenPlayers: v.number() }),
  nextStepAt: v.union(v.number(), v.null()), startsAt: v.union(v.number(), v.null()),
  theme: v.union(v.any(), v.null()), createdAt: v.string(), endedAt: nullableString,
  resultsStatus: nullableString, savedResponses: v.number(), unsavedResponses: v.number(),
});

function fail(code: string, message: string): never { throw new Error(`${code}: ${message}`); }

async function requireAccount(ctx: Ctx, userId: string, writable = false) {
  const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", userId)).first();
  if (!user) fail("ACCOUNT_REQUIRED", "Sign in to Chaos first.");
  if (!hasPro(user, Date.now())) fail("PRO_REQUIRED", "Games in MCP require Chaos Pro.");
  if (writable && (user.isBanned || user.suspendedUntil)) fail("ACCOUNT_RESTRICTED", "This Chaos account is read-only.");
}

function gameId(ctx: Ctx, ref: string): Id<"liveGames"> {
  const match = /^(?:game_)?([A-Za-z0-9]+)$/.exec(ref.trim());
  const id = match && ctx.db.normalizeId("liveGames", match[1]);
  if (!id) fail("NOT_FOUND", "No game with that id in this Chaos account. Use list_games.");
  return id;
}

async function ownedGame(ctx: Ctx, userId: string, ref: string) {
  const game = await ctx.db.get("liveGames", gameId(ctx, ref));
  if (!game || game.hostId !== userId) fail("NOT_FOUND", "No game with that id in this Chaos account. Use list_games.");
  return game;
}

/** Explicit allow-list: no questions, answers, nicknames, player tokens or hashes. */
function view(game: Doc<"liveGames">) {
  const base = (env.CHAOS_APP_URL ?? "https://chaos.fail").replace(/\/+$/, "");
  return {
    id: `game_${game._id}`, kind: "live_game" as const, title: game.title, state: game.state,
    sourceId: game.formId ? `form_${game.formId}` : null,
    pin: game.pin, hostUrl: `${base}/dashboard/live/${game._id}`,
    joinUrl: game.state === "ended" ? null : `${base}/play?pin=${game.pin}`,
    questionIndex: game.questionIndex, questionCount: game.questionCount ?? game.questions.length, skippedQuestions: game.skippedQuestions,
    questionEndsAt: game.questionEndsAt ?? null,
    settings: {
      timeLimitSec: game.settings.timeLimitSec, showAnswerLabels: game.settings.showAnswerLabels ?? true, maxPlayers: game.settings.maxPlayers, language: game.settings.language,
      autoAdvance: !!game.settings.autoAdvance, breakSec: game.settings.breakSec ?? DEFAULT_BREAK, startWhenPlayers: game.settings.startWhenPlayers ?? 0,
    },
    nextStepAt: game.phaseEndsAt ?? null, startsAt: game.startsAt ?? null,
    theme: game.theme ? themeView(game.theme as FormTheme) : null,
    createdAt: new Date(game.createdAt).toISOString(), endedAt: game.endedAt === undefined ? null : new Date(game.endedAt).toISOString(),
    resultsStatus: game.resultsStatus ?? null, savedResponses: game.savedResponses ?? 0, unsavedResponses: game.unsavedResponses ?? 0,
  };
}

function themePatch(raw: unknown) {
  const parsed = parseThemePatch(raw);
  if ("errors" in parsed) fail("VALIDATION_FAILED", parsed.errors.join(" "));
  return parsed.theme;
}

function timer(seconds?: number) {
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 5 || seconds > 240)) fail("VALIDATION_FAILED", "timeLimitSec must be an integer from 5 to 240.");
}

/** Source ownership is stricter than web editor access: MCP hosts only the account's own quizzes. */
async function source(ctx: Ctx, userId: string, ref: string) {
  const match = /^form_([A-Za-z0-9]+)$/.exec(ref.trim());
  if (!match) fail("NOT_FOUND", "Use a form_ id from search_forms.");
  const id = ctx.db.normalizeId("forms", match[1]);
  const form = id ? await ctx.db.get("forms", id) : null;
  if (!form || form.ownerId !== userId) fail("NOT_FOUND", "No owned quiz with that id in this account.");
  if (form.status !== "live" || form.isBanned || form.publishedVersion === undefined) fail("LIVE_NOT_PUBLISHED", "Publish and reopen this quiz in Chaos before hosting.");
  const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
  if (!version) fail("LIVE_NOT_PUBLISHED", "Publish this quiz before hosting.");
  return { formId: form._id, theme: (version.definition as FormDefinition).theme };
}

type CreateDraft = (ctx: MutationCtx, userId: string, raw: unknown) => Promise<{
  id: string; kind: "form"; title: string; status: string; editUrl: string; shareUrl: string | null; resultsUrl: string;
  readyToPublish: boolean; problems: string[];
}>;

export function registerMcpGames(createDraft: CreateDraft) {
  return {
    createGameDraft: internalMutation({
      args: { userId: v.string(), input: v.any() }, returns: v.any(),
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId, true);
        const parsed = parseGameDraftInput(args.input);
        if ("errors" in parsed) fail("VALIDATION_FAILED", parsed.errors.join(" "));
        const result = await createDraft(ctx, args.userId, parsed.input);
        return { ...result, note: "Private quiz draft. Review and explicitly publish with publish_form before host_game; hosting never publishes it." };
      },
    }),
    listGames: internalQuery({
      args: { userId: v.string(), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
      returns: v.object({ games: v.array(gameOutput), nextCursor: nullableString }),
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId);
        if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50)) fail("VALIDATION_FAILED", "limit must be from 1 to 50.");
        const page = await ctx.db.query("liveGames").withIndex("by_hostId_and_createdAt", (q) => q.eq("hostId", args.userId))
          .order("desc").paginate({ numItems: args.limit ?? 20, cursor: args.cursor || null, maximumRowsRead: 50, maximumBytesRead: 4 * 1024 * 1024 });
        return { games: page.page.map(view), nextCursor: page.isDone ? null : page.continueCursor };
      },
    }),
    getGame: internalQuery({
      args: { userId: v.string(), id: v.string() }, returns: gameOutput,
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId);
        return view(await ownedGame(ctx, args.userId, args.id));
      },
    }),
    hostGame: internalMutation({
      args: { userId: v.string(), id: v.string(), teamId: v.optional(v.id("businessTeams")), language: v.optional(languageValidator), theme: v.optional(v.any()), timeLimitSec: v.optional(v.number()), showAnswerLabels: v.optional(v.boolean()), autoAdvance: v.optional(v.boolean()), breakSec: v.optional(v.number()), startWhenPlayers: v.optional(v.number()) },
      returns: gameOutput,
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId, true);
        timer(args.timeLimitSec);
        const target = await source(ctx, args.userId, args.id);
        const id = await createGameForAccount(ctx, args.userId, {
          formId: target.formId,
          language: args.language, timeLimitSec: args.timeLimitSec, showAnswerLabels: args.showAnswerLabels,
          autoAdvance: args.autoAdvance, breakSec: args.breakSec, startWhenPlayers: args.startWhenPlayers, teamId: args.teamId,
          ...(args.theme === undefined ? {} : { theme: applyThemePatch(target.theme, themePatch(args.theme)) }),
        });
        return view((await ctx.db.get("liveGames", id))!);
      },
    }),
    setGameSettings: internalMutation({
      args: { userId: v.string(), id: v.string(), theme: v.optional(v.any()), timeLimitSec: v.optional(v.number()), showAnswerLabels: v.optional(v.boolean()), autoAdvance: v.optional(v.boolean()), breakSec: v.optional(v.number()), startWhenPlayers: v.optional(v.number()) },
      returns: gameOutput,
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId, true);
        const game = await ownedGame(ctx, args.userId, args.id);
        timer(args.timeLimitSec);
        const lobbyOnly = args.theme !== undefined || args.timeLimitSec !== undefined || args.showAnswerLabels !== undefined || args.startWhenPlayers !== undefined;
        const autoplay = args.autoAdvance !== undefined || args.breakSec !== undefined;
        if (!lobbyOnly && !autoplay) fail("VALIDATION_FAILED", "Choose at least one setting.");
        // Autoplay can change mid-game (pause/resume); the rest only in the lobby.
        if (autoplay) await setAutoplayForAccount(ctx, args.userId, { gameId: game._id, autoAdvance: args.autoAdvance, breakSec: args.breakSec });
        if (lobbyOnly) await setGameSettingsForAccount(ctx, args.userId, {
          gameId: game._id, timeLimitSec: args.timeLimitSec, showAnswerLabels: args.showAnswerLabels, startWhenPlayers: args.startWhenPlayers,
          ...(args.theme === undefined ? {} : { theme: applyThemePatch((game.theme ?? emptyDefinition().theme) as FormTheme, themePatch(args.theme)) }),
        });
        return view((await ctx.db.get("liveGames", game._id))!);
      },
    }),
    advanceGame: internalMutation({
      args: { userId: v.string(), id: v.string(), from: step, questionIndex: v.number() }, returns: gameOutput,
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId, true);
        const game = await ownedGame(ctx, args.userId, args.id);
        if (!Number.isInteger(args.questionIndex) || args.questionIndex < -1) fail("VALIDATION_FAILED", "Use questionIndex from get_game.");
        await advanceGameForAccount(ctx, args.userId, { gameId: game._id, from: args.from, questionIndex: args.questionIndex });
        return view((await ctx.db.get("liveGames", game._id))!);
      },
    }),
    endGame: internalMutation({
      args: { userId: v.string(), id: v.string() }, returns: gameOutput,
      handler: async (ctx, args) => {
        await requireAccount(ctx, args.userId, true);
        const game = await ownedGame(ctx, args.userId, args.id);
        await endGameForAccount(ctx, args.userId, game._id);
        return view((await ctx.db.get("liveGames", game._id))!);
      },
    }),
  };
}
