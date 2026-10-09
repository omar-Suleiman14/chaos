import { expect, it } from "vitest";
import { canonicalJson } from "../../convex/canonicalJson";
import fixtures from "../fixtures/canonical-json.json";

// Expected bytes captured from the historical serializers before extraction (main 77ba616).
const cases: Record<string, unknown> = {
  null: null,
  undefined,
  nested: { z: { b: 2, a: 1 }, a: [3, null, { y: false, x: "quote\"\n" }] },
  "undefined object": { z: undefined, a: 1, nested: { missing: undefined, present: null } },
  "undefined array": [undefined, null, { missing: undefined }, 1],
  "sparse array": Array(2),
  "number edges": [-0, NaN, Infinity, -Infinity, 1e-7, 1e21],
  "unicode keys": { z: 1, Z: 2, ä: 3, a: 4, سامر: 5, "10": 6, "2": 7 },
  "historical keys": Object.fromEntries([["__proto__", { x: 1 }], ["constructor", 2], ["toString", null]]),
  date: new Date("2026-01-01T00:00:00Z"),
  bigint: BigInt(1),
  function: () => {},
};

for (const contract of ["answers", "integration", "organization"] as const) {
  for (const [name, expected] of Object.entries(fixtures[contract])) {
    it(`preserves historical ${contract} bytes for ${name}`, () => {
      if (typeof expected === "object" && "throws" in expected) {
        expect(() => canonicalJson(cases[name], contract)).toThrow(TypeError);
      } else {
        expect(canonicalJson(cases[name], contract)).toBe(typeof expected === "object" ? undefined : expected);
      }
    });
  }
}

it("keeps order-insensitive answer comparison distinct from array ordering", () => {
  expect(canonicalJson({ mail: "old@b.co", stars: 2 }, "answers")).toBe(canonicalJson({ stars: 2, mail: "old@b.co" }, "answers"));
  expect(canonicalJson({ choices: ["a", "b"] }, "answers")).not.toBe(canonicalJson({ choices: ["b", "a"] }, "answers"));
});

it("preserves serialization errors for circular values", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const contract of ["answers", "integration", "organization"] as const) expect(() => canonicalJson(circular, contract)).toThrow(RangeError);
});
