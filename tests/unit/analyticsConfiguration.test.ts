import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn(), reset: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); document.cookie = "chaos-consent=; path=/; max-age=0"; localStorage.clear(); });
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
    const { saveCookieConsent } = await import("@/lib/cookieConsent");
    saveCookieConsent(true);
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
    expect(sdk.capture).toHaveBeenCalledWith("$pageview");
    expect(sdk.capture).not.toHaveBeenCalledWith("should_not_be_sent");
    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it("initializes and drains queued calls when both settings exist", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const { default: analytics, loadAnalytics } = await import("@/lib/analytics");
    const { saveCookieConsent } = await import("@/lib/cookieConsent");
    saveCookieConsent(true);
    analytics.capture("screen_viewed", { screen: "home" });
    await loadAnalytics();
    expect(sdk.init).toHaveBeenCalledWith("token", expect.objectContaining({ api_host: "https://eu.i.posthog.com" }));
    expect(sdk.capture).toHaveBeenCalledWith("screen_viewed", { screen: "home" });
  });
  it("does not initialize or replay events from before consent", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const { default: analytics, loadAnalytics } = await import("@/lib/analytics");
    analytics.capture("before_consent");
    await loadAnalytics();
    expect(sdk.init).not.toHaveBeenCalled();
    const { saveCookieConsent } = await import("@/lib/cookieConsent");
    saveCookieConsent(false);
    await loadAnalytics();
    expect(sdk.init).not.toHaveBeenCalled();
    saveCookieConsent(true);
    await loadAnalytics();
    expect(sdk.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    expect(sdk.capture).not.toHaveBeenCalledWith("before_consent");
  });
  it("checks consent again after the SDK download", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const { default: analytics, loadAnalytics } = await import("@/lib/analytics");
    const { saveCookieConsent } = await import("@/lib/cookieConsent");
    saveCookieConsent(true);
    analytics.capture("queued");
    const loading = loadAnalytics();
    saveCookieConsent(false);
    await loading;
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it("opts out, clears identifiers and drops later events on withdrawal", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const { default: analytics, loadAnalytics, scheduleAnalytics } = await import("@/lib/analytics");
    const { saveCookieConsent } = await import("@/lib/cookieConsent");
    scheduleAnalytics();
    saveCookieConsent(true);
    await loadAnalytics();
    localStorage.setItem("ph_token_posthog", "identifier");
    sessionStorage.setItem("ph_token_window_id", "session");
    localStorage.setItem("chaos.learn.guest-study.v1", "progress");
    saveCookieConsent(false);
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    expect(sdk.reset).toHaveBeenCalled();
    expect(localStorage.getItem("ph_token_posthog")).toBeNull();
    expect(sessionStorage.getItem("ph_token_window_id")).toBeNull();
    expect(localStorage.getItem("chaos.learn.guest-study.v1")).toBe("progress");
    analytics.capture("after_withdrawal");
    expect(sdk.capture).not.toHaveBeenCalledWith("after_withdrawal");
  });
});
