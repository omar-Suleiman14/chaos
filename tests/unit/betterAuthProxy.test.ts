import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextFetchEvent } from "next/server";

const state = vi.hoisted(() => ({ signedIn: true, wrapped: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: (handler: unknown) => handler, createRouteMatcher: () => (request: NextRequest) => request.nextUrl.pathname.startsWith("/dashboard") }));
vi.mock("next/server", () => ({ NextResponse: { next: () => new Response(null), redirect: (url: URL, status = 307) => new Response(null, { status, headers: { Location: url.href } }) } }));
vi.mock("better-auth/cookies", () => ({ getSessionCookie: () => state.signedIn ? "session" : null }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); state.wrapped.mockClear(); state.signedIn = true; });
const request = (path: string) => ({ url: `https://app.example.test${path}`, nextUrl: new URL(`https://app.example.test${path}`), headers: new Headers() }) as NextRequest;

describe("Better Auth navigation protection", () => {
  it("retains framing and robots policy", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "betterauth");
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(request("/dashboard?resume=receipt"), {} as NextFetchEvent);
    expect(response!.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response!.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
  it("redirects anonymous visitors and excludes Better Auth endpoints", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "betterauth");
    state.signedIn = false;
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(request("/dashboard/editor?id=quiz"), {} as NextFetchEvent);
    const destination = new URL(response!.headers.get("Location")!);
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("callbackUrl")).toBe("/dashboard/editor?id=quiz");
    await proxy(request("/api/auth/sign-in/email"), {} as NextFetchEvent);
  });
});
