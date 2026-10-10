import { describe, expect, it } from "vitest";
import { parseStoredJson } from "@/lib/storageJson";

type Saved = { v: 1; value: string };
const valid = (candidate: unknown): candidate is Saved =>
  candidate !== null && typeof candidate === "object" && "v" in candidate && candidate.v === 1
  && "value" in candidate && typeof candidate.value === "string";
const fallback = () => ({ v: 1 as const, value: "" });

describe("defensive local JSON decoding", () => {
  it("reads a compatible version without dropping content", () => {
    expect(parseStoredJson('{"v":1,"value":"Arabic: العربية"}', fallback, valid))
      .toEqual({ v: 1, value: "Arabic: العربية" });
  });
  it("resets missing, corrupt or different-version content", () => {
    for (const raw of [null, "", "{bad", '{"v":2,"value":"old"}', '{"v":1,"value":false}', "null"]) {
      expect(parseStoredJson(raw, fallback, valid)).toEqual(fallback());
    }
  });
});
