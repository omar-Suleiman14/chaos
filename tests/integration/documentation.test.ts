import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity } from "../fixtures";

const fields = { slug: "connection-guide", locale: "en" as const, sectionId: "connections", sectionTitle: "Connections", order: 0, content: { title: "Connect Chaos", summary: "OAuth setup", blocks: [{ type: "p" as const, text: "Use the HTTP endpoint." }] } };
describe("database documentation", () => {
  it("denies anonymous and nonadmin authoring, including the internal MCP actor boundary", async () => {
    const t = await createTestConvexWithAdmin("user_admin");
    await expect(t.mutation(api.docs.save, fields)).rejects.toThrow(/authenticated/);
    await expect(t.withIdentity(creatorIdentity).mutation(api.docs.save, fields)).rejects.toThrow(/admin access/);
    await expect(t.mutation(internal.docs.mcpSave, { ...fields, userId: creatorIdentity.subject, publish: true })).rejects.toThrow(/Admin access/);
    await expect(t.query(internal.docs.mcpList, { userId: creatorIdentity.subject, locale: "en" })).rejects.toThrow(/Admin access/);
    expect(await t.query(internal.docs.mcpCapabilities, { userId: creatorIdentity.subject })).toEqual({ admin: false });
    expect(await t.query(internal.docs.mcpCapabilities, { userId: "user_admin" })).toEqual({ admin: true });
  });
  it("keeps drafts private and published snapshots stable until an admin publishes a new revision", async () => {
    const t = await createTestConvexWithAdmin(creatorIdentity.subject);
    const actor = t.withIdentity(creatorIdentity);
    await actor.mutation(api.docs.save, fields);
    expect(await t.query(api.docs.listPublished, { locale: "en" })).toEqual([]);
    await actor.mutation(api.docs.save, { ...fields, expectedRevision: 0, publish: true });
    expect(await t.query(api.docs.getPublished, { slug: fields.slug, locale: "en" })).toMatchObject({ title: "Connect Chaos", sectionTitle: "Connections" });
    await actor.mutation(api.docs.save, { ...fields, sectionTitle: "New section", content: { ...fields.content, title: "Draft title" }, expectedRevision: 1, publish: false });
    expect(await t.query(api.docs.getPublished, { slug: fields.slug, locale: "en" })).toMatchObject({ title: "Connect Chaos", sectionTitle: "Connections" });
    await expect(actor.mutation(api.docs.save, { ...fields, expectedRevision: 1 })).rejects.toThrow(/CONFLICT/);
    await t.mutation(internal.docs.mcpSave, { ...fields, userId: creatorIdentity.subject, expectedRevision: 2, publish: true });
    expect((await actor.query(api.docs.adminList, { locale: "en" }))[0].revision).toBe(3);
  });
  it("imports both locales idempotently without overwriting authored content", async () => {
    const t = await createTestConvexWithAdmin(creatorIdentity.subject);
    for (const locale of ["en", "ar"] as const) {
      let offset: number | null = 0;
      while (offset !== null) { const result: { nextOffset: number | null } = await t.mutation(internal.docs.seed, { locale, offset }); offset = result.nextOffset; }
      const first = await t.query(api.docs.listPublished, { locale });
      expect(first.length).toBeGreaterThan(10);
      expect(await t.mutation(internal.docs.seed, { locale, offset: 0 })).toMatchObject({ inserted: 0 });
      expect(await t.query(api.docs.listPublished, { locale })).toEqual(first);
    }
  });
});
