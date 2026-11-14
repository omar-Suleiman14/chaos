/** Strict, key-free answer input validation shared by server writes and tests. */
export type AnswerableQuestion = {
  kind: "single_choice" | "multiple_choice" | "true_false" | "written";
  choices: ReadonlyArray<{ id: string }>;
};

export function normalizeExamAnswer(question: AnswerableQuestion,
  choiceIds: readonly string[], text: string,
) {
  if (typeof text !== "string" || text.length > 4_000)
    throw new Error("INVALID_ANSWER: Written response exceeds 4,000 characters.");
  if (choiceIds.length > 50 || new Set(choiceIds).size !== choiceIds.length)
    throw new Error("INVALID_ANSWER: Duplicate or excessive selections.");
  if (question.kind === "written") {
    if (choiceIds.length) throw new Error("INVALID_ANSWER: Written questions do not accept choices.");
    return { choiceIds: [] as string[], text };
  }
  if (text !== "") throw new Error("INVALID_ANSWER: Choice questions do not accept written text.");
  const valid = new Set(question.choices.map(choice => choice.id));
  if (choiceIds.some(id => !valid.has(id)) ||
      (question.kind !== "multiple_choice" && choiceIds.length > 1))
    throw new Error("INVALID_ANSWER: Selection does not match the frozen question.");
  return { choiceIds: [...choiceIds], text: "" };
}

/** Reusing an idempotency token for different content is never a valid retry. */
export function sameExamAnswer(a: {
  choiceIds: readonly string[]; text: string; flagged: boolean; savedForLater: boolean;
}, b: {
  choiceIds: readonly string[]; text: string; flagged: boolean; savedForLater: boolean;
}) {
  return a.text === b.text && a.flagged === b.flagged &&
    a.savedForLater === b.savedForLater &&
    a.choiceIds.length === b.choiceIds.length &&
    a.choiceIds.every((id, i) => id === b.choiceIds[i]);
}
