import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { decideFraming } from "@/lib/embed";
import { shortHostRedirect } from "@/lib/site";
import { isSitePath, LOCALE_COOKIE, splitLocale, type Locale } from "@/lib/locale";
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

/** The response for a page that may render: language segment, framing and robots headers. */
async function finish(req: NextRequest, route: LocaleRoute): Promise<NextResponse> {
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
}

/** Redirects that apply before any authentication: the short share host, then the page's language address. */
function earlyRedirect(req: NextRequest, route: LocaleRoute): NextResponse | null {
  // The short share host (NEXT_PUBLIC_SHORT_SHARE_ORIGIN) only redirects; pages live on the canonical site.
  const short = shortHostRedirect(req.url);
  if (short) return NextResponse.redirect(short, 301);
  return localeRedirect(req, route);
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  const route = localeRoute(req);
  const redirect = earlyRedirect(req, route);
  if (redirect) return redirect;
  if (isProtectedRoute(req)) await auth.protect();
  return finish(req, route);
});

/**
 * Marketing pages are prerendered, so the server never reads a session for them and Clerk's
 * middleware has nothing to do there. Skipping it avoids Clerk's handshake redirect (two extra
 * round trips before a cached page, whenever a signed-in visitor's short-lived token has expired).
 * The browser's Clerk client still shows the signed-in state. Every other page keeps the middleware:
 * ClerkProvider's `dynamic` mode reads the session while rendering them.
 */
async function chaosProxy(req: NextRequest, event: NextFetchEvent) {
  if (!isSitePath(splitLocale(req.nextUrl.pathname).path)) return clerkProxy(req, event);
  const route = localeRoute(req);
  return earlyRedirect(req, route) ?? finish(req, route);
}

export default process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? async function betterAuthProxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  const route = localeRoute(req);
  const redirect = earlyRedirect(req, route);
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
  return finish(req, route);
} : chaosProxy;

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
    "/((?!(?:ai|forms\\-quizzes|live\\-games|open\\-source|teams|status|changelog|admin|api|app|ar|auth|card|compare|chatgpt|connect|dashboard|docs|en|help|homework|learn|login|logout|mcp|play|pricing|print|privacy|copyright|faq|settings|sign\\-in|sign\\-up|signin|signup|sitemap|static|support|terms|trpc|_next|\\.well\\-known|opengraph\\-image)/)[A-Za-z0-9_.\\-]{1,64}/[A-Za-z0-9_\\-]{1,64})",
  ],
};
