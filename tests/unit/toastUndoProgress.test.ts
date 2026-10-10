import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast, toastStore } from "@/lib/toast";

describe("undo toast deadline", () => {
  beforeEach(() => { vi.useRealTimers(); toastStore.reset(); });
  it("uses a five-second default and retains undo", () => {
    const undo = vi.fn();
    toast("Archived", { undo });
    expect(toastStore.get()[0]).toMatchObject({ duration: 5000, undo });
  });
  it("carries a server deadline to the presenter", () => {
    toast("Pending removal", { undo: vi.fn(), expiresAt: 123456, pauseOnHover: false, duration: 5000 });
    expect(toastStore.get()[0]).toMatchObject({ expiresAt: 123456, pauseOnHover: false, duration: 5000 });
  });
  it("resets the progress version when a toast is updated", () => {
    const id = toast("Archiving", { undo: vi.fn() });
    toast.success("Archived", { id, undo: vi.fn() });
    expect(toastStore.get()[0].version).toBe(2);
  });
});
