import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition, type FormDefinition } from "@/convex/formLogic";
import type { LessonBlock, LessonDocument } from "@/convex/learnModel";
import { themeFromPreset, themePresets } from "@/components/forms/formThemes";

/**
 * Deterministic content generators shared by backend (convex-test) and
 * client (jsdom) perf suites. No backend imports here.
 */
type FieldOptions = { conditional?: boolean; sections?: boolean; images?: boolean; quiz?: boolean };

export function formFields(count: number, options: FieldOptions = {}): FormDefinition["fields"] {
  const fields: FormDefinition["fields"] = [];
  for (let i = 0; i < count; i++) {
    const id = `q${i}`;
    if (options.sections && i > 0 && i % 10 === 0) fields.push({ id: `s${i}`, type: "section", label: `Part ${i / 10 + 1}`, required: false });
    const showIf = options.conditional && i >= 4 && i % 4 === 0
      ? { match: "all" as const, conditions: [{ fieldId: `q${i - 4}`, op: "equals" as const, value: "a" }] }
      : undefined;
    const imageUrl = options.images && i % 3 === 0 ? `https://images.example.com/perf/${i}.jpg` : undefined;
    const base = { id, label: `Question ${i + 1}: describe the mechanism in your own words`, required: i % 2 === 0, ...(showIf ? { showIf } : {}), ...(imageUrl ? { imageUrl } : {}) };
    switch (i % 5) {
      case 0: case 1:
        fields.push({ ...base, type: i % 5 === 0 ? "choice" : "multi_choice", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }, { id: "d", label: "Delta" }],
          ...(options.quiz ? { quiz: { correctOptionIds: ["a"], points: 1 } } : {}) });
        break;
      case 2: fields.push({ ...base, type: "text" }); break;
      case 3: fields.push({ ...base, type: "rating", max: 5 }); break;
      default: fields.push({ ...base, type: "textarea" });
    }
  }
  return fields;
}

export function formDefinition(title: string, count: number, options: FieldOptions & { theme?: boolean } = {}): FormDefinition {
  const def = emptyDefinition(title);
  def.fields = formFields(count, options);
  if (options.sections) def.presentation = "sections";
  if (options.theme) def.theme = themeFromPreset(themePresets[themePresets.length - 1].id);
  return def;
}

const prose = (i: number) => `Paragraph ${i}. The baroreceptor reflex buffers short-term changes in arterial pressure by adjusting heart rate, contractility and vascular tone through autonomic outflow.`;

/** A lesson mixing every block kind that needs no uploaded source. Quiz embeds use `quizFormId` when given. */
export function lessonBlocks(count: number, opts: { quizFormId?: Id<"forms">; prefix?: string } = {}): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  for (let i = 0; i < count; i++) {
    const c = { id: `${opts.prefix ?? "b"}${i}`, citations: [], conceptIds: [] };
    switch (i % 10) {
      case 0: blocks.push({ ...c, type: "heading", level: 2, text: `Section ${i / 10 + 1}` }); break;
      case 1: case 2: case 5: blocks.push({ ...c, type: "paragraph", text: prose(i) }); break;
      case 3: blocks.push({ ...c, type: "table", headerRows: 1, rows: [["Receptor", "Location", "Effect"], ["α1", "Vessels", "Constriction"], ["β1", "Heart", "Rate up"], ["M2", "SA node", "Rate down"]] }); break;
      case 4: blocks.push({ ...c, type: "toggle", text: `Why does pressure fall on standing? (${i})` }); break;
      case 6: blocks.push({ ...c, type: "diagram", format: "mermaid", text: "graph LR; A[Stretch] --> B[NTS]; B --> C[Vagal outflow]" }); break;
      case 7: blocks.push({ ...c, type: "youtube", videoId: "dQw4w9WgXcQ", caption: `Video ${i}` }); break;
      case 8: blocks.push(opts.quizFormId ? { ...c, type: "quiz", asset: { kind: "form", id: opts.quizFormId } } : { ...c, type: "callout", tone: "key", text: `Key point ${i}` }); break;
      default: blocks.push({ ...c, type: "list", style: "bullet", text: `Item ${i}` });
    }
  }
  return blocks;
}

export const lessonDoc = (count: number, opts?: Parameters<typeof lessonBlocks>[1]): LessonDocument => ({ schemaVersion: 1, blocks: lessonBlocks(count, opts) });
export const lessonMeta = (title: string) => ({ title, description: `${title}, perf fixture`, language: "en", tags: ["perf"] });
