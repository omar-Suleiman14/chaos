import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { measureConvex } from "../../perf/lib/convex";
import { authorSearchCursor, readSearchCursor, writeSearchCursor } from "../../convex/learnSearchCursor";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

const metadata = { title: "Synthetic lesson", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Public teaching", citations: [], conceptIds: [] }] };
async function fixture(count = 3, fullTextCount = 0, prefixUsers = 0) {
  const t = createTestConvex();
  const seeded = await t.run(async ctx => {
    for (let i = 0; i < prefixUsers; i++) {
      await ctx.db.insert("users", { clerkId: `unrelated-${i}`, name: "Unrelated", username: `unrelated-${i}`, email: `unrelated-${i}@example.test`, createdAt: i });
    }
    const userId = await ctx.db.insert("users", { clerkId: creatorIdentity.subject, name: "NoraSubstring", username: "synthetic-author", email: creatorIdentity.email, createdAt: 0 });
    const lessonIds: Id<"lessons">[] = [];
    for (let i = 0; i < count; i++) {
      const lessonId = await ctx.db.insert("lessons", { ownerId: creatorIdentity.subject, metadata: { ...metadata, title: `Lesson ${i}` }, draft: document, revision: 1, status: "active", visibility: "public", communityState: "ok", searchText: i < fullTextCount ? "substring" : "unrelated", createdAt: i, updatedAt: i });
      const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata: { ...metadata, title: `Published ${i}` }, document, authorId: creatorIdentity.subject, publishedAt: i, visibility: "public" });
      await ctx.db.patch("lessons", lessonId, { publishedVersionId: versionId });
      lessonIds.push(lessonId);
    }
    return { userId, lessonIds };
  });
  const search = (cursor: string | null = null, numItems = 1, text = "substring") => t.query(api.learnSearch.searchPublic, { text, paginationOpts: { cursor, numItems } });
  return { t, search, ...seeded };
}

it("supports an exact timestamp/owner search probe without unrelated lesson reads", async () => {
  const f = await fixture(100, 1);
  const lesson = (await f.t.run(ctx => ctx.db.get("lessons", f.lessonIds[0])))!;
  const measured = await measureConvex(() => f.t.run(ctx => ctx.db.query("lessons").withSearchIndex("search_text", q => q.search("searchText", "substring").eq("ownerId", lesson.ownerId).eq("_creationTime", lesson._creationTime)).filter(q => q.eq(q.field("_id"), lesson._id)).paginate({ cursor: null, numItems: 1, maximumRowsRead: 20 })));
  expect(measured.result.page.map(row => row._id)).toEqual([lesson._id]);
  expect(measured.cost.documentsRead).toBe(1);
});

it("finds English substring author matches beyond the first 100 directory records with bounded requests", async () => {
  const f = await fixture(3, 0, 120);
  const first = await measureConvex(() => f.search(null, 20));
  expect(first.result.page).toEqual([]);
  expect(first.result.isDone).toBe(false);
  expect(first.cost.documentsRead).toBeLessThanOrEqual(100);
  const second = await measureConvex(() => f.search(first.result.continueCursor, 20));
  expect(second.result.page.map(row => row.lessonId)).toEqual(f.lessonIds);
  expect(second.result.isDone).toBe(true);
  expect(second.cost.documentsRead).toBeLessThanOrEqual(40);
  expect((await allPages(f)).map(row => row.lessonId)).toEqual(f.lessonIds);
});

it("preserves Arabic substring author matches beyond the old directory ceiling", async () => {
  const f = await fixture(3, 0, 120);
  await f.t.run(ctx => ctx.db.patch("users", f.userId, { name: "مدرسسامر" }));
  expect((await allPages(f, 1, "سامر unknown")).map(row => row.lessonId)).toEqual(f.lessonIds);
});

it("resumes an existing author cursor at the old 100-user boundary", async () => {
  const f = await fixture(1, 0, 120);
  const directory = await f.t.run(ctx => ctx.db.query("users").paginate({ cursor: null, numItems: 100 }));
  const cursor = authorSearchCursor("substring");
  cursor.userCursor = directory.continueCursor;
  cursor.usersRead = 100;
  const result = await f.search(writeSearchCursor(cursor));
  expect(result.page.map(row => row.lessonId)).toEqual(f.lessonIds);
  if (!result.isDone) {
    const exhausted = await f.search(result.continueCursor);
    expect(exhausted.page).toEqual([]);
    expect(exhausted.isDone).toBe(true);
  }
});

it("does not trust client-controlled pending IDs to broaden owner or publication access", async () => {
  const f = await fixture();
  const first = await f.search();
  const cursor = readSearchCursor(first.continueCursor, "substring");
  if (cursor.phase !== "authors") throw new Error("Expected author continuation");
  const foreignId = await f.t.run(async ctx => {
    const lessonId = await ctx.db.insert("lessons", { ownerId: "another-account", metadata: { ...metadata, title: "Unrelated account" }, draft: document, revision: 1, status: "active", visibility: "public", communityState: "ok", searchText: "unrelated", createdAt: 0, updatedAt: 0 });
    const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata: { ...metadata, title: "Unrelated account" }, document, authorId: "another-account", publishedAt: 0, visibility: "public" });
    await ctx.db.patch("lessons", lessonId, { publishedVersionId: versionId });
    return lessonId;
  });
  cursor.pending = { lessonId: foreignId, cursor: null, lastForOwner: false };
  expect((await f.search(writeSearchCursor(cursor))).page.map(row => row.lessonId)).toEqual([f.lessonIds[1]]);
  await f.t.run(ctx => ctx.db.patch("lessons", f.lessonIds[1], { visibility: "private" }));
  cursor.pending = { lessonId: f.lessonIds[1], cursor: null, lastForOwner: false };
  expect((await f.search(writeSearchCursor(cursor))).page.map(row => row.lessonId)).toEqual([f.lessonIds[2]]);
});

async function allPages(f: Awaited<ReturnType<typeof fixture>>, numItems = 1, text = "substring") {
  const results: Awaited<ReturnType<typeof f.search>>["page"] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const page = await f.search(cursor, numItems, text);
    expect(page.page.length).toBeLessThanOrEqual(numItems);
    results.push(...page.page);
    if (page.isDone) return results;
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Synthetic search did not finish");
}

it("continues every author-only lesson rather than marking its first page done", async () => {
  const f = await fixture();
  expect((await allPages(f)).map(row => row.lessonId)).toEqual(f.lessonIds);
});

it("preserves Arabic substring and any-word author matching with UTF-8 cursors", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("users", f.userId, { name: "مدرسسامر" }));
  expect((await allPages(f, 1, "سامر unknown")).map(row => row.lessonId)).toEqual(f.lessonIds);
});

it("keeps cursors bounded across many author lessons and rejects a different search scope", async () => {
  const f = await fixture(105);
  let cursor: string | null = null;
  const found = [];
  for (let i = 0; i < 106; i++) {
    const page = await f.search(cursor);
    expect(page.continueCursor.length).toBeLessThan(3000);
    found.push(...page.page.map(row => row.lessonId));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(found).toEqual(f.lessonIds);
  await expect(f.search(cursor, 1, "different")).rejects.toThrow("INVALID_SEARCH_CURSOR");
  await expect(f.search("chaos-search-v1:invalid")).rejects.toThrow("INVALID_SEARCH_CURSOR");
});

it("accepts an existing native full-text continuation without repeating those matches in author pages", async () => {
  const f = await fixture(5, 2);
  const native = await f.t.run(ctx => ctx.db.query("lessons").withSearchIndex("search_text", q => q.search("searchText", "substring").eq("visibility", "public").eq("communityState", "ok").eq("status", "active")).paginate({ cursor: null, numItems: 1 }));
  const next = await f.search(native.continueCursor);
  expect(next.page.map(row => row.lessonId)).toEqual([f.lessonIds[1]]);
});

it("returns full-text matches first and deduplicates them across author pages", async () => {
  const f = await fixture(5, 2);
  const result = await allPages(f);
  expect(result.map(row => row.lessonId)).toEqual(f.lessonIds);
  expect(new Set(result.map(row => row.lessonId)).size).toBe(5);
  expect(await allPages(f, 2)).toEqual(result);
});

it("continues through filtered candidates and rechecks revocation before returning a resumed lesson", async () => {
  const f = await fixture(4, 2);
  await f.t.run(async ctx => {
    const lesson = (await ctx.db.get("lessons", f.lessonIds[0]))!;
    await ctx.db.patch("lessonVersions", lesson.publishedVersionId!, { visibility: "private" });
    await ctx.db.patch("lessons", f.lessonIds[2], { communityState: "hidden" });
  });
  expect((await allPages(f)).map(row => row.lessonId)).toEqual([f.lessonIds[1], f.lessonIds[3]]);
  const first = await f.search();
  await f.t.run(ctx => ctx.db.patch("users", f.userId, { isBanned: true }));
  const resumed = await f.search(first.continueCursor);
  expect(resumed.page).toEqual([]);
});
