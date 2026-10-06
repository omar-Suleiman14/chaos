// Daily production health from telemetry that already exists; no model involved.
//
//   POSTHOG_API_HOST=https://us.posthog.com POSTHOG_PROJECT_ID=… POSTHOG_PERSONAL_API_KEY=… \
//   CONVEX_SITE_URL=https://….convex.site tsx scripts/production-health.ts
//
// Reads real-user journey timings (journey_usable, lib/journeys.ts) and exceptions from
// PostHog, and the platform status feed (GET /api/status/v1). Compares them with
// perf/production-thresholds.json and writes perf/results/production-health.{md,json}.
// Exit code 1 means a threshold was crossed; the workflow turns that into one issue.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateErrors, evaluateJourneys, evaluateStatus, type JourneyStats, type Problem, type ServiceStatus, type Thresholds } from "./lib/health";

const thresholds = JSON.parse(readFileSync(join("perf", "production-thresholds.json"), "utf8")) as Thresholds;
const results = join("perf", "results");

async function hogql<T extends unknown[]>(query: string): Promise<T[]> {
  const host = process.env.POSTHOG_API_HOST, project = process.env.POSTHOG_PROJECT_ID, key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!host || !project || !key) throw new Error("POSTHOG_API_HOST, POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY are required");
  const response = await fetch(`${host.replace(/\/+$/, "")}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!response.ok) throw new Error(`PostHog query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return ((await response.json()) as { results: T[] }).results;
}

const journeyQuery = (from: string, to: string) => `
  SELECT properties.journey, count(), quantile(0.5)(toFloat(properties.ms)), quantile(0.75)(toFloat(properties.ms)), quantile(0.95)(toFloat(properties.ms))
  FROM events
  WHERE event = 'journey_usable' AND timestamp >= now() - INTERVAL ${from} AND timestamp < now() - INTERVAL ${to}
  GROUP BY properties.journey`;

const toStats = (rows: [string, number, number, number, number][]): JourneyStats[] =>
  rows.map(([journey, n, p50, p75, p95]) => ({ journey, n: Number(n), p50: Number(p50), p75: Number(p75), p95: Number(p95) }));

async function main() {
  const lines: string[] = ["## Production health", ""];
  const problems: Problem[] = [];

  const current = toStats(await hogql(journeyQuery("1 DAY", "0 DAY")));
  const baseline = toStats(await hogql(journeyQuery("8 DAY", "1 DAY")));
  problems.push(...evaluateJourneys(current, baseline, thresholds));
  lines.push("Real users, last 24 hours:", "", "| Journey | n | p50 | p75 | p95 | p75 before |", "|---|---:|---:|---:|---:|---:|");
  const before = new Map(baseline.map((b) => [b.journey, b]));
  for (const s of [...current].sort((a, b) => a.journey.localeCompare(b.journey))) {
    const prior = before.get(s.journey);
    lines.push(`| \`${s.journey}\` | ${s.n} | ${Math.round(s.p50)} ms | ${Math.round(s.p75)} ms | ${Math.round(s.p95)} ms | ${prior ? `${Math.round(prior.p75)} ms` : "—"} |`);
  }

  const [[lastDay]] = await hogql<[number]>("SELECT count() FROM events WHERE event = '$exception' AND timestamp >= now() - INTERVAL 1 DAY");
  const [[week]] = await hogql<[number]>("SELECT count() FROM events WHERE event = '$exception' AND timestamp >= now() - INTERVAL 8 DAY AND timestamp < now() - INTERVAL 1 DAY");
  problems.push(...evaluateErrors(Number(lastDay), Number(week), thresholds));
  lines.push("", `Errors: ${lastDay} in the last day, ${(Number(week) / 7).toFixed(0)} per day in the week before.`);

  const site = process.env.CONVEX_SITE_URL;
  if (site) {
    const response = await fetch(`${site.replace(/\/+$/, "")}/api/status/v1`);
    if (!response.ok) problems.push({ journey: "status", kind: "status", detail: `status feed answered ${response.status}` });
    else {
      const { services } = (await response.json()) as { services: ServiceStatus[] };
      problems.push(...evaluateStatus(services));
      lines.push("", `Services: ${services.map((s) => `${s.service} ${s.status}`).join(", ")}.`);
    }
  }

  const verdict = problems.length
    ? `**${problems.length} threshold${problems.length === 1 ? "" : "s"} crossed:**\n\n${problems.map((p) => `- \`${p.journey}\` (${p.kind}): ${p.detail}`).join("\n")}\n`
    : "All thresholds hold.\n";
  lines.splice(2, 0, verdict);
  mkdirSync(results, { recursive: true });
  writeFileSync(join(results, "production-health.json"), JSON.stringify({ at: new Date().toISOString(), problems, current, baseline }, null, 2) + "\n");
  writeFileSync(join(results, "production-health.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((error) => {
  mkdirSync(results, { recursive: true });
  writeFileSync(join(results, "production-health.md"), `## Production health\n\nThe check could not run: ${error instanceof Error ? error.message : String(error)}\n`);
  console.error(error);
  process.exitCode = 1;
});
