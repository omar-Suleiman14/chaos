import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { fingerprintBytes, nearByteDuplicate } from "@/convex/sourceFingerprint";
import { api } from "@/convex/_generated/api";

function fixtureBytes(seed: number) {
  const bytes = new Uint8Array(512 * 100);
  let state = seed;
  for (let i = 0; i < bytes.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; bytes[i] = state >>> 24; }
  return bytes;
}
const register = makeFunctionReference<"mutation">("learnSources:registerUpload");
async function store(t: ReturnType<typeof createTestConvex>, actor: typeof creatorIdentity, bytes: Uint8Array) {
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array(bytes).buffer], { type: "text/plain" })));
  return t.withIdentity(actor).mutation(register, { storageId, contentType: "text/plain", fingerprint: fingerprintBytes(bytes), metadata: { title: "Notes", kind: "file", origin: "Personal" }, metadataVisibility: "private", contentVisibility: "private" });
}

it("flags small aligned byte changes while preserving a distinct source; exact SHA reuse remains", async () => {
  const t = createTestConvex(); const bytes = fixtureBytes(17);
  const original = await store(t, creatorIdentity, bytes);
  const changed = bytes.slice(); changed[1500] ^= 127;
  const similar = await store(t, creatorIdentity, changed);
  expect(similar).toMatchObject({ duplicate: false, nearDuplicateOf: original.sourceId });
  expect(similar.sourceId).not.toBe(original.sourceId);
  const stored = await t.run(ctx => ctx.db.get("learnSources", similar.sourceId));
  expect(stored?.nearDuplicateOf).toBe(original.sourceId);
  expect(stored?.contentVisibility).toBe("private");
  expect(await store(t, creatorIdentity, bytes)).toMatchObject({ duplicate: true, sourceId: original.sourceId });
});

it("does not disclose another owner's identical or similar private files", async () => {
  const t = createTestConvex(); const bytes = fixtureBytes(77);
  const original = await store(t, creatorIdentity, bytes);
  const changed = bytes.slice(); changed[100] ^= 1;
  const other = await store(t, otherCreatorIdentity, changed);
  expect(other.nearDuplicateOf).toBeUndefined();
  expect(JSON.stringify(other)).not.toContain(original.sourceId);
  expect(await t.withIdentity(otherCreatorIdentity).query(api.learnSources.getMetadata, { sourceId: original.sourceId })).toBeNull();
  const exactOther = await store(t, otherCreatorIdentity, bytes);
  expect(exactOther.duplicate).toBe(false);
  expect(exactOther.nearDuplicateOf).not.toBe(original.sourceId);
});

it("computes upload fingerprints on the server and keeps them out of metadata", async () => {
  const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity);
  const bytes = fixtureBytes(37).map(byte => 32 + byte % 90);
  const send = (body: Uint8Array) => owner.fetch("/learn/sources/upload?title=Notes&origin=Personal", { method: "POST", headers: { "Content-Type": "text/plain" }, body: new Uint8Array(body).buffer });
  const firstResponse = await send(bytes); expect(firstResponse.status).toBe(201);
  const first = await firstResponse.json();
  const changed = bytes.slice(); changed[1200] = 65;
  const response = await send(changed); expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ duplicate: false, nearDuplicateOf: first.sourceId });
  const metadata = await owner.query(api.learnSources.getMetadata, { sourceId: first.sourceId });
  expect(metadata).not.toHaveProperty("fingerprint");
  expect(metadata).not.toHaveProperty("nearDuplicateOf");
});

it("rejects unrelated, small, repetitive or substantially resized candidates", async () => {
  const t = createTestConvex(); const original = fixtureBytes(13), unrelated = fixtureBytes(92);
  await store(t, creatorIdentity, original);
  expect((await store(t, creatorIdentity, unrelated)).nearDuplicateOf).toBeUndefined();
  const fp = fingerprintBytes(original);
  expect(nearByteDuplicate(fp, original.length, fp, original.length * 1.1)).toBe(false);
  expect(nearByteDuplicate(fingerprintBytes(new Uint8Array(512 * 100)), 51200, fingerprintBytes(new Uint8Array(512 * 100)), 51200)).toBe(false);
  expect(fingerprintBytes(new Uint8Array(256)).chunks).toHaveLength(0);
  expect(fingerprintBytes(new Uint8Array(25 * 1024 * 1024)).chunks.length).toBeLessThanOrEqual(1024);
});

it("keeps fingerprints, lineage, hashes, bytes and manual excerpts out of MCP/API metadata and default context", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const original = await store(t, creatorIdentity, fixtureBytes(81));
  const changed = fixtureBytes(81); changed[1500] ^= 127;
  const similar = await store(t, creatorIdentity, changed);
  expect(similar.nearDuplicateOf).toBe(original.sourceId);
  const sourceId = similar.sourceId;
  await owner.mutation(makeFunctionReference<"mutation">("learnSourceExcerpts:replace"), { sourceId, expectedRevision: 0, excerpts: [{ id: "private", locator: { kind: "page", page: 1 }, text: "Secret manual quotation" }] });
  await owner.mutation(api.learnSources.update, { sourceId, metadataVisibility: "public" });
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Context", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "selected", type: "paragraph", text: "Lesson", citations: [{ sourceId, locator: { kind: "page", page: 1 } }], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Publish failed");
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Metadata", access: "selected", itemRefs: [], scopes: ["sources:read"] });
  await owner.mutation(api.learnIntegrations.setSourceSelection, { tokenId: connection.tokenId, sourceIds: [sourceId] });
  const mcp = await t.query(makeFunctionReference<"query">("mcpLearn:getSourceMetadata"), { userId: creatorIdentity.subject, sourceId });
  const context = await owner.query(api.learnContext.assemble, { lessonId, versionId: published.versionId, blockIds: ["selected"], sourceIds: [sourceId], includeMyProgress: false });
  const response = await t.fetch(`/api/integrations/v2/sources/source_${sourceId}`, { headers: { Authorization: `Bearer ${connection.token}` } });
  expect(response.status).toBe(200);
  const apiResult = await response.json();
  expect(apiResult.contentAccess).toBe("not_granted");
  for (const result of [mcp, apiResult, context]) {
    const json = JSON.stringify(result);
    for (const secret of ["fingerprint", "nearDuplicateOf", "sha256", "storageId", "Secret manual quotation", original.sourceId]) expect(json).not.toContain(secret);
  }
  expect(context.sourceExcerpts).toEqual([]);
  await owner.mutation(api.learnIntegrations.setSourceSelection, { tokenId: connection.tokenId, sourceIds: [] });
  expect((await t.fetch(`/api/integrations/v2/sources/source_${sourceId}`, { headers: { Authorization: `Bearer ${connection.token}` } })).status).toBe(404);
});
