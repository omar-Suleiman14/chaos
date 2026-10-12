import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { CacheZone, clearConfirmedCache, flushConfirmedWrites, setCacheScope, useCachePending } from "@/lib/confirmedQuery";
import { useFormInventoryPages } from "@/lib/forms/useFormInventoryPages";

const fake = vi.hoisted(() => ({
  authenticated: true,
  pages: {} as Record<string, unknown>,
  requested: [] as string[],
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: fake.authenticated }),
  useQueries: (queries: Record<string, unknown>) => {
    fake.requested = Object.keys(queries);
    return Object.fromEntries(fake.requested.map(key => [key, fake.pages[key]]));
  },
}));
vi.mock("@/lib/convexClient", () => ({ convex: null }));
const form = (id: string) => ({ _id: id, title: id, status: "draft", quizMode: false });
const page = (rows: { owned?: ReturnType<typeof form>[]; shared?: ReturnType<typeof form>[] }, isDone: boolean, cursor: string) => ({
  page: { owned: rows.owned ?? [], shared: rows.shared ?? [], invites: [], searchIndex: [] },
  isDone,
  continueCursor: cursor,
});

beforeEach(() => {
  fake.authenticated = true;
  fake.requested = [];
  fake.pages = {
    "owned:0": page({ owned: [form("recent")] }, false, "next"),
    "account:0": page({ shared: [form("shared"), form("recent")] }, true, ""),
    "email:0": page({ shared: [form("shared")] }, true, ""),
    "owned:1": page({ owned: [form("older")] }, true, ""),
  };
});

afterEach(() => {
  act(() => setCacheScope(null));
  clearConfirmedCache();
  localStorage.clear();
});

describe("form inventory cursors", () => {
  it("preserves cached rows and dimming while pages load, then replaces deleted or changed rows", () => {
    act(() => setCacheScope("inventory-user"));
    const wrapper = ({ children }: { children: ReactNode }) => createElement(CacheZone.Provider, { value: { authenticated: fake.authenticated } }, children);
    const probe = () => ({ ...useFormInventoryPages(), dimmed: useCachePending() });
    const first = renderHook(probe, { wrapper });
    act(() => first.result.current.loadMore());
    first.unmount();
    flushConfirmedWrites();

    delete fake.pages["owned:0"];
    const next = renderHook(probe, { wrapper });
    expect(next.result.current.forms?.owned.map(f => f._id)).toEqual(["recent", "older"]);
    expect(next.result.current.confirmed).toBe(false);
    expect(next.result.current.dimmed).toBe(true);

    fake.pages["owned:0"] = page({ owned: [form("recent")] }, false, "next");
    next.rerender();
    act(() => next.result.current.loadMore());
    fake.pages["owned:0"] = page({ owned: [{ ...form("recent"), title: "Renamed survey" }] }, false, "next");
    fake.pages["owned:1"] = page({}, true, "");
    next.rerender();
    expect(next.result.current.forms?.owned.map(f => f.title)).toEqual(["Renamed survey"]);
    expect(next.result.current.confirmed).toBe(true);
    expect(next.result.current.dimmed).toBe(false);
    next.unmount();
    flushConfirmedWrites();
    delete fake.pages["owned:0"];
    const reload = renderHook(probe, { wrapper });
    expect(reload.result.current.forms?.owned.map(f => f.title)).toEqual(["Renamed survey"]);
    expect(reload.result.current.dimmed).toBe(true);
  });
  it("preserves initial rows and reaches older owned forms without duplicate collaborators", () => {
    const { result } = renderHook(() => useFormInventoryPages());
    expect(result.current.forms?.owned.map(f => f._id)).toEqual(["recent"]);
    expect(result.current.forms?.shared.map(f => f._id)).toEqual(["shared"]);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    expect(fake.requested).toContain("owned:1");
    expect(result.current.forms?.owned.map(f => f._id)).toEqual(["recent", "older"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("does not claim the inventory is complete while a requested page is pending", () => {
    delete fake.pages["account:0"];
    const { result } = renderHook(() => useFormInventoryPages());
    expect(result.current.forms).toBeUndefined();
    expect(result.current.confirmed).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });
});
