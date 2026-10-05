import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const paginationOpts = { cursor: null, numItems: 25 };
const metadata = { title: "Private lesson", description: "Private prose", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "secret", type: "paragraph" as const, text: "Private content", citations: [], conceptIds: [] }] };

it("requires admin access for every platform inventory query", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  for (const caller of [t, t.withIdentity(otherCreatorIdentity)]) {
    for (const kind of ["courses", "lessons", "flashcards"] as const) {
      await expect(caller.query(api.admin.learningContent, { kind, paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
    }
    await expect(caller.query(api.admin.teams, { paginationOpts })).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
  }
});

it("maps learning lifecycle metadata and counts without returning private content", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const ids = await t.run(async ctx => {
    const ownerId = otherCreatorIdentity.subject;
    await ctx.db.insert("users", { clerkId: ownerId, name: "Inventory owner", email: "owner@example.com", username: "inventory", createdAt: 0 });
    const lesson = await ctx.db.insert("lessons", { ownerId, metadata, draft: document, revision: 0, status: "active", visibility: "private", communityState: "ok", createdAt: 10, updatedAt: 20, searchText: "Private content" });
    const lessonVersion = await ctx.db.insert("lessonVersions", { lessonId: lesson, number: 1, metadata, document, authorId: ownerId, publishedAt: 15 });
    await ctx.db.patch(lesson, { publishedVersionId: lessonVersion });
    const course = await ctx.db.insert("learnCollections", { ownerId, metadata: { ...metadata, title: "Draft course" }, items: [], lessonIds: [lesson], revision: 0, visibility: "public", communityState: "ok", createdAt: 30, updatedAt: 40 });
    const legacyCourse = await ctx.db.insert("learnCollections", { ownerId, metadata: { ...metadata, title: "Archived course" }, items: [{ kind: "lesson", id: lesson, versionId: lessonVersion }], archived: true, revision: 0, visibility: "private", communityState: "ok", createdAt: 50, updatedAt: 60 });
    const set = await ctx.db.insert("flashcardSets", { ownerId, title: "Archived cards", cards: [{ id: "card", front: "Secret question", back: "Secret answer", conceptIds: [] }], archived: true, revision: 0, visibility: "private", updatedAt: 70 });
    return { lesson, course, legacyCourse, set };
  });
  const admin = t.withIdentity(creatorIdentity);
  const lessons = await admin.query(api.admin.learningContent, { kind: "lessons", paginationOpts });
  expect(lessons.page).toEqual([{ id: ids.lesson, title: "Private lesson", ownerId: otherCreatorIdentity.subject, ownerName: "Inventory owner", ownerEmail: "owner@example.com", status: "live", createdAt: 10, updatedAt: 20, count: 0 }]);
  const courses = await admin.query(api.admin.learningContent, { kind: "courses", paginationOpts });
  expect(courses.page).toEqual(expect.arrayContaining([
    { id: ids.course, title: "Draft course", ownerId: otherCreatorIdentity.subject, ownerName: "Inventory owner", ownerEmail: "owner@example.com", status: "draft", createdAt: 30, updatedAt: 40, count: 1 },
    { id: ids.legacyCourse, title: "Archived course", ownerId: otherCreatorIdentity.subject, ownerName: "Inventory owner", ownerEmail: "owner@example.com", status: "archived", createdAt: 50, updatedAt: 60, count: 1 },
  ]));
  const cards = await admin.query(api.admin.learningContent, { kind: "flashcards", paginationOpts });
  expect(cards.page[0]).toEqual({ id: ids.set, title: "Archived cards", ownerId: otherCreatorIdentity.subject, ownerName: "Inventory owner", ownerEmail: "owner@example.com", status: "archived", createdAt: expect.any(Number), updatedAt: 70, count: 1 });
  expect(JSON.stringify([lessons, courses, cards])).not.toMatch(/Secret question|Secret answer|Private content|Private prose/);
  const first = await admin.query(api.admin.learningContent, { kind: "courses", paginationOpts: { cursor: null, numItems: 1 } });
  const second = await admin.query(api.admin.learningContent, { kind: "courses", paginationOpts: { cursor: first.continueCursor, numItems: 1 } });
  expect(first.page).toHaveLength(1);
  expect(second.page).toHaveLength(1);
  expect(second.page[0].id).not.toBe(first.page[0].id);
});

it("counts only each team's indexed memberships and shared resources and preserves pagination", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const teams = await t.run(async ctx => {
    const ownerId = otherCreatorIdentity.subject;
    const first = await ctx.db.insert("businessTeams", { name: "School", ownerId, createdAt: 10 });
    const second = await ctx.db.insert("businessTeams", { name: "Other school", ownerId, createdAt: 20 });
    const folder = await ctx.db.insert("folders", { ownerId, name: "Private folder", parentId: null, createdAt: 10, updatedAt: 10 });
    await ctx.db.insert("businessMembers", { teamId: first, userId: ownerId, role: "owner", joinedAt: 10 });
    await ctx.db.insert("businessMembers", { teamId: first, userId: creatorIdentity.subject, role: "member", joinedAt: 10 });
    await ctx.db.insert("businessMembers", { teamId: second, userId: ownerId, role: "owner", joinedAt: 10 });
    await ctx.db.insert("businessShares", { teamId: first, asset: { kind: "folder", id: folder }, ownerId, sharedBy: ownerId, createdAt: 10 });
    return { first, second };
  });
  const admin = t.withIdentity(creatorIdentity);
  const result = await admin.query(api.admin.teams, { paginationOpts });
  expect(result.page).toEqual(expect.arrayContaining([
    { id: teams.first, name: "School", ownerId: otherCreatorIdentity.subject, ownerName: otherCreatorIdentity.subject, ownerEmail: "", createdAt: 10, members: 2, sharedResources: 1 },
    { id: teams.second, name: "Other school", ownerId: otherCreatorIdentity.subject, ownerName: otherCreatorIdentity.subject, ownerEmail: "", createdAt: 20, members: 1, sharedResources: 0 },
  ]));
  expect(JSON.stringify(result)).not.toContain("Private folder");
  const first = await admin.query(api.admin.teams, { paginationOpts: { cursor: null, numItems: 1 } });
  const second = await admin.query(api.admin.teams, { paginationOpts: { cursor: first.continueCursor, numItems: 1 } });
  expect(new Set([...first.page, ...second.page].map(row => row.id)).size).toBe(2);
});
