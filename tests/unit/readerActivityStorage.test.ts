import { describe, expect, it, vi } from "vitest";
import { readReaderActivities, saveReaderActivity } from "../../lib/learn/readerActivityStorage";

describe("lesson reader activity storage", () => {
  it("defaults to empty state for missing or malformed data", () => {
    expect(readReaderActivities({ getItem: () => null }, "key")).toEqual({});
    expect(readReaderActivities({ getItem: () => "{" }, "key")).toEqual({});
  });
  it("stores by kind and id without mutating previous activities", () => {
    const setItem = vi.fn();
    const old = { "quiz:1": { kind: "quiz", id: "1" } };
    const next = saveReaderActivity({ setItem }, "key", old, { kind: "flashcards", id: "2" });
    expect(Object.keys(next)).toEqual(["quiz:1", "flashcards:2"]);
    expect(Object.keys(old)).toEqual(["quiz:1"]);
    expect(setItem).toHaveBeenCalledWith("key", JSON.stringify(next));
  });
  it("keeps in-memory completion if device persistence throws", () => {
    const next = saveReaderActivity({ setItem: () => { throw new Error("blocked"); } }, "key", {}, { kind: "quiz", id: "1" });
    expect(next["quiz:1"]).toEqual({ kind: "quiz", id: "1" });
  });
});
