import { answerText, isAnswerable } from "./formLogic";
import type { Answers, FormDefinition } from "./formLogic";

/** Small privacy-preserving response preview for the creator's results list. */
export function responsePreview(def: FormDefinition | null, answers: Answers): string {
  if (!def) return "";
  const parts: string[] = [];
  for (const f of def.fields) {
    if (!isAnswerable(f) || f.type === "file") continue;
    const text = answerText(f, answers[f.id]);
    if (text) parts.push(text);
    if (parts.length === 3) break;
  }
  return parts.join(" · ").slice(0, 200);
}
