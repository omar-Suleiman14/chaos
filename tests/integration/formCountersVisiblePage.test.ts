import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { withOwnerFormCounts } from "../../convex/formCounts";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

describe("creator library visible form counters", () => {
  it.each([3, 14])("returns current counts for %s displayed forms", async (count) => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const ids: Id<"forms">[] = [];
    for (let index = 0; index < count; index++) ids.push(await owner.mutation(api.forms.createForm, {}));
    const forms = await t.run(async ctx => {
      for (const [i, formId] of ids.entries()) {
        await ctx.db.patch("forms", formId, { publishedVersion: 1 });
        await ctx.db.insert("formCounters", {
          formId, ownerId: creatorIdentity.subject, responseCount: i + 1, partialCount: 2,
        });
      }
      return (await Promise.all(ids.map(id => ctx.db.get("forms", id)))).filter((row): row is NonNullable<typeof row> => !!row);
    });
    const read = async () => t.run(ctx => withOwnerFormCounts(ctx, creatorIdentity.subject, forms));
    expect((await read()).map(row => row.responseCount)).toEqual(ids.map((_, i) => i + 1));
    await t.run(async ctx => {
      const last = await ctx.db.query("formCounters").withIndex("by_formId", q => q.eq("formId", ids[0])).unique();
      if (!last) throw new Error("missing counter");
      await ctx.db.patch("formCounters", last._id, { responseCount: 45 });
    });
    expect((await read())[0].responseCount).toBe(45);
  });
});
