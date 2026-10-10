import { describe, expect, it } from "vitest";
import { readBoundedBody } from "../../convex/httpBody";

describe("bounded HTTP request bodies", () => {
  const request = (body?: string, headers?: HeadersInit) =>
    new Request("https://example.invalid/upload", { method: "POST", ...(body === undefined ? {} : { body }), headers });

  it("returns an empty body when no stream exists", async () => {
    expect(await readBoundedBody(request(), size => size > 4)).toEqual(new Uint8Array());
  });

  it("returns the original bytes for bodies inside the limit", async () => {
    expect(new TextDecoder().decode((await readBoundedBody(request("hé"), size => size > 3))!)).toBe("hé");
  });

  it("rejects bodies larger than the limit while streaming", async () => {
    expect(await readBoundedBody(request("12345"), size => size > 4)).toBeNull();
  });

  it("rejects oversized declared lengths before reading", async () => {
    expect(await readBoundedBody(request("x", { "Content-Length": "100" }), size => size > 4)).toBeNull();
  });
});
