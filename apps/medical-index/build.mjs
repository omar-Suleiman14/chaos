import { mkdir, rm, copyFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildSeo } from "./seo-build.mjs";

const root = process.cwd();
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "admin"), { recursive: true });
for (const name of ["index.html", "icon.svg", "manifest.webmanifest", "sw.js", "index-analytics.js"]) {
  await copyFile(join(root, name), join(output, name));
}
await copyFile(join(root, "admin", "index.html"), join(output, "admin", "index.html"));

const token = (process.env.INDEX_POSTHOG_PROJECT_TOKEN || "").trim();
const host = (process.env.INDEX_POSTHOG_HOST || "").trim();

if (host && !/^https:\/\/(?:eu|us)\.i\.posthog\.com$/.test(host)) {
  throw new Error("INDEX_POSTHOG_HOST must be an official PostHog ingestion host.");
}
if ((!token || !host) && process.env.NODE_ENV !== "production") {
  console.warn("INDEX_POSTHOG_PROJECT_TOKEN and INDEX_POSTHOG_HOST are required for Index analytics. Production skips analytics without them.");
}
// The project token is a client-safe PostHog public key, not a private API key.
// Inject at build time so the repository never contains environment-specific values.
const config = JSON.stringify({ token, host }).replace(/</g, "\\u003c");
await writeFile(join(output, "analytics-config.js"), "window.__INDEX_POSTHOG__=" + config + ";\n");

// Safety check: a build must never silently omit the index or its owner-protected admin navigation.
const html = await readFile(join(output, "index.html"), "utf8");
if (!html.includes("id=\"reportDialog\"") || !html.includes("index-analytics.js")) {
  throw new Error("Index entrypoint did not contain required report and analytics integration.");
}
console.log("Standalone Index build complete.");

await buildSeo(root, output);
