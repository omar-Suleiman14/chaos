import { describe, expect, it } from "vitest";
import { createTestConvex } from "./setup";
import { consumeCreation } from "../../convex/plans";
import { responseCap } from "../../convex/respond";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { planLimits } from "../../lib/planCatalog";

async function fixture(plan: "free" | "pro", count: number) {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkId: "owner", email: "owner@example.com", username: "owner", name: "Owner", createdAt: Date.now(), plan, ...(plan === "pro" ? { planExpiresAt: Date.now() + 86400000 } : {}), creationMonth: new Date().toISOString().slice(0, 7), monthlyCreations: count });
    const formId = await ctx.db.insert("forms", { ownerId: "owner", title: "Plan test", shareId: "plan-test", status: "draft", draft: emptyDefinition("Plan test"), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: Date.now(), updatedAt: Date.now() });
    return { userId, formId };
  });
  return { t, ...ids };
}
describe("plan entitlements", () => {
  it.each(["free", "pro"] as const)("does not cap %s creations, but still refuses restricted accounts", async plan => {
    expect(planLimits[plan].creationsPerMonth).toBeNull();
    const { t, userId } = await fixture(plan, 10_000);
    await t.run(ctx => consumeCreation(ctx, "owner"));
    await t.run(ctx => ctx.db.patch("users", userId, { isBanned: true }));
    await expect(t.run(ctx => consumeCreation(ctx, "owner"))).rejects.toThrow("ACCOUNT_RESTRICTED");
  });
  it("only applies the form's own response limit, on any plan", async () => {
    const { t, formId, userId } = await fixture("pro", 0);
    const cap = () => t.run(async ctx => responseCap(ctx, (await ctx.db.get("forms", formId))!, Date.now()));
    expect(await cap()).toBeNull();
    await t.run(ctx => ctx.db.patch("forms", formId, { settings: { ...defaultFormSettings, responseLimit: 50 } }));
    expect(await cap()).toBe(50);
    await t.run(async ctx => { await ctx.db.patch("forms", formId, { settings: defaultFormSettings }); await ctx.db.patch("users", userId, { planExpiresAt: Date.now() - 1 }); });
    expect(await cap()).toBeNull();
  });
});
