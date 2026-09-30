/**
 * Which sites may show a form in an iframe. Pure helpers shared by the Convex
 * functions (convex/embed.ts), the Next proxy that sets the frame-ancestors
 * header (proxy.ts via lib/embed.ts) and the Share tab.
 *
 * Origins end up inside a Content-Security-Policy header, so they are reduced
 * to a strict shape here and re-checked when the header is built: nothing a
 * creator types can add another directive or a keyword such as 'unsafe-inline'.
 */

export const MAX_EMBED_ORIGINS = 20;

export interface EmbedSettings {
  enabled: boolean;
  /** Normalised origins, e.g. "https://example.com" or "https://*.example.com". */
  origins: string[];
  /** Any site may frame the form. Only honoured for forms that need no sign-in. */
  anyOrigin: boolean;
}

export const defaultEmbedSettings: EmbedSettings = { enabled: false, origins: [], anyOrigin: false };

/** A hostname label: letters, digits and inner hyphens (IDNs arrive as punycode). */
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST = `${LABEL}(?:\\.${LABEL})+`;
const PORT = "(?::[0-9]{1,5})?";
/** https sites (optionally every subdomain with *.), plus http on this computer for testing. */
const ORIGIN = new RegExp(`^(?:https://(?:\\*\\.)?${HOST}${PORT}|http://(?:localhost|127\\.0\\.0\\.1)${PORT})$`);

/** True for an origin already in the stored, header-safe shape. */
export function isEmbedOrigin(value: string): boolean {
  return value.length <= 260 && ORIGIN.test(value);
}

/**
 * Turns what a creator typed ("Example.com", "https://example.com/blog/post")
 * into an origin ("https://example.com"), or null when it cannot be one.
 * Paths, queries and fragments are dropped: framing is decided per origin.
 */
export function normalizeEmbedOrigin(input: string): string | null {
  let raw = input.trim();
  if (!raw || raw.length > 300 || /[\s'";,]/.test(raw)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  const scheme = raw.slice(0, raw.indexOf(":")).toLowerCase();
  if (scheme !== "https" && scheme !== "http") return null;
  // URL() rejects "*" in hostnames; keep a leading "*." aside and put it back afterwards.
  const afterScheme = raw.slice(scheme.length + 3);
  const wildcard = afterScheme.startsWith("*.");
  let url: URL;
  try {
    url = new URL(`${scheme}://${wildcard ? afterScheme.slice(2) : afterScheme}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const origin = `${url.protocol}//${wildcard ? "*." : ""}${url.host}`.toLowerCase();
  return isEmbedOrigin(origin) ? origin : null;
}

/** Validates a creator's list; returns the clean list or the first entry that is not an origin. */
export function normalizeEmbedOrigins(inputs: string[]): { origins: string[] } | { invalid: string } | { tooMany: true } {
  const origins: string[] = [];
  for (const input of inputs) {
    if (!input.trim()) continue;
    const origin = normalizeEmbedOrigin(input);
    if (!origin) return { invalid: input };
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > MAX_EMBED_ORIGINS) return { tooMany: true };
  return { origins };
}

/** What the server needs to frame a published form; null means "never frame it". */
export type EmbedPolicy = { origins: string[]; anyOrigin: boolean } | null;

export const DENY_FRAMING: Readonly<Record<string, string>> = Object.freeze({
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
});

/**
 * The framing headers for one response. Enforced CSP (never report-only).
 * 'self' is included for allowed forms so the Share tab's live preview works.
 */
export function framingHeaders(policy: EmbedPolicy): Record<string, string> {
  if (!policy) return { ...DENY_FRAMING };
  if (policy.anyOrigin) return { "Content-Security-Policy": "frame-ancestors *" };
  const origins = [...new Set(policy.origins.filter(isEmbedOrigin))].slice(0, MAX_EMBED_ORIGINS);
  if (!origins.length) return { ...DENY_FRAMING };
  return { "Content-Security-Policy": `frame-ancestors 'self' ${origins.join(" ")}` };
}
