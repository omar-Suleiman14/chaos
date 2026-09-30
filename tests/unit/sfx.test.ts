import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("sound resilience", () => {
  it("honors mute in memory when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    const { sfx } = await import("@/lib/sfx");
    const audio = vi.fn();
    vi.stubGlobal("AudioContext", audio);
    sfx.setEnabled(false);
    expect(sfx.isEnabled()).toBe(false);
    sfx.play("select");
    expect(audio).not.toHaveBeenCalled();
    sfx.setEnabled(true);
    expect(sfx.isEnabled()).toBe(true);
  });

  it("never lets an audio initialization failure interrupt an action", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Audio unavailable"); } });
    const { sfx } = await import("@/lib/sfx");
    let answered = false;
    expect(() => { sfx.play("select"); answered = true; }).not.toThrow();
    expect(answered).toBe(true);
  });

  it("does not initialize audio for a silent theme", async () => {
    const audio = vi.fn();
    vi.stubGlobal("AudioContext", audio);
    const { sfx } = await import("@/lib/sfx");
    sfx.play("toggle", "off");
    expect(audio).not.toHaveBeenCalled();
  });
});
