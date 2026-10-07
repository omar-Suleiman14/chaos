import { describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import {
  creatorIdentity,
  otherCreatorIdentity,
  questionFixtures,
  quizFixture,
} from "../fixtures";

const token = "ab".repeat(16);
async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const seeded = await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: "creator",
    });
    const questionId = await ctx.db.insert("questions", {
      ...questionFixtures.mcq,
      quizId,
    });
    return { quizId, questionId };
  });
  return { t, owner, ...seeded };
}
describe("classroom resilience", () => {
  it("keeps phone reads independent of the full game and synchronizes every phase", async () => {
    const { t, owner, quizId } = await setup();
    const gameId = await owner.mutation(api.live.createGame, {
      quizId,
      autoAdvance: false,
    });
    const host = (await owner.query(api.live.hostView, { gameId }))!;
    await t.mutation(api.live.joinGame, {
      pin: host.pin,
      nickname: "Student",
      token,
    });
    const before = await t.run((ctx) =>
      ctx.db
        .query("livePhoneStates")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch("liveGames", gameId, {
        title: "Only the large document changed",
      }),
    );
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject(
      { title: "Fixture Quiz", state: "lobby" },
    );
    await owner.mutation(api.live.advance, {
      gameId,
      from: "lobby",
      questionIndex: -1,
    });
    const view = await t.query(api.live.playerView, { gameId, token });
    expect(view.state).toBe("question");
    expect(JSON.stringify(view)).not.toContain('"correct"');
    expect(view).not.toHaveProperty("questions");
    const small = await t.run((ctx) =>
      ctx.db
        .query("livePhoneStates")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .unique(),
    );
    expect(small?._id).toBe(before?._id);
    expect(small).not.toHaveProperty("questions");
    await owner.mutation(api.live.advance, {
      gameId,
      from: "question",
      questionIndex: 0,
    });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject(
      { state: "reveal", question: { correct: expect.any(Array) } },
    );
    await owner.mutation(api.live.endGameNow, { gameId });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject(
      { state: "ended" },
    );
  });

  it("initializes old-room projections lazily at a transition", async () => {
    const { t, owner, quizId } = await setup();
    const gameId = await owner.mutation(api.live.createGame, { quizId });
    const host = (await owner.query(api.live.hostView, { gameId }))!;
    await t.mutation(api.live.joinGame, {
      pin: host.pin,
      nickname: "Student",
      token,
    });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("livePhoneStates")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .unique();
      await ctx.db.delete("livePhoneStates", row!._id);
      for (const q of await ctx.db
        .query("liveQuestions")
        .withIndex("by_gameId_and_questionIndex", (q) => q.eq("gameId", gameId))
        .collect())
        await ctx.db.delete("liveQuestions", q._id);
    });
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject(
      { state: "lobby" },
    );
    await owner.mutation(api.live.advance, {
      gameId,
      from: "lobby",
      questionIndex: -1,
    });
    expect(
      await t.run((ctx) => ctx.db.query("liveQuestions").collect()),
    ).toHaveLength(1);
    expect(await t.query(api.live.playerView, { gameId, token })).toMatchObject(
      { state: "question" },
    );
  });

  it("rehearses through the real live engine without leaking or saving student results", async () => {
    const { t, owner, quizId } = await setup();
    const gameId = await owner.mutation(api.live.createRehearsal, { quizId });
    const game = (await owner.query(api.live.hostView, { gameId }))!;
    await expect(
      t.mutation(api.live.joinGame, {
        pin: game.pin,
        nickname: "Intruder",
        token,
      }),
    ).rejects.toThrow("LIVE_PRIVATE");
    await owner.mutation(api.live.joinGame, {
      pin: game.pin,
      nickname: "Practice 1",
      token,
    });
    await owner.mutation(api.live.advance, {
      gameId,
      from: "lobby",
      questionIndex: -1,
    });
    const phone = await owner.query(api.live.playerView, { gameId, token });
    if (phone.state !== "question") throw new Error("question expected");
    const optionIds = [phone.question.options[0].id];
    await expect(
      owner.mutation(api.live.submitAnswer, {
        gameId,
        token,
        questionIndex: 0,
        optionIds,
      }),
    ).resolves.toEqual({ status: "received" });
    await expect(
      owner.mutation(api.live.submitAnswer, {
        gameId,
        token,
        questionIndex: 0,
        optionIds,
      }),
    ).resolves.toEqual({ status: "already" });
    await owner.mutation(api.live.advance, {
      gameId,
      from: "question",
      questionIndex: 0,
    });
    await owner.mutation(api.live.endGameNow, { gameId });
    await t.mutation(internal.live.saveResults, { gameId, cursor: null });
    expect(
      await t.run((ctx) => ctx.db.query("quizSessions").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("formResponses").collect()),
    ).toHaveLength(0);
    const replay = await owner.query(api.live.questionReplay, {
      gameId,
      questionIndex: 0,
    });
    expect(replay?.players[0].answer?.at).toBe(0);
    expect(
      await t.query(api.live.questionReplay, { gameId, questionIndex: 0 }),
    ).toBeNull();
    expect(
      await t
        .withIdentity(otherCreatorIdentity)
        .query(api.live.questionReplay, { gameId, questionIndex: 0 }),
    ).toBeNull();
  });

  it("recovers an immutable attempt without releasing held answers and flags fast answers without changing marks", async () => {
    const { t, owner, quizId, questionId } = await setup();
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, {
      quizId,
      playerName: "Student",
    });
    await t.mutation(api.quizFunctions.openQuestion, { sessionId, questionId });
    await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId,
      answer: "4",
      timeTaken: 999,
    });
    const session = await t.run((ctx) => ctx.db.get("quizSessions", sessionId));
    expect(session?.answers[0]).toMatchObject({
      isCorrect: true,
      pointsEarned: 10,
      reviewFlag: "too_fast",
      timeTaken: 0,
    });
    await t.run((ctx) =>
      ctx.db.patch("questions", questionId, {
        questionText: "Edited after starting",
        correctAnswer: "5",
      }),
    );
    const restored = await t.query(api.quizFunctions.getAttemptRecovery, {
      quizId,
      sessionId,
    });
    expect(
      restored && !restored.completed && restored.questions[0].questionText,
    ).toBe(questionFixtures.mcq.questionText);
    expect(
      restored && !restored.completed && restored.questions[0],
    ).not.toHaveProperty("correctAnswer");
    await t.run((ctx) =>
      ctx.db.patch("quizzes", quizId, { resultRelease: "manual" }),
    );
    const held = await t.query(api.quizFunctions.getAttemptRecovery, {
      quizId,
      sessionId,
    });
    expect(held && !held.completed && held.answers[0].feedback).toEqual({
      withheld: true,
    });
    await t.mutation(api.quizFunctions.completeQuizSession, { sessionId });
    const insights = await owner.query(api.quizFunctions.getTeachingInsights, {
      quizId,
    });
    expect(insights?.questions[0]).toMatchObject({
      correctRate: 100,
      medianSeconds: 0,
      reviewCount: 1,
    });
    expect(
      await t.query(api.quizFunctions.getTeachingInsights, { quizId }),
    ).toBeNull();
  });

  it("keeps normal reading times unflagged and preserves late-answer enforcement during retry", async () => {
    const { t, quizId, questionId } = await setup();
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, {
      quizId,
      playerName: "Student",
    });
    await t.mutation(api.quizFunctions.openQuestion, { sessionId, questionId });
    vi.advanceTimersByTime(1_000);
    await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId,
      answer: "4",
    });
    expect(
      (await t.run((ctx) => ctx.db.get("quizSessions", sessionId)))?.answers[0]
        .reviewFlag,
    ).toBeUndefined();
    const lateSession = await t.mutation(api.quizFunctions.startQuizSession, {
      quizId,
      playerName: "Other",
    });
    await t.mutation(api.quizFunctions.openQuestion, {
      sessionId: lateSession,
      questionId,
    });
    vi.advanceTimersByTime(70_000);
    await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId: lateSession,
      questionId,
      answer: "4",
    });
    expect(
      (await t.run((ctx) => ctx.db.get("quizSessions", lateSession)))
        ?.answers[0],
    ).toMatchObject({ late: true, pointsEarned: 0 });
  });
});

it("runs the same simulated-phone harness against the real join and answer handlers", async () => {
  const { runRehearsal } = await import("@/lib/liveRehearsal");
  const { t, owner, quizId } = await setup();
  const gameId = await owner.mutation(api.live.createRehearsal, { quizId });
  const host = (await owner.query(api.live.hostView, { gameId }))!;
  type View = import("convex/server").FunctionReturnType<
    typeof api.live.playerView
  >;
  const watchers = new Map<string, (view: View) => void>();
  let ready!: () => void;
  const joined = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let allReceived!: () => void;
  const received = new Promise<void>(resolve => { allReceived = resolve; });
  const stop = runRehearsal(
    {
      join: (nickname, token) =>
        owner.mutation(api.live.joinGame, { pin: host.pin, nickname, token }),
      answer: (token, questionIndex, optionIds) =>
        owner.mutation(api.live.submitAnswer, {
          gameId,
          token,
          questionIndex,
          optionIds,
        }),
      watch: (token, update) => {
        watchers.set(token, update);
        if (watchers.size === 50) ready();
        return () => {
          watchers.delete(token);
        };
      },
    },
    50,
    false,
    stats => { if (stats.received === 50) allReceived(); },
  );
  try {
    await joined;
    await owner.mutation(api.live.advance, {
      gameId,
      from: "lobby",
      questionIndex: -1,
    });
    await Promise.all(
      [...watchers].map(async ([token, update]) => {
        update(await owner.query(api.live.playerView, { gameId, token }));
      }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await received;
    await vi.advanceTimersByTimeAsync(1_000);
    await t.finishInProgressScheduledFunctions();
    const revealed = await owner.query(api.live.hostView, { gameId });
    expect(revealed?.state).toBe("reveal");
    expect(revealed?.answeredCount).toBe(50);
    const answers = await t.run((ctx) => ctx.db.query("liveAnswers").collect());
    expect(answers).toHaveLength(50);
    const ledger = await t.run((ctx) =>
      ctx.db.query("liveRoundScores").collect(),
    );
    expect(ledger).toHaveLength(50);
    await owner.mutation(api.live.endGameNow, { gameId });
    const replay = await owner.query(api.live.questionReplay, {
      gameId,
      questionIndex: 0,
    });
    expect(replay?.players).toHaveLength(50);
    expect(replay?.revealedAtMs).toBeGreaterThan(0);
    expect(
      await t.run((ctx) => ctx.db.query("quizSessions").collect()),
    ).toHaveLength(0);
  } finally {
    stop();
  }
});

it("keeps published form editions separate and computes quality against the edition each student received", async () => {
  const { emptyDefinition } = await import("@/convex/formLogic");
  const { t, owner } = await setup();
  const definition = {
    ...emptyDefinition("Capital quiz"),
    quiz: { enabled: true },
    fields: [
      {
        id: "capital",
        type: "choice" as const,
        label: "Capital of France?",
        required: true,
        options: [
          { id: "a", label: "Paris" },
          { id: "b", label: "Lyon" },
        ],
        quiz: { correctOptionIds: ["a"], points: 2 },
      },
    ],
  };
  const formId = await owner.mutation(api.forms.createForm, { definition });
  let editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, {
    formId,
    expectedRevision: editor.draftRevision,
  });
  editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await t.mutation(api.respond.submitResponse, {
    shareId: editor.shareId,
    submissionKey: "insight-response-one",
    answers: { capital: "a" },
    language: "en",
    final: true,
    startedAt: Date.now() - 60_000,
  });
  const next = {
    ...definition,
    fields: [
      {
        ...definition.fields[0],
        label: "Capital of France — choose one",
        quiz: { correctOptionIds: ["b"], points: 3 },
      },
    ],
  };
  const saved = await owner.mutation(api.forms.saveFormDraft, {
    formId,
    expectedRevision: editor.draftRevision,
    definition: next,
  });
  await owner.mutation(api.forms.publishForm, {
    formId,
    expectedRevision: saved.draftRevision,
  });
  await t.mutation(api.respond.submitResponse, {
    shareId: editor.shareId,
    submissionKey: "insight-response-two",
    answers: { capital: "a" },
    language: "en",
    final: true,
    startedAt: Date.now() - 60_000,
  });
  const report = (await owner.query(api.formResults.getTeachingInsights, {
    formId,
  }))!;
  expect(report.versions.map((v) => v.key)).toEqual(["2", "1"]);
  expect(report.versions[1].questions[0]).toMatchObject({
    text: "Capital of France?",
    answerKey: ["Paris"],
    points: 2,
  });
  expect(report.questions.find((q) => q.id === "1:capital")).toMatchObject({
    correctRate: 100,
    medianSeconds: null,
  });
  expect(report.questions.find((q) => q.id === "2:capital")).toMatchObject({
    correctRate: 0,
    commonWrong: { label: "Paris", count: 1 },
  });
  expect(
    await t.query(api.formResults.getTeachingInsights, { formId }),
  ).toBeNull();
  expect(
    await t
      .withIdentity(otherCreatorIdentity)
      .query(api.formResults.getTeachingInsights, { formId }),
  ).toBeNull();
});

it("saves a live quiz's original questions even if the teacher edits the source during play", async () => {
  const { t, owner, quizId, questionId } = await setup();
  const gameId = await owner.mutation(api.live.createGame, {
    quizId,
    autoAdvance: false,
  });
  const game = (await owner.query(api.live.hostView, { gameId }))!;
  await t.mutation(api.live.joinGame, {
    pin: game.pin,
    nickname: "Student",
    token,
  });
  await owner.mutation(api.live.advance, {
    gameId,
    from: "lobby",
    questionIndex: -1,
  });
  const phone = await t.query(api.live.playerView, { gameId, token });
  if (phone.state !== "question") throw new Error("Expected question");
  await t.mutation(api.live.submitAnswer, {
    gameId,
    token,
    questionIndex: 0,
    optionIds: [phone.question.options[1].id],
  });
  await t.run((ctx) =>
    ctx.db.patch("questions", questionId, {
      questionText: "Replacement question",
      correctAnswer: "5",
    }),
  );
  await owner.mutation(api.live.endGameNow, { gameId });
  await vi.advanceTimersByTimeAsync(0);
  await t.finishInProgressScheduledFunctions();
  const attempts = await t.run((ctx) => ctx.db.query("quizSessions").collect());
  expect(attempts[0].questionSnapshot?.[0]).toMatchObject({
    questionText: "What is 2 + 2?",
    correctAnswer: "4",
    timeLimit: game.settings.timeLimitSec,
  });
  const replay = await owner.query(api.live.questionReplay, {
    gameId,
    questionIndex: 0,
  });
  expect(replay?.revealedAtMs).toBeNull();
});
