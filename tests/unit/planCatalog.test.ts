import { describe, expect, it } from "vitest";
import { LEARN_LIMITS } from "../../convex/learnModel";
import { planCatalog, planLimits } from "../../lib/planCatalog";

describe("public plan catalog", () => {
  it("keeps paid allowances finite and above personal allowances", () => {
    for (const key of ["creationsPerMonth", "responsesPerForm", "livePlayers"] as const) {
      expect(Number.isFinite(planLimits.pro[key])).toBe(true);
      expect(planLimits.pro[key]).toBeGreaterThan(planLimits.free[key]);
    }
    expect(planCatalog.pro.billingUnit).toBe("active-seat-month");
    expect(planCatalog.pro.proposedPriceEgp).toBe(20);
  });

  it("does not advertise active checkout or a made-up storage allowance", () => {
    expect(planCatalog.billing.available).toBe(false);
    expect(planCatalog.billing.automaticCharges).toBe(false);
    expect(planCatalog.uploads.totalStorageQuota).toBe("not-enforced");
    expect(planCatalog.uploads.teachingFileBytes).toBe(LEARN_LIMITS.fileBytes);
    expect(planCatalog.uploads.formFileBytes).toBe(10 * 1024 * 1024);
  });
});
