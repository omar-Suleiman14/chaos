import { afterEach, describe, expect, it, vi } from "vitest";
import { schedulePalettePreload } from "@/lib/schedulePalettePreload";

afterEach(() => vi.useRealTimers());

describe("dashboard palette deferred preload lifecycle", () => {
  it("cancels requestIdleCallback when the shell unmounts", () => {
    const load = vi.fn(), cancel = vi.fn();
    const request = vi.fn().mockReturnValue(19);
    const stop = schedulePalettePreload({ requestIdleCallback: request, cancelIdleCallback: cancel } as unknown as Window, load);
    expect(request).toHaveBeenCalledWith(load, { timeout: 5000 });
    stop();
    expect(cancel).toHaveBeenCalledWith(19);
    expect(load).not.toHaveBeenCalled();
  });
  it("clears the fallback timeout before it fires", () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const stop = schedulePalettePreload(window, load);
    stop();
    vi.advanceTimersByTime(5000);
    expect(load).not.toHaveBeenCalled();
  });
  it("runs the fallback once if the shell stays mounted", () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const stop = schedulePalettePreload(window, load);
    vi.advanceTimersByTime(3000);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });
});
