/** Public plan policy. Business registration is free during the promotion; billing is disabled. */
type Allowance = { creationsPerMonth: number | null; responsesPerForm: number | null; livePlayers: number };
/** Both plans have every feature and no usage caps; null means no cap. Live games stop at the platform's 500 players. */
const unlimited: Allowance = { creationsPerMonth: null, responsesPerForm: null, livePlayers: 500 };
export const planCatalog = {
  free: { priceEgp: 0, audience: "personal", users: 1, collaboration: false, ...unlimited },
  pro: { proposedPriceEgp: 50, priceEgp: 50, billingUnit: "active-seat-month", audience: "business", collaboration: true, promotion: { active: true, discountPercent: 100, priceEgp: 0, limitedTime: true }, ...unlimited },
  uploads: { formFileBytes: 10 * 1024 * 1024, teachingFileBytes: 25 * 1024 * 1024, appliesTo: "both-plans", totalStorageQuota: "not-enforced" },
  billing: { available: false, trialDays: 30, automaticCharges: false },
} as const;

/** Shared allowances used by backend creation and response enforcement. */
export const planLimits: { free: Allowance; pro: Allowance } = { free: planCatalog.free, pro: planCatalog.pro };
