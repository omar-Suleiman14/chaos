import type { LessonDocument } from "../../convex/learnModel";
import { validateLessonDocument } from "../lessonBlockAdapter";

/**
 * The portable lesson file: the durable LessonDocument (the same shape MCP tools and the backend
 * use) wrapped with a format name and a file version, so a file written today can still be read
 * after either changes.
 *
 * File versions
 *   0  a bare LessonDocument ({ schemaVersion: 1, blocks }) or its blocks array, as copied from
 *      MCP tool output or older exports. Read only.
 *   1  { format: "chaos.lesson", version: 1, exportedAt, meta?, document }.
 *
 * Reading always migrates to the current version and then validates with the same adapter the
 * save path uses; an invalid file is reported, never partly imported.
 */

export const PORTABLE_FORMAT = "chaos.lesson";
export const PORTABLE_VERSION = 1;

export interface PortableMeta { title?: string; description?: string; language?: string }
export interface PortableLesson { format: typeof PORTABLE_FORMAT; version: typeof PORTABLE_VERSION; exportedAt: string; meta?: PortableMeta; document: LessonDocument }

export type PortableResult =
  | { ok: true; lesson: PortableLesson; migratedFrom?: number }
  | { ok: false; problems: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function toPortableLesson(document: LessonDocument, meta?: PortableMeta, now = new Date()): PortableLesson {
  const clean = meta && Object.fromEntries(Object.entries(meta).filter(([, v]) => typeof v === "string" && v !== "")) as PortableMeta;
  return { format: PORTABLE_FORMAT, version: PORTABLE_VERSION, exportedAt: now.toISOString(), ...(clean && Object.keys(clean).length ? { meta: clean } : {}), document };
}

/** One step per file version: migrations[n] turns version n into version n + 1. */
const migrations: Record<number, (input: unknown) => unknown> = {
  0: (input) => ({
    format: PORTABLE_FORMAT, version: 1, exportedAt: new Date(0).toISOString(),
    document: Array.isArray(input) ? { schemaVersion: 1, blocks: input } : input,
  }),
};

/** The file version of `input`, or undefined when it is not a lesson file at all. */
export function portableVersion(input: unknown): number | undefined {
  if (Array.isArray(input)) return 0;
  if (!isRecord(input)) return undefined;
  if (input.format === PORTABLE_FORMAT && typeof input.version === "number" && Number.isInteger(input.version)) return input.version;
  if ("schemaVersion" in input && Array.isArray(input.blocks)) return 0;
  return undefined;
}

/** Reads a portable lesson (any supported version) and validates it like a save. */
export function parsePortableLesson(input: unknown): PortableResult {
  let value: unknown = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return { ok: false, problems: ["This file is not valid JSON."] }; }
  }
  const start = portableVersion(value);
  if (start === undefined) return { ok: false, problems: ["This is not a Chaos lesson file."] };
  if (start > PORTABLE_VERSION) return { ok: false, problems: [`This file was written by a newer version of Chaos (file version ${start}). Update Chaos to open it.`] };
  for (let v = start; v < PORTABLE_VERSION; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, problems: [`No migration from file version ${v}.`] };
    value = step(value);
  }
  const file = value as Record<string, unknown>;
  const checked = validateLessonDocument(file.document);
  if (!checked.ok) return { ok: false, problems: checked.problems.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message)) };
  const meta = isRecord(file.meta) ? Object.fromEntries(["title", "description", "language"].flatMap((k) => (typeof (file.meta as Record<string, unknown>)[k] === "string" ? [[k, (file.meta as Record<string, string>)[k]]] : []))) as PortableMeta : undefined;
  const lesson: PortableLesson = { format: PORTABLE_FORMAT, version: PORTABLE_VERSION, exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : new Date(0).toISOString(), ...(meta && Object.keys(meta).length ? { meta } : {}), document: checked.value };
  return { ok: true, lesson, ...(start !== PORTABLE_VERSION ? { migratedFrom: start } : {}) };
}
