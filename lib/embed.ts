/**
 * Which addresses may ever be framed, and the header decision for one request.
 *
 * Only public form addresses are candidates: /f/<shareId> and custom links
 * /<username>/<slug>. next.config.ts sends X-Frame-Options: DENY and
 * frame-ancestors 'none' on every other path; proxy.ts runs on every candidate
 * and sends the form's own frame-ancestors (or 'none') after asking Convex.
 *
 * Keep this file free of imports that only work in one runtime: next.config.ts,
 * proxy.ts, the Share tab and the tests all use it.
 */
import { DENY_FRAMING, framingHeaders } from "../convex/embedPolicy";
import type { EmbedPolicy } from "../convex/embedPolicy";

export { DENY_FRAMING, framingHeaders, MAX_EMBED_ORIGINS, normalizeEmbedOrigin, normalizeEmbedOrigins, isEmbedOrigin } from "../convex/embedPolicy";
export type { EmbedPolicy, EmbedSettings } from "../convex/embedPolicy";

/**
 * First path segments that belong to the app (and some that might one day).
 * None of them is a username (convex/links.ts reserves them), so a two-segment
 * path starting with one is never a custom link and never framable.
 */
export const APP_SEGMENTS = [
  "admin", "api", "app", "compare", "chatgpt", "dashboard", "docs", "help", "homework", "learn", "login", "logout", "mcp", "play", "pricing", "print",
  "privacy", "settings", "sign-in", "sign-up", "signin", "signup", "static", "support", "terms", "trpc",
  "_next", ".well-known", "opengraph-image",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/**
 * A path-to-regexp pattern (no leading slash, no anchors) for candidate paths.
 * Written into next.config.ts's negative match and, verbatim, into proxy.ts's
 * matcher, so every path that escapes the blanket DENY runs through the proxy.
 * tests/unit/embed.test.ts checks both against Next's own route compilers.
 */
export const EMBED_CANDIDATE_PATTERN =
  `(?!(?:${APP_SEGMENTS.map(escape).join("|")})/)[A-Za-z0-9_.\\-]{1,64}/[A-Za-z0-9_\\-]{1,64}`;

/** Header rule source for every path except candidates (see next.config.ts). */
export const NOT_EMBEDDABLE_SOURCE = `/((?!${EMBED_CANDIDATE_PATTERN}$).*)`;

/** The proxy matcher entry for candidates; proxy.ts must contain exactly this string. */
export const EMBED_PROXY_MATCHER = `/(${EMBED_CANDIDATE_PATTERN})`;

export type EmbedTarget = { shareId: string } | { username: string; slug: string };

const SHARE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const USERNAME = /^[A-Za-z0-9_.-]{1,64}$/;
const SLUG = /^[A-Za-z0-9-]{1,64}$/;

/**
 * The form a request path names, or null when the path may never be framed.
 * Strict on purpose: no trailing slash, no percent-encoding, no extra
 * segments, no app areas in any letter case. Anything else is denied.
 */
export function embedTarget(pathname: string): EmbedTarget | null {
  const parts = pathname.split("/");
  if (parts.length !== 3 || parts[0] !== "") return null;
  const [, first, second] = parts;
  if (first === "f") return SHARE_ID.test(second) ? { shareId: second } : null;
  const lower = first.toLowerCase();
  if (lower === "f" || APP_SEGMENTS.includes(lower)) return null;
  if (!USERNAME.test(first) || !SLUG.test(second)) return null;
  return { username: lower, slug: second.toLowerCase() };
}

/** Sec-Fetch-Dest values for a response that may end up inside a frame. */
const FRAME_DESTINATIONS = new Set(["iframe", "frame", "embed", "object"]);

/**
 * The framing headers for one request. `lookup` asks Convex for the form's
 * policy; it is skipped for anything that is not a frame load (the answer
 * would not matter) and any failure denies.
 */
export async function decideFraming(
  pathname: string,
  secFetchDest: string | null,
  lookup: (target: EmbedTarget) => Promise<EmbedPolicy>,
): Promise<Record<string, string>> {
  const target = embedTarget(pathname);
  if (!target) return { ...DENY_FRAMING };
  // Browsers that send Sec-Fetch-Dest tell us when this is not a frame; older ones get the lookup.
  // A cached copy of either answer is safe to reuse: the header never depends on who asks,
  // and the top-level answer is only stricter.
  if (secFetchDest && !FRAME_DESTINATIONS.has(secFetchDest)) return { ...DENY_FRAMING };
  let policy: EmbedPolicy = null;
  try {
    policy = await lookup(target);
  } catch {
    policy = null;
  }
  return framingHeaders(policy);
}

/** Message the embedded form posts to its parent whenever its height changes. */
export const EMBED_HEIGHT_MESSAGE = "chaos:embed:height";
export interface EmbedHeightMessage { type: typeof EMBED_HEIGHT_MESSAGE; height: number }

/** The iframe snippet for the Share tab: optional inline auto-resize script, no external host. */
export function embedSnippet({ src, title, appOrigin, autoResize }: { src: string; title: string; appOrigin: string; autoResize: boolean }): string {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const iframe = `<iframe src="${attr(src)}" title="${attr(title || "Form")}" style="width:100%;height:600px;border:0" loading="lazy"></iframe>`;
  if (!autoResize) return iframe;
  const script = [
    "<script>",
    "(function(){var f=document.currentScript.previousElementSibling;",
    "window.addEventListener(\"message\",function(e){",
    `if(e.origin!==${JSON.stringify(appOrigin).replace(/</g, "\\u003c")}||e.source!==f.contentWindow)return;`,
    `var d=e.data;if(d&&d.type===${JSON.stringify(EMBED_HEIGHT_MESSAGE)}&&typeof d.height==="number")`,
    "f.style.height=Math.max(200,Math.min(Math.ceil(d.height),20000))+\"px\";});})();",
    "</script>",
  ].join("");
  return `${iframe}\n${script}`;
}
