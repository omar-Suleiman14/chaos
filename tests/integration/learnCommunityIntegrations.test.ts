import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import { integrationScopes } from "@/convex/integrationModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

const save = makeFunctionReference<"mutation">("learnCommunityIntegrations:saveLesson");
const savePublic = makeFunctionReference<"mutation">("learnCommunityIntegrations:savePublic");
const search = makeFunctionReference<"query">("learnCommunityIntegrations:searchPublic");
const fork = makeFunctionReference<"mutation">("learnCommunityIntegrations:forkPublic");
afterEach(() => vi.unstubAllEnvs());
async function setup(scopes: (typeof integrationScopes)[number][] = ["community:read", "community:save"]) {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Community nephrology", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "one", type: "paragraph", text: "Nephrology material", citations: [], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Fixture publication failed");
  const connection = await student.mutation(api.integrations.createConnection, { label: "Study", access: "selected", itemRefs: [], scopes });
  return { t, owner, student, lessonId, versionId: published.versionId, tokenId: connection.tokenId };
}

describe("Community internal integration contract", () => {
  it("shares one signal and aggregate across native, MCP and bearer saves", async () => {
    const { t, student, lessonId, tokenId } = await setup();
    await student.mutation(api.learnCommunity.setSignals, { lessonId, saved: true, helpful: true });
    await t.mutation(save, { userId: otherCreatorIdentity.subject, lessonId });
    await t.mutation(savePublic, { tokenId, lessonId, saved: true });
    expect(await t.run(ctx => ctx.db.query("learnCommunitySignals").collect())).toMatchObject([{ userKey: otherCreatorIdentity.tokenIdentifier, saved: true, helpful: true }]);
    expect(await t.run(ctx => ctx.db.query("learnCommunityStats").collect())).toMatchObject([{ saves: 1, helpful: 1 }]);
    await t.mutation(savePublic, { tokenId, lessonId, saved: false });
    expect(await student.query(api.learnCommunity.getMySignals, { lessonId })).toEqual({ saved: false, helpful: true });
  });
  it("allows withdrawal after hiding but rejects new saves", async () => {
    const { t, lessonId, tokenId } = await setup();
    await t.mutation(savePublic, { tokenId, lessonId, saved: true });
    await t.run(ctx => ctx.db.patch("lessons", lessonId, { communityState: "hidden" }));
    await expect(t.mutation(savePublic, { tokenId, lessonId, saved: true })).rejects.toThrow();
    await expect(t.mutation(savePublic, { tokenId, lessonId, saved: false })).resolves.toEqual({ saved: false });
  });
  it("requires configured issuer and rejects client-supplied identity", async () => {
    const { t, lessonId } = await setup();
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "");
    await expect(t.mutation(save, { userId: otherCreatorIdentity.subject, lessonId })).rejects.toThrow("CLERK_JWT");
    await expect(t.mutation(save, { userId: otherCreatorIdentity.subject, lessonId, tokenIdentifier: "victim" })).rejects.toThrow();
  });
  it("checks scopes, active owners and revoked tokens", async () => {
    const { t, lessonId, versionId, tokenId } = await setup(["community:read"]);
    await expect(t.mutation(savePublic, { tokenId, lessonId, saved: true })).rejects.toThrow("INSUFFICIENT_SCOPE");
    await expect(t.mutation(fork, { tokenId, lessonId, versionId, idempotencyKey: "fork" })).rejects.toThrow("INSUFFICIENT_SCOPE");
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { revokedAt: Date.now() }));
    await expect(t.query(search, { tokenId, text: "nephrology", paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("TOKEN_REVOKED");
  });
  it("searches only public published material with bounded native pagination", async () => {
    const { t, lessonId, tokenId } = await setup();
    const result = await t.query(search, { tokenId, text: "nephrology", paginationOpts: { numItems: 10, cursor: null } });
    expect(result).toMatchObject({ page: [{ lessonId, metadata: { title: "Community nephrology" } }] });
    expect(JSON.stringify(result)).not.toContain("storageId");
    await expect(t.query(search, { tokenId, text: "nephrology", paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow("Page size");
    await t.run(ctx => ctx.db.patch("lessons", lessonId, { visibility: "private" }));
    expect(await t.query(search, { tokenId, text: "nephrology", paginationOpts: { numItems: 10, cursor: null } })).toMatchObject({ page: [] });
  });
  it.skipIf(!integrationScopes.some(scope => String(scope) === "community:fork"))("creates private lineage-preserving forks once and rechecks access on retry", async () => {
    const forkScope = integrationScopes.find(scope => String(scope) === "community:fork");
    if (!forkScope) throw new Error("Parent must add community:fork scope");
    const { t, lessonId, versionId, tokenId } = await setup([forkScope]);
    const input = { tokenId, lessonId, versionId, idempotencyKey: "stable" };
    const first = await t.mutation(fork, input);
    expect(await t.mutation(fork, input)).toEqual(first);
    expect(await t.run(ctx => ctx.db.query("lessons").collect())).toHaveLength(2);
    expect(await t.run(ctx => ctx.db.get("lessons", first.lessonId))).toMatchObject({ visibility: "private", parentLessonId: lessonId, parentVersionId: versionId, externalOrigin: { connectionId: tokenId } });
    await t.run(ctx => ctx.db.patch("lessons", lessonId, { communityState: "hidden" }));
    await expect(t.mutation(fork, input)).rejects.toThrow();
  });
});
