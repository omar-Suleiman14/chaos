/** The public origin used for canonical URLs, the sitemap and robots.txt. */
export function siteOrigin(value: string): string {
  const url = new URL(value.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTP(S) origin without a path, credentials, query or fragment.");
  }
  return url.origin;
}

export const siteUrl = siteOrigin(process.env.NEXT_PUBLIC_APP_URL || "https://chaos.fail");

/** Contact address shown in the footer, legal pages and help rows. Self-hosted instances set NEXT_PUBLIC_SUPPORT_EMAIL. */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "khomod14@gmail.com";

/** Forks can link the source actually serving their instance; support docs stay upstream. */
const upstreamRepoUrl = "https://github.com/omar-Suleiman14/chaos";
export const repoUrl = optionalHttpsUrl(process.env.NEXT_PUBLIC_SOURCE_REPO_URL) ?? upstreamRepoUrl;
export const repoIssuesUrl = `${upstreamRepoUrl}/issues`;
export const selfHostingGuideUrl = `${upstreamRepoUrl}/blob/main/docs/self-hosting.md`;
export const integrationApiDocUrl = `${upstreamRepoUrl}/blob/main/docs/integration-api-v1.md`;
export const webhooksDocUrl = `${upstreamRepoUrl}/blob/main/docs/webhooks-v1.md`;
export const securityPolicyUrl = `${upstreamRepoUrl}/blob/main/SECURITY.md`;

/**
 * An optional HTTPS link, such as a hosted status page. Anything else (http, credentials,
 * javascript:, unparseable text) is treated as unset, so a typo hides the link instead of
 * breaking every page.
 */
export function optionalHttpsUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * An optional HTTPS origin with nothing after the host: no path, query, fragment or
 * credentials. Returns the normalized origin, or null when unset or invalid.
 */
export function optionalHttpsOrigin(value: string | undefined): string | null {
  const href = optionalHttpsUrl(value);
  if (!href) return null;
  const url = new URL(href);
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

/** Hosted status page (NEXT_PUBLIC_STATUS_PAGE_URL). Links to it are hidden when unset. */
export const statusPageUrl = optionalHttpsUrl(process.env.NEXT_PUBLIC_STATUS_PAGE_URL);

/** Short, neutral share origin (NEXT_PUBLIC_SHORT_SHARE_ORIGIN), e.g. https://chs.example. */
export const shortShareOrigin = optionalHttpsOrigin(process.env.NEXT_PUBLIC_SHORT_SHARE_ORIGIN);

/**
 * The short share link for an app path such as `/f/abc123` or `/username/team-lunch`,
 * or null when no short origin is configured (callers keep their usual link).
 * The short origin must serve or redirect the same paths; see .env.example.
 */
export function shortShareUrl(path: string, origin: string | null = shortShareOrigin): string | null {
  if (!origin) return null;
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return null;
  const url = new URL(path, origin);
  // Guard against anything that would leave the configured origin.
  return url.origin === origin ? url.href : null;
}

/**
 * A request that arrived on the short share host goes to the same path and query on the
 * canonical site, so sign-in, cookies and canonical URLs stay on one host. Null for any
 * other host, or when the short origin is unset or equal to the site origin (no loops).
 */
export function shortHostRedirect(requestUrl: string, origin: string | null = shortShareOrigin, site: string = siteUrl): string | null {
  if (!origin || origin === site) return null;
  const url = new URL(requestUrl);
  if (url.host !== new URL(origin).host) return null;
  return new URL(url.pathname + url.search, site).href;
}
