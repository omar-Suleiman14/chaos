import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { deriveSaveState, hasUnsavedWork, isTransientSaveError, retryDelay, saveStateCopy, type SaveFacts } from "@/lib/learn/saveState";

const facts = (f: Partial<SaveFacts> = {}): SaveFacts => ({ pending: false, saving: false, online: true, conflict: false, error: false, retrying: false, ...f });

describe("lesson save state", () => {
  it("names every state the writer can be in", () => {
    expect(deriveSaveState(facts())).toBe("saved");
    expect(deriveSaveState(facts({ pending: true }))).toBe("unsaved");
    expect(deriveSaveState(facts({ pending: true, saving: true }))).toBe("saving");
    expect(deriveSaveState(facts({ pending: true, retrying: true }))).toBe("retrying");
    expect(deriveSaveState(facts({ pending: true, error: true }))).toBe("failed");
    expect(deriveSaveState(facts({ pending: true, online: false }))).toBe("offline");
    expect(deriveSaveState(facts({ pending: true, error: true, conflict: true, online: false }))).toBe("conflict");
  });

  it("offline with nothing pending is still saved", () => expect(deriveSaveState(facts({ online: false }))).toBe("saved"));

  it("guards navigation for anything but saved", () => {
    for (const s of ["unsaved", "saving", "retrying", "offline", "failed", "conflict"] as const) expect(hasUnsavedWork(s)).toBe(true);
    expect(hasUnsavedWork("saved")).toBe(false);
  });

  it("has a label in both languages for every state", () => {
    for (const locale of ["en", "ar"] as const) for (const label of Object.values(saveStateCopy[locale])) expect(label.trim()).not.toBe("");
    expect(Object.keys(saveStateCopy.ar).sort()).toEqual(Object.keys(saveStateCopy.en).sort());
  });

  it("retries outages, not decisions", () => {
    expect(isTransientSaveError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientSaveError(new Error("Network request failed"))).toBe(true);
    expect(isTransientSaveError(new Error("Connection lost while action was in flight"))).toBe(true);
    expect(isTransientSaveError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
    expect(isTransientSaveError(new ConvexError({ code: "REVISION_CONFLICT", currentRevision: 3 }))).toBe(false);
    expect(isTransientSaveError(new ConvexError({ code: "VALIDATION", problems: [] }))).toBe(false);
    expect(isTransientSaveError(new ConvexError({ code: "SOMETHING_NEW" }))).toBe(false);
    expect(isTransientSaveError(new Error("Upload this image to durable Chaos sources before saving."))).toBe(false);
    expect(isTransientSaveError(undefined)).toBe(false);
  });

  it("backs off exponentially with a cap", () => {
    expect([1, 2, 3, 4, 5, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });
});
