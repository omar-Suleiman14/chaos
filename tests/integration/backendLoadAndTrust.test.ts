import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

afterEach(() => { vi.useRealTimers(); });

describe("CRM follow-up search", () => {
  it("matches words and prefixes of names, not only the exact name", async () => {
    const t = await createTestConvexWithAdmin(otherCreatorIdentity.subject);
    const admin = t.withIdentity(otherCreatorIdentity);
    const base = { email: "", organization: "", stage: "new" as const, owner: "", source: "" };
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Suleiman", email: "omar@example.com", nextFollowUp: 1_900_000_000_000 });
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Without Followup", email: "o2@example.com" });
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Closed", email: "o3@example.com", stage: "closed", nextFollowUp: 1_900_000_000_000 });
    const page = await admin.query(api.admin.contacts, { paginationOpts: { numItems: 25, cursor: null }, followUps: true, search: "omar" });
    expect(page.page.map((c) => c.name)).toEqual(["Omar Suleiman"]);
  });
});

describe("tag-filtered response pages", () => {
  it("scans past a page of non-matching responses to find tagged ones", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { title: "Tags" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("formResponses", {
          formId, version: 1, status: "completed", answers: {}, language: "en", submissionKey: `k${i}`, receiptCode: `R${i}`,
          startedAt: 1_000 + i, submittedAt: 2_000 + i, updatedAt: 2_000 + i, tags: i === 0 ? ["rare"] : [], searchText: "", spam: false, reviewed: false,
        });
      }
    });
    const result = await owner.query(api.formResults.listResponses, { formId, filter: { tag: "rare" }, paginationOpts: { numItems: 25, cursor: null } });
    expect(result.page.map((r) => r.receiptCode)).toEqual(["R0"]);
    expect(result.isDone).toBe(true);
  });
});
