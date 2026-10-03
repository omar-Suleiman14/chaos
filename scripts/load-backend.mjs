// Controlled HTTP load probe. Payload fixtures may contain credentials: never commit them.
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("Usage: node scripts/load-backend.mjs <private-fixture.json> <report.json>");
const config = JSON.parse(await readFile(fixturePath, "utf8"));
const allowedHost = process.env.CHAOS_LOAD_DEV_HOST;
const url = new URL(config.url);
if (!allowedHost || url.hostname !== allowedHost || !/^(localhost|127\.0\.0\.1)$/.test(allowedHost) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only the explicitly selected local development host is allowed");
const count = config.requests ?? 100;
const concurrency = config.concurrency ?? 5;
if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) throw new Error("Requests 1–10000; concurrency 1–50");
if (!new Set(["GET", "POST"]).has(config.method ?? "GET")) throw new Error("Only GET/POST are supported");
if (config.method === "POST" && config.readOnly !== true && process.env.CHAOS_LOAD_ALLOW_WRITES !== "development-fixtures") throw new Error("Write probes require CHAOS_LOAD_ALLOW_WRITES=development-fixtures and disposable development fixtures");
let next = 0;
const timings = [], statuses = {}, errors = {};
const start = performance.now();
async function worker() {
  while (next < count) {
    const index = next++;
    const began = performance.now();
    try {
      const response = await fetch(url, { method: config.method ?? "GET", headers: config.headers, body: config.body === undefined ? undefined : JSON.stringify(config.body), redirect: "error", signal: AbortSignal.timeout(config.timeoutMs ?? 10000) });
      const body = await response.text();
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      if (config.assertJsonSuccess) {
        const parsed = JSON.parse(body);
        if (parsed.status !== "success") errors.backend = (errors.backend ?? 0) + 1;
      }
    } catch (error) {
      const kind = error?.name ?? "Error";
      errors[kind] = (errors[kind] ?? 0) + 1;
    }
    timings[index] = performance.now() - began;
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsedMs = performance.now() - start;
timings.sort((a, b) => a - b);
const percentile = fraction => Math.round(timings[Math.min(timings.length - 1, Math.ceil(timings.length * fraction) - 1)]);
const report = { measuredAt: new Date().toISOString(), label: config.label ?? "development-probe", host: url.hostname, requests: count, concurrency, elapsedMs: Math.round(elapsedMs), requestsPerSecond: Number((count * 1000 / elapsedMs).toFixed(2)), latencyMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: Math.round(timings.at(-1)) }, statuses, errors, limitation: "Controlled development sample; not a production capacity guarantee. Report excludes payloads, paths, headers and response content." };
await writeFile(process.argv[3] ?? "load-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (Object.keys(errors).length || Object.keys(statuses).some(status => Number(status) >= 400)) process.exitCode = 1;
