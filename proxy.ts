import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { decideFraming } from "@/lib/embed";
import { shortHostRedirect } from "@/lib/site";
import type { EmbedPolicy, EmbedTarget } from "@/lib/embed";

// /print shows a quiz with its answer key; the queries already check ownership, and
// signing in first keeps anonymous visitors off the page entirely.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/admin(.*)", "/print(.*)", "/homework(.*)"]);

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

export default clerkMiddleware(async (auth, req) => {
  // The short share host (NEXT_PUBLIC_SHORT_SHARE_ORIGIN) only redirects; pages live on the canonical site.
  const short = shortHostRedirect(req.url);
  if (short) return NextResponse.redirect(short, 301);
  if (isProtectedRoute(req)) await auth.protect();
  // Framing: every response here gets X-Frame-Options: DENY and frame-ancestors 'none',
  // except a published form whose creator allows the framing site (lib/embed.ts).
  const headers = await decideFraming(req.nextUrl.pathname, req.headers.get("sec-fetch-dest"), lookupPolicy);
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  // Receipt/resume capabilities and embedded copies are not search destinations,
  // even when the underlying form's creator enables indexing.
  if ((process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") || ["edit", "resume", "embed"].some((key) => req.nextUrl.searchParams.has(key))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
});

export const config = {
  matcher: [
    // Skip Next internals, static files, the MCP endpoint (it verifies OAuth tokens itself) and /.well-known.
    "/((?!_next|mcp(?:/|$)|\.well-known/|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
    "/(api|trpc)(.*)",
    // Every path that could be a public form address, even one that looks like a file
    // (a username may contain dots). Must equal EMBED_PROXY_MATCHER in lib/embed.ts;
    // next.config.ts leaves exactly these paths to this proxy.
    "/((?!(?:admin|api|app|card|compare|chatgpt|dashboard|docs|help|homework|learn|login|logout|mcp|play|pricing|print|privacy|settings|sign\\-in|sign\\-up|signin|signup|static|support|terms|trpc|_next|\\.well\\-known|opengraph\\-image)/)[A-Za-z0-9_.\\-]{1,64}/[A-Za-z0-9_\\-]{1,64})",
  ],
};
