// Read-only audit of CSS actually emitted by Next.js. Unlike perf:css,
// this measures built assets and their per-route manifest references.
// Do not equate asset size with browser CSS coverage or runtime style cost.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export type CssAsset = { file: string; rawBytes: number; gzipBytes: number };
type Manifest = Record<string, string[]>;

export function summarizeCssAssets(assets: CssAsset[], manifests: Manifest[]) {
  const byFile = new Map(assets.map((a) => [a.file, a]));
  const routeEntries = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    for (const [route, files] of Object.entries(manifest)) {
      const selected = routeEntries.get(route) ?? new Set<string>();
      for (const file of files) {
        // Manifests may include JS, duplicates or CSS that was not emitted.
        if (file.endsWith(".css") && byFile.has(file)) selected.add(file);
      }
      routeEntries.set(route, selected);
    }
  }
  const routes = [...routeEntries].map(([route, files]) => {
    const size = [...files].reduce((totals, file) => {
      const asset = byFile.get(file)!;
      totals.rawBytes += asset.rawBytes;
      totals.gzipBytes += asset.gzipBytes;
      return totals;
    }, { rawBytes: 0, gzipBytes: 0 });
    return { route, cssAssets: files.size, ...size };
  }).sort((a, b) => b.rawBytes - a.rawBytes || a.route.localeCompare(b.route));
  return {
    emitted: {
      cssAssets: assets.length,
      rawBytes: assets.reduce((sum, a) => sum + a.rawBytes, 0),
      gzipBytes: assets.reduce((sum, a) => sum + a.gzipBytes, 0),
    },
    // Route totals overlap where pages share CSS; never sum them as site bytes.
    routes,
  };
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  }).sort();
}

function loadManifest(path: string): Manifest {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { pages?: Manifest };
  return parsed.pages ?? {};
}

export function auditBuiltCss(buildDir = resolve(".next")) {
  const staticDir = join(buildDir, "static");
  if (!existsSync(staticDir)) throw new Error("No emitted Next.js assets. Run pnpm build before pnpm css:build-audit.");
  const assets = cssFiles(staticDir).map(path => {
    const source = readFileSync(path);
    return {
      file: relative(buildDir, path).replaceAll("\\", "/"),
      rawBytes: source.byteLength,
      gzipBytes: gzipSync(source).byteLength,
    };
  });
  return summarizeCssAssets(assets, [
    loadManifest(join(buildDir, "app-build-manifest.json")),
    loadManifest(join(buildDir, "build-manifest.json")),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditBuiltCss();
  mkdirSync(join("perf", "results"), { recursive: true });
  writeFileSync(join("perf", "results", "css-built.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("Emitted CSS assets (all routes, deduplicated):", result.emitted);
  for (const row of result.routes.slice(0, 10)) console.log(`${row.route}: ${row.rawBytes} raw / ${row.gzipBytes} gzip bytes (${row.cssAssets} assets)`);
  if (!result.routes.length) console.log("No app/pages route CSS manifests found; per-route totals unavailable, not zero.");
  console.log("Wrote perf/results/css-built.json. For runtime coverage use browser DevTools/Playwright.");
}
