/**
 * Pure summary statistics for the results page. Kept free of Convex imports so the
 * same functions are unit tested directly and used by formResults.getAnalysis.
 */

export interface Bin { from: number; to: number; count: number }

/** Middle value (mean of the two middle values for an even count), or null when empty. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Equal-width bins covering min..max. Whole-number data with a small range gets one bin per
 * value, so "1, 2, 3" reads as three bars rather than awkward fractions.
 */
export function histogram(values: readonly number[], maxBins = 10): Bin[] {
  if (!values.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const integers = values.every(Number.isInteger);
  let width: number;
  if (integers && max - min + 1 <= maxBins) width = 1;
  else {
    const raw = (max - min) / maxBins;
    // A round width (1, 2, 5 × 10^n) so labels stay readable.
    const step = 10 ** Math.floor(Math.log10(raw));
    width = [1, 2, 5, 10].map((m) => m * step).find((w) => w >= raw) ?? raw;
    if (integers) width = Math.max(1, Math.ceil(width));
  }
  const start = Math.floor(min / width) * width;
  const count = Math.floor((max - start) / width) + 1;
  const single = integers && width === 1;
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ from: start + i * width, to: single ? start + i : start + (i + 1) * width, count: 0 }));
  for (const v of values) bins[Math.min(count - 1, Math.floor((v - start) / width))].count++;
  return bins;
}

export interface DateSpread { earliest: string; latest: string; buckets: { label: string; count: number }[]; unit: "day" | "month" | "year" }

/** Dates as YYYY-MM-DD: earliest, latest and counts by day, month or year depending on the range. */
export function dateSpread(dates: readonly string[]): DateSpread | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!valid.length) return null;
  const earliest = valid[0];
  const latest = valid[valid.length - 1];
  const days = (Date.parse(latest) - Date.parse(earliest)) / 86_400_000;
  const unit: DateSpread["unit"] = days <= 31 ? "day" : days <= 366 * 3 ? "month" : "year";
  const key = (d: string) => (unit === "day" ? d : unit === "month" ? d.slice(0, 7) : d.slice(0, 4));
  const counts = new Map<string, number>();
  for (const d of valid) counts.set(key(d), (counts.get(key(d)) ?? 0) + 1);
  return { earliest, latest, unit, buckets: [...counts].map(([label, count]) => ({ label, count })) };
}

export interface QuizQuestionTally { answered: number; correct: number; wrong: Map<string, number> }

/**
 * Records one respondent's answer to a graded question. `chosen` is the option ids they picked;
 * a wrong answer is keyed by its sorted ids, so the same wrong combination counts once.
 */
export function tallyQuizAnswer(tally: QuizQuestionTally, chosen: readonly string[], correct: readonly string[], multi: boolean) {
  if (!chosen.length) return;
  tally.answered++;
  const right = multi
    ? chosen.length === correct.length && chosen.every((id) => correct.includes(id))
    : chosen.length === 1 && chosen[0] === correct[0];
  if (right) { tally.correct++; return; }
  const key = [...chosen].sort().join("|");
  tally.wrong.set(key, (tally.wrong.get(key) ?? 0) + 1);
}

/** The most common wrong answer as option ids, with how often it was given; ties go to the first seen. */
export function mostCommonWrong(tally: QuizQuestionTally): { optionIds: string[]; count: number } | null {
  let best: { optionIds: string[]; count: number } | null = null;
  for (const [key, count] of tally.wrong) if (!best || count > best.count) best = { optionIds: key.split("|"), count };
  return best;
}

export interface ScoreSummary { average: number; median: number; maxScore: number; passRate: number; graded: number; bins: Bin[] }

/**
 * Quiz scores as percentages of each response's own maximum (versions can differ).
 * "Pass" means at least half marks, the same line the respondent's celebration uses.
 */
export function scoreSummary(scores: readonly { score: number; max: number }[]): ScoreSummary | null {
  const usable = scores.filter((s) => s.max > 0);
  if (!usable.length) return null;
  const pcts = usable.map((s) => (s.score / s.max) * 100);
  const points = usable.map((s) => s.score);
  return {
    average: points.reduce((a, b) => a + b, 0) / points.length,
    median: median(points)!,
    maxScore: Math.max(...usable.map((s) => s.max)),
    passRate: usable.filter((s) => s.score / s.max >= 0.5).length / usable.length,
    graded: usable.length,
    bins: Array.from({ length: 5 }, (_, i) => ({
      from: i * 20, to: (i + 1) * 20,
      count: pcts.filter((p) => (i === 4 ? p >= 80 : p >= i * 20 && p < (i + 1) * 20)).length,
    })),
  };
}
