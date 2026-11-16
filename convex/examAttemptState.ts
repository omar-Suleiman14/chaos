export type ExamAttemptState = "in_progress" | "submitted" | "expired" | "void";

/** Terminal states are never reopened; duplicate close requests are idempotent. */
export function transitionExamAttempt(current: ExamAttemptState, next: Exclude<ExamAttemptState, "in_progress">) {
  if (current === next) return false;
  if (current !== "in_progress")
    throw new Error("ATTEMPT_FINALIZED: A completed exam attempt cannot change state.");
  return true;
}
