/** Development-only check through deployed Convex handlers and the private media HTTP proxy.
 * Owner setup uses Convex's admin identity override, not a real OAuth session.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { emptyDefinition } from "../convex/formLogic";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const targetSchema = z.object({ url: z.url(), headers: z.record(z.string(), z.string()), expiresAt: z.number() });
const editorSchema = z.object({ shareId: z.string(), draftRevision: z.number() });
const idSchema = z.string().min(8);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=", "base64");

async function main() {
  const deployment = argument("--deployment");
  if (!deployment?.startsWith("dev:")) throw new Error("Supply an explicit dev: deployment. Production is refused.");
  const cli = "node_modules/convex/bin/main.js";
  const env = { ...process.env, CONVEX_DEPLOYMENT: deployment };
  const run = (args: string[]) => execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 45_000, maxBuffer: 2_000_000,
  });
  const issuer = run(["env", "get", "CLERK_JWT_ISSUER_DOMAIN"]).trim();
  const subject = "r2_smoke_" + randomUUID().replaceAll("-", "");
  const identity = { subject, issuer, tokenIdentifier: issuer + "|" + subject, name: "Synthetic R2 check" };
  const call = (name: string, args: Record<string, unknown> = {}, owner = false): unknown => { try { const output = run([
    "run", name, JSON.stringify(args), "--codegen", "disable", "--typecheck", "disable",
    ...(owner ? ["--identity", JSON.stringify(identity)] : []),
  ]).trim(); return output ? JSON.parse(output) : null; } catch (error) { const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const code = stderr.match(/(?:Uncaught Error: |Error: )([A-Z][A-Z_]+):/);
    console.error("Handler failed: " + name + (code ? " (" + code[1] + ")" : "")); throw error; } };
  let stage = "synthetic owner setup", formId: string | undefined;
  let latestExpiry = 0;
  const media: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const pass = (condition: unknown, message: string) => { if (!condition) throw new Error("Check failed"); console.info("PASS " + message); };
  try {
    call("quizFunctions:getOrCreateUser", {}, true);
    const definition = emptyDefinition("Synthetic R2 image verification");
    definition.quiz = { enabled: true, showAnswers: true };
    definition.fields = [{ id: "question", type: "choice", label: "Choose A", required: true,
      options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      quiz: { correctOptionIds: ["a"], points: 1, explanation: "Synthetic explanation" } }];
    formId = idSchema.parse(call("forms:createForm", { definition }, true));
    const urls: string[] = [];
    stage = "deployed upload reservation, signing and verification";
    for (let i = 0; i < 3; i++) {
      stage = "deployed upload reservation";
      const mediaId = idSchema.parse(call("formImageMedia:reserveUpload", { formId, mimeType: "image/png", bytes: png.length }, true));
      media.push(mediaId);
      stage = "deployed upload signing";
      const target = targetSchema.parse(call("formImageMedia:getUploadTarget", { mediaId }, true));
      stage = "signed image PUT";
      latestExpiry = Math.max(latestExpiry, target.expiresAt);
      const response = await fetch(target.url, { method: "PUT", body: png, headers: target.headers, redirect: "error", signal: AbortSignal.timeout(20_000) });
      pass(response.ok, "Deployed upload capability accepts the reserved image " + (i + 1));
      await response.body?.cancel();
      stage = "deployed image verification";
      urls.push(z.url().parse(call("formImageMedia:completeUpload", { mediaId }, true)));
    }
    stage = "unpublished image privacy";
    const draftRead = await fetch(urls[0], { signal: AbortSignal.timeout(20_000) });
    pass(draftRead.status === 404, "Unpublished images are unavailable anonymously");
    await draftRead.body?.cancel();
    definition.fields[0].image = { url: urls[0], alt: "Synthetic question diagram" };
    definition.fields[0].options![0].image = { url: urls[1], alt: "Synthetic choice diagram" };
    definition.fields[0].quiz!.explanationImage = { url: urls[2], alt: "Synthetic explanation diagram" };
    const editor = editorSchema.parse(call("forms:getFormForEditor", { formId }, true));
    const saved = z.object({ draftRevision: z.number() }).parse(call("forms:saveFormDraft", { formId, expectedRevision: editor.draftRevision, definition }, true));
    call("forms:publishForm", { formId, expectedRevision: saved.draftRevision }, true);
    stage = "published image delivery";
    const published = z.object({ state: z.literal("open") }).parse(call("respond:getPublicForm", { shareId: editor.shareId }));
    pass(published.state === "open", "The published respondent API is available");
    const publicResult = call("respond:getPublicForm", { shareId: editor.shareId });
    pass(!JSON.stringify(publicResult).includes(urls[2]), "Respondents do not receive the private explanation image URL");
    for (const url of urls.slice(0, 2)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      pass(response.ok && Buffer.from(await response.arrayBuffer()).equals(png), "The deployed private proxy returns the published image bytes");
    }
    const hidden = await fetch(urls[2], { signal: AbortSignal.timeout(20_000) });
    pass(hidden.status === 404, "Explanation bytes remain private before submission");
    await hidden.body?.cancel();
    const baseUrl = argument("--base-url");
    if (baseUrl) {
      stage = "real respondent page rendering";
      const executablePath = process.env.CHAOS_CHROMIUM || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => existsSync(path));
      browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      const page = await browser.newPage();
      await page.goto(new URL("/en/f/" + editor.shareId, baseUrl).toString());
      const start = page.getByRole("button", { name: /start/i });
      if (await start.count()) await start.first().click();
      const image = page.getByRole("img", { name: "Synthetic question diagram" });
      await image.waitFor({ state: "visible", timeout: 45_000 });
      pass(await image.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth === 1), "The app's respondent page renders the hosted question image");
      const choice = page.getByRole("img", { name: "Synthetic choice diagram" });
      await choice.waitFor({ state: "visible" });
      pass(await choice.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth === 1), "The app renders the hosted answer-choice image");
      mkdirSync("docs/screenshots/learning-integration", { recursive: true });
      await page.screenshot({ path: "docs/screenshots/learning-integration/en-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(new URL("/ar/f/" + editor.shareId, baseUrl).toString());
      await page.getByRole("img", { name: "Synthetic question diagram" }).waitFor({ state: "visible", timeout: 45_000 });
      pass(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "The Arabic phone layout has no horizontal overflow");
      await page.screenshot({ path: "docs/screenshots/learning-integration/ar-phone.png", fullPage: true });
    }
    stage = "post-submission explanation proof";
    const submitted = z.object({ quizReview: z.array(z.object({ explanationImage: z.object({ url: z.url() }).optional() })).nullable() }).parse(call("respond:submitResponse", {
      shareId: editor.shareId, submissionKey: randomUUID(), answers: { question: "a" }, language: "en", final: true, startedAt: Date.now() - 60_000,
    }));
    const explanationUrl = submitted.quizReview?.[0].explanationImage?.url;
    if (!explanationUrl) throw new Error("Missing explanation proof");
    const explanation = await fetch(explanationUrl, { signal: AbortSignal.timeout(20_000) });
    pass(explanation.ok && Buffer.from(await explanation.arrayBuffer()).equals(png), "The private explanation image is readable with its completed-response proof");
  } catch {
    console.error("Application R2 smoke failed during " + stage + ". No credentials, receipts or signed URLs are logged.");
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (formId) {
      try {
        call("forms:setFormStatus", { formId, status: "archived" }, true);
        for (const mediaId of media) call("formImageMedia:remove", { mediaId }, true);
        // Any issued one-shot PUT must expire before physical deletion to prevent a late orphan write.
        while (Date.now() < latestExpiry + 5_000) await new Promise(resolve => setTimeout(resolve, 1_000));
        for (const mediaId of media) call("r2MediaCleanup:cleanup", { kind: "form", id: mediaId });
        const allReleased = media.every(mediaId => JSON.parse(run(["run", "--inline-query",
          `(await ctx.db.get("formImageMedia", ${JSON.stringify(mediaId)}))?.storageCounted === false`, "--codegen", "disable"])) === true);
        pass(allReleased, "Synthetic images were deleted and reserved storage was released");
      } catch { console.error("Synthetic application cleanup needs attention. Form ID: " + formId); process.exitCode = 1; }
    }
  }
  if (!process.exitCode) console.info("PASS deployed application R2 image checks; synthetic form archived");
}
void main().catch(() => { console.error("Application R2 smoke could not initialize; verify the explicit development deployment."); process.exitCode = 1; });
