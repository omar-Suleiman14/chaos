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
  "lessonQuiz",
] as const;
export interface LessonEditorBlock {
  id: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content?: string;
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
const common = {
  id,
  parentId: id.optional(),
  citations: z.array(citation).max(50),
  conceptIds: z.array(id).max(500),
};
const text = { ...common, text: str };
const blockSchema = z.discriminatedUnion("type", [
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
} as const;
const customTypes: Record<string, string> = {
  lessonImage: "image",
  lessonSource: "source",
  lessonDiagram: "diagram",
  lessonYoutube: "youtube",
  lessonEquation: "equation",
  lessonTable: "table",
  lessonQuiz: "quiz",
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
function validate(value: unknown): LessonAdapterResult<LessonDocument> {
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
  const result = validate(document);
  if (!result.ok) return result;
  const nodes = new Map<string, LessonEditorBlock>();
  result.value.blocks.forEach((block, index) => {
    const {
      id,
      parentId: _parent,
      citations,
      conceptIds,
      type,
      ...data
    } = block;
    const props: LessonEditorBlock["props"] = {
      lessonCitations: JSON.stringify(citations),
      lessonConceptIds: JSON.stringify(conceptIds),
      lessonOrder: index,
    };
    let editorType: string = type;
    let content: string | undefined;
    if (type === "paragraph" || type === "heading" || type === "list") {
      content = block.text;
      if (block.type === "heading") props.level = block.level;
      if (block.type === "list") {
        editorType = {
          bullet: "bulletListItem",
          number: "numberedListItem",
          check: "checkListItem",
        }[block.style];
        if (block.checked !== undefined) props.checked = block.checked;
      }
    } else {
      editorType = Object.keys(customTypes).find(
        (key) => customTypes[key] === type,
      )!;
      props.lessonData = JSON.stringify(data);
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
  function plain(content: unknown, path: string): string {
    if (typeof content === "string") return content;
    if (content === undefined) return "";
    if (Array.isArray(content)) {
      let output = "";
      for (const item of content) {
        if (
          !record(item) ||
          item.type !== "text" ||
          typeof item.text !== "string" ||
          Object.keys(item).some(
            (k) => !["type", "text", "styles"].includes(k),
          ) ||
          (item.styles !== undefined &&
            (!record(item.styles) || Object.keys(item.styles).length > 0))
        ) {
          problems.push(
            problem(
              path,
              "Remove inline styles, links or custom inline content, or extend the lesson schema to preserve them.",
              "formatting",
            ),
          );
        } else output += item.text;
      }
      return output;
    }
    problems.push(
      problem(path, "Use plain text or unstyled text runs.", "formatting"),
    );
    return "";
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
        "lessonOrder",
        ...(custom
          ? ["lessonData"]
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
      for (const [key, neutral] of [
        ["textAlignment", "left"],
        ["textColor", "default"],
        ["backgroundColor", "default"],
      ])
        if (props[key] !== undefined && props[key] !== neutral)
          problems.push(
            problem(
              `${path}.props.${key}`,
              "Remove block formatting or extend the lesson schema to preserve it.",
              "formatting",
            ),
          );
      try {
        const base = {
          id: item.id,
          ...(parentId === undefined ? {} : { parentId }),
          citations: json(props.lessonCitations, []),
          conceptIds: json(props.lessonConceptIds, []),
        };
        if (custom) {
          const data = json(props.lessonData, undefined);
          if (
            !record(data) ||
            ["id", "parentId", "type", "citations", "conceptIds"].some(
              (k) => k in data,
            )
          )
            throw new Error(
              "Custom block requires lessonData containing only its variant fields.",
            );
          if (item.content !== undefined)
            problems.push(
              problem(
                path,
                "Custom blocks store content in lessonData; content cannot be preserved.",
                "unsupported",
              ),
            );
          blocks.push({ ...data, ...base, type: customTypes[item.type] });
        } else {
          const content = plain(item.content, `${path}.content`);
          blocks.push(
            item.type === "paragraph"
              ? { ...base, type: "paragraph", text: content }
              : item.type === "heading"
                ? {
                    ...base,
                    type: "heading",
                    text: content,
                    level: props.level ?? 1,
                  }
                : {
                    ...base,
                    type: "list",
                    text: content,
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
    return validate({ schemaVersion: 1, blocks: sorted.map((v) => v.block) });
  }
  return validate({ schemaVersion: 1, blocks });
}
