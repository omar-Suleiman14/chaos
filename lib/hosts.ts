import { optionalHttpsOrigin, siteUrl } from "./site";
import { splitLocale } from "./locale";

/**
 * Chaos is split across hosts by what a visitor came to do:
 * - chaos.fail (NEXT_PUBLIC_APP_URL): discover. Marketing pages, public forms, games, cards.
 * - app.chaos.fail (NEXT_PUBLIC_DASHBOARD_ORIGIN): create. The dashboard, admin and print pages.
 * - learn.chaos.fail (NEXT_PUBLIC_LEARN_ORIGIN): learn. Lessons, courses, flashcards.
 * - docs.chaos.fail (NEXT_PUBLIC_DOCS_ORIGIN): understand and build. The guides.
 * - play.chaos.fail (NEXT_PUBLIC_PLAY_ORIGIN): play. Players join live games with a PIN.
 * Paths are the same on every host (app.chaos.fail/dashboard/forms, docs.chaos.fail/docs/first-form);
 * a path opened on the wrong host redirects to its own (proxy.ts). Unset origins keep that section
 * on the main host, which is how local development, previews and self-hosting run. See docs/hosts.md.
 */
export type Section = "main" | "dashboard" | "learn" | "docs" | "play";

const configuredOrigins: Record<Exclude<Section, "main">, string | null> = {
  dashboard: optionalHttpsOrigin(process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN),
  learn: optionalHttpsOrigin(process.env.NEXT_PUBLIC_LEARN_ORIGIN),
  docs: optionalHttpsOrigin(process.env.NEXT_PUBLIC_DOCS_ORIGIN),
  play: optionalHttpsOrigin(process.env.NEXT_PUBLIC_PLAY_ORIGIN),
};

/** Section roots, the page a bare subdomain opens. */
const SECTION_HOME: Record<Exclude<Section, "main">, string> = { dashboard: "/dashboard", learn: "/learn", docs: "/docs", play: "/play" };

/**
 * Served on whichever host asked: sign-in (Clerk keeps one session across *.chaos.fail), the OAuth
 * consent page MCP clients open, route handlers and static files.
 */
const SHARED = /^\/(?:sign-in|sign-up|auth|api|trpc|mcp|_next|\.well-known|opengraph-image)(?:\/|$)|^\/(?:robots\.txt|sitemap\.xml|favicon\.ico|manifest\.webmanifest)$/;

/** The section a path belongs to, or null for paths every host serves. Takes paths with or without /ar. */
export function pathSection(pathname: string): Section | null {
  if (SHARED.test(pathname)) return null;
  const { path } = splitLocale(pathname);
  if (/^\/(?:dashboard|admin|print|homework)(?:\/|$)/.test(path)) return "dashboard";
  if (/^\/learn(?:\/|$)/.test(path)) return "learn";
  if (/^\/docs(?:\/|$)/.test(path)) return "docs";
  if (/^\/play(?:\/|$)/.test(path)) return "play";
  return "main";
}

export function sectionOrigin(section: Section, origins = configuredOrigins, main = siteUrl): string {
  return section === "main" ? main : origins[section] ?? main;
}

/** True when this section has its own host (play.chaos.fail), not a path on the main one. */
export function hasOwnHost(section: Exclude<Section, "main">, origins = configuredOrigins): boolean {
  return Boolean(origins[section]);
}

/** True once at least one section has its own host. */
const splitHosts = Object.values(configuredOrigins).some(Boolean);

/**
 * A link that works from any host: "/learn/abc" becomes "https://learn.chaos.fail/learn/abc" when
 * Learn has its own host. next/link still navigates client-side when the origin is the current one.
 * Returned unchanged when no section has a host, or for anything that is not a root-relative path.
 */
export function hostHref(href: string, origins = configuredOrigins, main = siteUrl): string {
  if (!Object.values(origins).some(Boolean) || !href.startsWith("/") || href.startsWith("//")) return href;
  const end = href.search(/[?#]/);
  const section = pathSection(end === -1 ? href : href.slice(0, end));
  return section ? sectionOrigin(section, origins, main) + href : href;
}

/** The absolute address of a path on its own host, for canonical URLs, sitemaps and structured data. */
export function absoluteUrl(path: string, origins = configuredOrigins, main = siteUrl): string {
  if (!path.startsWith("/")) return path;
  return sectionOrigin(pathSection(path) ?? "main", origins, main) + path;
}

/** The section a request host serves, or null when the host is none of the configured ones (previews, localhost). */
export function hostSection(host: string, origins = configuredOrigins, main = siteUrl): Section | null {
  for (const [section, origin] of Object.entries(origins)) if (origin && new URL(origin).host === host) return section as Section;
  return new URL(main).host === host ? "main" : null;
}

/**
 * Where a request belongs when it arrived on another section's host, or null to serve it here.
 * A bare subdomain opens its section's home page.
 */
export function hostRedirect(requestUrl: string, origins = configuredOrigins, main = siteUrl): string | null {
  if (!Object.values(origins).some(Boolean)) return null;
  const url = new URL(requestUrl);
  const here = hostSection(url.host, origins, main);
  if (!here) return null;
  if (here !== "main" && url.pathname === "/") return sectionOrigin(here, origins, main) + SECTION_HOME[here] + url.search;
  const section = pathSection(url.pathname);
  if (!section || section === here) return null;
  const target = sectionOrigin(section, origins, main);
  if (new URL(target).host === url.host) return null;
  return target + url.pathname + url.search;
}

/**
 * The cookie domain shared by every configured host ("chaos.fail" for chaos.fail and its subdomains),
 * so settings such as the language follow a visitor between them. Null when the hosts share no parent.
 */
export function sharedCookieDomain(origins = configuredOrigins, main = siteUrl): string | null {
  const hosts = Object.values(origins).filter((origin): origin is string => Boolean(origin)).map((origin) => new URL(origin).hostname);
  if (!hosts.length) return null;
  const root = new URL(main).hostname;
  if (root === "localhost" || /^[\d.]+$/.test(root)) return null;
  return hosts.every((host) => host.endsWith(`.${root}`)) ? root : null;
}

/**
 * The origin for a link people copy or share: the section's own host once hosts are split, otherwise
 * the one in the address bar, so previews, localhost and self-hosted copies link to themselves.
 */
export function linkOrigin(section: Section): string {
  if (splitHosts) return sectionOrigin(section);
  return typeof window === "undefined" ? siteUrl : window.location.origin;
}

/** A page's canonical address for metadata: absolute on its own host once hosts are split, otherwise the path (resolved against metadataBase). */
export function canonicalUrl(path: string, origins = configuredOrigins, main = siteUrl): string {
  return Object.values(origins).some(Boolean) ? absoluteUrl(path, origins, main) : path;
}
