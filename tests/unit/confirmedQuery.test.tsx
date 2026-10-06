import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";

const live = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => live.value }));
vi.mock("@/lib/convexClient", () => ({ convex: null }));

import { clearConfirmedCache, setCacheScope, useConfirmedQuery } from "@/lib/confirmedQuery";
import { CacheState } from "@/components/workspace/CacheState";

function Courses() {
  const { data, confirmed } = useConfirmedQuery(api.courses.listMine);
  return <CacheState confirmed={confirmed}><ul>{(data ?? []).map((c) => <li key={c.id}>{c.title}</li>)}</ul></CacheState>;
}
const course = (id: string, title: string) => ({ id, title, description: "", lessons: 1, visibility: "public", published: true, updatedAt: 1, archived: false });
const state = () => document.querySelector(".cache-state")!.getAttribute("data-cache-state");

beforeEach(() => { live.value = undefined; });
afterEach(() => { act(() => setCacheScope(null)); clearConfirmedCache(); localStorage.clear(); });

describe("confirmed queries", () => {
  it("shows the cached copy faded at once, then the live result at full opacity", () => {
    act(() => setCacheScope("user_a"));
    live.value = [course("c1", "Anatomy"), course("c2", "Physiology")];
    const first = render(<Courses />);
    expect(state()).toBe("live");
    first.unmount();

    // Next visit: Convex has not answered yet.
    live.value = undefined;
    const view = render(<Courses />);
    expect(screen.getByText("Anatomy")).toBeInTheDocument();
    expect(state()).toBe("cached");
    expect(document.querySelector(".cache-state")).toHaveAttribute("aria-busy", "true");

    // Convex differs: Physiology was deleted on another device. It must vanish, not linger as confirmed.
    live.value = [course("c1", "Anatomy (renamed)")];
    view.rerender(<Courses />);
    expect(state()).toBe("live");
    expect(screen.queryByText("Physiology")).toBeNull();
    expect(screen.getByText("Anatomy (renamed)")).toBeInTheDocument();
  });

  it("never shows one account's cache to another and clears everything on sign-out", () => {
    act(() => setCacheScope("user_a"));
    live.value = [course("c1", "Private course")];
    render(<Courses />).unmount();

    live.value = undefined;
    act(() => setCacheScope("user_b"));
    const other = render(<Courses />);
    expect(screen.queryByText("Private course")).toBeNull();
    other.unmount();

    act(() => setCacheScope(null));
    expect(Object.keys(localStorage).filter((k) => k.startsWith("chaos.cache"))).toEqual([]);
  });

  it("caches nothing without a signed-in scope", () => {
    live.value = [course("c1", "Anatomy")];
    render(<Courses />).unmount();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("chaos.cache"))).toEqual([]);
  });
});
