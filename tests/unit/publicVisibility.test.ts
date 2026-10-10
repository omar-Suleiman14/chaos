import { describe, expect, it } from "vitest";
import { isListed } from "../../lib/learn/publicVisibility";
import type { Lesson } from "../../lib/learn/types";

const lesson = (patch: Partial<Lesson> = {}) => ({
  published: { version: 1 },
  visibility: "public",
  archived: false,
  moderation: "ok",
  ...patch,
}) as Lesson;

describe("public lesson frontend listing predicate", () => {
  it("accepts an active, approved, published public lesson", () => {
    expect(isListed(lesson())).toBe(true);
  });

  it("rejects unpublished, private, archived and moderated lessons", () => {
    expect(isListed(lesson({ published: undefined }))).toBe(false);
    expect(isListed(lesson({ visibility: "private" }))).toBe(false);
    expect(isListed(lesson({ archived: true }))).toBe(false);
    expect(isListed(lesson({ moderation: "pending" }))).toBe(false);
  });
});
