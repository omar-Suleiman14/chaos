import { describe, expect, it } from "vitest";
import { studyLessonProfile } from "../../lib/mcp/studyLessonProfile";

describe("studyLessonProfile", () => {
  it("retains default optional configuration", () => {
    expect(studyLessonProfile.safeParse({}).success).toBe(true);
    expect(studyLessonProfile.parse({ teamId: "team", publish: false, visibility: "restricted", sound: "wood" })).toMatchObject({ publish: false, visibility: "restricted" });
  });
  it("rejects oversized team ids, unsupported visibility and sounds", () => {
    expect(studyLessonProfile.safeParse({ teamId: "a".repeat(161) }).success).toBe(false);
    expect(studyLessonProfile.safeParse({ visibility: "unlisted" }).success).toBe(false);
    expect(studyLessonProfile.safeParse({ sound: "loud" }).success).toBe(false);
  });
});
