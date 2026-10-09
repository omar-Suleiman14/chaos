import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LocaleProvider } from "@/lib/i18n";
import type { Block } from "@/lib/learn/doc";
import type { Lesson } from "@/lib/learn/types";
import type { Census } from "../lib/fiberCensus";
import { rendersOf, summarize } from "../lib/fiberCensus";
import { formDefinition } from "../lib/content";
import { recordPerf } from "../lib/record";
import { server } from "./convexServer";

vi.mock("convex/react", async () => (await import("./convexServer")).convexReact);
vi.mock("next/navigation", () => ({
  useParams: () => ({ formId: "form_perf" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/dashboard/forms/form_perf",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/convexClient", () => ({ convex: null }));
vi.mock("@/lib/auth/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: "user_perf", fullName: "Perf" } }),
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_perf", getToken: async () => null }),
  useClerk: () => ({ openSignIn: () => {}, signOut: async () => {} }),
}));

const { default: FormBuilderPage } = await import("@/app/[lang]/(app)/dashboard/forms/[formId]/page");
const { default: LessonReader } = await import("@/components/learn/reader/LessonReader");
const { default: PlayerScreen } = await import("@/components/live/PlayerScreen");
await Promise.all([import("@/components/forms/builder/DesignTab"), import("@/components/forms/builder/LogicTab"), import("@/components/forms/builder/TranslateTab"),
  import("@/components/forms/builder/SettingsTab"), import("@/components/forms/builder/ShareTab"), import("@/components/forms/builder/TeamTab"), import("@/components/forms/builder/HistoryTab")]);

/**
 * React subscription census for the editor, the lesson player and Live:
 * how many Convex subscriptions a surface holds, how many components render
 * when it mounts, on a keystroke, and on a server update, and the largest
 * single commit (a rerender spike). Component renders come from the fiber
 * census (perf/lib/fiberCensus.ts), the same accounting React DevTools uses.
 * The dashboard is censused in the browser (perf/browser/render.spec.ts).
 */
const census = () => (globalThis as unknown as { __chaosCensus: Census }).__chaosCensus;
const mark = () => census().commits.length;
const since = (at: number) => summarize(census().since(at));
const bodies = (at: number) => rendersOf(census().since(at), "BlockBody");

// Without IntersectionObserver, Next Link queues visibility updates through a
// 1 ms idle-callback fallback. Include that mount work before measuring the next
// interaction; otherwise three link renders randomly land in either snapshot.
const settleMount = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

beforeEach(() => { localStorage.clear(); server.reset(); });

describe("editor", () => {
  it("100-question builder: mount, keystroke, server echo", async (ctx) => {
    const def = formDefinition("Census form", 100, { conditional: true, sections: true });
    const doc = { _id: "form_perf", title: def.title, status: "draft", shareId: "perfshare", role: "owner", draft: def, draftRevision: 1, settings: {}, versions: [], quizMode: false, responseCount: 0, canHideBranding: false };
    server.set("forms:getFormForEditor", doc);
    server.set("businessTeams:listMine", []);
    let at = mark();
    const view = render(<LocaleProvider initial="en"><FormBuilderPage /></LocaleProvider>);
    await waitFor(() => expect(screen.getAllByRole("tab").length).toBeGreaterThan(2));
    await settleMount();
    const mount = since(at);

    const label = [...view.container.querySelectorAll<HTMLInputElement>("input")].find((el) => el.value.startsWith("Question 1:"))!;
    at = mark();
    await act(async () => { fireEvent.change(label, { target: { value: label.value + "x" } }); });
    const keystroke = since(at);

    // Autosave's echo: the server returns the same draft at a new revision.
    at = mark();
    await act(async () => { server.push("forms:getFormForEditor", { ...doc, draft: { ...def, fields: def.fields.map((f, i) => i === 0 ? { ...f, label: label.value } : f) }, draftRevision: 2 }); });
    const echo = since(at);

    recordPerf(ctx, {
      "editor.subscriptions": server.subscriptionCount,
      "editor.duplicateSubscriptions": server.duplicates.sameArgs,
      "editor.sameFunctionManyArgs": server.duplicates.manyArgs,
      "editor.mount.renders": mount.renders,
      "editor.keystroke.commits": keystroke.commits,
      "editor.keystroke.renders": keystroke.renders,
      "editor.serverEcho.renders": echo.renders,
      "editor.maxRendersPerCommit": Math.max(keystroke.maxRendersPerCommit, echo.maxRendersPerCommit),
    });
  });
});

const paragraph = (i: number): Block => ({ id: `b${i}`, type: i % 10 === 0 ? "heading" : "paragraph", props: i % 10 === 0 ? { level: 2 } : {}, content: [{ type: "text", text: `Block ${i}: the renal tubule reabsorbs sodium against its gradient.`, styles: i % 3 === 0 ? { bold: true } : {} }], children: [] });

function lessonWith(count: number): Lesson {
  const meta = { title: "Census lesson", description: "Perf fixture", tags: [], language: "en", curricula: [] };
  const content = Array.from({ length: count }, (_, i) => paragraph(i));
  return {
    id: "lesson_perf", ownerId: "user_perf", ownerName: "Perf", draft: { meta, content, updatedAt: 1 }, visibility: "public", sources: [], quizzes: [],
    stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, moderation: "ok", quality: "ok", createdAt: 1, updatedAt: 1,
  } as unknown as Lesson;
}

/** The lesson as a page holds it: a Convex result that updates in place, under a provider that does not re-render. */
function LiveLesson() {
  const lesson = useQuery(api.learnFrontend.publicLesson, { id: "lesson_perf" }) as Lesson | undefined;
  return lesson ? <LessonReader lesson={lesson} previewDraft /> : null;
}

describe("lesson player", () => {
  it("60 blocks: mount, then an agent appending a block", async (ctx) => {
    const lesson = lessonWith(60);
    server.set("learnFrontend:publicLesson", lesson);
    let at = mark();
    const view = render(<LocaleProvider initial="en"><LiveLesson /></LocaleProvider>);
    await waitFor(() => expect(view.container.querySelector("[data-block-id='b59']")).not.toBeNull());
    await settleMount();
    const mount = since(at);
    const mountBodies = bodies(at);

    // The draft as Convex delivers it after add_lesson_blocks: every object fresh, one block more.
    at = mark();
    await act(async () => { server.push("learnFrontend:publicLesson", { ...lesson, draft: { ...lesson.draft, content: [...(lesson.draft.content as Block[]), paragraph(60)], updatedAt: 2 } }); });
    await waitFor(() => expect(view.container.querySelector("[data-block-id='b60']")).not.toBeNull());
    const append = since(at);
    const appendBodies = bodies(at);

    recordPerf(ctx, {
      "lesson.subscriptions": server.subscriptionCount,
      "lesson.duplicateSubscriptions": server.duplicates.sameArgs,
      "lesson.sameFunctionManyArgs": server.duplicates.manyArgs,
      "lesson.mount.renders": mount.renders,
      "lesson.mount.blockBodies": mountBodies,
      "lesson.appendBlock.renders": append.renders,
      "lesson.appendBlock.blockBodies": appendBodies,
      "lesson.maxRendersPerCommit": append.maxRendersPerCommit,
    });
    // Finished blocks never re-render when another block arrives.
    expect(appendBodies).toBe(1);
  });
});

describe("giant lesson", () => {
  it("500 blocks (the limit): mount, then an agent appending a block", async (ctx) => {
    const lesson = lessonWith(500);
    server.set("learnFrontend:publicLesson", lesson);
    let at = mark();
    const view = render(<LocaleProvider initial="en"><LiveLesson /></LocaleProvider>);
    await waitFor(() => expect(view.container.querySelector("[data-block-id='b499']")).not.toBeNull());
    await settleMount();
    const mount = since(at);
    const mountBodies = bodies(at);

    at = mark();
    await act(async () => { server.push("learnFrontend:publicLesson", { ...lesson, draft: { ...lesson.draft, content: [...(lesson.draft.content as Block[]), paragraph(500)], updatedAt: 2 } }); });
    await waitFor(() => expect(view.container.querySelector("[data-block-id='b500']")).not.toBeNull());
    const append = since(at);
    const appendBodies = bodies(at);

    recordPerf(ctx, {
      "giantLesson.mount.renders": mount.renders,
      "giantLesson.mount.blockBodies": mountBodies,
      "giantLesson.domNodes": view.container.querySelectorAll("*").length,
      "giantLesson.appendBlock.renders": append.renders,
      "giantLesson.appendBlock.blockBodies": appendBodies,
    });
    expect(appendBodies).toBe(1);
  });
});

describe("Live", () => {
  it("player: question on screen, clock ticks, another player's answer", async (ctx) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date", "requestAnimationFrame", "performance"] });
    const now = Date.now();
    const gameId = "game_perf";
    localStorage.setItem("chaos-live-session", JSON.stringify({ gameId, token: "a".repeat(32), pin: "123456" }));
    const question = { state: "question", title: "Census game", appearance: "apple", theme: null, showAnswerLabels: true, nickname: "perf", questionIndex: 2, questionCount: 10,
      question: { text: "Which segment reabsorbs most sodium?", kind: "single", options: [{ id: "a", text: "Proximal tubule" }, { id: "b", text: "Loop of Henle" }, { id: "c", text: "Distal tubule" }, { id: "d", text: "Collecting duct" }], image: null },
      startedAt: now, endsAt: now + 20_000, answered: false, myAnswer: null };
    server.set("live:playerView", question);
    let at = mark();
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getAllByText(/Which segment/).length).toBeGreaterThan(0);
    const mount = since(at);

    // One second of the countdown.
    at = mark();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const tick = since(at);

    // The server re-sends the same view (another player answered; nothing this phone shows changed).
    at = mark();
    await act(async () => { server.push("live:playerView", { ...question }); });
    const echo = since(at);
    vi.useRealTimers();

    recordPerf(ctx, {
      "live.player.subscriptions": server.subscriptionCount,
      "live.player.duplicateSubscriptions": server.duplicates.sameArgs,
      "live.player.sameFunctionManyArgs": server.duplicates.manyArgs,
      "live.player.mount.renders": mount.renders,
      "live.player.clockSecond.commits": tick.commits,
      "live.player.clockSecond.renders": tick.renders,
      "live.player.unchangedUpdate.renders": echo.renders,
      "live.player.maxRendersPerCommit": Math.max(tick.maxRendersPerCommit, echo.maxRendersPerCommit),
    });
  });
});
