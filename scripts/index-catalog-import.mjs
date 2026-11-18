#!/usr/bin/env node
/**
 * Seeds the live Chaos Index catalogue in Convex from the embedded copy in
 * apps/medical-index/index.html, then verifies what the public endpoint serves.
 *
 * Usage:
 *   CHAOS_INDEX_UPDATER_SECRET=<secret> node scripts/index-catalog-import.mjs \
 *     [--url https://<deployment>.convex.site] [--dry-run]
 *
 * The secret is the Convex `CHAOS_INDEX_UPDATER_SECRET` environment variable, and the URL is the
 * deployment's https://…convex.site address. Verification re-reads the public catalogue and
 * compares every entry against the embedded source, so a partially imported run fails loudly.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function extractArray(html, name) {
  const start = html.indexOf(`const ${name}=[`);
  if (start < 0) throw new Error(`Array ${name} not found in index.html`);
  const open = html.indexOf("[", start + 6);
  let depth = 0, inString = false, quote = "";
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return html.slice(open, i + 1); }
  }
  throw new Error(`Array ${name} is unterminated`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { dryRun: false, url: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") options.dryRun = true;
    else if (args[i] === "--url") options.url = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return options;
}

/** Embedded catalogue → publishable entries. First-element form selects the Telegram channel. */
function toEntries(D, Q) {
  const entries = [];
  for (const [id, moduleIndex, subject, type, caption, filename, date] of D) {
    const cross = typeof id === "string" && id.startsWith("ZatOona46/");
    entries.push({
      channel: cross ? "zatooona46" : "zatooona44",
      messageId: cross ? Number(id.split("/")[1]) : id,
      kind: "file",
      moduleIndex, subject, type, caption,
      ...(filename ? { filename } : {}),
      ...(date ? { date } : {}),
    });
  }
  for (const [messageId, moduleIndex, subject, type, lectureRefs, caption] of Q) {
    entries.push({
      channel: "medics_44_mcq",
      messageId, kind: "question", moduleIndex, subject, type, caption,
      ...(lectureRefs.length ? { lectureRefs: [...lectureRefs].sort((a, b) => a - b) } : {}),
    });
  }
  return entries;
}

async function postBatch(url, secret, entries) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ entries, updatedBy: "seed" }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Publish failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function main() {
  const options = parseArgs();
  const url = options.url ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
  const secret = process.env.CHAOS_INDEX_UPDATER_SECRET ?? "";
  const endpoint = url.replace(/\/$/, "") + "/api/index-catalog";
  if (!/^https:\/\/.+\/api\/index-catalog$/.test(endpoint)) {
    throw new Error("Pass --url https://<deployment>.convex.site (or set NEXT_PUBLIC_CONVEX_SITE_URL).");
  }
  if (!options.dryRun && secret.length < 32) {
    throw new Error("Set CHAOS_INDEX_UPDATER_SECRET to the deployment's updater secret.");
  }

  const html = await readFile(resolve("apps/medical-index/index.html"), "utf8");
  const M = JSON.parse(extractArray(html, "M"));
  const D = JSON.parse(extractArray(html, "D"));
  const Q = JSON.parse(extractArray(html, "Q"));
  console.log(`Embedded catalogue: ${M.length} modules, ${D.length} files, ${Q.length} question sets.`);

  const entries = toEntries(D, Q);
  const files = entries.filter(e => e.kind === "file").length;
  console.log(`Publishing ${entries.length} entries (${files} files, ${entries.length - files} questions) to ${endpoint}${options.dryRun ? " (dry run)" : ""}.`);

  if (options.dryRun) {
    for (const entry of entries.slice(0, 3)) console.log(JSON.stringify(entry));
    console.log("Dry run only; nothing was sent.");
    return;
  }

  const BATCH = 200;
  let created = 0, updated = 0, unchanged = 0, rejected = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const result = await postBatch(endpoint, secret, entries.slice(i, i + BATCH));
    created += result.created;
    updated += result.updated;
    unchanged += result.unchanged;
    rejected += result.rejected.length;
    if (result.rejected.length) {
      for (const item of result.rejected.slice(0, 5)) console.error(`Rejected ${i + item.index}: ${item.reason}`);
      if (result.rejected.length > 5) console.error(`… and ${result.rejected.length - 5} more rejections`);
    }
    console.log(`Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(entries.length / BATCH)}: +${result.created} ~${result.updated} =${result.unchanged} ✗${result.rejected.length}`);
  }
  if (rejected) throw new Error(`${rejected} entries were rejected; fix them before verifying.`);

  // Read back through the public endpoint and compare against the embedded source.
  const live = await (await fetch(endpoint, { signal: AbortSignal.timeout(60_000) })).json();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const liveFiles = new Map(live.files.map(row => [`${typeof row[0] === "number" ? "44" : "46"}:${typeof row[0] === "number" ? row[0] : row[0].split("/")[1]}`, row]));
  const liveQuestions = new Map(live.questions.map(row => [row[0], row]));
  let fileDiff = 0, questionDiff = 0;
  for (const entry of entries) {
    if (entry.kind === "file") {
      const key = `${entry.channel === "zatooona46" ? "46" : "44"}:${entry.messageId}`;
      const row = liveFiles.get(key);
      if (!row) { fileDiff++; console.error(`Missing file ${key}`); continue; }
      const expected = [
        entry.channel === "zatooona46" ? `ZatOona46/${entry.messageId}` : entry.messageId,
        entry.moduleIndex, entry.subject, entry.type, entry.caption,
        entry.filename ?? "", entry.date ?? "",
      ];
      if (!same(row, expected)) { fileDiff++; console.error(`Differs file ${key}`); }
    } else {
      const row = liveQuestions.get(entry.messageId);
      if (!row) { questionDiff++; console.error(`Missing question ${entry.messageId}`); continue; }
      const expected = [entry.messageId, entry.moduleIndex, entry.subject, entry.type, entry.lectureRefs ?? [], entry.caption];
      if (!same(row, expected)) { questionDiff++; console.error(`Differs question ${entry.messageId}`); }
    }
  }
  const extra = live.files.length + live.questions.length - entries.length;
  console.log(`Read back: ${live.files.length} files, ${live.questions.length} questions. Diffs: ${fileDiff} files, ${questionDiff} questions, ${extra} extra rows.`);
  if (fileDiff || questionDiff || extra) throw new Error("Verification failed; the live catalogue does not match the embedded source.");
  console.log("Verification passed: the live catalogue matches the embedded source.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
