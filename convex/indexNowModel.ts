import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Changed public URLs waiting for the next batched IndexNow submission (convex/indexNow.ts). */
export const indexNowTables = {
  indexNowQueue: defineTable({ url: v.string(), queuedAt: v.number() }).index("by_url", ["url"]).index("by_queuedAt", ["queuedAt"]),
};

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol accepts up to 10,000 URLs per request; smaller batches keep each call quick. */
export const INDEXNOW_BATCH_SIZE = 500;
const DEFAULT_ORIGIN = "https://chaos.fail";

/** Signed-in, internal and capability areas. Never submitted, whatever a caller passes. */
const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/api", "/mcp", "/print", "/auth", "/homework", "/sign-in", "/sign-up", "/play", "/_next", "/.well-known"];

/** IndexNow keys are 8-128 characters of a-z, A-Z, 0-9 and dashes. */
export function indexNowKeyValid(key: string | undefined): key is string {
  return !!key && /^[a-zA-Z0-9-]{8,128}$/.test(key);
}

/**
 * The configured key and public origin, or null when IndexNow is off: no valid key, or an origin
 * that is not public HTTPS (local development and preview deployments).
 */
export function indexNowConfig(env: { INDEXNOW_KEY?: string; CHAOS_APP_URL?: string }): { key: string; origin: string } | null {
  const key = env.INDEXNOW_KEY?.trim();
  if (!indexNowKeyValid(key)) return null;
  try {
    const url = new URL(env.CHAOS_APP_URL?.trim() || DEFAULT_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return null;
    return { key, origin: url.origin };
  } catch {
    return null;
  }
}

/**
 * Absolute, deduplicated URLs that may be submitted for `origin`. Drops other hosts, non-HTTPS,
 * credentials, query strings (receipt, resume and embed links are noindex) and private areas.
 * Fragments are removed, since search engines index the page, not the anchor.
 */
export function indexNowUrls(origin: string, candidates: string[]): string[] {
  const site = new URL(origin);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    let url: URL;
    try { url = new URL(candidate, site); } catch { continue; }
    if (url.protocol !== "https:" || url.host !== site.host || url.username || url.password || url.search) continue;
    const path = url.pathname;
    if (PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) continue;
    url.hash = "";
    seen.add(url.href);
  }
  return [...seen];
}

export function indexNowBatches<T>(items: T[], size = INDEXNOW_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

/** The JSON body for POST https://api.indexnow.org/indexnow. The key file lives at the site root. */
export function indexNowPayload(config: { key: string; origin: string }, urlList: string[]) {
  const site = new URL(config.origin);
  return { host: site.host, key: config.key, keyLocation: `${site.origin}/${config.key}.txt`, urlList };
}

/** Public paths of indexable content. Each is URL-encoded the same way the pages build canonicals. */
export const indexNowPaths = {
  lesson: (id: string) => `/learn/${encodeURIComponent(id)}`,
  course: (id: string) => `/learn/courses/${encodeURIComponent(id)}`,
  form: (shareId: string) => `/f/${encodeURIComponent(shareId)}`,
  // Arabic guides live under /ar (lib/locale.ts).
  doc: (slug: string, locale: "en" | "ar" = "en") => `${locale === "ar" ? "/ar" : ""}/docs/${encodeURIComponent(slug)}`,
};

/** Indexable state of one public page: its path and a fingerprint of what search engines see. */
export type IndexNowState = { path: string; fingerprint: string } | null;

/**
 * Paths to submit after a write. A page counts when it became indexable, stopped being indexable
 * (unpublished, archived, deleted, turned noindex: the URL is submitted so engines recrawl and drop
 * it), or stayed indexable with different published content. Pages that were never indexable,
 * and writes that leave the published content unchanged, submit nothing.
 */
export function indexNowChanges(before: IndexNowState, after: IndexNowState): string[] {
  if (!before && !after) return [];
  if (before && after && before.path === after.path) return before.fingerprint === after.fingerprint ? [] : [after.path];
  return [before?.path, after?.path].filter((path): path is string => !!path);
}

const SUBMIT_TIMEOUT_MS = 10_000;

/**
 * POSTs URLs to IndexNow in batches. Never throws: a failed or slow submission is logged and
 * reported, because indexing hints must never hold up or fail a publish.
 */
export async function submitIndexNow(config: { key: string; origin: string }, urls: string[], fetchImpl: typeof fetch = fetch): Promise<{ submitted: number; failed: number }> {
  let submitted = 0, failed = 0;
  for (const batch of indexNowBatches(indexNowUrls(config.origin, urls))) {
    try {
      const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(indexNowPayload(config, batch)),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
      // 200 OK and 202 Accepted (key validation pending) both mean the URLs were received.
      if (response.ok) submitted += batch.length;
      else { failed += batch.length; console.warn("IndexNow rejected a submission", response.status, batch.length); }
    } catch (error) {
      failed += batch.length;
      console.warn("IndexNow submission failed", batch.length, error instanceof Error ? error.message : error);
    }
  }
  return { submitted, failed };
}
