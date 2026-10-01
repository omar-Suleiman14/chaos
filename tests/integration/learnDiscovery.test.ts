import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";

import { api } from "@/convex/_generated/api";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
type DiscoveryKind = "institution" | "program" | "module" | "creator" | "tag";
type DiscoveryArgs = { creatorMatch?: "name" | "username"; kind: DiscoveryKind; text: string; institutionId?: Id<"curriculumInstitutions">; versionId?: Id<"curriculumVersions">; paginationOpts: { numItems: number; cursor: string | null; endCursor?: string } };
type DiscoveryResult = { page: { kind: DiscoveryKind; id: string; name: string; parentId: string | null }[]; isDone: boolean; continueCursor: string };
const discover = makeFunctionReference<"query", DiscoveryArgs, DiscoveryResult>("learnDiscovery:search");
const paginationOpts = { numItems: 25, cursor: null };
it("discovers canonical institutions/programs/modules and subjects with scoped filters", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "university", name: "University" });
    const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "medicine", name: "Medicine" });
    const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "2026", name: "2026" });
    await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "git", name: "GIT module", kind: "module", conceptKeys: [] });
    await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "git-year", name: "GIT year", kind: "year", conceptKeys: [] });
    await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "git-subject", name: "GIT subject", kind: "subject", conceptKeys: [] });
    return { institutionId, versionId };
  });
  expect((await t.query(discover, { kind: "institution", text: "UNIVERSITY", paginationOpts })).page[0].name).toBe("University");
  expect((await t.query(discover, { kind: "program", text: "medicine", institutionId: ids.institutionId, paginationOpts })).page).toHaveLength(1);
  expect((await t.query(discover, { kind: "module", text: "git", versionId: ids.versionId, paginationOpts })).page.map(r => r.name)).toEqual(["GIT module", "GIT subject"]);
});
it("uses only published public tags and creators, including for authenticated owners", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  const uid = await t.run(ctx => ctx.db.insert("users", { clerkId: creatorIdentity.subject, username: "casey", name: "Casey", email: "secret@example.com", createdAt: 0 }));
  const metadata = { title: "Lesson", description: "", language: "en", tags: ["PublicTag"] };
  const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Content", citations: [], conceptIds: [] }] };
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  expect((await owner.query(discover, { kind: "creator", text: "casey", paginationOpts })).page).toEqual([]);
    expect((await owner.query(discover, { kind: "creator", creatorMatch: "name", text: "Casey", paginationOpts })).page).toEqual([]);
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 1, metadata: { ...metadata, tags: ["SecretTag"] }, document });
  expect((await t.query(discover, { kind: "tag", text: "public", paginationOpts })).page[0].name).toBe("PublicTag");
  expect((await owner.query(discover, { kind: "tag", text: "secret", paginationOpts })).page).toEqual([]);
  const creators = await t.query(discover, { kind: "creator", text: "casey", paginationOpts });
  expect((await t.query(discover, { kind: "creator", creatorMatch: "name", text: "Casey", paginationOpts })).page).toEqual(creators.page);
  expect(creators.page).toEqual([{ kind: "creator", id: "casey", name: "Casey", parentId: null }]);
  expect(JSON.stringify(creators)).not.toContain("secret@example.com");
  for (const patch of [{ visibility: "restricted" as const }, { visibility: "public" as const, communityState: "hidden" as const }, { communityState: "ok" as const, status: "archived" as const }]) {
    await t.run(ctx => ctx.db.patch("lessons", lessonId, patch));
    expect((await owner.query(discover, { kind: "creator", text: "casey", paginationOpts })).page).toEqual([]);
    expect((await owner.query(discover, { kind: "creator", creatorMatch: "name", text: "Casey", paginationOpts })).page).toEqual([]);
  }
  await t.run(async ctx => { await ctx.db.patch("lessons", lessonId, { status: "active" }); await ctx.db.patch("users", uid, { isBanned: true }); });
  expect((await t.query(discover, { kind: "tag", text: "public", paginationOpts })).page).toEqual([]);
});
it("continues past empty filtered pages and rejects oversized or inapplicable requests", async () => {
  const t = createTestConvex();
  await t.run(async ctx => { await ctx.db.insert("curriculumInstitutions", { key: "a", name: "Unrelated" }); await ctx.db.insert("curriculumInstitutions", { key: "b", name: "Target" }); });
  const first = await t.query(discover, { kind: "institution", text: "target", paginationOpts: { numItems: 1, cursor: null } });
  expect(first.page[0].name).toBe("Target");
  expect(first.page).toHaveLength(1);
  for (const numItems of [0, 26, 1.5]) await expect(t.query(discover, { kind: "tag", text: "tag", paginationOpts: { numItems, cursor: null } })).rejects.toThrow("1–25");
  await expect(t.query(discover, { kind: "tag", text: " ", paginationOpts })).rejects.toThrow("1–200");
  await expect(t.query(discover, { kind: "tag", text: "tag", paginationOpts: { ...paginationOpts, endCursor: "x" } })).rejects.toThrow("endCursor");
});
it("finds indexed names beyond the first catalog page and paginates matches", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    for (let i = 0; i < 30; i++) await ctx.db.insert("curriculumInstitutions", { key: `a${i}`, name: `Unrelated ${i}` });
    await ctx.db.insert("curriculumInstitutions", { key: "z1", name: "Target university one" });
    await ctx.db.insert("curriculumInstitutions", { key: "z2", name: "Target university two" });
  });
  const first = await t.query(discover, { kind: "institution", text: "Target", paginationOpts: { numItems: 1, cursor: null } });
  expect(first.page).toHaveLength(1);
  const second = await t.query(discover, { kind: "institution", text: "Target", paginationOpts: { numItems: 1, cursor: first.continueCursor } });
  expect(second.page).toHaveLength(1);
  expect(second.page[0].id).not.toBe(first.page[0].id);
});




it("checks another bounded creator snapshot after a stale newest candidate", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await t.run(ctx => ctx.db.insert("users", { clerkId: creatorIdentity.subject, username: "casey", name: "Casey", email: "private@example.com", createdAt: 0 }));
  const input = { metadata: { title: "Public", description: "", language: "en", tags: [] }, document: { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Content", citations: [], conceptIds: [] }] } };
  const lessonId = await owner.mutation(api.lessons.create, input);
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  const stale = await owner.mutation(api.lessons.create, input);
  await t.run(ctx => ctx.db.patch("lessons", stale, { visibility: "public" }));
  expect((await t.query(discover, { kind: "creator", text: "casey", paginationOpts })).page).toHaveLength(1);
});
