import { v, type Infer } from "convex/values";

/** Policy only. PR 14+ must enforce these values at student entry and submission. */
export const examSettings = v.object({
  mode: v.union(v.literal("anytime"), v.literal("scheduled")),
  opensAt: v.optional(v.number()),
  closesAt: v.optional(v.number()),
  durationMinutes: v.number(),
  maxAttempts: v.number(),
  requireAllAnswers: v.boolean(),
  allowEarlySubmission: v.boolean(),
  timeoutAction: v.union(v.literal("auto_submit"), v.literal("expire")),
  passingPercent: v.number(),
  resultVisibility: v.union(v.literal("immediate"), v.literal("after_close"), v.literal("manual")),
  showCorrectAnswers: v.boolean(),
  showExplanations: v.boolean(),
});
export type ExamSettings = Infer<typeof examSettings>;

export const defaultExamSettings: ExamSettings = {
  mode: "anytime",
  durationMinutes: 60,
  maxAttempts: 1,
  requireAllAnswers: false,
  allowEarlySubmission: true,
  timeoutAction: "auto_submit",
  passingPercent: 50,
  resultVisibility: "manual",
  showCorrectAnswers: false,
  showExplanations: false,
};

/** Store UTC epoch milliseconds. Never trust a browser clock or local-time string. */
export function validateExamSettings(s: ExamSettings, now: number): ExamSettings {
  const integer = (n: number, low: number, high: number) =>
    Number.isSafeInteger(n) && n >= low && n <= high;
  if (!integer(s.durationMinutes, 1, 480))
    throw new Error("VALIDATION_FAILED: Duration must be 1–480 whole minutes.");
  if (!integer(s.maxAttempts, 1, 3))
    throw new Error("VALIDATION_FAILED: Attempts must be between 1 and 3.");
  if (!Number.isFinite(s.passingPercent) || s.passingPercent < 0 ||
      s.passingPercent > 100 ||
      Math.abs(Math.round(s.passingPercent * 100) - s.passingPercent * 100) > 1e-8)
    throw new Error("VALIDATION_FAILED: Passing percentage must be 0–100, up to two decimals.");
  if (s.mode === "anytime") {
    if (s.opensAt !== undefined || s.closesAt !== undefined)
      throw new Error("VALIDATION_FAILED: Anytime exams cannot have a scheduled window.");
    if (s.resultVisibility === "after_close")
      throw new Error("VALIDATION_FAILED: After-close results need a scheduled closing time.");
  } else {
    if (!integer(s.opensAt ?? NaN, 1, Number.MAX_SAFE_INTEGER) ||
        !integer(s.closesAt ?? NaN, 1, Number.MAX_SAFE_INTEGER))
      throw new Error("VALIDATION_FAILED: Enter valid opening and closing timestamps.");
    if (s.opensAt! >= s.closesAt!)
      throw new Error("VALIDATION_FAILED: Closing time must follow opening time.");
    if (s.closesAt! <= now)
      throw new Error("VALIDATION_FAILED: The exam must close in the future.");
    if (s.closesAt! - s.opensAt! > 366 * 24 * 60 * 60 * 1000)
      throw new Error("VALIDATION_FAILED: Scheduling windows cannot exceed 366 days.");
  }
  // Fresh object prevents callers retaining unexpected optional fields.
  return {
    mode: s.mode,
    ...(s.mode === "scheduled" ? { opensAt: s.opensAt, closesAt: s.closesAt } : {}),
    durationMinutes: s.durationMinutes,
    maxAttempts: s.maxAttempts,
    requireAllAnswers: s.requireAllAnswers,
    allowEarlySubmission: s.allowEarlySubmission,
    timeoutAction: s.timeoutAction,
    passingPercent: s.passingPercent,
    resultVisibility: s.resultVisibility,
    showCorrectAnswers: s.showCorrectAnswers,
    showExplanations: s.showExplanations,
  };
}
