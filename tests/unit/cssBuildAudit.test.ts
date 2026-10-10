import { describe, expect, it } from "vitest";
import { summarizeCssAssets, type CssAsset } from "../../scripts/css-build-audit";

const assets: CssAsset[] = [
  { file: "static/css/a.css", rawBytes: 100, gzipBytes: 42 },
  { file: "static/css/b.css", rawBytes: 70, gzipBytes: 35 },
];

describe("compiled CSS build audit", () => {
  it("counts each emitted asset once but deduplicates references within each route", () => {
    const report = summarizeCssAssets(assets, [{
      "/dashboard/page": ["static/css/a.css", "static/css/a.css", "static/chunks/page.js", "static/css/b.css"],
      "/learn/page": ["static/css/a.css"],
    }]);
    expect(report.emitted).toEqual({ cssAssets: 2, rawBytes: 170, gzipBytes: 77 });
    expect(report.routes).toEqual([
      { route: "/dashboard/page", cssAssets: 2, rawBytes: 170, gzipBytes: 77 },
      { route: "/learn/page", cssAssets: 1, rawBytes: 100, gzipBytes: 42 },
    ]);
  });

  it("merges app and pages manifests without double counting shared route CSS", () => {
    const report = summarizeCssAssets(assets, [
      { "/shared": ["static/css/a.css"] },
      { "/shared": ["static/css/a.css", "static/css/b.css", "static/css/missing.css"] },
    ]);
    expect(report.routes).toEqual([{ route: "/shared", cssAssets: 2, rawBytes: 170, gzipBytes: 77 }]);
  });

  it("does not invent route coverage when there is no manifest", () => {
    expect(summarizeCssAssets(assets, []).routes).toEqual([]);
  });
});
