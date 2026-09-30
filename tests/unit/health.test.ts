import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import pkg from "../../package.json";

describe("GET /api/health", () => {
  it("returns 200 with status and version only", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: pkg.version });
  });
});
