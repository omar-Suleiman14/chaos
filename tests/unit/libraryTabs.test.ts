import { describe, expect, it } from "vitest";
import { kinds, kindFromParam } from "../../lib/forms/libraryTabs";

describe("library tab query parsing", () => {
  it("resolves all five canonical tab values", () => {
    for (const kind of kinds) expect(kindFromParam(kind.toLowerCase())).toBe(kind);
  });

  it("retains the Forms fallback for absent or unknown values", () => {
    expect(kindFromParam(null)).toBe("Forms");
    expect(kindFromParam("not-a-tab")).toBe("Forms");
    expect(kindFromParam("")).toBe("Forms");
  });

  it("does not silently reinterpret noncanonical mixed-case values", () => {
    expect(kindFromParam("Games")).toBe("Forms");
  });
});
