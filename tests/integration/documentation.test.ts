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
  it("refreshes obsolete copy in bounded pages, preserving drafts and genuine integrations", async () => {
    const t = await createTestConvexWithAdmin(creatorIdentity.subject);
    await t.run(async ctx => {
      for (let order = 0; order < 12; order++) {
        const content = { title: `Admin title ${order}`, summary: "Draft note", blocks: [{ type: "p" as const, text: "My Google Forms style notes; import from Google Forms and Microsoft Forms." }] };
        await ctx.db.insert("docArticles", { ...fields, slug: `copy-${order}`, order, content, revision: 7, updatedAt: 1, publishedAt: order === 0 ? null : 2, published: order === 0 ? null : { ...fields.content, sectionId: fields.sectionId, sectionTitle: "Kept published section", order, summary: "Personal is free; Business pays per seat.", blocks: [{ type: "p", text: "Published Google Forms style guide." }] } });
      }
    });
    const first = await t.mutation(internal.docs.refreshCopy, { locale: "en" });
    expect(first.updated).toBe(10);
    expect(first.nextCursor).not.toBeNull();
    expect(await t.mutation(internal.docs.refreshCopy, { locale: "en", cursor: first.nextCursor })).toEqual({ updated: 2, nextCursor: null });
    const rows = await t.run(ctx => ctx.db.query("docArticles").withIndex("by_locale_and_order", q => q.eq("locale", "en")).take(20));
    expect(rows[0]).toMatchObject({ published: null, publishedAt: null, revision: 8, content: { title: "Admin title 0", summary: "Draft note", blocks: [{ type: "p", text: "My Lilac notes; import from Google Forms and Microsoft Forms." }] } });
    expect(rows[1].published).toMatchObject({ title: "Connect Chaos", sectionTitle: "Kept published section", summary: "Personal use is free. Business pricing is per person.", blocks: [{ type: "p", text: "Published Lilac guide." }] });
    expect(rows[1].content.title).toBe("Admin title 1");
    const second = await t.mutation(internal.docs.refreshCopy, { locale: "en" });
    expect(second.updated).toBe(0);
    await t.mutation(internal.docs.refreshCopy, { locale: "en", cursor: second.nextCursor });
    expect(await t.run(ctx => ctx.db.query("docArticles").withIndex("by_locale_and_order", q => q.eq("locale", "en")).take(20))).toEqual(rows);
  });
  it("refreshes Arabic pricing without changing another locale or publishing a draft", async () => {
    const t = await createTestConvexWithAdmin(creatorIdentity.subject);
    const id = await t.run(ctx => ctx.db.insert("docArticles", { ...fields, locale: "ar", content: { title: "أسعار مخصصة", summary: "الخطة الشخصية مجانية؛ والأعمال تدفع لكل مقعد.", blocks: [{ type: "list", items: ["50 جنيهًا لكل مقعد إنشاء نشط شهريًا: فقط لمن ينشئ المحتوى أو يديره.", "نص أضافه المسؤول"] }] }, revision: 3, updatedAt: 1, publishedAt: null, published: null }));
    expect(await t.mutation(internal.docs.refreshCopy, { locale: "en" })).toEqual({ updated: 0, nextCursor: null });
    expect(await t.mutation(internal.docs.refreshCopy, { locale: "ar" })).toEqual({ updated: 1, nextCursor: null });
    expect(await t.run(ctx => ctx.db.get("docArticles", id))).toMatchObject({ published: null, revision: 4, content: { title: "أسعار مخصصة", summary: "الاستخدام الشخصي مجاني. اشتراك الأعمال لكل شخص.", blocks: [{ type: "list", items: ["50 جنيهًا شهريًا لكل شخص ينشئ المحتوى أو يديره.", "نص أضافه المسؤول"] }] } });
  });
});
