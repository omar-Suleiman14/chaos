/* Deploy-authorized data import; no Vercel or site build is performed. */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "apps/medical-index");
const seed = process.argv.includes("--seed");
if (!process.env.CONVEX_DEPLOY_KEY) {
  console.error("CONVEX_DEPLOY_KEY is required; no data was changed.");
  process.exit(1);
}
function arrayFrom(html, name) {
  const marker = "const " + name + "=";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Missing " + name);
  const from = start + marker.length;
  const end = html.indexOf(";\n", from);
  if (end < 0) throw new Error("Malformed " + name);
  return JSON.parse(html.slice(from, end));
}
let items;
if (seed) {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  const files = arrayFrom(html, "D").map(f => {
    const cross = typeof f[0] === "string" && f[0].startsWith("ZatOona46/");
    return {
      source: cross ? "ZatOona46" : "zatooona44",
      messageId: Number(cross ? f[0].split("/")[1] : f[0]),
      moduleIndex: f[1], subject: f[2], kind: f[3], title: f[4],
      filename: f[5], postedAt: f[6],
    };
  });
  const questions = arrayFrom(html, "Q").map(q => ({
    source: "medics_44_mcq", messageId: Number(q[0]), moduleIndex: q[1],
    subject: q[2], kind: q[3], numbers: q[4], title: q[5],
  }));
  items = [...files, ...questions];
} else {
  items = JSON.parse(readFileSync(resolve(root, "catalog-updates.json"), "utf8")).items;
}
if (!Array.isArray(items) || !items.length) {
  console.log("No catalogue records to import.");
  process.exit(0);
}
const seen = new Set();
for (const item of items) {
  const key = item.source + "/" + item.messageId;
  if (seen.has(key)) throw new Error("Duplicate source message: " + key);
  seen.add(key);
}
console.log("Importing " + items.length + (seed ? " baseline" : " changed") + " records to Convex production.");
for (let i = 0; i < items.length; i += 25) {
  const payload = JSON.stringify({ items: items.slice(i, i + 25), mode: seed ? "seed" : "upsert" });
  const run = spawnSync("pnpm", ["exec", "convex", "run", "--prod", "indexCatalog:importBatch", payload], {
    cwd: resolve(root, "../.."), env: process.env, stdio: "inherit",
  });
  if (run.status !== 0) {
    console.error("Convex import failed at record " + i + "; safe to retry.");
    process.exit(1);
  }
}
console.log("Convex production import completed.");
