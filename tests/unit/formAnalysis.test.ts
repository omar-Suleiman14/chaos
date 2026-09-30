import { describe, expect, it } from "vitest";
import { dateSpread, histogram, median, mostCommonWrong, scoreSummary, tallyQuizAnswer } from "@/convex/formAnalysis";
import type { QuizQuestionTally } from "@/convex/formAnalysis";

describe("results summary statistics", () => {
  it("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("histogram gives one bar per value for small whole-number ranges", () => {
    expect(histogram([1, 2, 2, 5])).toEqual([
      { from: 1, to: 1, count: 1 }, { from: 2, to: 2, count: 2 }, { from: 3, to: 3, count: 0 }, { from: 4, to: 4, count: 0 }, { from: 5, to: 5, count: 1 },
    ]);
    expect(histogram([7, 7])).toEqual([{ from: 7, to: 7, count: 2 }]);
    expect(histogram([])).toEqual([]);
  });

  it("histogram uses round widths for wide or fractional data and counts every value", () => {
    const values = [0, 3, 18, 55, 99, 100, 250];
    const bins = histogram(values);
    // Range 250 over at most 10 bins: 25 rounds up to a width of 50.
    expect(bins.map((b) => [b.from, b.to, b.count])).toEqual([[0, 50, 3], [50, 100, 2], [100, 150, 1], [150, 200, 0], [200, 250, 0], [250, 300, 1]]);
    const fractions = histogram([0.1, 0.25, 0.9, 1.4]);
    expect(fractions.reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it("date spread groups by day, month or year depending on the range and ignores bad values", () => {
    expect(dateSpread(["2026-01-02", "2026-01-02", "2026-01-09", "oops"])).toEqual({
      earliest: "2026-01-02", latest: "2026-01-09", unit: "day", buckets: [{ label: "2026-01-02", count: 2 }, { label: "2026-01-09", count: 1 }],
    });
    expect(dateSpread(["2026-01-02", "2026-05-09"])!.unit).toBe("month");
    expect(dateSpread(["1990-01-02", "2026-05-09"])!.buckets.map((b) => b.label)).toEqual(["1990", "2026"]);
    expect(dateSpread([])).toBeNull();
  });

  it("quiz tallies count exact matches and group identical wrong combinations", () => {
    const tally: QuizQuestionTally = { answered: 0, correct: 0, wrong: new Map() };
    tallyQuizAnswer(tally, ["a", "b"], ["a", "b"], true);
    tallyQuizAnswer(tally, ["b", "c"], ["a", "b"], true);
    tallyQuizAnswer(tally, ["c", "b"], ["a", "b"], true);
    tallyQuizAnswer(tally, ["a"], ["a", "b"], true);
    tallyQuizAnswer(tally, [], ["a", "b"], true);
    expect(tally.answered).toBe(4);
    expect(tally.correct).toBe(1);
    expect(mostCommonWrong(tally)).toEqual({ optionIds: ["b", "c"], count: 2 });
    expect(mostCommonWrong({ answered: 1, correct: 1, wrong: new Map() })).toBeNull();
  });

  it("score summary: average and median in points, pass at half marks, five percentage bands", () => {
    const s = scoreSummary([{ score: 10, max: 10 }, { score: 5, max: 10 }, { score: 2, max: 10 }, { score: 0, max: 0 }])!;
    expect(s).toMatchObject({ graded: 3, average: 17 / 3, median: 5, maxScore: 10, passRate: 2 / 3 });
    expect(s.bins.map((b) => b.count)).toEqual([0, 1, 1, 0, 1]);
    expect(scoreSummary([])).toBeNull();
  });
});
