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
    expect(planCatalog.free.users).toBe(1);
    expect(planCatalog.free.collaboration).toBe(false);
    expect(planCatalog.pro.collaboration).toBe(true);
    expect(planCatalog.pro.promotion).toEqual({ active: true, discountPercent: 100, priceEgp: 0, limitedTime: true });
  });

  it("does not advertise active checkout or a made-up storage allowance", () => {
    expect(planCatalog.billing.available).toBe(false);
    expect(planCatalog.billing.automaticCharges).toBe(false);
    expect(planCatalog.uploads.totalStorageQuota).toBe("teaching-sources");
    expect(planCatalog.uploads.teachingStorageBytes).toBe(2 * 1024 ** 3);
    expect(planCatalog.uploads.teachingFileBytes).toBe(LEARN_LIMITS.fileBytes);
    expect(planCatalog.uploads.formFileBytes).toBe(10 * 1024 * 1024);
  });
});
