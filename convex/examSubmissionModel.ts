import type { ExamSettings } from "./examSettingsModel";

export type FrozenExamPolicy = Pick<
  ExamSettings, "requireAllAnswers" | "allowEarlySubmission" | "timeoutAction"
>;
export type TimedAttempt = {
  startedAt: number;
  deadlineAt?: number;
  minimumSubmitAt?: number;
  submissionPolicy?: FrozenExamPolicy;
};
export type AnswerVersion = {
  questionIndex: number;
  revision: number;
  choiceIds: readonly string[];
  text: string;
};

const MINIMUM_MANUAL_SUBMISSION_MS = 30_000;
const MAX_EXAM_DURATION_MS = 480 * 60_000;

/**
 * Called by the *future* authorized attempt-creation transaction. Freeze both
 * timing and policy once, never recompute from a doctor's mutable settings.
 * Clock values are server UTC milliseconds, not browser-provided timestamps.
 */
export function createExamAttemptTiming(settings: ExamSettings, startedAt: number) {
  if (!Number.isSafeInteger(startedAt) || startedAt < 1 ||
      !Number.isSafeInteger(settings.durationMinutes) ||
      settings.durationMinutes < 1 || settings.durationMinutes > 480)
    throw new Error("INVALID_EXAM_CLOCK: Invalid start or duration.");
  if (settings.mode === "scheduled" &&
      (!settings.opensAt || !settings.closesAt ||
        startedAt < settings.opensAt || startedAt >= settings.closesAt))
    throw new Error("EXAM_CLOSED: Start must be within the scheduled window.");
  const durationEnd = startedAt + settings.durationMinutes * 60_000;
  const deadlineAt = settings.mode === "scheduled"
    ? Math.min(durationEnd, settings.closesAt!) : durationEnd;
  if (!Number.isSafeInteger(deadlineAt) ||
      deadlineAt <= startedAt || deadlineAt - startedAt > MAX_EXAM_DURATION_MS)
    throw new Error("INVALID_EXAM_CLOCK: Invalid attempt deadline.");
  return {
    deadlineAt,
    minimumSubmitAt: Math.min(deadlineAt, startedAt + MINIMUM_MANUAL_SUBMISSION_MS),
    submissionPolicy: {
      allowEarlySubmission: settings.allowEarlySubmission,
      requireAllAnswers: settings.requireAllAnswers,
      timeoutAction: settings.timeoutAction,
    },
  };
}

/** Legacy/untimed attempts are NOT silently converted into untimed exams. */
export function requireExamAttemptTiming(attempt: TimedAttempt) {
  const { startedAt, deadlineAt, minimumSubmitAt, submissionPolicy } = attempt;
  if (!Number.isSafeInteger(startedAt) || startedAt < 1 ||
      !Number.isSafeInteger(deadlineAt) || deadlineAt! <= startedAt ||
      deadlineAt! - startedAt > MAX_EXAM_DURATION_MS ||
      !Number.isSafeInteger(minimumSubmitAt) ||
      minimumSubmitAt! < startedAt || minimumSubmitAt! > deadlineAt! ||
      !submissionPolicy ||
      typeof submissionPolicy.allowEarlySubmission !== "boolean" ||
      typeof submissionPolicy.requireAllAnswers !== "boolean" ||
      !["auto_submit", "expire"].includes(submissionPolicy.timeoutAction))
    throw new Error("EXAM_CLOCK_NOT_CONFIGURED: Timed attempt initialization required.");
  return {
    deadlineAt: deadlineAt!,
    minimumSubmitAt: minimumSubmitAt!,
    submissionPolicy,
  };
}

/** Only actual selected choices or nonempty written response counts as answered. */
export function countExamAnswers(answers: readonly AnswerVersion[]) {
  return answers.filter(a => a.choiceIds.length > 0 || a.text.trim().length > 0).length;
}

/** Stable compare value: a save after confirmation invalidates it, even if answers look similar. */
export function examAnswerRevisionStamp(answers: readonly AnswerVersion[]) {
  return [...answers].sort((a, b) => a.questionIndex - b.questionIndex)
    .map(a => a.questionIndex + ":" + a.revision).join("|");
}

export function requireManualSubmissionAllowed(
  attempt: TimedAttempt, now: number, answeredCount: number, questionCount: number,
) {
  const { deadlineAt, minimumSubmitAt, submissionPolicy } = requireExamAttemptTiming(attempt);
  if (now >= deadlineAt) throw new Error("ATTEMPT_TIMED_OUT: Submission deadline passed.");
  if (!submissionPolicy.allowEarlySubmission)
    throw new Error("EARLY_SUBMISSION_DISABLED: The exam closes automatically at its deadline.");
  if (now < minimumSubmitAt)
    throw new Error("MINIMUM_SUBMISSION_TIME: Wait until the minimum time has elapsed.");
  if (submissionPolicy.requireAllAnswers && answeredCount < questionCount)
    throw new Error("ANSWERS_REQUIRED: Answer every question before submitting.");
}
