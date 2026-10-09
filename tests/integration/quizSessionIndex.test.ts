import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

describe("response folders via the spam index", () => {
  it("lists the inbox and the spam folder newest first, with the reviewed filter", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { title: "Folders" });
    const rows = [
      { spam: false, reviewed: false }, { spam: true, reviewed: false }, { spam: false, reviewed: true }, { spam: true, reviewed: true },
    ];
    const ids = await t.run(async (ctx) => Promise.all(rows.map((r, i) => ctx.db.insert("formResponses", {
      formId, version: 1, status: "completed", answers: {}, language: "en", submissionKey: `k${i}`, receiptCode: `R${i}`,
      startedAt: 1_000 + i, submittedAt: 2_000 + i, updatedAt: 2_000 + i, tags: [], searchText: "", ...r,
    }))));
    const list = async (filter: { spam?: boolean; reviewed?: boolean }) =>
      (await owner.query(api.formResults.listResponses, { formId, filter, paginationOpts: { numItems: 10, cursor: null } })).page.map((r) => r._id);
    expect(await list({})).toEqual([ids[2], ids[0]]);
    expect(await list({ spam: true })).toEqual([ids[3], ids[1]]);
    expect(await list({ reviewed: false })).toEqual([ids[0]]);
    expect(await list({ spam: true, reviewed: true })).toEqual([ids[3]]);
  });
});
