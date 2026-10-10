import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../components/learn/learn.css", import.meta.url)), "utf8");

describe("Learn cover actions on touch devices", () => {
  it("retains exactly one identical hover:none override", () => {
    const touchRule = /@media\s*\(hover:\s*none\)\s*\{\s*\.lx-cover__actions\s*\{\s*opacity:\s*1;\s*\}\s*\}/g;
    expect([...css.matchAll(touchRule)]).toHaveLength(1);
  });

  it("preserves the deliberate non-hover behavior and documentation", () => {
    expect(css).toContain("Touch screens have no hover: keep the page-top and cover controls visible.");
    expect(css).toContain(".lx-cover__actions { opacity: 1; }");
  });
});
