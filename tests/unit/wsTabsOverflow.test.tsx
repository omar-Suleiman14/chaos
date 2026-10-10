import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WsTabs } from "@/components/workspace/primitives";

const tabs = ["Forms", "Quizzes", "Flashcards", "Courses", "Games"] as const;

function layout(el: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: scrollLeft });
}

describe("WsTabs overflow hint", () => {
  it("marks the edges that have tabs out of view and offers a scroll chevron", () => {
    const { container } = render(<WsTabs tabs={tabs} value="Forms" onChange={() => {}} label="Library" />);
    const wrap = container.querySelector(".ws-tabs-wrap")!;
    const bar = screen.getByRole("tablist");
    expect(wrap.hasAttribute("data-overflow-end")).toBe(false);

    layout(bar, { scrollWidth: 600, clientWidth: 360, scrollLeft: 0 });
    fireEvent.scroll(bar);
    expect(wrap.hasAttribute("data-overflow-end")).toBe(true);
    expect(wrap.hasAttribute("data-overflow-start")).toBe(false);
    expect(container.querySelector(".ws-tabs-more")).not.toBeNull();

    layout(bar, { scrollWidth: 600, clientWidth: 360, scrollLeft: 240 });
    fireEvent.scroll(bar);
    expect(wrap.hasAttribute("data-overflow-start")).toBe(true);
    expect(wrap.hasAttribute("data-overflow-end")).toBe(false);
    expect(container.querySelector(".ws-tabs-more")).toBeNull();
  });

  it("treats negative right-to-left scroll offsets as distance from the start", () => {
    const { container } = render(<WsTabs tabs={tabs} value="Forms" onChange={() => {}} label="Library" />);
    const bar = screen.getByRole("tablist");
    layout(bar, { scrollWidth: 600, clientWidth: 360, scrollLeft: -120 });
    fireEvent.scroll(bar);
    const wrap = container.querySelector(".ws-tabs-wrap")!;
    expect(wrap.hasAttribute("data-overflow-start")).toBe(true);
    expect(wrap.hasAttribute("data-overflow-end")).toBe(true);
  });

  it("keeps the chevron out of the keyboard and accessibility trees", () => {
    const { container } = render(<WsTabs tabs={tabs} value="Forms" onChange={() => {}} label="Library" />);
    const bar = screen.getByRole("tablist");
    layout(bar, { scrollWidth: 600, clientWidth: 360, scrollLeft: 0 });
    fireEvent.scroll(bar);
    const more = container.querySelector<HTMLButtonElement>(".ws-tabs-more")!;
    expect(more.tabIndex).toBe(-1);
    expect(more.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });
});
