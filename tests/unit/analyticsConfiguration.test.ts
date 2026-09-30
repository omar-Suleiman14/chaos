import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());

describe("analytics configuration", () => {
  it.each([
    ["", ""],
    ["token", ""],
    ["", "https://eu.i.posthog.com"],
  ])("stays off with token=%s and host=%s", async (token, host) => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", token);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", host);
    const { default: analytics, loadAnalytics } = await import("@/lib/analytics");
    analytics.capture("should_not_be_sent");
    analytics.identify("owner");
    await loadAnalytics();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
    // Incomplete configuration must not queue personal events for a later init.
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    await loadAnalytics();
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it("initializes and drains queued calls when both settings exist", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const { default: analytics, loadAnalytics } = await import("@/lib/analytics");
    analytics.capture("screen_viewed", { screen: "home" });
    await loadAnalytics();
    expect(sdk.init).toHaveBeenCalledWith("token", expect.objectContaining({ api_host: "https://eu.i.posthog.com" }));
    expect(sdk.capture).toHaveBeenCalledWith("screen_viewed", { screen: "home" });
  });
});
