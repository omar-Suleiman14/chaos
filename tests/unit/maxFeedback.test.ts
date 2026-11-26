import { describe, expect, it } from "vitest";
import { MAX_FEEDBACK_BYTES, parseMaxFeedback, readMaxFeedbackBody } from "@/lib/maxFeedback";

const valid = { kind: "Crash", message: "The editor stopped working.", area: "Editor", version: "2.0.0", submissionKey: "test-submission-1" };
describe("Max feedback intake", () => {
  it("accepts the allowlisted fields only", () => {
    expect(parseMaxFeedback(JSON.stringify({ ...valid, url: "private", token: "secret", formId: "other" }))).toEqual(valid);
  });
  it("rejects malformed or oversized reports", () => {
    for (const data of ["{", "[]", JSON.stringify({ ...valid, area: "/p/private-id" }), JSON.stringify({ ...valid, kind: "Other" }), JSON.stringify({ ...valid, message: "x".repeat(2001) })]) expect(parseMaxFeedback(data)).toBeNull();
  });
});

describe("bounded feedback body", () => {
  it("accepts valid long messages with Unicode and JSON escapes", () => {
    const message = "ع".repeat(1000) + "\n".repeat(999) + "!";
    expect(parseMaxFeedback(JSON.stringify({ ...valid, message }))?.message).toBe(message);
  });
  it("rejects oversized bodies before parsing", async () => {
    const body = "x".repeat(MAX_FEEDBACK_BYTES + 1);
    expect(await readMaxFeedbackBody(new Request("https://chaos.fail/api/max-feedback", { method: "POST", body }))).toBeNull();
    expect(parseMaxFeedback(body)).toBeNull();
  });
  it("preserves a valid body", async () => {
    const body = JSON.stringify(valid);
    expect(await readMaxFeedbackBody(new Request("https://chaos.fail/api/max-feedback", { method: "POST", body }))).toBe(body);
  });
});
