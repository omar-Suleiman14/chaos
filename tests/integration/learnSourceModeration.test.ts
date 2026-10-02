import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
describe("source takedown and appeal", () => {
  it("revokes metadata without deleting files, audits actions and protects appeals", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const reader = t.withIdentity(otherCreatorIdentity);
    const adminIdentity = { subject: "reviewer", issuer: creatorIdentity.issuer, tokenIdentifier: `${creatorIdentity.issuer}|reviewer` }; const admin = t.withIdentity(adminIdentity);
    await t.run(ctx => ctx.db.insert("admins", { clerkId: "reviewer", email: "reviewer@example.com", grantedAt: 0 }));
    const sourceId = await owner.mutation(api.learnSources.create, { metadata: { kind: "reference", title: "Reference", origin: "Publisher" }, metadataVisibility: "public", contentVisibility: "private" });
    const reportId = await reader.mutation(api.learnSourceModeration.report, { sourceId, category: "copyright", detail: "Ownership claim" });
    expect(await reader.mutation(api.learnSourceModeration.report, { sourceId, category: "copyright", detail: "Retry" })).toBe(reportId);
    await expect(owner.mutation(api.learnSourceModeration.act, { sourceId, action: "takedown", reason: "No permission" })).rejects.toThrow("admin");
    const auditId = await admin.mutation(api.learnSourceModeration.act, { sourceId, action: "takedown", reason: "Review claim", reportId });
    expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
    await expect(reader.mutation(api.learnSourceModeration.appeal, { sourceId, auditId, reason: "Not the owner" })).rejects.toThrow("unauthorized");
    const appealId = await owner.mutation(api.learnSourceModeration.appeal, { sourceId, auditId, reason: "License attached to claim" });
    await admin.mutation(api.learnSourceModeration.resolveAppeal, { appealId, accepted: true, reason: "License reviewed" });
    expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
    await admin.mutation(api.learnSourceModeration.act, { sourceId, action: "restore", reason: "Approved restoration" });
    expect(await t.query(api.learnSources.getMetadata, { sourceId })).not.toBeNull();
    const history = await owner.query(api.learnSourceModeration.history, { sourceId, paginationOpts: { cursor: null, numItems: 10 } });
    expect(history.page.map(r => r.action)).toEqual(["restore", "takedown"]);
    expect((await t.run(ctx => ctx.db.get("learnSources", sourceId)))?.uploadedBy).toBe(creatorIdentity.subject);
  });
});
