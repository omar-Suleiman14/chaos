import type { NextConfig } from "next";
import { DENY_FRAMING, NOT_EMBEDDABLE_SOURCE } from "./lib/embed";

const isDev = process.env.NODE_ENV !== "production";

/** PostHog's configured host (e.g. https://eu.i.posthog.com), if analytics is on. */
const posthogHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_POSTHOG_HOST ? new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST).origin : "";
  } catch {
    return "";
  }
})();

const clerk = ["https://clerk.chaos.fail", "https://*.clerk.accounts.dev"];
const convex = ["https://*.convex.cloud", "wss://*.convex.cloud", "https://*.convex.site"];
const posthog = ["https://*.posthog.com", posthogHost].filter(Boolean);
// Vercel's preview-deployment toolbar.
const vercelLive = ["https://vercel.live"];

/**
 * Report-only for now: violations show in the browser console without breaking
 * anything. Promote to `Content-Security-Policy` once a production session
 * (sign-in, builder, a public form, PostHog) runs clean. Next injects inline
 * scripts and styles without a nonce, so 'unsafe-inline' is required.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${[...clerk, "https://challenges.cloudflare.com", ...posthog, ...vercelLive].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // Form images can come from Convex storage or any https URL a creator pastes.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${[...clerk, "https://clerk-telemetry.com", ...convex, ...posthog, ...vercelLive, "wss://ws-us3.pusher.com"].join(" ")}`,
  `frame-src 'self' https://challenges.cloudflare.com ${vercelLive.join(" ")}`,
  "worker-src 'self' blob: data:",
  "media-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

/** Same values proxy.ts sends when a form may not be framed (see convex/embedPolicy.ts). */
const noFraming = Object.entries(DENY_FRAMING).map(([key, value]) => ({ key, value }));
// "Content-Security-Policy: frame-ancestors 'none'" is enforced, unlike the
// report-only policy above, which browsers ignore for frame-ancestors.

/**
 * Every path gets X-Frame-Options: DENY and frame-ancestors 'none' except the
 * public form addresses /f/<shareId> and /<username>/<slug> (lib/embed.ts).
 * Those are decided per request by proxy.ts, which asks Convex whether the form
 * is published and which sites its creator allows, and denies otherwise.
 * Kept as a single negative match so new routes are unframable by default.
 */
const nextConfig: NextConfig = {
  // NEXT_OUTPUT=standalone (set by the Dockerfile) emits a self-contained server
  // bundle. Left unset the build is unchanged, so Vercel deployments are unaffected.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  compress: true,
  poweredByHeader: false,
  // CI typechecks every push (pnpm typecheck), so Vercel skips the repeat and deploys sooner.
  typescript: { ignoreBuildErrors: Boolean(process.env.VERCEL) },
  experimental: {
    // Keep visited workspace pages in the client router cache for 30 s, so Back and sidebar hops
    // re-render at once. Their data comes live from Convex, so nothing shown goes stale.
    staleTimes: { dynamic: 30 },
    // The root layout is app/[lang]/layout.tsx, so unmatched URLs use app/global-not-found.tsx.
    globalNotFound: true,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@clerk/nextjs",
    ],
  },
  async redirects() {
    // One canonical host: www.chaos.fail answers with a permanent 308 to the same path on chaos.fail.
    return [
      { source: "/:path*", has: [{ type: "host", value: "www.chaos.fail" }], destination: "https://chaos.fail/:path*", permanent: true },
      // The combined ChatGPT and Claude guide became one guide per assistant (lib/docs/articles-assistants.ts).
      { source: "/docs/chatgpt-app", destination: "/docs/chatgpt", permanent: true },
      { source: "/ar/docs/chatgpt-app", destination: "/ar/docs/chatgpt", permanent: true },
    ];
  },
  async rewrites() {
    // IndexNow key file at the site root (app/api/indexnow/key/[key]/route.ts checks it against INDEXNOW_KEY).
    return [{ source: "/:key([a-zA-Z0-9-]{8,128}).txt", destination: "/api/indexnow/key/:key" }];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: NOT_EMBEDDABLE_SOURCE, headers: noFraming },
      // Signed-in and internal areas never belong in search results.
      ...["/dashboard/:path*", "/admin/:path*", "/print/:path*", "/api/:path*", "/mcp/:path*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
