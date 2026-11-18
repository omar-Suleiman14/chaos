import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";

const SECRET = "x".repeat(40);
const FILE = {
  channel: "zatooona44",
  messageId: 3000,
  kind: "file",
  moduleIndex: 0,
  subject: "Anatomy",
  type: "lecture",
  caption: "L30 Anatomy",
  filename: "L30 Anatomy.pdf",
  date: "2026-11-17",
};
const CROSS_COHORT_FILE = {
  channel: "zatooona46",
  messageId: 300,
  kind: "file",
  moduleIndex: 1,
  subject: "Biochemistry",
  type: "tutorial",
  caption: "Tut 8 Bio",
  filename: "Tut8 bio.pdf",
};
const QUESTION = {
  channel: "medics_44_mcq",
  messageId: 500,
  kind: "question",
  moduleIndex: 1,
  subject: "Physiology",
  type: "tutorial",
  caption: "Tut 8 physio question set",
  lectureRefs: [8, 7],
};

beforeEach(() => { process.env.CHAOS_INDEX_UPDATER_SECRET = SECRET; });
afterEach(() => { delete process.env.CHAOS_INDEX_UPDATER_SECRET; });

describe("index catalogue publishing", () => {
  it("rejects a wrong secret without touching the database", async () => {
    const t = createTestConvex();
    await expect(t.mutation(api.indexCatalog.publish, { secret: "wrong", entries: [FILE] })).rejects.toThrow("UNAUTHORIZED");
    const stored = await t.query(api.indexCatalog.catalog, {});
    expect(stored.files).toEqual([]);
    expect(stored.questions).toEqual([]);
  });

  it("rejects unconfigured deployments before checking the secret", async () => {
    delete process.env.CHAOS_INDEX_UPDATER_SECRET;
    const t = createTestConvex();
    await expect(t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [FILE] })).rejects.toThrow("INDEX_UPDATER_NOT_CONFIGURED");
  });

  it("creates, then treats a replay as unchanged, and reports what is stored", async () => {
    const t = createTestConvex();
    const first = await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [FILE, CROSS_COHORT_FILE, QUESTION], updatedBy: "seed" });
    expect(first.created).toBe(3);
    expect(first.updated).toBe(0);
    expect(first.unchanged).toBe(0);
    expect(first.rejected).toEqual([]);
    // Projection shapes match the site's embedded D/Q tuples.
    expect(first.stored[0]).toEqual([FILE.messageId, 0, "Anatomy", "lecture", FILE.caption, FILE.filename, FILE.date]);
    expect(first.stored[1]).toEqual([`ZatOona46/${CROSS_COHORT_FILE.messageId}`, 1, "Biochemistry", "tutorial", CROSS_COHORT_FILE.caption, CROSS_COHORT_FILE.filename, ""]);
    expect(first.stored[2]).toEqual([QUESTION.messageId, 1, "Physiology", "tutorial", [7, 8], QUESTION.caption]);

    const replay = await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [FILE, CROSS_COHORT_FILE, QUESTION], updatedBy: "updater" });
    expect(replay.created).toBe(0);
    expect(replay.updated).toBe(0);
    expect(replay.unchanged).toBe(3);
    const rows = await t.run(async ctx => ctx.db.query("indexCatalogEntries").collect());
    expect(rows).toHaveLength(3);
    // A replay never changes authorship or timestamps of existing rows.
    expect(rows.every(row => row.updatedBy === "seed")).toBe(true);
  });

  it("patches an edited post in place and keeps the same identity", async () => {
    const t = createTestConvex();
    await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [QUESTION] });
    const before = await t.run(async ctx => ctx.db.query("indexCatalogEntries").collect());
    const edited = { ...QUESTION, lectureRefs: [8, 9, 10], caption: "Tut 8 physio question set (updated)" };
    const result = await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [edited] });
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    const after = await t.run(async ctx => ctx.db.query("indexCatalogEntries").collect());
    expect(after).toHaveLength(1);
    expect(after[0]._id).toBe(before[0]._id);
    expect(after[0].caption).toBe("Tut 8 physio question set (updated)");
    expect(after[0].lectureRefs).toEqual([8, 9, 10]);
  });

  it("reports rejected entries with reasons and stores nothing for them", async () => {
    const t = createTestConvex();
    const bad = [
      { ...FILE, messageId: 0 },
      { ...FILE, channel: "medics_44_mcq" },
      { ...QUESTION, kind: "file" },
      { ...FILE, type: "unknown" },
      { ...FILE, moduleIndex: 18 },
      { ...FILE, date: "17-11-2026" },
      { ...FILE, lectureRefs: [1] },
      "not an object",
    ];
    const result = await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: bad });
    expect(result.created).toBe(0);
    expect(result.stored).toEqual([]);
    expect(result.rejected.map(r => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.rejected.every(r => r.reason.length > 0)).toBe(true);
    const rows = await t.run(async ctx => ctx.db.query("indexCatalogEntries").collect());
    expect(rows).toEqual([]);
  });

  it("enforces the batch limit and deduplicates within one batch", async () => {
    const t = createTestConvex();
    await expect(t.mutation(api.indexCatalog.publish, {
      secret: SECRET,
      entries: Array.from({ length: 201 }, (_, i) => ({ ...FILE, messageId: i + 1 })),
    })).rejects.toThrow("BATCH_TOO_LARGE");
    const result = await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [FILE, FILE] });
    expect(result.created).toBe(1);
    expect(result.rejected).toEqual([{ index: 1, reason: "Duplicate of an earlier entry in this batch." }]);
  });

  it("serves the public catalogue projected into the site's tuple shapes", async () => {
    const t = createTestConvex();
    await t.mutation(api.indexCatalog.publish, { secret: SECRET, entries: [FILE, CROSS_COHORT_FILE, QUESTION] });
    const catalog = await t.query(api.indexCatalog.catalog, {});
    expect(catalog.files).toEqual([
      [FILE.messageId, 0, "Anatomy", "lecture", FILE.caption, FILE.filename, FILE.date],
      [`ZatOona46/${CROSS_COHORT_FILE.messageId}`, 1, "Biochemistry", "tutorial", CROSS_COHORT_FILE.caption, CROSS_COHORT_FILE.filename, ""],
    ]);
    expect(catalog.questions).toEqual([
      [QUESTION.messageId, 1, "Physiology", "tutorial", [7, 8], QUESTION.caption],
    ]);
    expect(catalog.generatedAt).toBeGreaterThan(0);
  });
});

describe("index catalogue model validation", () => {
  it("normalizes and trims text fields", async () => {
    const { normalizeIndexCatalogEntry } = await import("../../convex/indexCatalogModel");
    const result = normalizeIndexCatalogEntry({ ...FILE, subject: " Anatomy ", caption: " L30 Anatomy " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.subject).toBe("Anatomy");
    expect(result.entry.caption).toBe("L30 Anatomy");
  });

  it("sorts and dedupes lecture references", async () => {
    const { normalizeIndexCatalogEntry } = await import("../../convex/indexCatalogModel");
    const result = normalizeIndexCatalogEntry({ ...QUESTION, lectureRefs: [12, 3, 12] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lectureRefs).toEqual([3, 12]);
  });
});
