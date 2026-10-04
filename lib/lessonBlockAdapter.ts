import { z } from "zod";
import type { Id } from "../convex/_generated/dataModel";
import type { LessonDocument } from "../convex/learnModel";
import { validateDocument } from "../convex/learnValidation";

/** UI contract: register these custom blocks and preserve the lesson* props on native blocks. */
export const LESSON_CUSTOM_BLOCK_TYPES = [
  "lessonImage",
  "lessonSource",
  "lessonDiagram",
  "lessonYoutube",
  "lessonEquation",
  "lessonTable",
  "lessonQuiz", "lessonFlashcards", "flashcards",
  "image", "source", "diagram", "youtube", "equation", "table", "quiz",
] as const;
export type LessonEditorInline = { type: "text"; text: string; styles?: Record<string, string | boolean> } | { type: "link"; href: string; content: { type: "text"; text: string; styles?: Record<string, string | boolean> }[] };
export interface LessonEditorBlock {
  id: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content?: string | LessonEditorInline[];
  children: LessonEditorBlock[];
}
export interface LessonAdapterProblem {
  code: "invalid" | "unsupported" | "formatting" | "limit";
  path: string;
  message: string;
}
export type LessonAdapterResult<T> =
  | { ok: true; value: T; problems: [] }
  | { ok: false; problems: LessonAdapterProblem[] };
const str = z.string().max(20_000);
const id = z.string().min(1).max(200);
const sourceId = id.transform((value) => value as Id<"learnSources">);
const time = z.number().finite().nonnegative();
const citation = z.strictObject({
  sourceId,
  locator: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("page"),
      page: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal("slide"),
      slide: z.number().int().positive(),
    }),
    z
      .strictObject({
        kind: z.literal("time"),
        start: time,
        end: time.optional(),
      })
      .refine((v) => v.end === undefined || v.end > v.start),
    z.strictObject({ kind: z.literal("section"), label: str }),
  ]),
});
const marks = z.strictObject({ bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(), strike: z.boolean().optional(), code: z.boolean().optional(), textColor: str.optional(), backgroundColor: str.optional() });
const inline = z.array(z.strictObject({ text: str, marks: marks.optional(), href: str.optional() })).max(1000);
const presentation = z.strictObject({ alignment: z.enum(["left", "center", "right", "justify"]).optional(), textColor: str.optional(), backgroundColor: str.optional() });
const annotations = z.strictObject({ v: z.literal(1), items: z.array(z.strictObject({ id, x: z.number(), y: z.number(), w: z.number().optional(), h: z.number().optional(), label: str, body: str.optional() })).max(100) });
const common = {
  id,
  parentId: id.optional(),
  presentation: presentation.optional(),
  citations: z.array(citation).max(50),
  conceptIds: z.array(id).max(500),
};
const text = { ...common, text: str, inline: inline.optional() };
const blockSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...common, type: z.literal("flashcards"), setId: id.transform(v => v as Id<"flashcardSets">) }),
  z.strictObject({ ...text, type: z.literal("callout"), tone: z.enum(["info", "tip", "warning", "clinical", "key"]) }),
  z.strictObject({ ...text, type: z.literal("code"), language: str }),
  z.strictObject({ ...text, type: z.literal("quote") }),
  z.strictObject({ ...text, type: z.literal("toggle") }),
  z.strictObject({ ...common, type: z.literal("divider") }),
  z.strictObject({ ...text, type: z.literal("paragraph") }),
  z.strictObject({
    ...text,
    type: z.literal("heading"),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({
    ...text,
    type: z.literal("list"),
    style: z.enum(["bullet", "number", "check"]),
    checked: z.boolean().optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal("image"),
    sourceId,
    alt: str,
    name: str.optional(), previewWidth: z.number().finite().positive().max(10000).optional(), showPreview: z.boolean().optional(), credit: str.optional(), creditUrl: str.optional(), figureKind: z.enum(["photo", "diagram"]).optional(), annotations: annotations.optional(),
    caption: str,
  }),
  z.strictObject({
    ...text,
    type: z.literal("diagram"),
    format: z.literal("mermaid"),
  }),
  z
    .strictObject({
      ...common,
      type: z.literal("youtube"),
      videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
      start: time.optional(),
      end: time.optional(),
      caption: str,
    })
    .refine((v) => v.end === undefined || v.end >= (v.start ?? 0)),
  z.strictObject({
    ...text,
    type: z.literal("equation"),
    display: z.boolean(),
  }),
  z
    .strictObject({
      ...common,
      type: z.literal("table"),
      rows: z.array(z.array(str).min(1).max(100)).min(1).max(500),
      headerRows: z.number().int().nonnegative(),
    })
    .refine(
      (v) =>
        v.headerRows <= v.rows.length &&
        v.rows.every((r) => r.length === v.rows[0].length),
      "Use rectangular rows and a header count within the table.",
    ),
  z.strictObject({
    ...common,
    type: z.literal("source"),
    sourceId,
    label: str,
  }),
  z.strictObject({
    ...common,
    type: z.literal("quiz"),
    asset: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("form"),
        id: id.transform((v) => v as Id<"forms">),
      }),
      z.strictObject({
        kind: z.literal("quiz"),
        id: id.transform((v) => v as Id<"quizzes">),
      }),
    ]),
  }),
]);
const documentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  blocks: z.array(blockSchema).max(500),
});
const nativeTypes = {
  paragraph: "paragraph",
  heading: "heading",
  bulletListItem: "bullet",
  numberedListItem: "number",
  checkListItem: "check",
  callout: "callout", codeBlock: "code", quote: "quote", toggleListItem: "toggle", divider: "divider",
} as const;
const customFields: Record<string, string[]> = {
  image: ["sourceId", "alt", "caption", "credit", "creditUrl", "figureKind", "annotations", "name", "showPreview", "previewWidth"],
  youtube: ["videoId", "start", "end", "caption"],
  equation: ["text", "display"], source: ["sourceId", "label"],
  diagram: ["format", "text"], table: ["headerRows"], quiz: [], flashcards: ["setId"],
};
const customTypes: Record<string, string> = {
  lessonImage: "image",
  lessonSource: "source",
  lessonDiagram: "diagram",
  lessonYoutube: "youtube",
  lessonEquation: "equation",
  lessonTable: "table",
  lessonQuiz: "quiz",
  lessonFlashcards: "flashcards", flashcards: "flashcards",
  image: "image", source: "source", diagram: "diagram", youtube: "youtube", equation: "equation", table: "table", quiz: "quiz",
};
function problem(
  path: string,
  message: string,
  code: LessonAdapterProblem["code"] = "invalid",
): LessonAdapterProblem {
  return { code, path, message };
}
function bounded(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= 300_000;
  } catch {
    return false;
  }
}
export function validateLessonDocument(value: unknown): LessonAdapterResult<LessonDocument> {
  if (!bounded(value))
    return {
      ok: false,
      problems: [
        problem(
          "document",
          "Document must be JSON and at most 300000 bytes.",
          "limit",
        ),
      ],
    };
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map((i) =>
        problem(i.path.join("."), i.message),
      ),
    };
  const blocks = parsed.data.blocks;
  const map = new Map(blocks.map((b) => [b.id, b]));
  const problems: LessonAdapterProblem[] = validateDocument(parsed.data).map(p => problem(p.path, p.message, p.code === "LIMIT" ? "limit" : "invalid"));
  if (map.size !== blocks.length)
    problems.push(problem("blocks", "Block IDs must be unique."));
  for (const block of blocks) {
    const visited = new Set([block.id]);
    let parent = block.parentId;
    while (parent !== undefined) {
      if (visited.has(parent)) {
        problems.push(problem(block.id, "Parent links contain a cycle."));
        break;
      }
      visited.add(parent);
      const next = map.get(parent);
      if (!next) {
        problems.push(problem(block.id, `Missing parent ${parent}.`));
        break;
      }
      parent = next.parentId;
    }
  }
  return problems.length
    ? { ok: false, problems }
    : { ok: true, value: parsed.data, problems: [] };
}
export function lessonDocumentToEditorBlocks(
  document: LessonDocument,
): LessonAdapterResult<LessonEditorBlock[]> {
  const result = validateLessonDocument(document);
  if (!result.ok) return result;
  const nodes = new Map<string, LessonEditorBlock>();
  result.value.blocks.forEach((block, index) => {
    const {
      id,
      parentId: _parent,
      citations,
      conceptIds,
      type,
      presentation,
      ...data
    } = block;
    const props: LessonEditorBlock["props"] = {
      lessonCitations: JSON.stringify(citations),
      lessonConceptIds: JSON.stringify(conceptIds),
      lessonOrder: index,
    };
    let editorType: string = type;
    if (presentation) {
      props.lessonPresentation = JSON.stringify(presentation);
      if (presentation.alignment) props.textAlignment = presentation.alignment;
      if (presentation.textColor) props.textColor = presentation.textColor;
      if (presentation.backgroundColor) props.backgroundColor = presentation.backgroundColor;
    }
    if ("inline" in block && block.inline !== undefined) props.lessonInline = true;
    let content: LessonEditorBlock["content"];
    if (type === "paragraph" || type === "heading" || type === "list" || type === "callout" || type === "code" || type === "quote" || type === "toggle") {
      content = block.inline ? block.inline.map(run => run.href ? { type: "link" as const, href: run.href, content: [{ type: "text" as const, text: run.text, ...(run.marks ? { styles: run.marks } : {}) }] } : { type: "text" as const, text: run.text, ...(run.marks ? { styles: run.marks } : {}) }) : block.text;
      if (block.type === "callout") props.tone = block.tone;
      if (block.type === "code") { editorType = "codeBlock"; props.language = block.language; }
      if (block.type === "toggle") editorType = "toggleListItem";
      if (block.type === "heading") props.level = block.level;
      if (block.type === "list") {
        editorType = {
          bullet: "bulletListItem",
          number: "numberedListItem",
          check: "checkListItem",
        }[block.style];
        if (block.checked !== undefined) props.checked = block.checked;
      }
    } else if (type === "divider") {
      editorType = "divider";
    } else {
      editorType = type;
      props.lessonData = JSON.stringify(data);
      for (const [key, value] of Object.entries(data)) if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") props[key] = value;
      if (block.type === "image" && block.annotations) props.annotations = JSON.stringify(block.annotations);
      if (block.type === "equation") content = block.inline ? block.inline.map(r => ({ type: "text" as const, text: r.text, ...(r.marks ? { styles: r.marks } : {}) })) : block.text;
    }
    nodes.set(id, {
      id,
      type: editorType,
      props,
      ...(content === undefined ? {} : { content }),
      children: [],
    });
  });
  const roots: LessonEditorBlock[] = [];
  result.value.blocks.forEach((b) => {
    const node = nodes.get(b.id)!;
    if (b.parentId) nodes.get(b.parentId)!.children.push(node);
    else roots.push(node);
  });
  return { ok: true, value: roots, problems: [] };
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** Accepts untrusted editor JSON; never returns a partial document when data would be lost. */
export function editorBlocksToLessonDocument(
  input: unknown,
  options: { imageSourceId?: (url: string) => string | undefined } = {},
): LessonAdapterResult<LessonDocument> {
  const problems: LessonAdapterProblem[] = [];
  if (!bounded(input) || !Array.isArray(input))
    return {
      ok: false,
      problems: [
        problem(
          "blocks",
          "Supply a JSON block array of at most 300000 bytes.",
          "limit",
        ),
      ],
    };
  const blocks: unknown[] = [];
  const orders: (number | undefined)[] = [];
  let count = 0;
  function json(value: unknown, fallback: unknown): unknown {
    if (value === undefined) return fallback;
    if (typeof value !== "string")
      throw new Error("Metadata props must be JSON strings.");
    return JSON.parse(value);
  }
  function rich(content: unknown, path: string): { text: string; inline?: { text: string; marks?: z.infer<typeof marks>; href?: string }[] } {
    if (typeof content === "string") return { text: content };
    if (content === undefined) return { text: "" };
    const runs: { text: string; marks?: z.infer<typeof marks>; href?: string }[] = [];
    if (!Array.isArray(content)) { problems.push(problem(path, "Unsupported inline content.", "formatting")); return { text: "" }; }
    for (const item of content) {
      const linked = record(item) && item.type === "link";
      const children = linked ? item.content : [item];
      if (!record(item) || (linked && (typeof item.href !== "string" || Object.keys(item).some(k => !["type", "href", "content"].includes(k)))) || !Array.isArray(children)) {
        problems.push(problem(path, "Unsupported inline content.", "formatting")); continue;
      }
      for (const child of children) {
        const parsed = record(child) ? marks.safeParse(child.styles ?? {}) : null;
        if (!record(child) || child.type !== "text" || typeof child.text !== "string" || Object.keys(child).some(k => !["type", "text", "styles"].includes(k)) || !parsed?.success) {
          problems.push(problem(path, "Unsupported inline marks or content.", "formatting")); continue;
        }
        runs.push({ text: child.text, ...(Object.keys(parsed.data).length ? { marks: parsed.data } : {}), ...(linked ? { href: item.href as string } : {}) });
      }
    }
    const text = runs.map(r => r.text).join("");
    return { text, ...(runs.some(r => r.marks || r.href) ? { inline: runs } : {}) };
  }
  function walk(items: unknown[], parentId?: string, depth = 0) {
    if (depth > 100) {
      problems.push(
        problem("children", "Nesting exceeds 100 levels.", "limit"),
      );
      return;
    }
    for (const item of items) {
      if (++count > 500) {
        problems.push(
          problem("blocks", "At most 500 blocks are supported.", "limit"),
        );
        return;
      }
      const path = `blocks.${count - 1}`;
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        typeof item.type !== "string" ||
        (item.props !== undefined && !record(item.props))
      ) {
        problems.push(
          problem(path, "Block requires a string id/type and object props."),
        );
        continue;
      }
      if (
        Object.keys(item).some(
          (k) => !["id", "type", "props", "content", "children"].includes(k),
        )
      )
        problems.push(
          problem(
            path,
            "Unknown block fields cannot be preserved.",
            "unsupported",
          ),
        );
      const props = record(item.props) ? item.props : {};
      const native = Object.prototype.hasOwnProperty.call(
        nativeTypes,
        item.type,
      );
      const custom = Object.prototype.hasOwnProperty.call(
        customTypes,
        item.type,
      );
      if (!native && !custom) {
        problems.push(
          problem(
            path,
            `Unsupported block type ${item.type}; use a supported lesson block.`,
            "unsupported",
          ),
        );
        continue;
      }
      const allowed = [
        "textAlignment",
        "textColor",
        "backgroundColor",
        "lessonCitations",
        "lessonConceptIds",
        "lessonOrder", "lessonPresentation", "lessonInline",
        ...(item.type === "callout" ? ["tone"] : item.type === "codeBlock" ? ["language"] : []),
        ...(custom
          ? ["lessonData", ...customFields[customTypes[item.type]], ...(item.type === "image" ? ["url"] : item.type === "source" ? ["locator"] : [])]
          : item.type === "heading"
            ? ["level"]
            : item.type.endsWith("ListItem")
              ? ["checked"]
              : []),
      ];
      for (const key of Object.keys(props))
        if (!allowed.includes(key))
          problems.push(
            problem(
              `${path}.props.${key}`,
              "Unsupported prop; remove it or add a lossless schema mapping.",
              "unsupported",
            ),
          );
      try {
        const formatting = { ...(props.textAlignment !== undefined && props.textAlignment !== "left" ? { alignment: props.textAlignment } : {}), ...(props.textColor !== undefined && props.textColor !== "default" ? { textColor: props.textColor } : {}), ...(props.backgroundColor !== undefined && props.backgroundColor !== "default" ? { backgroundColor: props.backgroundColor } : {}) };
        const base = {
          ...(props.lessonPresentation !== undefined ? { presentation: { ...json(props.lessonPresentation, {} ) as object, ...formatting } } : Object.keys(formatting).length ? { presentation: formatting } : {}),
          id: item.id,
          ...(parentId === undefined ? {} : { parentId }),
          citations: json(props.lessonCitations, []),
          conceptIds: json(props.lessonConceptIds, []),
        };
        if (custom) {
          let data = json(props.lessonData, undefined);
          if (data === undefined) {
            switch (item.type) {
              case "image": data = { sourceId: props.sourceId ?? options.imageSourceId?.(String(props.url ?? "")), alt: props.alt ?? "", caption: props.caption ?? "", ...(props.credit === undefined ? {} : { credit: props.credit }), ...(props.creditUrl === undefined ? {} : { creditUrl: props.creditUrl }), ...(props.figureKind === undefined ? {} : { figureKind: props.figureKind }), ...(props.annotations ? { annotations: json(props.annotations, undefined) } : {}) }; break;
              case "youtube": data = { videoId: props.videoId, caption: props.caption ?? "", ...(props.start === undefined ? {} : { start: props.start }), ...(props.end ? { end: props.end } : {}) }; break;
              case "equation": data = { ...rich(item.content, path), display: props.display ?? true }; break;
              case "source": data = { sourceId: props.sourceId, label: props.label ?? props.locator ?? "" }; break;
              default: throw new Error("Structured block requires lessonData.");
            }
          }
          if (
            !record(data) ||
            ["id", "parentId", "type", "citations", "conceptIds"].some(
              (k) => k in data,
            )
          )
            throw new Error(
              "Custom block requires lessonData containing only its variant fields.",
            );
          if (item.content !== undefined && item.type !== "equation")
            problems.push(
              problem(
                path,
                "Custom blocks store content in lessonData; content cannot be preserved.",
                "unsupported",
              ),
            );
          if (item.type === "image" && props.url && !options.imageSourceId) throw new Error("Image URLs require an authorized source resolver.");
          if (item.type === "image" && props.url && options.imageSourceId) {
            const resolved = options.imageSourceId(String(props.url));
            if (!resolved) throw new Error("Upload or select an authorized image source.");
            data.sourceId = resolved;
          }
          if (!item.type.startsWith("lesson")) {
            for (const key of customFields[customTypes[item.type]]) if (props[key] !== undefined && key !== "annotations") data[key] = props[key];
            if (item.type === "image" && props.annotations !== undefined) data.annotations = props.annotations === "" ? undefined : json(props.annotations, undefined);
            if (item.type === "equation" && item.content !== undefined) Object.assign(data, rich(item.content, path));
          }
          blocks.push({ ...data, ...base, type: customTypes[item.type] });
        } else {
          const content = rich(item.content, `${path}.content`);
          if (props.lessonInline && !content.inline) content.inline = Array.isArray(item.content) ? item.content.filter(record).map(r => ({ text: String(r.text ?? "") })) : [{ text: content.text }];
          if (item.type === "divider" && content.text) problems.push(problem(path, "Divider cannot hold content.", "unsupported"));
          blocks.push(
            item.type === "divider" ? { ...base, type: "divider" }
              : item.type === "callout" ? { ...base, type: "callout", ...content, tone: props.tone ?? "info" }
              : item.type === "codeBlock" ? { ...base, type: "code", ...content, language: props.language ?? "" }
              : item.type === "quote" || item.type === "toggleListItem" ? { ...base, type: item.type === "quote" ? "quote" : "toggle", ...content }
              : item.type === "paragraph"
              ? { ...base, type: "paragraph", ...content }
              : item.type === "heading"
                ? {
                    ...base,
                    type: "heading",
                    ...content,
                    level: props.level ?? 1,
                  }
                : {
                    ...base,
                    type: "list",
                    ...content,
                    style: nativeTypes[item.type as keyof typeof nativeTypes],
                    ...(props.checked === undefined
                      ? {}
                      : { checked: props.checked }),
                  },
          );
        }
        const order = props.lessonOrder;
        if (
          order !== undefined &&
          (typeof order !== "number" ||
            !Number.isInteger(order) ||
            order < 0 ||
            order >= 500)
        )
          throw new Error("lessonOrder must be an integer from 0 to 499.");
        orders.push(order as number | undefined);
      } catch (error) {
        problems.push(
          problem(
            path,
            error instanceof Error ? error.message : "Invalid JSON metadata.",
          ),
        );
      }
      if (item.children !== undefined && !Array.isArray(item.children))
        problems.push(problem(path, "children must be an array."));
      else if (Array.isArray(item.children))
        walk(item.children, item.id, depth + 1);
    }
  }
  walk(input);
  if (problems.length) return { ok: false, problems };
  if (orders.every((v) => v !== undefined)) {
    if (new Set(orders).size !== orders.length)
      return {
        ok: false,
        problems: [problem("lessonOrder", "Order values must be unique.")],
      };
    const sorted = blocks
      .map((block, i) => ({ block, order: orders[i]! }))
      .sort((a, b) => a.order - b.order);
    return validateLessonDocument({ schemaVersion: 1, blocks: sorted.map((v) => v.block) });
  }
  return validateLessonDocument({ schemaVersion: 1, blocks });
}
