import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import VersionBrowser, { compareItems, ItemSheet } from "@/components/versions/VersionBrowser";

type Card = { id: string; text: string };
type V = { key: string; name: string; at: number; cards: Card[] };
const v = (key: string, at: number, cards: Card[]): V => ({ key, name: `Version ${key}`, at, cards });
const draft = v("draft", Date.UTC(2026, 9, 8), [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta, edited" }, { id: "c", text: "Gamma" }]);
const past = [v("2", Date.UTC(2026, 9, 7), [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }]), v("1", Date.UTC(2026, 9, 6), [{ id: "a", text: "Alpha" }, { id: "d", text: "Delta" }])];
const diffOf = (a: Card[], b: Card[]) => compareItems(a, b, (c) => c.id);

function show(run = vi.fn()) {
  const onClose = vi.fn();
  render(<LocaleProvider initial="en"><VersionBrowser status="ready" current={draft} currentLabel="Your draft" past={past} onClose={onClose}
    counts={(a, b) => diffOf(a.cards, b.cards).counts}
    sheet={(x, { against, side }) => {
      const diff = against ? (side === "base" ? diffOf(x.cards, against.cards) : diffOf(against.cards, x.cards)) : null;
      return <ItemSheet items={x.cards.map((c) => ({ id: c.id, title: c.text, change: diff ? diff.change(c, side) : undefined }))} />;
    }}
    restore={{ label: "Restore to draft", warning: "Your draft will be replaced.", run }} /></LocaleProvider>);
  return { run, onClose };
}

describe("shared version browser", () => {
  it("compares the draft with the newest earlier version and marks what changed", () => {
    show();
    const current = screen.getByRole("region", { name: "Your draft" });
    expect(within(current).getByText("Beta, edited").closest("li")).toHaveAttribute("data-change", "changed");
    expect(within(current).getByText("Gamma").closest("li")).toHaveAttribute("data-change", "added");
    expect(screen.getByText("1 changed · 1 added · 0 removed")).toBeInTheDocument();
  });

  it("steps back through versions with the timeline arrows and the keyboard", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Older version" }));
    expect(screen.getByText("0 changed · 2 added · 1 removed")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
    expect(screen.getByText("1 changed · 1 added · 0 removed")).toBeInTheDocument();
  });

  it("restores only after a second, confirming click", async () => {
    const { run } = show(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole("button", { name: "Restore to draft" }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Your draft will be replaced.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restore to draft" })); });
    expect(run).toHaveBeenCalledWith(past[0]);
    expect(screen.getByRole("status")).toHaveTextContent("Restored to your draft.");
  });

  it("closes with Done", () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
