import { describe, expect, it } from "vitest";
import { migrateLessonSnapshot, readLessonSchemaV1, type LessonSchemaMigration } from "../../lib/lessonSchemaMigrations";

const snapshot = { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "SAAG", citations: [], conceptIds: [] }] };
const upgrade: LessonSchemaMigration = { from: 1, to: 2, transform: value => ({ ...(value as object), schemaVersion: 2, newField: [] }), validateTarget: value => !!value && typeof value === "object" && "newField" in value && Array.isArray(value.newField) };
describe("immutable lesson schema migration", () => {
  it("reads retained v1 snapshots as independent validated copies", () => {
    const result = readLessonSchemaV1(snapshot);
    result.blocks[0].id = "edited";
    expect(snapshot.blocks[0].id).toBe("p");
  });
  it("upgrades through an explicit tested path without rewriting history", () => {
    expect(migrateLessonSnapshot(snapshot, 2, [upgrade])).toEqual({ ...snapshot, schemaVersion: 2, newField: [] });
    expect(snapshot.schemaVersion).toBe(1);
  });
  it("refuses unknown, missing, ambiguous, downgrade and malformed paths", () => {
    expect(() => readLessonSchemaV1({ schemaVersion: 1, blocks: [{ type: "unknown" }] })).toThrow("INVALID_LESSON_SCHEMA_DOCUMENT");
    expect(() => readLessonSchemaV1({ schemaVersion: 2, blocks: [] })).toThrow("UNSUPPORTED");
    expect(() => migrateLessonSnapshot(snapshot, 2)).toThrow("UNSUPPORTED");
    expect(() => migrateLessonSnapshot(snapshot, 2, [upgrade, upgrade])).toThrow("UNSUPPORTED");
    expect(() => migrateLessonSnapshot(snapshot, 2, [{ ...upgrade, transform: () => ({ schemaVersion: 2 }), validateTarget: () => false }])).toThrow("INVALID_LESSON_MIGRATION_OUTPUT");
  });
  it("rejects transforms that mutate their inputs", () => {
    expect(() => migrateLessonSnapshot(snapshot, 2, [{ ...upgrade, transform: value => { (value as { schemaVersion: number }).schemaVersion = 2; return value; } }])).toThrow("MUTATED_INPUT");
    expect(snapshot.schemaVersion).toBe(1);
  });
});
