import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProductAnalytics, {
  analyticsScreen,
} from "@/components/ProductAnalytics";
const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/f/private-id?resume=secret",
}));
afterEach(() => vi.unstubAllEnvs());
it("does not expose private identifiers in screen names", () => {
  expect(analyticsScreen("/f/private-id?resume=secret")).toBe("respondent");
  expect(analyticsScreen("/dashboard/forms/private-id/responses")).toBe(
    "responses",
  );
});
it("captures a sanitized screen name when PostHog is configured", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  render(<ProductAnalytics />);
  // PostHog loads lazily (lib/analytics.ts); the call is queued and replayed once it arrives.
  await waitFor(() =>
    expect(sdk.capture).toHaveBeenCalledWith("screen_viewed", {
      screen: "respondent",
    }),
  );
});
