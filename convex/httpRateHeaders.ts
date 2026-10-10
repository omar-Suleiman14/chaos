export type RateState = { limit: number; remaining: number; reset: number; policy: string };

/** Stable API rate-limit header projection, shared by integration HTTP handlers. */
export function rateHeaders(rate: RateState): Record<string, string> {
  return {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(rate.reset),
    "RateLimit-Policy": rate.policy,
  };
}
