/** Real private-bucket check. Uses only unique synthetic objects and removes them. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { r2Config, signR2Request } from "../lib/r2/privateR2";

async function main() {
function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const names = ["CHAOS_R2_ACCOUNT_ID", "CHAOS_R2_BUCKET", "CHAOS_R2_ACCESS_KEY_ID", "CHAOS_R2_SECRET_ACCESS_KEY"];
for (const [flag, name] of [["--access-key-file", "CHAOS_R2_ACCESS_KEY_ID"], ["--secret-key-file", "CHAOS_R2_SECRET_ACCESS_KEY"]]) {
  const file = argument(flag);
  if (file) process.env[name] = readFileSync(file, "utf8").trim();
}
const convexDir = argument("--convex-dir");
if (convexDir) for (const name of names) {
  if (process.env[name]) continue;
  try {
    process.env[name] = execFileSync(process.execPath,
      [resolve(convexDir, "node_modules/convex/bin/main.js"), "env", "get", name],
      { cwd: convexDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }).trim();
  } catch { /* Missing configuration is reported by name only below. */ }
}
const missing = names.filter(name => !process.env[name]);
if (missing.length) {
  console.error("R2 smoke blocked: configure " + missing.join(", ") + ". Secrets are never printed.");
  process.exit(2);
}
const config = r2Config(process.env);
const originInput = argument("--origin");
if (!originInput) throw new Error("Supply --origin with the actual app origin to verify browser CORS.");
const origin = new URL(originInput).origin;
if (!origin.startsWith("https://") && !origin.startsWith("http://localhost:")) throw new Error("Use an HTTPS app origin or local development origin.");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=", "base64");
const prefix = "form-images/chaos_smoke_" + randomUUID().replaceAll("-", "");
const keys = [prefix, prefix + "_length"];
let stage = "initialization";
const checks: string[] = [];
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
  checks.push(message);
}
const request = async (method: "GET" | "HEAD" | "PUT" | "DELETE", key: string, extra: RequestInit = {}, length?: number) => {
  const signed = await signR2Request(config, method, key, { expiresSeconds: 60,
    ...(method === "PUT" ? { contentType: "image/png", contentLength: length ?? png.length } : {}) });
  return fetch(signed.url, { ...extra, method, headers: { ...signed.headers, ...extra.headers },
    redirect: "error", signal: AbortSignal.timeout(20_000) });
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const cleanupObject = async (key: string) => {
  const deleted = await request("DELETE", key);
  if (!deleted.ok && deleted.status !== 404) throw new Error("Delete failed");
  const absent = await request("HEAD", key);
  if (absent.status !== 404) throw new Error("Object remains");
};
try {
  stage = "signed upload length enforcement";
  const wrong = await request("PUT", keys[1], { body: png }, png.length + 1);
  check(wrong.status === 403, "Storage rejects a body with the wrong signed byte length");
  await wrong.body?.cancel();
  stage = "browser upload and CORS";
  const executablePath = process.env.CHAOS_CHROMIUM || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(path => existsSync(path));
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  // Fulfill only this synthetic document. No app content or real user session is read.
  await page.route(origin + "/__chaos_r2_smoke__", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>R2 synthetic smoke</title>" }));
  await page.goto(origin + "/__chaos_r2_smoke__");
  const target = await signR2Request(config, "PUT", keys[0], {
    contentType: "image/png", contentLength: png.length, expiresSeconds: 60 });
  const uploaded = await page.evaluate(async ({ url, headers, bytes }) => {
    const body = new File([new Uint8Array(bytes)], "synthetic.png", { type: "image/png" });
    const result = await fetch(url, { method: "PUT", headers, body });
    return result.status;
  }, { ...target, bytes: [...png] });
  check(uploaded >= 200 && uploaded < 300, "A browser File upload succeeds from the configured app origin");
  stage = "create-only protection";
  const replay = await request("PUT", keys[0], { body: png });
  check(replay.status === 412 || replay.status === 409, "A replay cannot overwrite the uploaded object");
  await replay.body?.cancel();
  stage = "HEAD verification";
  const head = await request("HEAD", keys[0]);
  check(head.ok && Number(head.headers.get("content-length")) === png.length &&
    head.headers.get("content-type")?.split(";")[0] === "image/png", "HEAD confirms exact image size and MIME type");
  const etag = head.headers.get("etag");
  check(!!etag, "Storage supplies an ETag for conditional reads");
  stage = "conditional range verification";
  const range = await request("GET", keys[0], { headers: { Range: "bytes=0-31", "If-Match": etag! } });
  check(range.status === 206 && Buffer.from(await range.arrayBuffer()).equals(png.subarray(0, 32)), "Conditional range reads return the expected image signature");
  stage = "conditional full read";
  const read = await request("GET", keys[0], { headers: { "If-Match": etag! } });
  const bytes = Buffer.from(await read.arrayBuffer());
  check(read.ok && bytes.equals(png), "Conditional full reads preserve the image bytes");
  stage = "browser image decoding";
  const decoded = await page.evaluate(async bytes => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    try { const img = new Image(); img.src = url; await img.decode(); return img.naturalWidth === 1 && img.naturalHeight === 1; }
    finally { URL.revokeObjectURL(url); }
  }, [...bytes]);
  check(decoded, "The downloaded image decodes in a real browser");
  stage = "unsigned object access";
  const unsigned = new URL(target.url); unsigned.search = "";
  const denied = await fetch(unsigned, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  check(denied.status >= 400 && denied.status < 500, "The S3 endpoint rejects unsigned object reads");
  await denied.body?.cancel();
} catch {
  console.error("R2 smoke failed during " + stage + ". No credentials or signed URLs are logged.");
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const key of keys) {
    try {
      await cleanupObject(key);
    } catch { console.error("Synthetic object cleanup needs attention; object suffix: " + key.split("/")[1]); process.exitCode = 1; }
  }
}
for (const message of checks) console.info("PASS " + message);
if (!process.exitCode) console.info("PASS synthetic objects deleted and absence verified");
}
void main().catch(() => {
  console.error("R2 smoke could not initialize. Check configuration and arguments; secrets are not logged.");
  process.exitCode = 1;
});
