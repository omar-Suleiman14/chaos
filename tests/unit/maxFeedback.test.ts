import { describe, expect, it } from "vitest";
import { parseMaxFeedback } from "@/lib/maxFeedback";

const valid = { kind: "Crash", message: "The editor stopped working.", area: "Editor", version: "2.0.0", submissionKey: "test-submission-1" };
describe("Max feedback intake", () => {
  it("accepts the allowlisted fields only", () => {
    expect(parseMaxFeedback(JSON.stringify({ ...valid, url: "private", token: "secret", formId: "other" }))).toEqual(valid);
  });
  it("rejects malformed or oversized reports", () => {
    for (const data of ["{", "[]", JSON.stringify({ ...valid, area: "/p/private-id" }), JSON.stringify({ ...valid, kind: "Other" }), JSON.stringify({ ...valid, message: "x".repeat(2001) })]) expect(parseMaxFeedback(data)).toBeNull();
  });
});
