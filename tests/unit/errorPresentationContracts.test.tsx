import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../lib/i18n";
import QueryErrorBoundary from "../../components/forms/QueryErrorBoundary";
import LoadingState from "../../components/LoadingState";

vi.mock("../../components/StateIllustration", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid="state-illustration" data-variant={variant} />,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("distinct loading/error retry contracts", () => {
  it("recovers only the failed query subtree when its retry button is used", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    function Child() {
      if (broken) throw new Error("Synthetic query failure");
      return <p>Recovered content</p>;
    }
    render(<LocaleProvider initial="en"><QueryErrorBoundary><Child /></QueryErrorBoundary></LocaleProvider>);
    expect(screen.getByRole("alert").textContent).toContain("This view is unavailable.");
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered content")).toBeTruthy();
  });

  it("preserves Arabic wording and the accessible feature-local retry button", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Child(): never { throw new Error("Synthetic query failure"); }
    render(<LocaleProvider initial="ar"><QueryErrorBoundary><Child /></QueryErrorBoundary></LocaleProvider>);
    expect(screen.getByRole("alert").textContent).toContain("هذا العرض غير متاح");
    expect(screen.getByRole("button", { name: "حاول مجددًا" })).toBeTruthy();
  });

  it("does not show the stalled loader or reload control until eight seconds elapse", () => {
    vi.useFakeTimers();
    const { container } = render(<LoadingState label="Loading content" />);
    expect(container.textContent).toContain("Loading content");
    expect(container.querySelector("button")).toBeNull();
    act(() => vi.advanceTimersByTime(7_999));
    expect(container.querySelector("button")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.textContent).toContain("This is taking longer than expected.");
    expect(screen.getByTestId("state-illustration").getAttribute("data-variant")).toBe("offline");
    expect(container.querySelector("button")?.textContent).toBe("RETRY");
  });
});
