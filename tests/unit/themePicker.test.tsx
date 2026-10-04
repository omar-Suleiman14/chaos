import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemePicker } from "@/components/ThemePicker";
import type { ThemePresetId } from "@/convex/formLogic";
import { LocaleProvider } from "@/lib/i18n";

function Picker({ initial = "paper" }: { initial?: ThemePresetId }) {
  const [value, setValue] = useState<ThemePresetId | undefined>(initial);
  return <ThemePicker value={value} onChange={setValue} defaultOption={{ label: "Use quiz theme", onSelect: () => setValue(undefined) }} />;
}

describe("compact theme choices", () => {
  // Picks are remembered as recent themes; each test starts with none.
  beforeEach(() => localStorage.clear());

  it("keeps a selected preset visible, expands all 19, searches, and keeps a newly selected preset on collapse", () => {
    render(<Picker />);
    expect(screen.getByRole("radio", { name: "Paper" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.queryByText("Aa")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All themes (19)" }));
    expect(screen.getAllByRole("radio")).toHaveLength(20);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search themes" }), { target: { value: "Banner" } });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "Banner" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer themes" }));
    expect(screen.getByRole("radio", { name: "Banner" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Banner" })).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("moves focus and selection together using arrows, Home and End, including the inherited choice", () => {
    render(<Picker initial="chaos" />);
    const evergreen = screen.getByRole("radio", { name: "Evergreen" });
    evergreen.focus();
    fireEvent.keyDown(evergreen, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Terracotta" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Terracotta" })).toBeChecked();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("radio", { name: "Use quiz theme" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Use quiz theme" })).toBeChecked();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("radio", { name: "Velvet" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Velvet" })).toBeChecked();
    expect(within(screen.getByRole("radiogroup")).getAllByRole("radio").filter((node) => node.tabIndex === 0)).toHaveLength(1);
  });

  it("reverses horizontal keys in Arabic and searches Arabic or English theme names", () => {
    const change = vi.fn();
    render(<LocaleProvider initial="ar"><ThemePicker value="midnight" onChange={change} /></LocaleProvider>);
    fireEvent.keyDown(screen.getByRole("radio", { name: "منتصف الليل" }), { key: "ArrowLeft" });
    expect(change).toHaveBeenCalledWith("velvet");
    expect(screen.getByRole("radio", { name: "مخمل" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "كل المظاهر (19)" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "ابحث عن مظهر" }), { target: { value: "شفق" } });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "شفق" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ocean" } });
    expect(screen.getByRole("radio", { name: "محيط" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no match" } });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("لا توجد مظاهر تطابق بحثك.");
  });

  it("respects a caller-provided theme order without adding a second expansion control", () => {
    render(<ThemePicker value="velvet" onChange={vi.fn()} ids={["velvet", "ocean"]} />);
    expect(screen.getAllByRole("radio").map((node) => node.textContent)).toEqual(["Velvet", "Ocean"]);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
