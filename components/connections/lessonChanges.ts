// Pure: what changes between two versions of a lesson, for ChangePreview.
// Used for both "a connected app wants to update this lesson" and "both sides changed it".

import type { LessonMeta } from "@/lib/learn/types";

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
