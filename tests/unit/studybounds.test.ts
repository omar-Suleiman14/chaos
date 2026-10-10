import { describe, expect, it } from "vitest";
import { bounded, fail } from "@/convex/studyLessonBounds";
describe("study checkpoint validation", () => {
  it("accepts bounded JSON", () => expect(() => bounded({ title: "Study" }, 1000)).not.toThrow());
  it("checks UTF-8 bytes", () => expect(() => bounded("أ".repeat(100), 20)).toThrow("VALIDATION_FAILED: Input exceeds workflow limits; split into smaller checkpoints."));
  it("preserves error codes", () => expect(() => fail("No source")).toThrow("VALIDATION_FAILED: No source"));
});
