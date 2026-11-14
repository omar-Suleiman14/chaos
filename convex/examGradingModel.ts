import { v, type Infer } from "convex/values";

/** Frozen on the sealed snapshot. A blank and a wrong response are distinct policies. */
export const examMarkingPolicy = v.object({
  mode: v.union(v.literal("exact"), v.literal("partial")),
  incorrectPenalty: v.number(),
  blankPenalty: v.number(),
});
export type ExamMarkingPolicy = Infer<typeof examMarkingPolicy>;

export const examRubricCriterion = v.object({
  id: v.string(),
  description: v.string(),
  weightPercent: v.number(),
});
export type ExamRubricCriterion = Infer<typeof examRubricCriterion>;

const cents = (n: number) => Math.round(n * 100);
function validMoney(n: number, low: number, high: number) {
  return Number.isFinite(n) && n >= low && n <= high &&
    Math.abs(n * 100 - cents(n)) < 1e-7;
}
export function validateExamMarking(marking: ExamMarkingPolicy | undefined, points: number) {
  if (!validMoney(points, 0.01, 100)) throw new Error("INVALID_GRADING: Invalid question weight.");
  if (!marking) return;
  if (!["exact", "partial"].includes(marking.mode) ||
    !validMoney(marking.incorrectPenalty, 0, points) ||
    !validMoney(marking.blankPenalty, 0, points))
    throw new Error("INVALID_GRADING: Penalties must be 0–question points, in 0.01 increments.");
}
export function validateExamRubric(rubric: readonly ExamRubricCriterion[] | undefined, kind: string) {
  if (rubric === undefined) return;
  if (kind !== "written" || rubric.length < 1 || rubric.length > 10 ||
    rubric.some(c => !/^[a-zA-Z0-9_-]{1,40}$/.test(c.id) ||
      !c.description.trim() || c.description.length > 300 ||
      !Number.isSafeInteger(c.weightPercent) || c.weightPercent < 1 || c.weightPercent > 100) ||
    new Set(rubric.map(c => c.id)).size !== rubric.length ||
    rubric.reduce((sum, c) => sum + c.weightPercent, 0) !== 100)
    throw new Error("INVALID_RUBRIC: Written rubric requires 1–10 unique criteria totaling 100%.");
}

export type FrozenGradingQuestion = {
  kind: "single_choice" | "multiple_choice" | "true_false" | "written";
  choices: readonly { id: string }[];
  correctChoiceIds: readonly string[];
  points: number;
  marking?: ExamMarkingPolicy;
  rubricCriteria?: readonly ExamRubricCriterion[];
};
export type FrozenGradingAnswer = {
  questionIndex: number;
  choiceIds: readonly string[];
  text: string;
};

export function gradeFrozenExam(
  questions: readonly FrozenGradingQuestion[],
  answers: readonly FrozenGradingAnswer[],
) {
  if (!questions.length || questions.length > 100 || answers.length > questions.length)
    throw new Error("INVALID_GRADING: Invalid snapshot or answer count.");
  const byIndex = new Map<number, FrozenGradingAnswer>();
  for (const a of answers) {
    if (!Number.isSafeInteger(a.questionIndex) || a.questionIndex < 0 ||
      a.questionIndex >= questions.length || byIndex.has(a.questionIndex))
      throw new Error("INVALID_GRADING: Duplicate or out-of-range answer.");
    byIndex.set(a.questionIndex, a);
  }
  let earnedCents = 0;
  let objectiveMaximumCents = 0;
  let maximumCents = 0;
  let pendingWrittenCount = 0;
  const entries = questions.map((q, questionIndex) => {
    validateExamMarking(q.marking, q.points);
    validateExamRubric(q.rubricCriteria, q.kind);
    const available = cents(q.points);
    maximumCents += available;
    const a = byIndex.get(questionIndex);
    if (q.kind === "written") {
      if (q.correctChoiceIds.length || q.choices.length || (a && a.choiceIds.length))
        throw new Error("INVALID_GRADING: Written question data is malformed.");
      if (!a?.text.trim()) return {
        questionIndex, status: "scored" as const, pointsAvailableCents: available,
        pointsAwardedCents: 0,
      };
      pendingWrittenCount++;
      return {
        questionIndex, status: "needs_manual" as const, pointsAvailableCents: available,
        pointsAwardedCents: 0,
      };
    }
    objectiveMaximumCents += available;
    const validIds = q.kind === "true_false"
      ? ["true", "false"] : q.choices.map(c => c.id);
    const key = new Set(q.correctChoiceIds);
    const selection = a?.choiceIds ?? [];
    if (q.correctChoiceIds.length === 0 || key.size !== q.correctChoiceIds.length ||
      [...key].some(id => !validIds.includes(id)) ||
      (q.kind !== "multiple_choice" && key.size !== 1) ||
      (a && a.text !== "") ||
      selection.length > validIds.length || new Set(selection).size !== selection.length ||
      selection.some(id => !validIds.includes(id)) ||
      (q.kind !== "multiple_choice" && selection.length > 1))
      throw new Error("INVALID_GRADING: Invalid frozen answer/key pairing.");
    const wrongOptions = validIds.length - key.size;
    if (wrongOptions < 0) throw new Error("INVALID_GRADING: Invalid answer key.");
    const penaltyWrong = cents(q.marking?.incorrectPenalty ?? 0);
    const penaltyBlank = cents(q.marking?.blankPenalty ?? 0);
    let awarded = 0;
    if (!selection.length) {
      awarded = -penaltyBlank;
    } else if (selection.length === key.size && selection.every(id => key.has(id))) {
      awarded = available;
    } else if (q.kind === "multiple_choice" && q.marking?.mode === "partial") {
      const matched = selection.filter(id => key.has(id)).length;
      const incorrect = selection.length - matched;
      const fraction = matched / key.size - (wrongOptions ? incorrect / wrongOptions : 0);
      awarded = Math.max(0, Math.min(available, Math.round(available * fraction)));
      if (awarded === 0) awarded = -penaltyWrong;
    } else {
      awarded = -penaltyWrong;
    }
    earnedCents += awarded;
    return {
      questionIndex, status: "scored" as const, pointsAvailableCents: available,
      pointsAwardedCents: awarded,
    };
  });
  return {
    state: pendingWrittenCount ? "needs_manual" as const : "auto_final" as const,
    earnedCents, maximumCents, objectiveMaximumCents,
    pendingWrittenCount, entries,
    /** Never publish a percentage for a partly marked written exam. */
    finalPercentBasisPoints: pendingWrittenCount ? undefined
      : Math.round(Math.max(0, earnedCents) * 10_000 / maximumCents),
  };
}
