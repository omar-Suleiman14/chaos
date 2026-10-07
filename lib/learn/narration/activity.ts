import type { Block } from "@/lib/learn/doc";

/** The activity a quiz or flashcards block reports when finished (same keys LessonReader stores). */
export function activityOf(block: Block): { activity: "quiz" | "flashcards"; key: string; required: boolean } | null {
  let props = block.props;
  try { if (props.lessonData) props = { ...props, ...JSON.parse(String(props.lessonData)) }; } catch { /* incomplete block */ }
  if (block.type === "flashcards" || block.type === "lessonFlashcards") return { activity: "flashcards", key: `flashcards:${props.setId}`, required: !!props.required };
  if (block.type === "quiz" || block.type === "lessonQuiz") {
    const asset = props.asset as { kind?: string; id?: string } | undefined;
    return { activity: "quiz", key: `${props.assetKind ?? asset?.kind}:${props.assetId ?? asset?.id}`, required: !!props.required };
  }
  return null;
}
