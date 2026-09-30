/** Public plan policy. Billing/seat metering is proposed, not an active checkout. */
export const planCatalog = {
  free: { priceEgp: 0, audience: "personal", creationsPerMonth: 5, responsesPerForm: 1_000, livePlayers: 100 },
  pro: { proposedPriceEgp: 20, billingUnit: "active-seat-month", audience: "business", creationsPerMonth: 100, responsesPerForm: 10_000, livePlayers: 500 },
  uploads: { formFileBytes: 10 * 1024 * 1024, teachingFileBytes: 25 * 1024 * 1024, appliesTo: "both-plans", totalStorageQuota: "not-enforced" },
  billing: { available: false, trialDays: 30, automaticCharges: false },
} as const;

/** Shared allowances used by backend creation and response enforcement. */
export const planLimits = { free: planCatalog.free, pro: planCatalog.pro } as const;
