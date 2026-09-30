import { describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { registerLearnIntegrationRoutes } from "@/convex/learnIntegrations";
import { integrationScopes, learnIntegrationScopes } from "@/convex/integrationModel";
import { httpRouter } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { LessonDocument } from "@/convex/learnModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

const metadata = { title: "Connected lesson", description: "Review before publishing", language: "en", tags: [] };
const document: LessonDocument = { schemaVersion: 1, blocks: [{ id: "intro", type: "heading", level: 1, text: "Introduction", citations: [], conceptIds: [] }] };
const source = { type: "notes", id: "page-1", title: "My notes", url: "https://notes.example/page-1" };
const draft = { kind: "lesson", metadata, document, source };
const learnIntegrationApi = internal.learnIntegrations;
type T = ReturnType<typeof createTestConvex>;
async function setup(scopes: string[] = ["lessons:read", "lessons:create", "lessons:update"]) {
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Notes", access: "selected", itemRefs: [], scopes: scopes as never });
  const tokenId = connection.tokenId;
  const create = (key = "create", body: unknown = draft) => t.mutation(learnIntegrationApi.createDraft, { tokenId, idempotencyKey: key, body });
  const read = (ref: string, view?: "definition" | "outline") => t.query(learnIntegrationApi.getLesson, { tokenId, now: Date.now(), ref, view });
  const update = (ref: string, revision = "0", key = "update", body: unknown = { document }) => t.mutation(learnIntegrationApi.updateDraft, { tokenId, ref, ifMatch: revision, idempotencyKey: key, body });
  return { t, owner, other, tokenId, token: connection.token, create, read, update };
}
function createdItem(result: { status: number; body: unknown }) {
  expect(result.status).toBeLessThan(300);
  return (result.body as { item: { itemRef: string; lessonId: Id<"lessons">; revision: number; source: typeof source; connectionId: Id<"integrationTokens"> } }).item;
}
async function select(t: T, tokenId: Id<"integrationTokens">, refs: string[]) {
  await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { itemRefs: refs }));
}

describe("Learn integration v2", () => {
  it("advertises dedicated scopes without publication and keeps v1 unchanged", async () => {
    const { t, tokenId } = await setup(["items:read", "lessons:read"]);
    expect(integrationScopes).toContain("lessons:update");
    expect(learnIntegrationScopes).not.toContain("lessons:publish");
    expect(await t.query(learnIntegrationApi.capabilities, { tokenId, now: Date.now() })).toMatchObject({ status: 200, body: { apiVersion: "2", supportedVersions: ["1", "2"], selection: "explicit" } });
    expect(await t.query(learnIntegrationApi.capabilities, { tokenId, now: Date.now() })).toMatchObject({ body: { scopes: ["lessons:read"], availableScopes: ["lessons:read", "lessons:create", "lessons:update"] } });
    expect(await t.query(internal.integrations.capabilities, { tokenId, now: Date.now() })).toMatchObject({ status: 200, body: { apiVersion: "1", supportedKinds: ["form", "quiz"] } });
    const router = httpRouter(); registerLearnIntegrationRoutes(router);
    expect(router.lookup("/api/integrations/v2/capabilities", "GET")).not.toBeNull();
    expect(router.lookup("/api/integrations/v1/capabilities", "GET")).toBeNull();
  });

  it("creates private drafts with connection/source provenance, definitions and outlines", async () => {
    const { t, tokenId, create, read } = await setup();
    const item = createdItem(await create());
    expect(item.source).toEqual(source); expect(item.connectionId).toBe(tokenId);
    expect(await read(item.itemRef, "definition")).toMatchObject({ status: 200, body: { document, revision: 0 } });
    expect(await read(item.itemRef, "outline")).toMatchObject({ status: 200, body: { outline: [{ id: "intro", type: "heading", title: "Introduction" }], document: null } });
    expect(await t.run(ctx => ctx.db.get("lessons", item.lessonId))).toMatchObject({ visibility: "private", revision: 0 });
    expect((await t.run(ctx => ctx.db.get("lessons", item.lessonId)))?.publishedVersionId).toBeUndefined();
  });

  it.each(["revoked", "expired", "banned", "suspended"])("rechecks %s tokens on every operation", async state => {
    const { t, tokenId, create, read, update } = await setup();
    const item = createdItem(await create());
    await t.run(async ctx => {
      if (state === "revoked") await ctx.db.patch("integrationTokens", tokenId, { revokedAt: Date.now() });
      if (state === "expired") await ctx.db.patch("integrationTokens", tokenId, { expiresAt: Date.now() });
      if (state === "banned" || state === "suspended") {
        const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
        await ctx.db.patch("users", user!._id, state === "banned" ? { isBanned: true } : { suspendedUntil: Date.now() + 10000 });
      }
    });
    expect((await create()).status).toBe(401); expect((await read(item.itemRef)).status).toBe(401); expect((await update(item.itemRef)).status).toBe(401);
    expect((await t.query(learnIntegrationApi.capabilities, { tokenId, now: Date.now() })).status).toBe(401);
    expect((await t.mutation(learnIntegrationApi.unlinkLesson, { tokenId, ref: item.itemRef })).status).toBe(401);
  });

  it("requires least privilege scopes independently and rechecks removed scopes before replay", async () => {
    const { t, tokenId, create, read, update } = await setup();
    const item = createdItem(await create());
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { scopes: ["items:read", "drafts:create", "drafts:update", "definitions:read"] }));
    expect((await create()).status).toBe(403); expect((await read(item.itemRef)).status).toBe(403); expect((await update(item.itemRef)).status).toBe(403);
    expect((await t.mutation(learnIntegrationApi.unlinkLesson, { tokenId, ref: item.itemRef })).status).toBe(403);
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { scopes: ["lessons:read"] }));
    expect((await read(item.itemRef)).status).toBe(200); expect((await create("new")).status).toBe(403);
  });

  it("refuses arbitrary owner and cross-user assets even when selected or v1 access is all", async () => {
    const { t, owner, other, tokenId, read, update } = await setup();
    const ownId = await owner.mutation(api.lessons.create, { metadata, document });
    const otherId = await other.mutation(api.lessons.create, { metadata, document });
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { access: "all" }));
    expect((await read(`lesson_${ownId}`)).status).toBe(404);
    await select(t, tokenId, [`lesson_${ownId}`, `lesson_${otherId}`]);
    expect((await read(`lesson_${ownId}`)).status).toBe(200);
    expect((await read(`lesson_${otherId}`)).status).toBe(404);
    expect((await update(`lesson_${otherId}`)).status).toBe(404);
    await t.run(ctx => ctx.db.insert("integrationCreatedItems", { tokenId, itemRef: `lesson_${otherId}`, createdAt: Date.now() }));
    expect((await read(`lesson_${otherId}`)).status).toBe(404);
    await select(t, tokenId, []);
    expect((await read(`lesson_${ownId}`)).status).toBe(404);
  });

  it("lets the native owner grant/revoke existing lesson selections while preserving v1 refs", async () => {
    const { t, owner, other, tokenId, read, update } = await setup();
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
    const foreignId = await other.mutation(api.lessons.create, { metadata, document });
    const quizId = await owner.mutation(api.quizFunctions.createQuiz, { title: "Keep v1 selection" });
    await select(t, tokenId, [`quiz_${quizId}`]);
    const ref = `lesson_${lessonId}`;
    expect((await read(ref)).status).toBe(404);
    await expect(t.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [lessonId] })).rejects.toThrow();
    await expect(other.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [lessonId] })).rejects.toThrow("unauthorized");
    await expect(owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [foreignId] })).rejects.toThrow("unauthorized");
    expect(await owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [lessonId, lessonId] })).toEqual({ lessonRefs: [ref] });
    expect((await t.run(ctx => ctx.db.get("integrationTokens", tokenId)))?.itemRefs).toEqual([`quiz_${quizId}`, ref]);
    expect((await read(ref)).status).toBe(200); expect((await update(ref)).status).toBe(200);
    await owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [] });
    expect((await read(ref)).status).toBe(404); expect((await update(ref, "1", "revoked-selection")).status).toBe(404);
    expect((await t.run(ctx => ctx.db.get("integrationTokens", tokenId)))?.itemRefs).toEqual([`quiz_${quizId}`]);
    expect((await owner.query(api.lessons.getDraft, { lessonId })).revision).toBe(1);
  });

  it("requires active tokens and existing lesson read/update scope for native selection", async () => {
    const { t, owner, tokenId } = await setup(["lessons:create"]);
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
    await expect(owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [lessonId] })).rejects.toThrow("INSUFFICIENT_SCOPE");
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { scopes: ["lessons:read"], access: "all" }));
    await owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [lessonId] });
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { revokedAt: Date.now() }));
    await expect(owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [] })).rejects.toThrow("Active connection");
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { revokedAt: undefined, expiresAt: Date.now() }));
    await expect(owner.mutation(api.learnIntegrations.setLessonSelection, { tokenId, lessonIds: [] })).rejects.toThrow("Active connection");
  });

  it("makes canonical creation and updates idempotent, isolates keys by connection and API version", async () => {
    const { t, owner, tokenId, create, update } = await setup();
    const first = createdItem(await create());
    const retry = await create("create", { source, document, metadata, kind: "lesson" });
    expect(createdItem(retry).lessonId).toBe(first.lessonId); expect(retry.headers?.["Idempotent-Replayed"]).toBe("true");
    expect((await create("create", { ...draft, metadata: { ...metadata, title: "Different" } })).status).toBe(422);
    const updated = await update(first.itemRef); expect(createdItem(updated).revision).toBe(1);
    expect(createdItem(await update(first.itemRef)).revision).toBe(1);
    const second = await owner.mutation(api.integrations.createConnection, { label: "Second", scopes: ["lessons:create"], access: "selected", itemRefs: [] });
    expect(createdItem(await t.mutation(learnIntegrationApi.createDraft, { tokenId: second.tokenId, idempotencyKey: "create", body: draft })).lessonId).not.toBe(first.lessonId);
    await t.run(ctx => ctx.db.insert("integrationIdempotency", { tokenId, key: "create", requestHash: "v1", status: 201, body: "{}", createdAt: Date.now() }));
    expect(createdItem(await create()).lessonId).toBe(first.lessonId);
    expect((await t.run(ctx => ctx.db.query("lessons").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", creatorIdentity.subject)).take(10)))).toHaveLength(2);
  });

  it("returns revision conflicts without overwriting data and protects block operations", async () => {
    const { t, tokenId, create, update, read } = await setup();
    const item = createdItem(await create());
    expect(createdItem(await update(item.itemRef)).revision).toBe(1);
    expect(await update(item.itemRef, "0", "stale")).toMatchObject({ status: 409, body: { error: { code: "REVISION_CONFLICT" } } });
    const block = { id: "detail", type: "paragraph", text: "More detail", citations: [], conceptIds: [] };
    const args = { tokenId, ref: item.itemRef, ifMatch: '"1"', idempotencyKey: "append", blocks: true, body: { operations: [{ action: "append", blocks: [block] }] } };
    expect(createdItem(await t.mutation(learnIntegrationApi.updateDraft, args)).revision).toBe(2);
    expect(createdItem(await t.mutation(learnIntegrationApi.updateDraft, args)).revision).toBe(2);
    expect((await t.mutation(learnIntegrationApi.updateDraft, { ...args, idempotencyKey: "stale-block" })).status).toBe(409);
    expect(await read(item.itemRef, "definition")).toMatchObject({ body: { document: { blocks: [document.blocks[0], block] } } });
    expect(await t.run(ctx => ctx.db.query("lessonDraftRecovery").withIndex("by_lessonId_and_revision", q => q.eq("lessonId", item.lessonId)).take(10))).toHaveLength(2);
  });

  it("updates only drafts and leaves an immutable published snapshot unchanged", async () => {
    const { t, owner, create, update } = await setup(); const item = createdItem(await create());
    const publication = await owner.mutation(api.lessons.publish, { lessonId: item.lessonId, expectedRevision: 0, visibility: "public" });
    if (!publication.ok) throw new Error("Publication failed");
    const changed = { schemaVersion: 1, blocks: [{ ...document.blocks[0], text: "Draft only" }] };
    expect(createdItem(await update(item.itemRef, "1", "after-publication", { document: changed })).revision).toBe(2);
    expect((await t.run(ctx => ctx.db.get("lessonVersions", publication.versionId)))?.document).toEqual(document);
  });

  it("validates all unknown JSON, malformed IDs and invalid blocks before writing", async () => {
    const { t, create } = await setup();
    const bodies = [null, [], { ...draft, publish: true }, { ...draft, metadata: { ...metadata, ownerId: "attacker" } }, { ...draft, source: { ...source, secret: true } }, { ...draft, document: { ...document, extra: true } }, { ...draft, document: { schemaVersion: 1, blocks: [{ ...document.blocks[0], extra: true }] } }, { ...draft, document: { schemaVersion: 1, blocks: [document.blocks[0], document.blocks[0]] } }, { ...draft, document: { schemaVersion: 1, blocks: [{ id: "source", type: "source", sourceId: "bad-id", label: "bad", citations: [], conceptIds: [] }] } }];
    for (const [i, body] of bodies.entries()) expect((await create(`invalid-${i}`, body)).status).toBe(400);
    expect(await t.run(ctx => ctx.db.query("lessons").take(10))).toHaveLength(0);
  });

  it("requires independent source scope, selected source and owner even for public references", async () => {
    const { t, tokenId, create } = await setup();
    const sourceId = await t.run(ctx => ctx.db.insert("learnSources", { ownerId: creatorIdentity.subject, uploadedBy: creatorIdentity.subject, metadata: { title: "Reference", kind: "reference", origin: "manual" }, metadataVisibility: "private", contentVisibility: "private", status: "active", createdAt: Date.now() }));
    const body = { ...draft, document: { schemaVersion: 1, blocks: [{ id: "source", type: "source", sourceId, label: "Reference", citations: [], conceptIds: [] }] } };
    expect((await create("source", body)).status).toBe(403);
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { scopes: ["lessons:create", "sources:read"] }));
    expect((await create("source", body)).status).toBe(404);
    await select(t, tokenId, [`source_${sourceId}`]);
    expect((await create("source", body)).status).toBe(201);
    await select(t, tokenId, []); expect((await create("source", body)).status).toBe(404);
    await select(t, tokenId, [`source_${sourceId}`]);
    await t.run(ctx => ctx.db.patch("learnSources", sourceId, { ownerId: otherCreatorIdentity.subject, metadataVisibility: "public", contentVisibility: "public" }));
    expect((await create("foreign", body)).status).toBe(404);
  });

  it("unlink removes only the connection link and prevents idempotency resurrection", async () => {
    const { t, owner, tokenId, create, read } = await setup(); const item = createdItem(await create());
    await select(t, tokenId, [item.itemRef]);
    expect(await t.mutation(learnIntegrationApi.unlinkLesson, { tokenId, ref: item.itemRef })).toMatchObject({ status: 200, body: { unlinked: true } });
    expect((await read(item.itemRef)).status).toBe(404); expect((await create()).status).toBe(404);
    expect((await owner.query(api.lessons.getDraft, { lessonId: item.lessonId })).draft).toEqual(document);
    expect((await t.run(ctx => ctx.db.get("integrationTokens", tokenId)))?.itemRefs).toEqual([]);
  });

  it("serves mounted v2 HTTP routes with bearer auth, rate limits and v1 compatibility", async () => {
    const { t, token } = await setup(["lessons:read", "lessons:create", "lessons:update", "items:read"]);
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => t.fetch(`/api/integrations/v2${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await t.fetch("/api/integrations/v2/capabilities")).status).toBe(401);
    const capabilities = await call("GET", "/capabilities");
    expect(capabilities.status).toBe(200); expect(capabilities.headers.get("RateLimit-Limit")).toBe("300"); expect(capabilities.headers.get("Chaos-Api-Version")).toBe("2");
    expect((await call("GET", "/capabilities", undefined, { "Chaos-Api-Version": "1" })).status).toBe(400);
    expect((await call("POST", "/drafts", draft)).status).toBe(400);
    const response = await call("POST", "/drafts", draft, { "Idempotency-Key": "http-create" });
    expect(response.status).toBe(201); const { item } = await response.json();
    expect((await call("GET", `/lessons/${item.itemRef}/definition`)).status).toBe(200);
    expect((await call("GET", `/lessons/${item.itemRef}/outline?limit=0`)).status).toBe(400);
    expect((await call("GET", `/lessons/${item.itemRef}/outline?limit=1&limit=2`)).status).toBe(400);
    expect((await call("GET", `/lessons/${item.itemRef}/definition?secret=1`)).status).toBe(400);
    expect((await call("PATCH", `/lessons/${item.itemRef}`, { document }, { "Idempotency-Key": "http-update" })).status).toBe(428);
    expect((await call("PATCH", `/lessons/${item.itemRef}`, { document }, { "Idempotency-Key": "http-update", "If-Match": '"0"' })).status).toBe(200);
    expect((await call("PATCH", `/lessons/${item.itemRef}`, { document }, { "Idempotency-Key": "http-stale", "If-Match": "0" })).status).toBe(409);
    expect((await call("POST", `/lessons/${item.itemRef}/publish`, {})).status).toBe(404);
    expect((await t.fetch("/api/integrations/v1/capabilities", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    await t.run(ctx => ctx.db.insert("globalConfig", { integrationReadRatePerMinute: 1 }));
    const limited = await call("GET", "/capabilities"); expect(limited.status).toBe(429); expect(limited.headers.get("Retry-After")).not.toBeNull();
  });

  it("rejects malformed and oversized JSON bodies and keeps failed requests retryable", async () => {
    const { t, token } = await setup();
    const send = (body: string, key: string) => t.fetch("/api/integrations/v2/drafts", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key }, body });
    expect((await send("{", "retry")).status).toBe(400);
    expect((await send(JSON.stringify({ ...draft, unknown: true }), "retry")).status).toBe(400);
    expect((await send(JSON.stringify(draft), "retry")).status).toBe(201);
    expect((await send(" ".repeat(350_001), "large")).status).toBe(400);
    expect((await t.run(ctx => ctx.db.query("lessons").take(10)))).toHaveLength(1);
  });
});
