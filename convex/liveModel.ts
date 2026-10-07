import { defineTable } from "convex/server";
import { v } from "convex/values";
import { savedQuestion } from "./quizModel";
import { languageValidator, themeValidator } from "./formModel";

export const liveStateValidator = v.union(
  v.literal("lobby"), v.literal("question"), v.literal("reveal"), v.literal("leaderboard"), v.literal("ended"),
);

export const liveQuestionValidator = v.object({
  key: v.string(),
  text: v.string(),
  kind: v.union(v.literal("single"), v.literal("multi")),
  options: v.array(v.object({ id: v.string(), label: v.string() })),
  correct: v.array(v.string()),
  image: v.optional(v.object({ url: v.string(), alt: v.string() })),
  legacyType: v.optional(v.union(v.literal("mcq"), v.literal("true_false"), v.literal("multi_select"))),
  legacyCorrect: v.optional(v.string()),
  legacyCorrectList: v.optional(v.array(v.string())),
  points: v.optional(v.number()),
});

export const liveSettingsValidator = v.object({
  timeLimitSec: v.number(),
  maxPlayers: v.number(),
  language: languageValidator,
  /** Old rooms use readable answers too; hosts may opt into projector-only symbols. */
  showAnswerLabels: v.optional(v.boolean()),
  /** Moves from answer to leaderboard to the next question on its own. Missing on old rooms (off). */
  autoAdvance: v.optional(v.boolean()),
  /** Seconds each of the answer and leaderboard screens stay up during autoplay. */
  breakSec: v.optional(v.number()),
  /** Start the countdown automatically once this many players have joined. */
  startWhenPlayers: v.optional(v.number()),
});

/**
 * Live games: a host runs a quiz on a shared screen and players answer on their phones.
 * The server owns the clock (questionEndsAt) and every correctness decision.
 */
export const liveTables = {
  /** Immutable server-only snapshot; state transitions never rewrite this data. */
  liveGameContent: defineTable({ questions: v.array(liveQuestionValidator), quizQuestions: v.optional(v.array(savedQuestion)) }),
  liveGames: defineTable({
    hostId: v.string(),
    rehearsal: v.optional(v.boolean()),
    replayClockVersion: v.optional(v.literal(1)),
    formId: v.optional(v.id("forms")),
    formVersion: v.optional(v.number()),
    quizId: v.optional(v.id("quizzes")),
    title: v.string(),
    /** Optional for rooms created before themes; snapshot survives source edits. */
    theme: v.optional(themeValidator),
    /** New rooms default to Apple styling; an explicit theme remains a creator choice. */
    appearance: v.optional(v.union(v.literal("apple"), v.literal("theme"))),
    pin: v.string(),
    state: liveStateValidator,
    /** -1 in the lobby. */
    questionIndex: v.number(),
    questionStartedAt: v.optional(v.number()),
    questionEndsAt: v.optional(v.number()),
    /** Lobby countdown: the first question starts at this time. */
    startsAt: v.optional(v.number()),
    /** When autoplay leaves the current answer or leaderboard screen; unset while paused. */
    phaseEndsAt: v.optional(v.number()),
    /** Snapshot taken when the game was created; answer keys stay on the server until each reveal. */
    questions: v.array(liveQuestionValidator),
    /** Legacy: rooms created before liveGameContent kept this snapshot inline. */
    quizQuestions: v.optional(v.array(savedQuestion)),
    contentId: v.optional(v.id("liveGameContent")),
    questionCount: v.optional(v.number()),
    skippedQuestions: v.number(),
    settings: liveSettingsValidator,
    lastActivityAt: v.number(),
    createdAt: v.number(),
    /** Legacy: rooms created before livePlayerCounts. Read only as a fallback; never written. */
    activePlayerCount: v.optional(v.number()),
    /** Team-only game: copied from the quiz; only signed-in members of this team may join. */
    audienceTeamId: v.optional(v.id("businessTeams")),
    /** The question whose sharded answer counters and single check loop are initialized. */
    answerCounterQuestion: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    endedReason: v.optional(v.union(v.literal("finished"), v.literal("host"), v.literal("idle"))),
    resultsStatus: v.optional(v.union(v.literal("saving"), v.literal("saved"))),
    savedResponses: v.optional(v.number()),
    /** Players whose answers could not be saved because the form or quiz was full. */
    unsavedResponses: v.optional(v.number()),
  })
    .index("by_pin_and_state", ["pin", "state"])
    .index("by_state_and_lastActivityAt", ["state", "lastActivityAt"])
    .index("by_hostId_and_createdAt", ["hostId", "createdAt"]),

  /** Small phone subscription; immutable question content lives in separate rows. */
  livePhoneStates: defineTable({
    gameId: v.id("liveGames"), title: v.string(), state: liveStateValidator,
    questionIndex: v.number(), questionCount: v.number(),
    appearance: v.optional(v.union(v.literal("apple"), v.literal("theme"))),
    theme: v.optional(themeValidator), showAnswerLabels: v.boolean(),
    startsAt: v.optional(v.number()), questionStartedAt: v.optional(v.number()), questionEndsAt: v.optional(v.number()),
  }).index("by_gameId", ["gameId"]),
  liveQuestions: defineTable({ gameId: v.id("liveGames"), questionIndex: v.number(), question: liveQuestionValidator, startedAt: v.optional(v.number()), endsAt: v.optional(v.number()), revealedAt: v.optional(v.number()) })
    .index("by_gameId_and_questionIndex", ["gameId", "questionIndex"]),

  /** Historical round scores stay off the player documents every phone subscribes to. */
  liveRoundScores: defineTable({ gameId: v.id("liveGames"), questionIndex: v.number(), playerId: v.id("livePlayers"), scoreBefore: v.number(), scoreAfter: v.number(), streakAfter: v.number() })
    .index("by_gameId_and_questionIndex", ["gameId", "questionIndex"]),

  livePlayers: defineTable({
    gameId: v.id("liveGames"),
    nickname: v.string(),
    nicknameKey: v.string(),
    /** SHA-256 of the player's private browser token. */
    tokenHash: v.string(),
    score: v.number(),
    streak: v.number(),
    correctCount: v.number(),
    /** Set at each reveal, so players never learn correctness earlier. */
    rank: v.optional(v.number()),
    lastQuestionIndex: v.optional(v.number()),
    lastCorrect: v.optional(v.boolean()),
    lastPoints: v.optional(v.number()),
    lastBonus: v.optional(v.number()),
    kicked: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_gameId_and_tokenHash", ["gameId", "tokenHash"])
    .index("by_gameId_and_nicknameKey", ["gameId", "nicknameKey"])
    .index("by_gameId_and_kicked_and_score", ["gameId", "kicked", "score"])
    .index("by_gameId_and_score", ["gameId", "score"]),

  /**
   * Active players per game, kept off liveGames so a burst of joins doesn't rewrite the
   * document every phone subscribes to (each write would re-run every playerView).
   */
  livePlayerCounts: defineTable({
    gameId: v.id("liveGames"), count: v.number(),
  }).index("by_gameId", ["gameId"]),

  liveAnswerCounts: defineTable({
    gameId: v.id("liveGames"), questionIndex: v.number(), shard: v.number(), count: v.number(),
  }).index("by_gameId_and_questionIndex_and_shard", ["gameId", "questionIndex", "shard"]),

  liveAnswers: defineTable({
    gameId: v.id("liveGames"),
    playerId: v.id("livePlayers"),
    questionIndex: v.number(),
    answer: v.array(v.string()),
    correct: v.boolean(),
    /** Time points, before any streak bonus (added at the reveal). */
    points: v.number(),
    timeTakenMs: v.number(),
    answeredAt: v.number(),
    reviewFlag: v.optional(v.literal("too_fast")),
  })
    .index("by_gameId_and_questionIndex_and_playerId", ["gameId", "questionIndex", "playerId"])
    .index("by_playerId_and_questionIndex", ["playerId", "questionIndex"]),
};
