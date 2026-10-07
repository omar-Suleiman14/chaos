/**
 * Page addresses as PostHog may see them: path only (no domain, query or hash), with every
 * private or per-form segment replaced. Custom links (/<username>/<slug>) contain no digits,
 * so digit-based rules alone would leak names; the route shape decides instead.
 */
const TOP_LEVEL = new Set(["", "pricing", "docs", "chatgpt", "claude", "privacy", "cookies", "terms", "dashboard", "admin", "mcp", "sign-in", "sign-up"]);
const DASHBOARD = new Set(["settings", "connections", "archive", "editor", "results", "forms"]);
const DOC_SLUG = /^[a-z0-9-]{1,64}$/;

export function cleanAnalyticsPath(raw: unknown, base = "https://chaos.invalid"): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  let path: string;
  try {
    path = new URL(raw, base).pathname;
  } catch {
    return undefined;
  }
  const parts = path.split("/").filter(Boolean);
  const [first = "", second, third, ...rest] = parts;
  if (first === "f") return second ? "/f/:id" : "/f";
  if (first === "print") return "/print/:id";
  if (first === "docs") return second && DOC_SLUG.test(second) && !third ? `/docs/${second}` : "/docs";
  if (first === "dashboard") {
    if (!second) return "/dashboard";
    if (!DASHBOARD.has(second)) return "/dashboard/:id";
    if (second === "forms" && third) return `/dashboard/forms/:id${rest[0] === "responses" ? "/responses" : ""}`;
    return `/dashboard/${second}`;
  }
  if (TOP_LEVEL.has(first)) return `/${first}${second ? "/:id" : ""}`;
  // Anything else is someone's custom link or an unknown address.
  return parts.length >= 2 ? "/:username/:slug" : "/:id";
}
