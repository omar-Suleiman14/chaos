import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { examAllocation } from "./examBuilderModel";
import type { BankDraft } from "./questionBankModel";

type Allocation = Infer<typeof examAllocation>;
type PublishedDefinition = Doc<"formVersions">["definition"];

/**
 * Convert only complete, published, answer-keyed quiz choices to private bank records.
 * Question order is matched to the exam's allocation order and counts.
 * Unsupported fields fail the whole import instead of silently dropping exam marks.
 */
export function preparePublishedQuizForExam(definition: PublishedDefinition, allocations: Allocation[]) {
  if (!definition.quiz?.enabled)
    throw new Error("VALIDATION_FAILED: The published source must be a graded quiz.");

  const slots = allocations.flatMap(allocation => Array.from({ length: allocation.count }, () => allocation));
  const questions = definition.fields.filter(field => field.type !== "section" && field.type !== "statement");
  if (questions.length !== slots.length || slots.length === 0 || slots.length > 100)
    throw new Error("QUESTION_COUNT_MISMATCH: Source quiz questions must match the complete exam plan.");

  return questions.map((field, index) => {
    const allocation = slots[index];
    if (allocation.kind !== "module" && allocation.kind !== "course")
      throw new Error("UNSUPPORTED_ALLOCATION: Quiz import supports module and whole-course allocations.");
    if (field.type !== "choice" && field.type !== "dropdown" && field.type !== "multi_choice")
      throw new Error("UNSUPPORTED_QUESTION: Import only choice-based quiz questions.");
    if (field.showIf || field.releasesAt !== undefined || field.image || field.quiz?.explanationImage ||
        field.options?.some(option => option.image))
      throw new Error("UNSUPPORTED_QUESTION: Conditional, timed-release and image questions need manual review.");

    const options = field.options ?? [];
    const choices = options.map((option, optionIndex) => ({ id: `choice_${optionIndex + 1}`, text: option.label }));
    const keys = new Map(options.map((option, optionIndex) => [option.id, `choice_${optionIndex + 1}`]));
    const sourceKeys = field.quiz?.correctOptionIds ?? [];
    if (!sourceKeys.length || sourceKeys.some(id => !keys.has(id)))
      throw new Error("MISSING_ANSWER_KEY: Every exam question needs a valid answer key.");
    const correctChoiceIds = sourceKeys.map(id => keys.get(id)!);
    const item: BankDraft = {
      kind: field.type === "multi_choice" ? "multiple_choice" : "single_choice",
      prompt: field.label,
      choices,
      correctChoiceIds,
      ...(field.quiz?.explanation ? { explanation: field.quiz.explanation } : {}),
      points: field.quiz?.points ?? 1,
      topics: [],
      terms: [],
      outcomes: [],
      status: "ready",
    };
    return { allocationId: allocation.id, moduleId: allocation.kind === "module" ? allocation.key : undefined, item };
  });
}
