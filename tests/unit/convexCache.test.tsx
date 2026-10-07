import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";

const client = vi.hoisted(() => {
  const release = vi.fn();
  return { release, watchQuery: vi.fn(() => ({ onUpdate: vi.fn(() => release) })), prewarmQuery: vi.fn() };
});
vi.mock("@/lib/convexClient", () => ({ convex: client }));
vi.mock("convex/react", () => ({ useQuery: () => "value" }));

import { KEEP_ALIVE_MS, useQuery, warmForm } from "@/lib/convexCache";

function Page({ formId }: { formId: string | "skip" }) {
  const value = useQuery(api.forms.getFormForEditor, formId === "skip" ? "skip" : { formId: formId as never });
  return <p>{String(value)}</p>;
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("cached useQuery", () => {
  it("keeps the subscription for a few minutes after the page unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Page formId="f1" />);
    expect(client.watchQuery).toHaveBeenCalledWith(api.forms.getFormForEditor, { formId: "f1" });
    unmount();
    expect(client.release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(KEEP_ALIVE_MS);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("holds nothing for skipped queries", () => {
    render(<Page formId="skip" />).unmount();
    expect(client.watchQuery).not.toHaveBeenCalled();
  });
  it("shares one retained watcher and cancels expiry when a page returns", () => {
    vi.useFakeTimers();
    const first = render(<Page formId="shared" />);
    const second = render(<Page formId="shared" />);
    expect(client.watchQuery).toHaveBeenCalledTimes(1);
    first.unmount();
    vi.advanceTimersByTime(KEEP_ALIVE_MS);
    expect(client.release).not.toHaveBeenCalled();
    second.unmount();
    vi.advanceTimersByTime(KEEP_ALIVE_MS - 1);
    const returned = render(<Page formId="shared" />);
    vi.advanceTimersByTime(KEEP_ALIVE_MS);
    expect(client.watchQuery).toHaveBeenCalledTimes(1);
    expect(client.release).not.toHaveBeenCalled();
    returned.unmount();
    vi.advanceTimersByTime(KEEP_ALIVE_MS);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("warms a form on intent once per few seconds", () => {
    warmForm("f2");
    warmForm("f2");
    expect(client.prewarmQuery).toHaveBeenCalledTimes(1);
    expect(client.prewarmQuery).toHaveBeenCalledWith(expect.objectContaining({ query: api.forms.getFormForEditor, args: { formId: "f2" } }));
  });
});
