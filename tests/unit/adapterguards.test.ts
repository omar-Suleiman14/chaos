import { describe, expect, it } from "vitest";
import { bounded, problem } from "@/lib/lessonAdapterGuards";
describe("lesson adapter validation guards", () => {
  it("preserves structured problem codes and locations", () => {
    expect(problem("blocks.2", "Missing link")).toEqual({ code: "invalid", path: "blocks.2", message: "Missing link" });
    expect(problem("document", "Too big", "limit")).toEqual({ code: "limit", path: "document", message: "Too big" });
  });
  it("rejects oversized or non-serializable documents", () => {
    expect(bounded({ blocks: [] })).toBe(true);
    expect(bounded({ text: "a".repeat(300001) })).toBe(false);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(bounded(circular)).toBe(false);
  });
});
