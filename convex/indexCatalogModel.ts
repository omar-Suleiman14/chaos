import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Live catalogue for the standalone Chaos Index (apps/medical-index).
 *
 * One row per verified Telegram post. Identity is (channel, messageId, kind), so the daily
 * updater can re-post the same message or an edited one without creating duplicates.
 * The static site keeps an embedded fallback copy; Convex is the authoritative live source.
 */
export const indexCatalogTables = {
  indexCatalogEntries: defineTable({
    /** Telegram channel: "zatooona44" (lectures/files), "zatooona46" (cross-cohort), "medics_44_mcq" (question sets). */
    channel: v.string(),
    messageId: v.number(),
    kind: v.union(v.literal("file"), v.literal("question")),
    moduleIndex: v.number(),
    subject: v.string(),
    type: v.string(),
    caption: v.string(),
    filename: v.optional(v.string()),
    date: v.optional(v.string()),
    /** Question posts only: lecture/tutorial numbers the set covers. */
    lectureRefs: v.optional(v.array(v.number())),
    /** Who wrote the row: "seed" (initial import), "updater" (scheduled task), "manual". */
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_identity", ["channel", "messageId", "kind"])
    .index("by_module", ["moduleIndex"])
    .index("by_updated", ["updatedAt"]),
};

export const INDEX_CATALOG_CHANNELS = ["zatooona44", "zatooona46", "medics_44_mcq"] as const;
export const INDEX_CATALOG_FILE_CHANNELS = ["zatooona44", "zatooona46"] as const;
export const INDEX_CATALOG_QUESTION_CHANNEL = "medics_44_mcq";
export const INDEX_CATALOG_TYPES = ["lecture", "tutorial", "cbl", "practical", "exam", "timetable", "resource"] as const;
export const INDEX_CATALOG_KINDS = ["file", "question"] as const;

/** Year of each module index (0-17), embedded from the index's canonical `M` array. */
export const INDEX_CATALOG_MODULE_YEARS = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3] as const;
export const INDEX_CATALOG_MODULE_COUNT = INDEX_CATALOG_MODULE_YEARS.length;

/** One POST may carry at most this many entries; the import script paginates in these batches. */
export const INDEX_CATALOG_BATCH_SIZE = 200;

const MAX_SUBJECT = 100;
const MAX_CAPTION = 500;
const MAX_FILENAME = 300;
const MAX_LECTURE_REFS = 40;

export type IndexCatalogEntryInput = {
  channel?: unknown;
  messageId?: unknown;
  kind?: unknown;
  moduleIndex?: unknown;
  subject?: unknown;
  type?: unknown;
  caption?: unknown;
  filename?: unknown;
  date?: unknown;
  lectureRefs?: unknown;
};

export type NormalizedIndexCatalogEntry = {
  channel: string;
  messageId: number;
  kind: "file" | "question";
  moduleIndex: number;
  subject: string;
  type: string;
  caption: string;
  filename?: string;
  date?: string;
  lectureRefs?: number[];
};

/** Site tuple shapes (index.html's `D` and `Q` rows) after projection. */
export type IndexCatalogFileTuple = [number | string, number, string, string, string, string, string];
export type IndexCatalogQuestionTuple = [number, number, string, string, number[], string];

type Validation = { ok: true; entry: NormalizedIndexCatalogEntry } | { ok: false; reason: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type TextCheck = { ok: true; text: string } | { ok: false; reason: string };

const isFiniteInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const requiredText = (value: unknown, max: number, label: string): TextCheck => {
  if (typeof value !== "string") return { ok: false, reason: `${label} is required.` };
  const text = value.trim();
  if (!text) return { ok: false, reason: `${label} is required.` };
  if (text.length > max) return { ok: false, reason: `${label} is longer than ${max} characters.` };
  return { ok: true, text };
};

const optionalText = (value: unknown, max: number, label: string): TextCheck => {
  if (value === undefined || value === null || value === "") return { ok: true, text: "" };
  return requiredText(value, max, label);
};

/**
 * Validates and normalizes one catalogue entry from the updater. Returns the canonical row or a
 * human-readable reason; rejected entries never touch the database and are reported back.
 */
export function normalizeIndexCatalogEntry(input: unknown): Validation {
  if (!isObject(input)) return { ok: false, reason: "Entry must be an object." };
  const fail = (reason: string): Validation => ({ ok: false, reason });
  const { channel, messageId, kind, moduleIndex, subject, type, caption, filename, date, lectureRefs } = input;

  if (typeof channel !== "string" || !(INDEX_CATALOG_CHANNELS as readonly string[]).includes(channel)) {
    return fail(`channel must be one of ${INDEX_CATALOG_CHANNELS.join(", ")}.`);
  }
  if (!isFiniteInt(messageId, 1, 2_147_483_647)) return fail("messageId must be a positive integer.");
  if (kind !== "file" && kind !== "question") return fail('kind must be "file" or "question".');
  if ((kind === "file") !== (INDEX_CATALOG_FILE_CHANNELS as readonly string[]).includes(channel)) {
    return fail(kind === "file" ? `Files come from ${INDEX_CATALOG_FILE_CHANNELS.join(" or ")}.` : `Questions come from ${INDEX_CATALOG_QUESTION_CHANNEL}.`);
  }
  if (!isFiniteInt(moduleIndex, 0, INDEX_CATALOG_MODULE_COUNT - 1)) return fail(`moduleIndex must be an integer between 0 and ${INDEX_CATALOG_MODULE_COUNT - 1}.`);
  if (typeof type !== "string" || !(INDEX_CATALOG_TYPES as readonly string[]).includes(type)) {
    return fail(`type must be one of ${INDEX_CATALOG_TYPES.join(", ")}.`);
  }
  const subjectText = requiredText(subject, MAX_SUBJECT, "subject");
  if (!subjectText.ok) return fail(subjectText.reason);
  const captionText = requiredText(caption, MAX_CAPTION, "caption");
  if (!captionText.ok) return fail(captionText.reason);

  const normalized: NormalizedIndexCatalogEntry = {
    channel, messageId, kind, moduleIndex,
    subject: subjectText.text, type, caption: captionText.text,
  };

  if (kind === "file") {
    const filenameText = optionalText(filename, MAX_FILENAME, "filename");
    if (!filenameText.ok) return fail(filenameText.reason);
    const dateText = optionalText(date, 10, "date");
    if (!dateText.ok) return fail(dateText.reason);
    if (dateText.text && !/^\d{4}-\d{2}-\d{2}$/.test(dateText.text)) return fail("date must be YYYY-MM-DD.");
    if (lectureRefs !== undefined) return fail("lectureRefs is only valid on question posts.");
    if (filenameText.text) normalized.filename = filenameText.text;
    if (dateText.text) normalized.date = dateText.text;
  } else {
    const filenameText = optionalText(filename, MAX_FILENAME, "filename");
    if (!filenameText.ok) return fail(filenameText.reason);
    if (filenameText.text) return fail("Questions use caption; filename is not valid.");
    if (lectureRefs !== undefined && lectureRefs !== null) {
      if (!Array.isArray(lectureRefs)) return fail("lectureRefs must be an array of numbers.");
      if (lectureRefs.length > MAX_LECTURE_REFS) return fail(`lectureRefs can hold at most ${MAX_LECTURE_REFS} numbers.`);
      for (const ref of lectureRefs) {
        if (!isFiniteInt(ref, 0, 500)) return fail("lectureRefs must be integers between 0 and 500.");
      }
      const refs = [...new Set(lectureRefs)].sort((a, b) => a - b);
      if (refs.length) normalized.lectureRefs = refs;
    }
  }
  return { ok: true, entry: normalized };
}

/** Stable identity string, used by the site merge to dedupe against the embedded fallback. */
export function indexCatalogIdentity(entry: { channel: string; messageId: number; kind: string }): string {
  return `${entry.kind}:${entry.channel}:${entry.messageId}`;
}

/**
 * Projection to the site's embedded tuple shapes so the static site can merge rows without
 * translation. Mirrors index.html's `D` and `Q` arrays:
 * files  → [messageId | "ZatOona46/<id>", moduleIndex, subject, type, caption, filename, date]
 * questions → [messageId, moduleIndex, subject, type, lectureRefs, caption]
 */
export function indexCatalogFileTuple(entry: NormalizedIndexCatalogEntry): IndexCatalogFileTuple {
  const first = entry.channel === "zatooona46" ? `ZatOona46/${entry.messageId}` : entry.messageId;
  return [first, entry.moduleIndex, entry.subject, entry.type, entry.caption, entry.filename ?? "", entry.date ?? ""];
}

export function indexCatalogQuestionTuple(entry: NormalizedIndexCatalogEntry): IndexCatalogQuestionTuple {
  return [entry.messageId, entry.moduleIndex, entry.subject, entry.type, entry.lectureRefs ?? [], entry.caption];
}

/** Same-tuple comparison used for idempotent writes: unchanged content never rewrites a row. */
export function indexCatalogSameRow(
  stored: { moduleIndex: number; subject: string; type: string; caption: string; filename?: string; date?: string; lectureRefs?: number[] },
  entry: NormalizedIndexCatalogEntry,
): boolean {
  return stored.moduleIndex === entry.moduleIndex
    && stored.subject === entry.subject
    && stored.type === entry.type
    && stored.caption === entry.caption
    && (stored.filename ?? "") === (entry.filename ?? "")
    && (stored.date ?? "") === (entry.date ?? "")
    && JSON.stringify(stored.lectureRefs ?? []) === JSON.stringify(entry.lectureRefs ?? []);
}
