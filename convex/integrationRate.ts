/** Resolve an API rate limit: valid operator config overrides environment, then defaults. */
export function configuredRate(fromConfig: number | undefined, fromEnv: string | undefined, fallback: number): number {
  for (const value of [fromConfig, fromEnv === undefined ? undefined : Number(fromEnv)]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100_000) return value;
  }
  return fallback;
}
