import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";

const live = vi.hoisted(() => ({ value: undefined as unknown }));
const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock("convex/react", () => ({ useQuery: () => live.value }));
vi.mock("@/lib/convexClient", () => ({ convex: null }));

import { CacheZone, clearConfirmedCache, flushConfirmedWrites, setCacheScope, useCachePending, useConfirmedQuery } from "@/lib/confirmedQuery";
import { CacheState } from "@/components/workspace/CacheState";

function Courses() {
  return <CacheZone.Provider value={{ authenticated: auth.isAuthenticated }}><CourseList /></CacheZone.Provider>;
}
function CourseList() {
  const { data, confirmed } = useConfirmedQuery(api.courses.listMine);
  return <CacheState confirmed={confirmed}><ul>{(data ?? []).map((c) => <li key={c.id}>{c.title}</li>)}</ul></CacheState>;
}
const course = (id: string, title: string) => ({ id, title, description: "", lessons: 1, visibility: "public", published: true, updatedAt: 1, archived: false });
const state = () => document.querySelector(".cache-state")!.getAttribute("data-cache-state");

beforeEach(() => { live.value = undefined; auth.isAuthenticated = true; });
afterEach(() => { act(() => setCacheScope(null)); clearConfirmedCache(); localStorage.clear(); });

describe("confirmed queries", () => {
  it("shows the cached copy faded at once, then the live result at full opacity", () => {
    act(() => setCacheScope("user_a"));
    live.value = [course("c1", "Anatomy"), course("c2", "Physiology")];
    const first = render(<Courses />);
    expect(state()).toBe("live");
    first.unmount();
    flushConfirmedWrites();

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
    flushConfirmedWrites();

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
    flushConfirmedWrites();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("chaos.cache"))).toEqual([]);
  });

  it("ignores answers given before Convex has the sign-in, and fades the workspace meanwhile", () => {
    act(() => setCacheScope("user_a"));
    live.value = [course("c1", "Anatomy")];
    render(<Courses />).unmount();
    flushConfirmedWrites();

    // Reload: Convex answers as a signed-out visitor first (an empty list).
    auth.isAuthenticated = false;
    live.value = [];
    function Probe() { return <i data-testid="pending">{String(useCachePending())}</i>; }
    const pending = () => screen.getByTestId("pending").textContent === "true";
    const view = render(<><Courses /><Probe /></>);
    expect(screen.getByText("Anatomy")).toBeInTheDocument();
    expect(state()).toBe("cached");
    expect(pending()).toBe(true);

    auth.isAuthenticated = true;
    live.value = [course("c1", "Anatomy"), course("c3", "Pharmacology")];
    view.rerender(<><Courses /><Probe /></>);
    expect(state()).toBe("live");
    expect(screen.getByText("Pharmacology")).toBeInTheDocument();
    expect(pending()).toBe(false);
  });

  it("passes live values straight through outside the workspace", () => {
    act(() => setCacheScope("user_a"));
    live.value = [course("c1", "Anatomy")];
    function Outside() { const { data } = useConfirmedQuery(api.courses.listMine); return <p>{data?.length ?? "none"}</p>; }
    render(<Outside />);
    expect(Object.keys(localStorage).filter((k) => k.startsWith("chaos.cache.v1"))).toEqual([]);
  });

  it("trusts the remembered account only for the same sign-in", async () => {
    document.cookie = "__client_uat=1700000000";
    act(() => setCacheScope("user_a"));
    expect(JSON.parse(localStorage.getItem("chaos.cache.scope")!)).toEqual({ userId: "user_a", session: "1700000000" });

    vi.resetModules();
    const same = await import("@/lib/confirmedQuery");
    function Scope({ mod }: { mod: typeof same }) { const { data } = mod.useConfirmed("probe", undefined as unknown); return <p>{data === undefined ? "no cache" : "cache"}</p>; }
    localStorage.setItem("chaos.cache.v1:user_a:probe", JSON.stringify({ at: Date.now(), value: 1 }));
    const a = render(<same.CacheZone.Provider value={{ authenticated: false }}><Scope mod={same} /></same.CacheZone.Provider>);
    expect(screen.getByText("cache")).toBeInTheDocument();
    a.unmount();

    // Someone else signed in on this device: Clerk's marker changed.
    document.cookie = "__client_uat=1800000000";
    vi.resetModules();
    const other = await import("@/lib/confirmedQuery");
    render(<other.CacheZone.Provider value={{ authenticated: false }}><Scope mod={other} /></other.CacheZone.Provider>);
    expect(screen.getByText("no cache")).toBeInTheDocument();
    document.cookie = "__client_uat=; max-age=0";
  });
});
