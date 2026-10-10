/** Combine the platform and form-specific caps without changing null (unlimited) semantics. */
export function effectiveResponseCap(platform: number | null, own: number | null): number | null {
  if (platform === null) return own;
  return own === null ? platform : Math.min(own, platform);
}
