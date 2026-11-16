/** UI-only exam player contracts. Never source these from a sealed snapshot in the browser. */
export type ExamPlayerQuestion = {
  id: string;
  kind: "single_choice" | "multiple_choice" | "true_false" | "written";
  prompt: string;
  choices: ReadonlyArray<{ id: string; text: string }>;
  caseStudy?: {
    stem: string;
    media: ReadonlyArray<{ id: string; src: string; alt: string }>;
  };
};
export type PreviewAnswer = { choiceIds: string[]; text: string };
export type NavigatorStatus = "unanswered" | "answered" | "saved" | "flagged";

export function isPreviewAnswered(question: ExamPlayerQuestion, answer?: PreviewAnswer): boolean {
  return question.kind === "written"
    ? !!answer?.text.trim()
    : !!answer?.choiceIds.some(id => question.choices.some(choice => choice.id === id));
}

/** Flags/bookmarks are separate from answers; the grid displays the highest priority state. */
export function navigatorStatus(
  question: ExamPlayerQuestion,
  answer: PreviewAnswer | undefined,
  saved: boolean,
  flagged: boolean,
): NavigatorStatus {
  if (flagged) return "flagged";
  if (saved) return "saved";
  return isPreviewAnswered(question, answer) ? "answered" : "unanswered";
}

export function togglePreviewChoice(
  current: readonly string[],
  choiceId: string,
  multiple: boolean,
): string[] {
  if (!multiple) return [choiceId];
  return current.includes(choiceId)
    ? current.filter(id => id !== choiceId)
    : [...current, choiceId];
}
