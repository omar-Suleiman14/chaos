// Writes perf/results/bundles.json from the last `next build`: first-load
// JavaScript per tracked route, raw and gzip. Run after `pnpm build`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Routes that stand for each product surface. Adding one needs a baseline; removing one fails the ratchet. */
export const TRACKED_ROUTES: Record<string, string> = {
  dashboard: "/[lang]/dashboard",
  "forms.editor": "/[lang]/dashboard/forms/[formId]",
  "forms.respondent": "/[lang]/f/[shareId]",
  "forms.responses": "/[lang]/dashboard/forms/[formId]/responses",
  "quizzes.legacy": "/[lang]/[username]/[quizname]",
  "lessons.editor": "/[lang]/dashboard/learn/lessons/[id]",
  "lessons.reader": "/[lang]/learn/[id]",
  "courses.editor": "/[lang]/dashboard/courses/[id]",
  "courses.public": "/[lang]/learn/courses/[id]",
  "live.host": "/[lang]/dashboard/live/[gameId]",
  "live.player": "/[lang]/play",
  card: "/[lang]/card",
  "card.public": "/[lang]/card/[username]",
  landing: "/[lang]",
};

type RouteStats = { route: string; firstLoadUncompressedJsBytes: number; firstLoadChunkPaths: string[] };

const stats = JSON.parse(readFileSync(join(".next", "diagnostics", "route-bundle-stats.json"), "utf8")) as RouteStats[];
const gzipCache = new Map<string, number>();
const gzip = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  if (!gzipCache.has(normalized)) gzipCache.set(normalized, gzipSync(readFileSync(normalized), { level: 9 }).length);
  return gzipCache.get(normalized)!;
};

const metrics: Record<string, { value: number; unit: "bytes" | "count" }> = {};
const missing: string[] = [];
for (const [name, route] of Object.entries(TRACKED_ROUTES)) {
  const row = stats.find((s) => s.route === route);
  if (!row) { missing.push(route); continue; }
  metrics[`bundle.${name}.firstLoadJs`] = { value: row.firstLoadUncompressedJsBytes, unit: "bytes" };
  metrics[`bundle.${name}.firstLoadJsGzip`] = { value: row.firstLoadChunkPaths.reduce((sum, p) => sum + gzip(p), 0), unit: "bytes" };
  metrics[`bundle.${name}.chunks`] = { value: row.firstLoadChunkPaths.length, unit: "count" };
}
mkdirSync(join("perf", "results"), { recursive: true });
writeFileSync(join("perf", "results", "bundles.json"), JSON.stringify({ suite: "bundles", failed: missing.map((r) => `route missing from build: ${r}`), metrics }, null, 2) + "\n");
console.log(`bundles: ${Object.keys(metrics).length} metrics${missing.length ? `, missing ${missing.join(", ")}` : ""}`);
