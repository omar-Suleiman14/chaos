import type { Answers, FormDefinition, FormField } from "./formLogic";
import { visibleFieldIds } from "./formLogic";
import { sameSet } from "./grading";

export interface QuizGrade {
  score: number;
  maxScore: number;
  questions: { fieldId: string; earned: number; possible: number }[];
}

/**
 * Whether chosen option ids earn the marks of a quiz question. Option ids are compared exactly.
 * Single choice and dropdown take one id; checkboxes an exact set. Live games use this too.
 */
export function choiceIsCorrect(field: Pick<FormField, "type" | "quiz">, chosen: string[]): boolean {
  const correct = field.quiz?.correctOptionIds ?? [];
  if (!correct.length) return false;
  const exact = (x: string) => x;
  return field.type === "multi_choice" ? sameSet(chosen, correct, exact) : chosen.length === 1 && chosen[0] === correct[0];
}

/** Grade against the immutable published definition, never client-supplied keys. */
export function gradeQuiz(def: FormDefinition, answers: Answers): QuizGrade | null {
  if (!def.quiz?.enabled) return null;
  const visible = visibleFieldIds(def, answers);
  const questions: QuizGrade["questions"] = [];
  for (const field of def.fields) {
    if (!visible.has(field.id) || !field.quiz?.correctOptionIds.length) continue;
    const possible = field.quiz.points;
    const actual = answers[field.id];
    const chosen = Array.isArray(actual) ? actual.filter((x): x is string => typeof x === "string") : typeof actual === "string" ? [actual] : [];
    const matches = choiceIsCorrect(field, chosen);
    const earned = matches && Number.isFinite(possible) ? Math.max(0, possible) : 0;
    questions.push({ fieldId: field.id, earned, possible });
  }
  return {
    score: questions.reduce((sum, q) => sum + q.earned, 0),
    maxScore: questions.reduce((sum, q) => sum + q.possible, 0),
    questions,
  };
}

/** One graded question as the respondent sees it once they have submitted: marks, the key and why. */
export interface QuizReviewItem { fieldId: string; earned: number; possible: number; correctOptionIds: string[]; explanation?: string }

/**
 * What the respondent got right and wrong, returned only with their own submission so they can learn
 * from it. Never part of the public form: the key is revealed after the answers are in, not before.
 * When the creator turns "Show answers after submitting" off, only marks are returned: no key, no explanation.
 */
export function quizReview(def: FormDefinition, grade: QuizGrade | null): QuizReviewItem[] | null {
  if (!grade) return null;
  const reveal = showsAnswers(def);
  const byId = new Map(def.fields.map((f) => [f.id, f]));
  return grade.questions.map((q) => {
    const quiz = byId.get(q.fieldId)?.quiz;
    if (!reveal) return { fieldId: q.fieldId, earned: q.earned, possible: q.possible, correctOptionIds: [] };
    return { fieldId: q.fieldId, earned: q.earned, possible: q.possible, correctOptionIds: quiz?.correctOptionIds ?? [], ...(quiz?.explanation ? { explanation: quiz.explanation } : {}) };
  });
}

/** Whether respondents see the answer key after submitting. On unless the creator turned it off. */
export function showsAnswers(def: Pick<FormDefinition, "quiz">): boolean {
  return def.quiz?.showAnswers !== false;
}

/** The public form and edit link must never contain answer keys or option scores. */
export function publicQuizDefinition(def: FormDefinition): FormDefinition {
  return {
    ...def,
    fields: def.fields.map((field) => {
      const clean = { ...field };
      delete clean.quiz;
      if (def.quiz?.enabled && clean.options) {
        clean.options = clean.options.map((option) => {
          const copy = { ...option };
          delete copy.score;
          return copy;
        });
      }
      return clean;
    }),
  };
}
