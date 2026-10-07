/** Review signals describe a question and cohort; they never change marks. */
export const MIN_READ_TIME_MS = 500;
export interface QualityQuestion {
  id: string;
  text: string;
  kind: string;
  options: string[];
  answerKey: string[];
  points: number;
  timeLimit: number | null;
}
export interface QualityObservation {
  correct: boolean;
  seconds: number | null;
  cohortScore: number;
  wrongChoice: string | null;
  review: boolean;
}
export function questionQuality(
  question: QualityQuestion,
  observations: QualityObservation[],
) {
  const n = observations.length;
  const correct = observations.filter((a) => a.correct).length;
  const times = observations
    .map((a) => a.seconds)
    .filter((t): t is number => t !== null && Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianSeconds = times.length
    ? times.length % 2
      ? times[mid]
      : (times[mid - 1] + times[mid]) / 2
    : null;
  const wrong = new Map<string, number>();
  for (const a of observations)
    if (!a.correct && a.wrongChoice)
      wrong.set(a.wrongChoice, (wrong.get(a.wrongChoice) ?? 0) + 1);
  const commonWrong = [...wrong].sort((a, b) => b[1] - a[1])[0];
  const flags: (
    "small_sample" | "difficult" | "easy" | "negative_discrimination"
  )[] = [];
  if (n < 10) flags.push("small_sample");
  else {
    if (correct / n < 0.4) flags.push("difficult");
    if (correct / n > 0.95) flags.push("easy");
  }
  let discrimination: number | null = null;
  if (n >= 20) {
    const sorted = [...observations].sort(
      (a, b) => a.cohortScore - b.cohortScore,
    );
    const size = Math.max(1, Math.floor(n / 4));
    const bottom = sorted.slice(0, size),
      top = sorted.slice(-size);
    // Tied cohorts cannot support a meaningful high/low comparison.
    if (bottom.at(-1)!.cohortScore < top[0].cohortScore) {
      discrimination =
        top.filter((a) => a.correct).length / size -
        bottom.filter((a) => a.correct).length / size;
      if (discrimination < -0.1) flags.push("negative_discrimination");
    }
  }
  return {
    id: question.id,
    text: question.text,
    answered: n,
    correctRate: n ? Math.round((correct / n) * 100) : null,
    medianSeconds,
    timingCount: times.length,
    commonWrong: commonWrong
      ? { label: commonWrong[0], count: commonWrong[1] }
      : null,
    reviewCount: observations.filter((a) => a.review).length,
    discrimination,
    flags,
  };
}
