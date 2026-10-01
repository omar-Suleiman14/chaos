import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
it("ranks by published curriculum coverage, current review and capped open reports without identity scoring", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Lesson", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Content", conceptIds: [], citations: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Publication failed");
  const ids = await t.run(async ctx => {
    const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "uni", name: "University" });
    const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "med", name: "Medicine" });
    const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "2026", name: "2026" });
    const nodeId = await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "git", name: "GIT", kind: "module", conceptKeys: [] });
    await ctx.db.patch("lessonVersions", published.versionId, { curriculumMappings: [{ versionId, nodeId, conceptKeys: [], blockIds: [] }] });
    await ctx.db.insert("learnQuality", { lessonId, versionId: published.versionId, status: "reviewed", reason: "Reviewed" });
    for (let i = 0; i < 7; i++) await ctx.db.insert("learnReports", { lessonId, reporterKey: `reporter${i}`, category: "inaccurate", detail: "Private report", status: "open", createdAt: 0 });
    return { versionId, nodeId };
  });
  const args = { asOf: Date.now(), limit: 20, curriculumVersionId: ids.versionId, nodeId: ids.nodeId };
  const before = await t.query(api.learnCommunity.rank, args);
  expect(before[0].signals).toMatchObject({ curriculum: 2, quality: 1, reports: -1.25 });
  expect(JSON.stringify(before)).not.toContain("Private report");
  await t.run(ctx => ctx.db.insert("learnIdentityClaims", { userKey: creatorIdentity.tokenIdentifier, role: "educator", institution: "University", status: "verified", createdAt: 0 }));
  expect(await t.query(api.learnCommunity.rank, args)).toEqual(before);
  await t.run(ctx => ctx.db.patch("lessonVersions", published.versionId, { curriculumMappings: [] }));
  expect(await t.query(api.learnCommunity.rank, args)).toEqual([]);
});
