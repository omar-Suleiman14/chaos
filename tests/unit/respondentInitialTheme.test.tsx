import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { themeFromPreset } from "@/components/forms/formThemes";

const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));

import FormLayout from "@/app/f/[shareId]/layout";
import { useInitialTheme } from "@/components/forms/respond/initial-theme";

function Probe() {
  const theme = useInitialTheme();
  return <p>{theme ? theme.preset : "none"}</p>;
}

describe("respondent loading theme", () => {
  it("hands the form's theme from the server to the page before it loads", async () => {
    fetchQuery.mockResolvedValue({ state: "open", theme: themeFromPreset("paper") });
    render(await FormLayout({ children: <Probe />, params: Promise.resolve({ shareId: "abc" }) }));
    expect(screen.getByText("paper")).toBeInTheDocument();
  });

  it("falls back quietly when the form is unavailable or the lookup fails", async () => {
    fetchQuery.mockResolvedValueOnce({ state: "unavailable" });
    const { unmount } = render(await FormLayout({ children: <Probe />, params: Promise.resolve({ shareId: "gone" }) }));
    expect(screen.getByText("none")).toBeInTheDocument();
    unmount();
    fetchQuery.mockRejectedValueOnce(new Error("offline"));
    render(await FormLayout({ children: <Probe />, params: Promise.resolve({ shareId: "x" }) }));
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
