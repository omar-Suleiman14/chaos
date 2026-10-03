/** Only local app paths may be used after login/logout. */
export function safeAuthReturn(value: string | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://chaos.invalid");
    return url.origin === "https://chaos.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
