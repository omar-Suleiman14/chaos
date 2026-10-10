import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboardText } from "@/lib/clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("shared clipboard writer", () => {
  it("passes text unchanged without owning the caller's toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(writeClipboardText("https://example.test/ar/f/abc")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledExactlyOnceWith("https://example.test/ar/f/abc");
  });
  it("preserves localized unavailable messages and write failures", async () => {
    vi.stubGlobal("navigator", { clipboard: undefined });
    expect(() => writeClipboardText("text", "الحافظة غير متاحة")).toThrow("الحافظة غير متاحة");
    const failure = new Error("permission denied");
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(failure) } });
    await expect(writeClipboardText("text")).rejects.toBe(failure);
  });
});
