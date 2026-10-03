import { expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const replace = makeFunctionReference<"mutation">("learnSourceExcerpts:replace");
it("revokes context from a restricted lesson creator despite an existing reader grant", async () => {
  const { t, other, args } = await fixture();
  const userId = await t.run(async ctx => {
    await ctx.db.insert("lessonPermissions", { lessonId: args.lessonId, userId: otherCreatorIdentity.subject, role: "reader" });
    return ctx.db.insert("users", { clerkId: creatorIdentity.subject, username: "creator", name: "Creator", email: "creator@example.com", createdAt: 0 });
  });
  const selection = { ...args, sourceIds: [] };
  expect(await other.query(api.learnContext.assemble, selection)).toMatchObject({ blocks: [{ id: "selected" }] });
  await t.run(ctx => ctx.db.patch("users", userId, { isBanned: true }));
  await expect(other.query(api.learnContext.assemble, selection)).rejects.toThrow(/NOT_FOUND|Lesson version not accessible/);
  await t.run(ctx => ctx.db.patch("users", userId, { isBanned: false, suspendedUntil: Date.now() + 60000 }));
  await expect(other.query(api.learnContext.assemble, selection)).rejects.toThrow(/NOT_FOUND|Lesson version not accessible/);
});
async function fixture() {
  const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const other = t.withIdentity(otherCreatorIdentity);
  const sourceId = await owner.mutation(api.learnSources.create, { metadata: { title: "Book", kind: "reference", origin: "Publisher" }, metadataVisibility: "public", contentVisibility: "private" });
  await owner.mutation(replace, { sourceId, expectedRevision: 0, excerpts: [{ id: "page23", locator: { kind: "page", page: 23 }, text: "Selected quotation" }, { id: "page24", locator: { kind: "page", page: 24 }, text: "Unrelated quotation" }] });
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Study", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "selected", type: "paragraph", text: "Lesson", citations: [{ sourceId, locator: { kind: "page", page: 23 } }], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("publish failed");
  return { t, owner, other, sourceId, args: { lessonId, versionId: published.versionId, blockIds: ["selected"], sourceIds: [sourceId], includeMyProgress: false } };
}

it("never includes excerpts by default; metadata access cannot grant quotation access", async () => {
  const { owner, other, sourceId, args } = await fixture();
  expect((await owner.query(api.learnContext.assemble, args)).sourceExcerpts).toEqual([]);
  const selected = { ...args, excerptSelections: [{ sourceId, excerptIds: ["page23"] }] };
  await expect(other.query(api.learnContext.assemble, selected)).rejects.toThrow("content unavailable");
  await owner.mutation(api.learnSources.update, { sourceId, contentVisibility: "public" });
  const packet = await other.query(api.learnContext.assemble, selected);
  expect(packet.sourceExcerpts[0].provenance).toBe("owner-supplied-unverified");
  expect(packet.boundaries.sourceExcerptsIncluded).toBe(true);
  expect(JSON.stringify(packet)).not.toContain("Unrelated quotation");
  await owner.mutation(api.learnSources.update, { sourceId, contentVisibility: "private" });
  await expect(other.query(api.learnContext.assemble, selected)).rejects.toThrow("content unavailable");
});

it("rejects uncited locations, omitted source selection, duplicate and excessive excerpts", async () => {
  const { owner, sourceId, args } = await fixture();
  await expect(owner.query(api.learnContext.assemble, { ...args, excerptSelections: [{ sourceId, excerptIds: ["page24"] }] })).rejects.toThrow("location");
  await expect(owner.query(api.learnContext.assemble, { ...args, sourceIds: [], excerptSelections: [{ sourceId, excerptIds: ["page23"] }] })).rejects.toThrow("explicit selected source");
  await expect(owner.query(api.learnContext.assemble, { ...args, excerptSelections: [{ sourceId, excerptIds: ["page23", "page23"] }] })).rejects.toThrow("distinct");
  await expect(owner.query(api.learnContext.assemble, { ...args, excerptSelections: [{ sourceId, excerptIds: Array.from({ length: 11 }, (_, n) => String(n)) }] })).rejects.toThrow("at most 10");
});

it("protects manual excerpt ownership, revision and size", async () => {
  const { owner, other, sourceId } = await fixture();
  await expect(other.mutation(replace, { sourceId, expectedRevision: 1, excerpts: [] })).rejects.toThrow("owned source");
  await expect(owner.mutation(replace, { sourceId, expectedRevision: 0, excerpts: [] })).rejects.toThrow("REVISION_CONFLICT");
  await expect(owner.mutation(replace, { sourceId, expectedRevision: 1, excerpts: [{ id: "large", locator: { kind: "page", page: 1 }, text: "x".repeat(4001) }] })).rejects.toThrow("4000");
});

it("uses only published curriculum snapshots and selected coverage, with opt-in", async () => {
  const { t, owner, args } = await fixture();
  await t.run(async ctx => {
    const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "uni", name: "University" });
    const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "medicine", name: "Medicine" });
    const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "2026", name: "2026" });
    const nodeId = await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "module", name: "Module", kind: "module", conceptKeys: [] });
    const conceptId = await ctx.db.insert("learnConcepts", { slug: "portal-hypertension", title: "Portal hypertension", description: "", createdBy: creatorIdentity.subject });
    await ctx.db.insert("learnConcepts", { slug: "unselected-concept", title: "Unselected", description: "", createdBy: creatorIdentity.subject });
    const published = await ctx.db.get("lessonVersions", args.versionId);
    if (!published) throw new Error("Missing version");
    await ctx.db.patch("lessonVersions", args.versionId, { document: { ...published.document, blocks: published.document.blocks.map(b => ({ ...b, conceptIds: [conceptId] })) }, curriculumMappings: [{ versionId, nodeId, blockIds: ["selected"], conceptKeys: ["portal-hypertension", "unselected-concept", "missing-concept"] }] });
    await ctx.db.insert("lessonCurriculumMappings", { lessonId: args.lessonId, versionId, nodeId, blockIds: [], conceptKeys: ["private-draft-concept"] });
  });
  expect((await owner.query(api.learnContext.assemble, args)).curriculum).toEqual([]);
  const packet = await owner.query(api.learnContext.assemble, { ...args, includeCurriculum: true });
  expect(packet.curriculum[0]).toMatchObject({ institution: "University", program: "Medicine", version: "2026", node: "Module", blockIds: ["selected"], conceptKeys: ["portal-hypertension"] });
  expect(JSON.stringify(packet)).not.toContain("private-draft-concept");
});

it("requires curriculum scope independently of context permission for integrations", async () => {
  const { t, owner, args } = await fixture();
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  try {
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const connection = await owner.mutation(api.integrations.createConnection, { label: "Context", access: "selected", itemRefs: [], scopes: ["tutor:context"] });
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [`lesson_${args.lessonId}`] }));
    const context = makeFunctionReference<"query">("learnStudyIntegrations:getContext");
    expect(await t.query(context, { ...args, tokenId: connection.tokenId, sourceIds: [], includeCurriculum: true })).toMatchObject({ status: 403 });
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { scopes: ["tutor:context", "curricula:read"] }));
    expect(await t.query(context, { ...args, tokenId: connection.tokenId, sourceIds: [], includeCurriculum: true })).toMatchObject({ status: 200 });
  } finally { vi.unstubAllEnvs(); }
});

it("passes optional curriculum and excerpt selections through the HTTP context transport", async () => {
  const { t, owner, sourceId, args } = await fixture();
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  try {
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const connection = await owner.mutation(api.integrations.createConnection, { label: "Context HTTP", access: "selected", itemRefs: [], scopes: ["tutor:context", "curricula:read", "sources:read"] });
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [`lesson_${args.lessonId}`, `source_${sourceId}`] }));
    const response = await t.fetch("/api/integrations/v2/context/assemble", { method: "POST", headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...args, includeCurriculum: true, excerptSelections: [{ sourceId, excerptIds: ["page23"] }] }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ curriculum: [], sourceExcerpts: [{ sourceId, excerpt: { id: "page23", text: "Selected quotation" } }], boundaries: { sourceExcerptsIncluded: true } });
  } finally { vi.unstubAllEnvs(); }
});

it("rechecks restricted quotation grants, replacement and removal on repeated assembly", async () => {
  const { owner, other, sourceId, args } = await fixture();
  const selected = { ...args, excerptSelections: [{ sourceId, excerptIds: ["page23"] }] };
  await owner.mutation(api.learnSources.update, { sourceId, contentVisibility: "restricted" });
  await owner.mutation(api.learnSources.setGrant, { sourceId, userId: otherCreatorIdentity.subject, metadata: true, content: false });
  await expect(other.query(api.learnContext.assemble, selected)).rejects.toThrow("content unavailable");
  await owner.mutation(api.learnSources.setGrant, { sourceId, userId: otherCreatorIdentity.subject, metadata: true, content: true });
  expect((await other.query(api.learnContext.assemble, selected)).sourceExcerpts).toHaveLength(1);
  await owner.mutation(api.learnSources.setGrant, { sourceId, userId: otherCreatorIdentity.subject, metadata: true, content: false });
  await expect(other.query(api.learnContext.assemble, selected)).rejects.toThrow("content unavailable");
  await owner.mutation(replace, { sourceId, expectedRevision: 1, excerpts: [] });
  await expect(owner.query(api.learnContext.assemble, selected)).rejects.toThrow("Stored excerpt unavailable");
  await owner.mutation(api.learnSources.remove, { sourceId });
  await expect(owner.query(api.learnContext.assemble, selected)).rejects.toThrow("metadata unavailable");
});

it("rechecks selected sources, scope, expiry and revocation on repeated HTTP context requests", async () => {
  const { t, owner, sourceId, args } = await fixture();
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  try {
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const connection = await owner.mutation(api.integrations.createConnection, { label: "Context revocation", access: "selected", itemRefs: [], scopes: ["tutor:context", "sources:read"] });
    const refs = [`lesson_${args.lessonId}`, `source_${sourceId}`];
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: refs }));
    const send = () => t.fetch("/api/integrations/v2/context/assemble", { method: "POST", headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...args, excerptSelections: [{ sourceId, excerptIds: ["page23"] }] }) });
    expect((await send()).status).toBe(200);
    await owner.mutation(api.learnIntegrations.setSourceSelection, { tokenId: connection.tokenId, sourceIds: [] });
    const deselected = await send();
    expect(deselected.status).toBe(404);
    expect(await deselected.text()).not.toContain("Selected quotation");
    await owner.mutation(api.learnIntegrations.setSourceSelection, { tokenId: connection.tokenId, sourceIds: [sourceId] });
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { scopes: ["tutor:context"] }));
    expect((await send()).status).toBe(403);
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { scopes: ["tutor:context", "sources:read"], expiresAt: Date.now() - 1 }));
    expect((await send()).status).toBe(401);
    await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { expiresAt: undefined, revokedAt: Date.now() }));
    expect((await send()).status).toBe(401);
  } finally { vi.unstubAllEnvs(); }
});
