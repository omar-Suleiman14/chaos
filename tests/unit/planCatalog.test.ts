import { describe, expect, it } from "vitest";
import { LEARN_LIMITS } from "../../convex/learnModel";
import { planCatalog, planLimits } from "../../lib/planCatalog";

describe("public plan catalog", () => {
  it("gives Personal and Business the same uncapped allowances and prices Business per seat", () => {
    for (const plan of [planLimits.free, planLimits.pro]) {
      expect(plan.creationsPerMonth).toBeNull();
      expect(plan.responsesPerForm).toBeNull();
      expect(plan.livePlayers).toBe(500);
    }
    expect(planCatalog.free.priceEgp).toBe(0);
    expect(planCatalog.pro.billingUnit).toBe("active-seat-month");
    expect(planCatalog.pro.proposedPriceEgp).toBe(50);
  });

  it("does not advertise active checkout or a made-up storage allowance", () => {
    expect(planCatalog.billing.available).toBe(false);
    expect(planCatalog.billing.automaticCharges).toBe(false);
    expect(planCatalog.uploads.totalStorageQuota).toBe("not-enforced");
    expect(planCatalog.uploads.teachingFileBytes).toBe(LEARN_LIMITS.fileBytes);
    expect(planCatalog.uploads.formFileBytes).toBe(10 * 1024 * 1024);
  });
});
