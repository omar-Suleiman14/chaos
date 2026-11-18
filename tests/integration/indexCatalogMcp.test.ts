import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";

const SECRET = "x".repeat(40);
const ADMIN = "user_adminclerk";
const NON_ADMIN = "user_plainclerk";

const FILE = {
  channel: "zatooona44",
  messageId: 4100,
  kind: "file",
  moduleIndex: 2,
  subject: "Microbiology",
  type: "lecture",
  caption: "L21 Micro",
  filename: "L21.pdf",
  date: "2026-11-18",
};
const QUESTION = {
  channel: "medics_44_mcq",
  messageId: 600,
  kind: "question",
  moduleIndex: 2,
  subject: "Microbiology",
  type: "tutorial",
  caption: "Tut 3 micro questions",
  lectureRefs: [3, 2],
};

async function seedActors(t: Awaited<ReturnType<typeof createTestConvex>>) {
  await t.run(async (ctx) => {
    for (const [clerkId, username] of [[ADMIN, "admin"], [NON_ADMIN, "plain"]] as const) {
      await ctx.db.insert("users", { clerkId, name: username, email: `${username}@example.com`, username, createdAt: 0 });
    }
  });
}

describe("index catalogue MCP tools", () => {
  beforeEach(() => { process.env.CHAOS_INDEX_UPDATER_SECRET = SECRET; });
  afterEach(() => { delete process.env.CHAOS_INDEX_UPDATER_SECRET; });

  it("refuses non-administrators on both tools", async () => {
    const t = await createTestConvexWithAdmin(ADMIN);
    await seedActors(t);
    await expect(t.query(internal.mcpIndexCatalog.list, { userId: NON_ADMIN })).rejects.toThrow(/FORBIDDEN/);
    await expect(t.mutation(internal.mcpIndexCatalog.upsert, { userId: NON_ADMIN, entries: [FILE] })).rejects.toThrow(/FORBIDDEN/);
  });

  it("lets an administrator read the catalogue in the site's tuple shapes", async () => {
    const t = await createTestConvexWithAdmin(ADMIN);
    await seedActors(t);
    await t.mutation(api.indexCatalog.publish, { secret: "x".repeat(40), entries: [FILE, QUESTION] });
    const catalog = await t.query(internal.mcpIndexCatalog.list, { userId: ADMIN });
    expect(catalog.files).toEqual([[FILE.messageId, 2, "Microbiology", "lecture", FILE.caption, FILE.filename, FILE.date]]);
    expect(catalog.questions).toEqual([[QUESTION.messageId, 2, "Microbiology", "tutorial", [2, 3], QUESTION.caption]]);
    expect(catalog.generatedAt).toBeGreaterThan(0);
  });

  it("publishes through the same idempotent upsert and labels the writer", async () => {
    const t = await createTestConvexWithAdmin(ADMIN);
    await seedActors(t);
    const first = await t.mutation(internal.mcpIndexCatalog.upsert, { userId: ADMIN, entries: [FILE, QUESTION], updatedBy: "morning-updater" });
    expect(first.created).toBe(2);
    expect(first.rejected).toEqual([]);
    const replay = await t.mutation(internal.mcpIndexCatalog.upsert, { userId: ADMIN, entries: [FILE, QUESTION], updatedBy: "morning-updater" });
    expect(replay.created).toBe(0);
    expect(replay.unchanged).toBe(2);
    const rows = await t.run(async ctx => ctx.db.query("indexCatalogEntries").collect());
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.updatedBy === "mcp:morning-updater")).toBe(true);
  });

  it("enforces the batch limit and rejects empty batches", async () => {
    const t = await createTestConvexWithAdmin(ADMIN);
    await seedActors(t);
    await expect(t.mutation(internal.mcpIndexCatalog.upsert, {
      userId: ADMIN,
      entries: Array.from({ length: 201 }, (_, i) => ({ ...FILE, messageId: 5000 + i })),
    })).rejects.toThrow(/BATCH_TOO_LARGE/);
    await expect(t.mutation(internal.mcpIndexCatalog.upsert, { userId: ADMIN, entries: [] })).rejects.toThrow(/VALIDATION_FAILED/);
  });
});
