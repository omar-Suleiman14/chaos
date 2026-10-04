import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { decideFraming } from "@/lib/embed";
import { shortHostRedirect } from "@/lib/site";
import { LOCALE_COOKIE, type Locale } from "@/lib/locale";
import { routeLocale, type LocaleRoute } from "@/lib/localeRouting";
import type { EmbedPolicy, EmbedTarget } from "@/lib/embed";

// /print shows a quiz with its answer key; the queries already check ownership, and
// signing in first keeps anonymous visitors off the page entirely.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/admin(.*)", "/print(.*)", "/homework(.*)", "/auth(.*)"]);

/** Past this the frame is denied rather than holding up the page. */
const POLICY_TIMEOUT_MS = 2500;

async function lookupPolicy(target: EmbedTarget): Promise<EmbedPolicy> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchQuery(api.embed.getEmbedPolicy, target),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("embed policy timeout")), POLICY_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Pages live under app/[lang]; see lib/localeRouting.ts for which URLs redirect or rewrite. */
function localeRoute(req: NextRequest): LocaleRoute {
  return routeLocale(req.nextUrl.pathname, req.nextUrl.search, req.cookies.get(LOCALE_COOKIE)?.value);
}

function rememberLocale<T extends NextResponse>(response: T, locale: Locale | undefined): T {
  if (locale) response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return response;
}

function localeRedirect(req: NextRequest, route: LocaleRoute): NextResponse | null {
  return route.action === "redirect" ? rememberLocale(NextResponse.redirect(new URL(route.location, req.url), route.status), route.setLocale) : null;
}

function continueWith(req: NextRequest, route: LocaleRoute): NextResponse {
  if (route.action === "rewrite") return NextResponse.rewrite(new URL(route.pathname + req.nextUrl.search, req.url));
  return rememberLocale(NextResponse.next(), route.action === "pass" ? route.setLocale : undefined);
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  // The short share host (NEXT_PUBLIC_SHORT_SHARE_ORIGIN) only redirects; pages live on the canonical site.
  const short = shortHostRedirect(req.url);
  if (short) return NextResponse.redirect(short, 301);
  const route = localeRoute(req);
  const redirect = localeRedirect(req, route);
  if (redirect) return redirect;
  if (isProtectedRoute(req)) await auth.protect();
  // Framing: every response here gets X-Frame-Options: DENY and frame-ancestors 'none',
  // except a published form whose creator allows the framing site (lib/embed.ts).
  const headers = await decideFraming(req.nextUrl.pathname, req.headers.get("sec-fetch-dest"), lookupPolicy);
  const response = continueWith(req, route);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  // Receipt/resume capabilities and embedded copies are not search destinations,
  // even when the underlying form's creator enables indexing.
  if ((process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") || ["edit", "resume", "embed"].some((key) => req.nextUrl.searchParams.has(key))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
});

export default process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? async function betterAuthProxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  const short = shortHostRedirect(req.url);
  if (short) return NextResponse.redirect(short, 301);
  const route = localeRoute(req);
  const redirect = localeRedirect(req, route);
  if (redirect) return redirect;
  if (isProtectedRoute(req)) {
    // This is a navigation hint only. Convex verifies JWTs and ownership on every request.
    const { getSessionCookie } = await import("better-auth/cookies");
    if (!getSessionCookie(req)) {
      const login = new URL("/sign-in", req.url);
      login.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }
  const headers = await decideFraming(req.nextUrl.pathname, req.headers.get("sec-fetch-dest"), lookupPolicy);
  const response = continueWith(req, route);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  if ((process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") || ["edit", "resume", "embed"].some(key => req.nextUrl.searchParams.has(key))) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
} : clerkProxy;

export const config = {
  matcher: [
    // Skip Next internals, static files, the MCP endpoint (it verifies OAuth tokens itself) and /.well-known.
    // Doubled backslashes, so the pattern gets an escaped (literal) dot. A bare "\." in a JS string
    // is just ".", which skipped any path with a character before "doc", "png" and so on. Every page
    // must reach the proxy now, because it picks the page's app/[lang] segment.
    "/((?!_next|mcp(?:/|$)|\\.well-known/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
    // Member cards: usernames may contain dots, so /card/ahmed.js must not pass for a static file.
    "/card/(.*)",
    "/(api|trpc)(.*)",
    // Every path that could be a public form address, even one that looks like a file
    // (a username may contain dots). Must equal EMBED_PROXY_MATCHER in lib/embed.ts;
    // next.config.ts leaves exactly these paths to this proxy.
    "/((?!(?:admin|api|app|ar|auth|card|compare|chatgpt|connect|dashboard|docs|en|help|homework|learn|login|logout|mcp|play|pricing|print|privacy|copyright|settings|sign\\-in|sign\\-up|signin|signup|sitemap|static|support|terms|trpc|_next|\\.well\\-known|opengraph\\-image)/)[A-Za-z0-9_.\\-]{1,64}/[A-Za-z0-9_\\-]{1,64})",
  ],
};
