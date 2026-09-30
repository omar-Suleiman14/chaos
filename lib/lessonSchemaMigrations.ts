import { validateLessonDocument } from "./lessonBlockAdapter";
import type { LessonDocument } from "../convex/learnModel";

export interface LessonSchemaMigration {
  from: number;
  to: number;
  /** Pure adjacent-version transform. It must never mutate the input snapshot. */
  transform: (snapshot: unknown) => unknown;
  validateTarget: (snapshot: unknown) => boolean;
}

/** Read-time upgrades return copies; immutable database versions are never rewritten.
 * Register a tested adjacent migration when a new public schema version ships.
 * Unknown versions fail closed rather than silently dropping blocks or references.
 */
export function migrateLessonSnapshot(snapshot: unknown, targetVersion: number, migrations: readonly LessonSchemaMigration[] = []): unknown {
  const original = structuredClone(snapshot);
  let current = original;
  const versionOf = (value: unknown): number => {
    if (!value || typeof value !== "object" || !("schemaVersion" in value) || !Number.isSafeInteger(value.schemaVersion) || Number(value.schemaVersion) < 1) throw new Error("INVALID_LESSON_SCHEMA_VERSION");
    return Number(value.schemaVersion);
  };
  let version = versionOf(current);
  if (!Number.isSafeInteger(targetVersion) || targetVersion < version || targetVersion - version > 20) throw new Error("UNSUPPORTED_LESSON_SCHEMA_PATH");
  if (version === 1 && !validateLessonDocument(current).ok) throw new Error("INVALID_LESSON_SCHEMA_DOCUMENT");
  if (version > 1) {
    const readers = migrations.filter(m => m.to === version);
    if (readers.length !== 1 || !readers[0].validateTarget(current)) throw new Error("UNSUPPORTED_LESSON_SCHEMA_VERSION");
  }
  while (version < targetVersion) {
    const candidates = migrations.filter(m => m.from === version && m.to === version + 1);
    if (candidates.length !== 1) throw new Error("UNSUPPORTED_LESSON_SCHEMA_PATH");
    const migration = candidates[0];
    const input = structuredClone(current);
    const before = JSON.stringify(input);
    const upgraded = migration.transform(input);
    if (JSON.stringify(input) !== before) throw new Error("LESSON_MIGRATION_MUTATED_INPUT");
    if (versionOf(upgraded) !== migration.to || !migration.validateTarget(upgraded)) throw new Error("INVALID_LESSON_MIGRATION_OUTPUT");
    current = structuredClone(upgraded);
    version++;
  }
  return current;
}

export function readLessonSchemaV1(snapshot: unknown): LessonDocument {
  return migrateLessonSnapshot(snapshot, 1) as LessonDocument;
}
