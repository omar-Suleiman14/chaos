import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import LoadingState from "@/components/LoadingState";

const art = () => document.querySelector(".state-illustration");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("loading state", () => {
  it("shows only its plain line, with no picture or fake progress, while loading", () => {
    render(<LoadingState label="Loading connections…" />);
    expect(screen.getByText("Loading connections…")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(7999); });
    expect(art()).toBeNull();
  });

  it("draws the connection-trouble illustration once it stalls after 8 seconds, and still reloads on retry", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<LoadingState label="Loading connections…" />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(art()).toHaveAttribute("data-variant", "offline");
    expect(art()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/taking longer than expected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("speaks Arabic when stalled", () => {
    render(<LocaleProvider initial="ar"><LoadingState label="…" /></LocaleProvider>);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
    expect(art()).toHaveAttribute("data-variant", "offline");
  });
});
