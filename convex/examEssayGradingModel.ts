import type { ExamRubricCriterion } from "./examGradingModel";

export type CriterionMark = { criterionId: string; scorePercent: number };
export type EssayQuestion = {
  kind: string; points: number; rubricCriteria?: readonly ExamRubricCriterion[];
};

/** Scores are integer hundredths; rubric ratings are whole percentages. */
export function calculateEssayAward(
  question: EssayQuestion, marks: readonly CriterionMark[], holisticAwardCents?: number,
): number {
  if (question.kind !== "written" || !Number.isFinite(question.points) ||
      question.points <= 0 || question.points > 100 ||
      Math.abs(Math.round(question.points * 100) - question.points * 100) > 1e-7)
    throw new Error("INVALID_MARK: Written question weight is invalid.");
  const maximum = Math.round(question.points * 100);
  const rubric = question.rubricCriteria ?? [];
  if (!rubric.length) {
    if (marks.length || !Number.isSafeInteger(holisticAwardCents) ||
        holisticAwardCents! < 0 || holisticAwardCents! > maximum)
      throw new Error("INVALID_MARK: A holistic score in cents is required.");
    return holisticAwardCents!;
  }
  if (holisticAwardCents !== undefined || marks.length !== rubric.length ||
      rubric.length > 10 ||
      new Set(rubric.map(c => c.id)).size !== rubric.length ||
      rubric.reduce((n, c) => n + c.weightPercent, 0) !== 100 ||
      rubric.some(c => !Number.isSafeInteger(c.weightPercent) || c.weightPercent < 1))
    throw new Error("INVALID_MARK: Frozen rubric is inconsistent.");
  const supplied = new Map(marks.map(m => [m.criterionId, m.scorePercent]));
  if (supplied.size !== marks.length ||
      marks.some(m => !/^[a-zA-Z0-9_-]{1,40}$/.test(m.criterionId) ||
        !Number.isSafeInteger(m.scorePercent) || m.scorePercent < 0 || m.scorePercent > 100) ||
      rubric.some(c => !supplied.has(c.id)))
    throw new Error("INVALID_MARK: Every frozen criterion needs one 0–100 score.");
  const weighted = rubric.reduce((n, c) => n + c.weightPercent * supplied.get(c.id)!, 0);
  return Math.round(maximum * weighted / 10_000);
}

export function validateMarkFeedback(feedback: string) {
  if (typeof feedback !== "string" || feedback.length > 2000)
    throw new Error("INVALID_MARK: Feedback exceeds 2000 characters.");
}

export function finalEssayGrade(
  grade: {
    state: "auto_final" | "needs_manual";
    earnedCents: number; maximumCents: number; pendingWrittenCount: number;
    entries: readonly { questionIndex: number; status: "scored" | "needs_manual";
      pointsAvailableCents: number; pointsAwardedCents: number }[];
  },
  approved: readonly { questionIndex: number; pointsAwardedCents: number }[],
) {
  if (grade.state !== "needs_manual" || grade.pendingWrittenCount < 1 ||
      !Number.isSafeInteger(grade.maximumCents) || grade.maximumCents <= 0)
    throw new Error("GRADING_CONFLICT: No pending essay grading.");
  const marks = new Map(approved.map(m => [m.questionIndex, m.pointsAwardedCents]));
  if (marks.size !== approved.length) throw new Error("GRADING_CONFLICT: Duplicate essay marks.");
  let additions = 0;
  const entries = grade.entries.map(e => {
    if (e.status !== "needs_manual") {
      if (marks.has(e.questionIndex)) throw new Error("GRADING_CONFLICT: Unexpected essay score.");
      return e;
    }
    const score = marks.get(e.questionIndex);
    if (!Number.isSafeInteger(score) || score! < 0 || score! > e.pointsAvailableCents)
      throw new Error("GRADING_CONFLICT: Missing or invalid approved mark.");
    additions += score!;
    return { ...e, status: "scored" as const, pointsAwardedCents: score! };
  });
  if (approved.length !== grade.pendingWrittenCount ||
      entries.some(e => e.status === "needs_manual"))
    throw new Error("GRADING_CONFLICT: All essays require approval.");
  const earnedCents = grade.earnedCents + additions;
  return { entries, earnedCents, pendingWrittenCount: 0,
    state: "auto_final" as const,
    finalPercentBasisPoints: Math.round(Math.max(0, earnedCents) * 10_000 / grade.maximumCents) };
}
