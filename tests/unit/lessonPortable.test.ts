import { describe, expect, it } from "vitest";
import type { LessonDocument } from "@/convex/learnModel";
import { parsePortableLesson, PORTABLE_FORMAT, PORTABLE_VERSION, portableVersion, toPortableLesson } from "@/lib/learn/portable";

const base = { citations: [], conceptIds: [] };
const doc: LessonDocument = { schemaVersion: 1, blocks: [
  { ...base, id: "h", type: "heading", level: 1, text: "القلب" },
  { ...base, id: "p", type: "paragraph", text: "Bold then plain", inline: [{ text: "Bold", marks: { bold: true } }, { text: " then plain" }] },
  { ...base, id: "c", parentId: "p", type: "list", style: "bullet", text: "Nested" },
] };

describe("portable lesson files", () => {
  it("round-trips the durable document exactly", () => {
    const file = toPortableLesson(doc, { title: "Heart", description: "", language: "ar" }, new Date("2026-01-02T03:04:05Z"));
    expect(file).toMatchObject({ format: PORTABLE_FORMAT, version: PORTABLE_VERSION, exportedAt: "2026-01-02T03:04:05.000Z", meta: { title: "Heart", language: "ar" } });
    const back = parsePortableLesson(JSON.stringify(file));
    expect(back.ok && back.lesson.document).toEqual(doc);
    expect(back.ok && back.migratedFrom).toBeUndefined();
  });

  it("migrates version 0 (a bare document or block array, as MCP tools return)", () => {
    expect(portableVersion(doc)).toBe(0);
    const fromDoc = parsePortableLesson(doc);
    expect(fromDoc.ok && fromDoc.lesson.document).toEqual(doc);
    expect(fromDoc.ok && fromDoc.migratedFrom).toBe(0);
    const fromArray = parsePortableLesson(JSON.stringify(doc.blocks));
    expect(fromArray.ok && fromArray.lesson.document.blocks).toEqual(doc.blocks);
  });

  it("refuses files from a newer version instead of guessing", () => {
    const result = parsePortableLesson({ format: PORTABLE_FORMAT, version: PORTABLE_VERSION + 1, document: doc });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]).toMatch(/newer version/);
  });

  it("reports invalid content with its path and never partly imports", () => {
    expect(parsePortableLesson("{not json")).toEqual({ ok: false, problems: ["This file is not valid JSON."] });
    expect(parsePortableLesson({ hello: 1 })).toEqual({ ok: false, problems: ["This is not a Chaos lesson file."] });
    const bad = parsePortableLesson({ format: PORTABLE_FORMAT, version: 1, document: { schemaVersion: 1, blocks: [{ ...base, id: "x", type: "heading", level: 9, text: "x" }] } });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.problems.join(" ")).toMatch(/blocks/);
  });
});
