/** Public plan policy. Billing/seat metering is proposed, not an active checkout. */
type Allowance = { creationsPerMonth: number | null; responsesPerForm: number | null; livePlayers: number };
/** Both plans have every feature and no usage caps; null means no cap. Live games stop at the platform's 500 players. */
const unlimited: Allowance = { creationsPerMonth: null, responsesPerForm: null, livePlayers: 500 };
export const planCatalog = {
  free: { priceEgp: 0, audience: "personal", ...unlimited },
  pro: { proposedPriceEgp: 50, billingUnit: "active-seat-month", audience: "business", ...unlimited },
  uploads: { formFileBytes: 10 * 1024 * 1024, teachingFileBytes: 25 * 1024 * 1024, appliesTo: "both-plans", totalStorageQuota: "not-enforced" },
  billing: { available: false, trialDays: 30, automaticCharges: false },
} as const;

/** Shared allowances used by backend creation and response enforcement. */
export const planLimits: { free: Allowance; pro: Allowance } = { free: planCatalog.free, pro: planCatalog.pro };
