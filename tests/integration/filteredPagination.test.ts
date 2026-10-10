import { expect, it } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";

it("retains author cursors across consecutive hidden and moderated pages", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    for (const [username, extra] of [
      ["eligible", {}], ["optedout", { hideFromAuthorLists: true }],
      ["banned", { isBanned: true }], ["suspended", { suspendedUntil: Date.now() + 100_000 }],
    ] as const) await ctx.db.insert("users", { clerkId: username, username, name: username, email: `${username}@example.test`, createdAt: 1, publicAuthorAssets: 1, ...extra });
  });
  let cursor: string | null = null;
  for (let page = 0; page < 4; page++) {
    const result: FunctionReturnType<typeof api.publicAuthors.browse> = await t.query(api.publicAuthors.browse, { paginationOpts: { numItems: 1, cursor } });
    expect(result.page.map(row => row.username)).toEqual(page === 3 ? ["eligible"] : []);
    if (page < 3) { expect(result.isDone).toBe(false); expect(result.continueCursor).not.toBe(cursor); }
    cursor = result.continueCursor;
  }
});

it("retains public roster cursors through private, guest and banned relationships", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: "teacher", username: "teacher", name: "Teacher", email: "teacher@example.test", createdAt: 1 });
    for (const [index, studentId, extra] of [[0, "eligible", { studentCardsPublic: true }], [1, "private", {}], [2, "banned", { studentCardsPublic: true, isBanned: true }]] as const) {
      await ctx.db.insert("users", { clerkId: studentId, username: studentId, name: studentId, email: `${studentId}@example.test`, createdAt: 1, ...extra });
      await ctx.db.insert("authorStudents", { authorId: "teacher", key: `user:${studentId}`, studentId, publicVisible: true, context: "PRIVATE CONTEXT", updatedAt: index });
    }
    await ctx.db.insert("authorStudents", { authorId: "teacher", key: "guest:one", guestName: "Private guest", publicVisible: true, context: "PRIVATE CONTEXT", updatedAt: 3 });
  });
  let cursor: string | null = null;
  for (let page = 0; page < 4; page++) {
    const result: FunctionReturnType<typeof api.studentRoster.publicStudents> = await t.query(api.studentRoster.publicStudents, { username: "teacher", paginationOpts: { numItems: 1, cursor } });
    expect(result.page.map(row => row.username)).toEqual(page === 3 ? ["eligible"] : []);
    expect(result.page.every(row => row.context === null)).toBe(true);
    if (page < 3) { expect(result.isDone).toBe(false); expect(result.continueCursor).not.toBe(cursor); }
    cursor = result.continueCursor;
  }
});

it("retains sitemap cursors across unindexed and archived publications", async () => {
  const t = createTestConvex();
  const eligible = await t.run(async ctx => {
    let eligibleId;
    for (let index = 0; index < 3; index++) {
      const metadata = { title: index === 2 ? "عنوان منشور" : "Published", description: "", language: index === 2 ? "ar" : "en", tags: [], indexing: index === 0 ? "noindex" as const : "index" as const };
      const document = { schemaVersion: 1 as const, blocks: [] };
      const lessonId = await ctx.db.insert("lessons", { ownerId: "author", metadata: { ...metadata, title: "SECRET DRAFT" }, draft: document, revision: 0, status: index === 1 ? "archived" : "active", visibility: "public", communityState: "ok", searchText: "", createdAt: index, updatedAt: index });
      const publishedVersionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, document, visibility: "public", authorId: "author", publishedAt: index });
      await ctx.db.patch("lessons", lessonId, { publishedVersionId });
      if (index === 2) eligibleId = lessonId;
    }
    return eligibleId!;
  });
  let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const result: FunctionReturnType<typeof api.learnFrontend.listIndexableLessons> = await t.query(api.learnFrontend.listIndexableLessons, { paginationOpts: { numItems: 1, cursor } });
    expect(result.page.map(row => row.lessonId)).toEqual(page === 2 ? [eligible] : []);
    if (page < 2) { expect(result.isDone).toBe(false); expect(result.continueCursor).not.toBe(cursor); }
    else expect(result.page[0].metadata.title).toBe("عنوان منشور");
    cursor = result.continueCursor;
  }
});
