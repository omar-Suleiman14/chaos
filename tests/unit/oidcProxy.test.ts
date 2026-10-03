import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextFetchEvent } from "next/server";

const state = vi.hoisted(() => ({ signedIn: true, wrapped: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: (handler: unknown) => handler, createRouteMatcher: () => (request: NextRequest) => request.nextUrl.pathname.startsWith("/dashboard") }));
vi.mock("next/server", () => ({ NextResponse: { next: () => new Response(null), redirect: (url: URL, status = 307) => new Response(null, { status, headers: { Location: url.href } }) } }));
vi.mock("@/lib/auth/server", () => ({ auth: (handler: (request: unknown) => Promise<Response>) => {
  state.wrapped(handler);
  if (typeof handler !== "function") throw new Error("Proxy must use auth(handler) to persist rotation");
  return async (request: object) => {
    const response = await handler({ ...request, auth: state.signedIn ? { user: { id: "stable-account" } } : null });
    response.headers.append("Set-Cookie", "session=rotated; HttpOnly; Secure; SameSite=Lax");
    return response;
  };
} }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); state.wrapped.mockClear(); state.signedIn = true; });
const request = (path: string) => ({ url: `https://app.example.test${path}`, nextUrl: new URL(`https://app.example.test${path}`), headers: new Headers() }) as NextRequest;

describe("OIDC proxy session persistence", () => {
  it("retains middleware Set-Cookie alongside framing and robots policy", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "oidc");
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(request("/dashboard?resume=receipt"), {} as NextFetchEvent);
    expect(state.wrapped).toHaveBeenCalledTimes(1);
    expect(response!.headers.get("Set-Cookie")).toContain("session=rotated");
    expect(response!.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response!.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
  it("preserves cookies on protected redirects and excludes Auth.js callbacks", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "oidc");
    state.signedIn = false;
    const { default: proxy } = await import("../../proxy");
    const response = await proxy(request("/dashboard/editor?id=quiz"), {} as NextFetchEvent);
    expect(response!.headers.get("Set-Cookie")).toContain("session=rotated");
    const destination = new URL(response!.headers.get("Location")!);
    expect(destination.pathname).toBe("/api/auth/signin");
    expect(destination.searchParams.get("callbackUrl")).toBe("/dashboard/editor?id=quiz");
    await proxy(request("/api/auth/callback/keycloak"), {} as NextFetchEvent);
    expect(state.wrapped).toHaveBeenCalledTimes(1);
  });
});
