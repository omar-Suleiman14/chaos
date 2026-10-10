import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const consent = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/components/CookieConsent", () => ({ useAnalyticsConsent: () => consent.allowed }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => <span data-testid="speed-insights" /> }));

import ConsentedSpeedInsights, { speedInsightsEvent } from "@/components/ConsentedSpeedInsights";

describe("consented Speed Insights", () => {
  it("loads only on Vercel after analytics consent", () => {
    consent.allowed = false;
    const { queryByTestId, rerender } = render(<ConsentedSpeedInsights enabled />);
    expect(queryByTestId("speed-insights")).toBeNull();
    consent.allowed = true;
    rerender(<ConsentedSpeedInsights enabled={false} />);
    expect(queryByTestId("speed-insights")).toBeNull();
    rerender(<ConsentedSpeedInsights enabled />);
    expect(queryByTestId("speed-insights")).not.toBeNull();
  });

  it("reports the route pattern instead of private addresses", () => {
    expect(speedInsightsEvent({ type: "vital", url: "https://chaos.fail/ar/f/abc123?ref=mail#top", route: "/[lang]/f/[shareId]" }))
      .toEqual({ type: "vital", url: "https://chaos.fail/[lang]/f/[shareId]", route: "/[lang]/f/[shareId]" });
  });

  it("drops vitals from pages without a known route", () => {
    expect(speedInsightsEvent({ type: "vital", url: "https://chaos.fail/perry" })).toBeNull();
  });
});
