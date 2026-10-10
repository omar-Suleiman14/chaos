import { describe, expect, it } from "vitest";
import { historicalScoreBefore } from "../../convex/liveReplay";
import { streakBonus } from "../../convex/liveLogic";

type Answer = { questionIndex: number; correct: boolean; points: number };
function reference(history: Answer[], end: number, initialScore = 0, initialStreak = 0) {
  const byIndex = new Map(history.map(a => [a.questionIndex, a]));
  let score = initialScore, streak = initialStreak;
  for (let qi = 0; qi < end; qi++) {
    const answer = byIndex.get(qi);
    streak = answer?.correct ? streak + 1 : 0;
    if (answer?.correct) score += answer.points + streakBonus(streak);
  }
  return { score, streak };
}

describe("historical replay score reconstruction", () => {
  it("preserves missing-answer and streak-reset semantics", () => {
    const answers = [{ questionIndex: 0, correct: true, points: 100 }, { questionIndex: 2, correct: true, points: 50 }];
    expect(historicalScoreBefore(answers, 3, 5, 0)).toEqual(reference(answers, 3, 5, 0));
    expect(historicalScoreBefore(answers, 1, 0, 0)).toEqual(reference(answers, 1));
  });
  for (const players of [100, 500]) {
    it(`agrees with the legacy algorithm for ${players} synthetic players`, () => {
      const answers = Array.from({ length: players }, (_, player) =>
        Array.from({ length: 20 }, (_, qi) => ({ questionIndex: qi, correct: (qi + player) % 3 !== 0, points: qi * 7 })));
      expect(answers.map(history => historicalScoreBefore(history, 20, 0, 0)))
        .toEqual(answers.map(history => reference(history, 20)));
    });
  }
});
