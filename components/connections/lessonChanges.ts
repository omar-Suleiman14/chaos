// Pure: what changes between two versions of a lesson, for ChangePreview.
// Used for both "a connected app wants to update this lesson" and "both sides changed it".

import type { LessonMeta } from "@/lib/learn/types";
import type { LessonDocument } from "@/convex/learnModel";

export type BlockChangeKind = "added" | "removed" | "changed";

export interface BlockChange {
  blockId: string;
  kind: BlockChangeKind;
  beforeText?: string;
  afterText?: string;
}

export type MetaField = "title" | "description" | "tags" | "language" | "curricula" | "license" | "authorDisplay" | "coverUrl" | "indexing";

export interface MetaChange { field: MetaField; before: string; after: string }

const listText = (values: string[]) => values.join(", ");

function metaValue(meta: LessonMeta, field: MetaField): string {
  switch (field) {
    case "tags": return listText(meta.tags);
    case "curricula": return listText(meta.curricula.map((c) => [...c.path, c.versionLabel].filter(Boolean).join(" › ")));
    default: return String(meta[field] ?? "");
  }
}

const FIELDS: MetaField[] = ["title", "description", "tags", "language", "curricula", "license", "authorDisplay", "coverUrl", "indexing"];

/** Changed lesson settings, in a fixed order. `before` null means a new lesson: every non-empty field counts. */
export function diffLessonMeta(before: LessonMeta | null, after: LessonMeta): MetaChange[] {
  const out: MetaChange[] = [];
  for (const field of FIELDS) {
    const b = before ? metaValue(before, field) : "";
    const a = metaValue(after, field);
    if (b !== a) out.push({ field, before: b, after: a });
  }
  return out;
}

export function countBlockChanges(changes: readonly BlockChange[]): Record<BlockChangeKind, number> {
  const counts: Record<BlockChangeKind, number> = { added: 0, removed: 0, changed: 0 };
  for (const c of changes) counts[c.kind] += 1;
  return counts;
}

/** Compare full typed blocks, including formatting, citations, order and references. */
export function diffDraftBlocks(before: LessonDocument, after: LessonDocument): BlockChange[] {
  const old = new Map(before.blocks.map((block, order) => [block.id, { block, order }]));
  const current = new Set(after.blocks.map(block => block.id));
  const changes: BlockChange[] = [];
  for (const [order, block] of after.blocks.entries()) {
    const previous = old.get(block.id);
    if (!previous) changes.push({ blockId: block.id, kind: "added", afterText: JSON.stringify(block, null, 2) });
    else if (previous.order !== order || JSON.stringify(previous.block) !== JSON.stringify(block)) changes.push({ blockId: block.id, kind: "changed", beforeText: JSON.stringify(previous.block, null, 2), afterText: JSON.stringify(block, null, 2) });
  }
  for (const block of before.blocks) if (!current.has(block.id)) changes.push({ blockId: block.id, kind: "removed", beforeText: JSON.stringify(block, null, 2) });
  return changes;
}
