import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../../tests/e2e/support";
import { browserSuite, chromeWork, memory } from "./results";
import { instrument, type Probe } from "./instrument";

/**
 * Render health of the heavy surfaces, in Chromium against the E2E
 * environment (never production; tests/e2e/support.ts refuses it):
 *
 * - React census: components rendered while loading, the largest single
 *   commit (a rerender spike), and commits while idle (a render loop).
 * - Convex subscriptions held once the page settles.
 * - Style recalculation and layout: count and time, on load and on the
 *   surface's main interaction (theme switch, fan, next question).
 * - Layout shift, with the elements that moved.
 * - Animation frames: main-thread time per frame against 60 Hz and 120 Hz
 *   budgets (perf/browser/instrument.ts).
 * - Memory once settled: JS heap after garbage collection and DOM nodes.
 *
 * Public surfaces need only PLAYWRIGHT_BASE_URL and their fixture id;
 * dashboard and editor also need the creator login. Missing fixtures skip.
 */
const fixtures = {
  formId: process.env.E2E_PERF_FORM_ID,
  courseId: process.env.E2E_PERF_COURSE_ID,
  lessonId: process.env.E2E_PERF_LESSON_ID,
  /** A lesson at the 500-block limit (perf/lib/content.ts largeLessonBlocks). */
  giantLessonId: process.env.E2E_PERF_GIANT_LESSON_ID,
  quizShareId: process.env.E2E_PERF_QUIZ_SHARE_ID,
  livePin: process.env.E2E_PERF_LIVE_PIN,
};
const signedIn = !!process.env.E2E_CREATOR_EMAIL;
const RUNS = Number(process.env.PERF_RENDER_RUNS ?? 3);
const suite = browserSuite("render-browser");
/** Layout shift above this fails outright ("good" CLS is ≤ 0.1). */
const MAX_CLS = 0.1;
/** Commits during 3 s of doing nothing; more means something re-renders on a loop. */
const MAX_IDLE_COMMITS = 12;

test.describe.configure({ mode: "serial" });
test.afterAll(() => suite.write());

type Surface = { name: string; url: string; ready: (page: Page) => Promise<unknown>; interact?: (page: Page) => Promise<void> };

async function measure(page: Page, probe: Probe, s: Surface) {
  const load = await chromeWork(page, async () => {
    await page.goto(s.url, { waitUntil: "commit" });
    await s.ready(page);
    await page.waitForTimeout(1500);
  });
  expect(await probe.censusActive(), "React registered with the render census").toBe(true);
  const rendered = await probe.renders(0);
  const idleFrom = await probe.commitMark();
  await page.waitForTimeout(3000);
  const idle = await probe.renders(idleFrom);
  const shift = await probe.layoutShift();
  const subs = probe.subscriptions();
  const mem = await memory(page);

  const m = `render.${s.name}`;
  suite.add(`${m}.load.renders`, rendered.renders, "count");
  suite.add(`${m}.maxRendersPerCommit`, rendered.maxRendersPerCommit, "count");
  suite.add(`${m}.idleCommits`, idle.commits, "count");
  suite.add(`${m}.subscriptions`, subs.length, "count");
  suite.add(`${m}.convexBytes`, probe.convexBytes(), "bytes");
  suite.add(`${m}.sameFunctionSubscriptions`, probe.sameFunctionSubscriptions(), "count");
  suite.add(`${m}.load.recalcStyles`, load.recalcStyles, "count");
  suite.add(`${m}.load.recalcStyleMs`, load.recalcStyleMs);
  suite.add(`${m}.load.layouts`, load.layouts, "count");
  suite.add(`${m}.load.layoutMs`, load.layoutMs);
  suite.add(`${m}.cls.milli`, Math.round(shift.cls * 1000), "count");
  suite.add(`${m}.heapBytes`, mem.heapBytes, "bytes");
  suite.add(`${m}.domNodes`, mem.domNodes, "count");
  test.info().annotations.push(
    { type: `${s.name} spike`, description: JSON.stringify(rendered.spikeTop) },
    { type: `${s.name} subscriptions`, description: subs.join(", ") },
    { type: `${s.name} shifted`, description: JSON.stringify(shift.movers) },
  );
  expect(shift.cls, `${s.name}: layout shift; moved: ${JSON.stringify(shift.movers)}`).toBeLessThanOrEqual(MAX_CLS);
  expect(idle.commits, `${s.name}: React keeps committing while idle`).toBeLessThanOrEqual(MAX_IDLE_COMMITS);

  if (s.interact) {
    const before = await probe.commitMark();
    let style = { recalcStyles: 0, recalcStyleMs: 0, layouts: 0, layoutMs: 0, scriptMs: 0 };
    const frames = await probe.frames(async () => { style = await chromeWork(page, () => s.interact!(page)); });
    const renders = await probe.renders(before);
    const a = `anim.${s.name}`;
    suite.add(`${a}.renders`, renders.renders, "count");
    suite.add(`${a}.recalcStyles`, style.recalcStyles, "count");
    suite.add(`${a}.recalcStyleMs`, style.recalcStyleMs);
    suite.add(`${a}.layoutMs`, style.layoutMs);
    suite.add(`${a}.frameWorkP95`, frames.p95WorkMs);
    suite.add(`${a}.over60Hz`, frames.over60, "count");
    suite.add(`${a}.over120Hz`, frames.over120, "count");
    suite.add(`${a}.droppedFrames`, frames.dropped, "count");
  }
}

let session: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
async function creatorSession(browser: Browser) {
  if (session) return session;
  const env = smokeEnvironment();
  const context = await browser.newContext();
  await signInCreator(await context.newPage(), env.creatorEmail, env.creatorPassword);
  session = await context.storageState();
  await context.close();
  return session;
}

function surfaceTest(s: Surface & { skip?: string | false; auth?: boolean }) {
  test(s.name, async ({ browser }) => {
    test.setTimeout(60_000 * (RUNS + 1));
    test.skip(!!s.skip, s.skip || "");
    test.skip(!!s.auth && !signedIn, "E2E_CREATOR_EMAIL not set");
    const storageState = s.auth ? await creatorSession(browser) : undefined;
    // A fresh context per run: no Live session, warm query cache or service worker carried over.
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      await measure(page, await instrument(page), s);
      await context.close();
    }
  });
}

const usable = (journey: string) => (page: Page) => page.waitForFunction((name) => performance.getEntriesByName(`chaos:usable:${name}`).length > 0, journey, { timeout: 30_000 });
const toggleTheme = async (page: Page) => {
  await page.evaluate(() => { document.documentElement.classList.toggle("dark"); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.documentElement.classList.toggle("dark"); });
};

surfaceTest({ name: "dashboard", auth: true, url: "/dashboard", ready: usable("dashboard"), interact: toggleTheme });
surfaceTest({ name: "editor", auth: true, skip: !fixtures.formId && "E2E_PERF_FORM_ID not set", url: `/dashboard/forms/${fixtures.formId}`, ready: usable("form.open"),
  interact: async (page) => {
    // The Design tab swaps the preview's theme: the most style-heavy switch in the editor.
    await page.getByRole("tab", { name: /^(Theme|Design)/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("tab", { name: /^Questions/ }).first().click();
  } });
surfaceTest({ name: "card", url: "/card", ready: (page) => page.locator(".author-stack, .authors-state").first().waitFor(),
  interact: async (page) => {
    // Browsing the stack: each arrow key swings the cards to the next author.
    await page.locator(".author-stack").focus();
    for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(450); }
  } });
surfaceTest({ name: "lesson", skip: !fixtures.lessonId && "E2E_PERF_LESSON_ID not set", url: `/learn/${fixtures.lessonId}`, ready: usable("lesson.read"),
  interact: async (page) => { await page.mouse.wheel(0, 2400); await page.waitForTimeout(300); await page.mouse.wheel(0, -2400); } });
surfaceTest({ name: "giantLesson", skip: !fixtures.giantLessonId && "E2E_PERF_GIANT_LESSON_ID not set", url: `/learn/${fixtures.giantLessonId}`, ready: usable("lesson.read"),
  interact: async (page) => { for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 6000); await page.waitForTimeout(250); } } });
surfaceTest({ name: "course", skip: !fixtures.courseId && "E2E_PERF_COURSE_ID not set", url: `/learn/courses/${fixtures.courseId}`, ready: usable("course.modules") });
surfaceTest({ name: "flow", skip: !fixtures.quizShareId && "E2E_PERF_QUIZ_SHARE_ID not set", url: `/f/${fixtures.quizShareId}`,
  ready: async (page) => {
    const start = page.getByRole("button", { name: /^Start/ });
    if (await start.isVisible({ timeout: 10_000 }).catch(() => false)) await start.click();
    await usable("quiz.question")(page);
  },
  interact: async (page) => {
    // Quiz transition: answer, then move to the next question.
    await page.getByRole("radio").first().check({ force: true }).catch(() => page.getByRole("button", { name: /^(A|1)\b/ }).first().click());
    await page.getByRole("button", { name: /^(Next|OK|Continue)/ }).first().click().catch(() => page.keyboard.press("Enter"));
  } });
surfaceTest({ name: "live", skip: !fixtures.livePin && "E2E_PERF_LIVE_PIN not set", url: `/play?pin=${fixtures.livePin}`,
  ready: (page) => page.getByLabel(/nickname/i).waitFor(),
  interact: async (page) => {
    // Joining plays the game UI's entrance into the lobby.
    await page.getByLabel(/nickname/i).fill(`render-${Date.now().toString(36)}`);
    await page.getByRole("button", { name: /^Join/ }).click();
    await usable("live.join")(page);
  } });
