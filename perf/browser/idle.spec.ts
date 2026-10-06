import { expect, test, type Page } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../../tests/e2e/support";
import { browserSuite } from "./results";

/**
 * Idle work: a page that is open and untouched should go quiet. Once the
 * dashboard or an editor has settled, nothing should write to Convex, churn
 * subscriptions or poll over HTTP; only server pushes caused by other people's
 * changes may arrive. A polling loop, an autosave that keeps firing or a
 * subscription that re-registers on every render shows up here, not in a
 * one-shot load benchmark.
 *
 * Against the E2E environment only (tests/e2e/support.ts refuses production).
 */
const IDLE_MS = Number(process.env.PERF_IDLE_MS ?? 20_000);
const formId = process.env.E2E_PERF_FORM_ID;
const lessonId = process.env.E2E_PERF_LESSON_ID;
const suite = browserSuite("idle-browser");

/** Requests that are not the app's own work (analytics, fonts, extensions). */
const ignored = /posthog|\/ingest\/|\.(woff2?|png|jpe?g|webp|svg|ico)(\?|$)|_next\/static|__nextjs/;

test.describe.configure({ mode: "serial" });
test.afterAll(() => suite.write());
test.skip(!process.env.E2E_CREATOR_EMAIL, "E2E_CREATOR_EMAIL not set");

/** Counts what the page does on its own between start() and stop(). */
function watch(page: Page) {
  let on = false;
  const counts = { mutations: 0, actions: 0, queryAdds: 0, queryRemoves: 0, pushes: 0, http: 0 };
  const http: string[] = [];
  page.on("websocket", (ws) => {
    if (!/convex/.test(ws.url())) return;
    ws.on("framesent", ({ payload }) => {
      if (!on || typeof payload !== "string") return;
      try {
        const m = JSON.parse(payload) as { type: string; modifications?: { type: string }[] };
        if (m.type === "Mutation") counts.mutations++;
        else if (m.type === "Action") counts.actions++;
        else if (m.type === "ModifyQuerySet") for (const mod of m.modifications ?? []) { if (mod.type === "Add") counts.queryAdds++; else counts.queryRemoves++; }
      } catch { /* not JSON */ }
    });
    ws.on("framereceived", ({ payload }) => {
      if (on && typeof payload === "string" && payload.includes('"Transition"')) counts.pushes++;
    });
  });
  page.on("request", (request) => {
    if (!on || request.resourceType() === "websocket" || ignored.test(request.url())) return;
    counts.http++;
    http.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return { start: () => { on = true; }, stop: () => { on = false; return { ...counts, http, httpCount: counts.http }; } };
}

const usable = (page: Page, journey: string) => page.waitForFunction((name) => performance.getEntriesByName(`chaos:usable:${name}`).length > 0, journey, { timeout: 30_000 });

const surfaces = [
  { name: "dashboard", url: "/dashboard", journey: "dashboard", skip: false as const },
  { name: "formEditor", url: `/dashboard/forms/${formId}`, journey: "form.open", skip: !formId && "E2E_PERF_FORM_ID not set" },
  { name: "lessonEditor", url: `/dashboard/learn/lessons/${lessonId}`, journey: "lesson.edit", skip: !lessonId && "E2E_PERF_LESSON_ID not set" },
];

for (const s of surfaces) {
  test(`${s.name} goes quiet when untouched`, async ({ page }) => {
    test.skip(!!s.skip, s.skip || "");
    test.setTimeout(IDLE_MS + 90_000);
    const env = smokeEnvironment();
    await signInCreator(page, env.creatorEmail, env.creatorPassword);
    const probe = watch(page);
    await page.goto(s.url);
    await usable(page, s.journey);
    // Let load-time work (prefetches, the confirmed-cache handshake, analytics boot) finish first.
    await page.waitForTimeout(5000);
    probe.start();
    await page.waitForTimeout(IDLE_MS);
    const idle = probe.stop();

    const m = `idle.${s.name}`;
    suite.add(`${m}.mutations`, idle.mutations, "count");
    suite.add(`${m}.actions`, idle.actions, "count");
    suite.add(`${m}.subscriptionChurn`, idle.queryAdds + idle.queryRemoves, "count");
    suite.add(`${m}.httpRequests`, idle.httpCount, "count");
    suite.add(`${m}.serverPushes`, idle.pushes, "count");
    test.info().annotations.push({ type: `${s.name} idle requests`, description: idle.http.join(", ") || "none" });

    // Nobody typed: an idle page must not write.
    expect(idle.mutations, `${s.name}: mutations while idle`).toBe(0);
    expect(idle.actions, `${s.name}: actions while idle`).toBe(0);
    expect(idle.queryAdds + idle.queryRemoves, `${s.name}: subscriptions re-registered while idle`).toBe(0);
    expect(idle.httpCount, `${s.name}: HTTP polling while idle: ${idle.http.join(", ")}`).toBeLessThanOrEqual(1);
  });
}
