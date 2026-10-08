import { afterEach, describe, expect, it, vi } from "vitest";
import { readLiveAnswer, saveLiveAnswer } from "@/lib/liveRecovery";
import {
  questionQuality,
  type QualityQuestion,
} from "@/convex/questionQuality";
import { runRehearsal, type RehearsalStats } from "@/lib/liveRehearsal";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
const question: QualityQuestion = {
  id: "q",
  text: "Prompt",
  kind: "mcq",
  options: ["A", "B"],
  answerKey: ["A"],
  points: 1,
  timeLimit: null,
};
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("live answer backups and quality signals", () => {
  it("fails safely when storage is disabled and keeps live answers bound to their token and question", () => {
    expect(
      saveLiveAnswer("g", { token: "t", questionIndex: 0, optionIds: ["a"] }),
    ).toBe(true);
    expect(readLiveAnswer("g", "t", 0)?.optionIds).toEqual(["a"]);
    expect(readLiveAnswer("g", "other", 0)).toBeNull();
    expect(readLiveAnswer("g", "t", 1)).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    expect(
      saveLiveAnswer("g", { token: "t", questionIndex: 1, optionIds: ["b"] }),
    ).toBe(false);
  });
  it("does not suggest question defects from tiny or tied cohorts and separates missing timing", () => {
    const tiny = questionQuality(question, [
      {
        correct: false,
        seconds: null,
        cohortScore: 0,
        wrongChoice: "B",
        review: false,
      },
    ]);
    expect(tiny).toMatchObject({
      correctRate: 0,
      medianSeconds: null,
      timingCount: 0,
      flags: ["small_sample"],
    });
    const tied = questionQuality(
      question,
      Array.from({ length: 20 }, () => ({
        correct: false,
        seconds: 2,
        cohortScore: 0.5,
        wrongChoice: "B",
        review: false,
      })),
    );
    expect(tied.discrimination).toBeNull();
    expect(tied.flags).toEqual(["difficult"]);
  });
  it("detects a reversed answer-key signal and computes the median without changing observations", () => {
    const observations = Array.from({ length: 20 }, (_, i) => ({
      correct: i < 5,
      seconds: i,
      cohortScore: i / 20,
      wrongChoice: i < 5 ? null : "B",
      review: i === 0,
    }));
    const quality = questionQuality(question, observations);
    expect(quality).toMatchObject({
      correctRate: 25,
      medianSeconds: 9.5,
      reviewCount: 1,
      discrimination: -1,
      commonWrong: { label: "B", count: 15 },
    });
    expect(quality.flags).toContain("negative_discrimination");
    expect(observations[0].seconds).toBe(0);
  });
});
describe("shared rehearsal harness", () => {
  it("simulates chaos, uses unique tokens, never submits a question twice on updates and cancels subscriptions", async () => {
    vi.useFakeTimers();
    type View = FunctionReturnType<typeof api.live.playerView>;
    const callbacks = new Map<string, (view: View) => void>();
    const tokens: string[] = [];
    const off = vi.fn();
    const answer = vi.fn().mockResolvedValue({ status: "received" });
    let stats: RehearsalStats | undefined;
    const stop = runRehearsal(
      {
        join: async (_name, token) => {
          tokens.push(token);
        },
        watch: (token, update) => {
          callbacks.set(token, update);
          return off;
        },
        answer,
      },
      20,
      true,
      (s) => {
        stats = s;
      },
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(stats?.joined).toBe(20);
    expect(new Set(tokens).size).toBe(20);
    const view: View = {
      state: "question",
      title: "Practice",
      appearance: "apple",
      theme: null,
      showAnswerLabels: true,
      nickname: "Student",
      questionIndex: 0,
      questionCount: 1,
      question: {
        text: "Pick",
        kind: "single",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        image: null,
      },
      startedAt: Date.now(),
      endsAt: Date.now() + 30_000,
      answered: false,
      myAnswer: null,
    };
    for (const cb of callbacks.values()) {
      cb(view);
      cb(view);
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(stats?.missed).toBe(2);
    expect(stats?.duplicates).toBeGreaterThan(0);
    expect(answer.mock.calls.length).toBeLessThan(25);
    stop();
    const calls = answer.mock.calls.length;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(answer).toHaveBeenCalledTimes(calls);
    expect(off).toHaveBeenCalledTimes(20);
  });
});
