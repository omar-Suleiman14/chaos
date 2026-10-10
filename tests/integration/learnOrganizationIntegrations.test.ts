import { expect, it } from "vitest";
import { makeFunctionReference, httpRouter } from "convex/server";
import { api } from "@/convex/_generated/api";
import { registerOrganizationIntegrationRoutes } from "@/convex/learnOrganizationIntegrations";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
const write = makeFunctionReference<"mutation">("learnOrganizationIntegrations:write");
const read = makeFunctionReference<"query">("learnOrganizationIntegrations:read");
async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Organization", access: "selected", itemRefs: [], scopes: ["folders:read", "folders:update", "curricula:read", "curricula:map"] });
  const w = (operation: string, body: unknown, key = operation) => t.mutation(write, { tokenId: connection.tokenId, operation, body, idempotencyKey: key });
  const r = (resource: string, params: unknown = {}) => t.query(read, { tokenId: connection.tokenId, now: Date.now(), resource, params });
  return { t, owner, other, connection, w, r };
}
it("creates once, rejects reused keys, rechecks scopes and revocation", async () => {
  const { t, connection, w, r } = await setup();
  const first = await w("create", { name: "Study", parentId: null });
  expect(first.status).toBe(200);
  expect((await t.run(ctx => ctx.db.query("integrationIdempotency").withIndex("by_tokenId_and_key", q => q.eq("tokenId", connection.tokenId).eq("key", "v2:organization:create")).unique()))?.requestHash).toBe("cb3b3e25ac3423c794929ce47dbc2b621230428c7b9feb329699ef2d4c67f96a");
  expect(await w("create", { parentId: null, name: "Study" })).toMatchObject({ body: first.body, headers: { "Idempotent-Replayed": "true" } });
  expect((await w("create", { name: "Different", parentId: null })).status).toBe(422);
  expect(await r("folders")).toMatchObject({ status: 200, body: { page: [{ name: "Study" }] } });
  await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { scopes: ["folders:read"] }));
  expect((await w("create", { name: "Study", parentId: null })).status).toBe(403);
  await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { revokedAt: Date.now() }));
  expect((await r("folders")).status).toBe(401);
});
it("uses owner-only shared hierarchy and cycle protection", async () => {
  const { owner, other, w } = await setup();
  const own = await owner.mutation(api.folders.create, { name: "Own", parentId: null });
  const otherFolder = await other.mutation(api.folders.create, { name: "Other", parentId: null });
  expect((await w("move", { folderId: own, parentId: otherFolder })).status).toBe(404);
  expect(await w("move", { folderId: own, parentId: own }, "cycle")).toMatchObject({ status: 400, body: { error: { code: "FOLDER_CYCLE" } } });
});
it("requires selection for memberships and rechecks it before replay", async () => {
  const { t, owner, connection, w, r } = await setup();
  const lesson = await owner.mutation(api.lessons.create, { metadata: { title: "Lesson", description: "", language: "en", tags: [] } });
  const folder = await owner.mutation(api.folders.create, { name: "Folder", parentId: null });
  const body = { folderId: folder, asset: { kind: "lesson", id: lesson } };
  expect((await w("member", body)).status).toBe(404);
  await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [`lesson_${lesson}`] }));
  expect((await w("member", body)).status).toBe(200);
  expect(await r("contents", { folderId: folder })).toMatchObject({ status: 200, body: { page: [{ asset: body.asset }] } });
  await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [] }));
  expect((await w("member", body)).status).toBe(404);
  expect(await r("contents", { folderId: folder })).toMatchObject({ status: 200, body: { page: [] } });
});
it("maps selected owned lessons through shared coverage validation", async () => {
  const { t, owner, connection, w, r } = await setup();
  const lesson = await owner.mutation(api.lessons.create, { metadata: { title: "Lesson", description: "", language: "en", tags: [] } });
  const ids = await t.run(async ctx => {
    const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "university", name: "University" });
    const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "program", name: "Program" });
    const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "2026", name: "2026" });
    const nodeId = await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "module", name: "Module", kind: "module", conceptKeys: ["concept"] });
    await ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [`lesson_${lesson}`] });
    return { versionId, nodeId };
  });
  const body = { lessonId: lesson, ...ids, conceptKeys: ["concept"], blockIds: [] };
  expect((await w("mapping", body)).status).toBe(200);
  expect(await w("mapping", body)).toMatchObject({ headers: { "Idempotent-Replayed": "true" } });
  expect(await r("mappings", { lessonId: lesson })).toMatchObject({ body: { page: [{ lessonId: lesson }] } });
  expect((await w("mapping", { ...body, conceptKeys: ["missing"] }, "invalid")).status).toBe(400);
  expect(await r("institutions")).toMatchObject({ body: { page: [{ name: "University" }] } });
});
it("rejects malformed input, excessive pagination and mounts separate paths", async () => {
  const { w, r } = await setup();
  expect((await w("create", { name: "X", parentId: null, ownerId: "spoof" })).status).toBe(400);
  expect((await r("folders", { limit: 101 })).status).toBe(400);
  expect((await r("folders", { unexpected: 1 })).status).toBe(400);
  const router = httpRouter(); registerOrganizationIntegrationRoutes(router);
  expect(router.lookup("/api/integrations/v2/folders", "POST")).not.toBeNull();
  expect(router.lookup("/api/integrations/v2/curricula/nodes", "GET")).not.toBeNull();
  expect(router.lookup("/api/integrations/v1/folders", "GET")).toBeNull();
});
