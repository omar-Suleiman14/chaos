import { streakBonus } from "./liveLogic";

/** Historical rooms have no round-score ledger. Reconstruct only prior questions. */
export function historicalScoreBefore(
  history: readonly { questionIndex: number; correct: boolean; points: number }[],
  questionIndex: number,
  initialScore: number,
  initialStreak: number,
): { score: number; streak: number } {
  const byIndex = new Map(history.map(answer => [answer.questionIndex, answer]));
  let score = initialScore;
  let streak = initialStreak;
  for (let qi = 0; qi < questionIndex; qi++) {
    const answer = byIndex.get(qi);
    streak = answer?.correct ? streak + 1 : 0;
    if (answer?.correct) score += answer.points + streakBonus(streak);
  }
  return { score, streak };
}
