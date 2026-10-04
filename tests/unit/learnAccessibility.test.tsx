import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { LocaleProvider } from "@/lib/i18n";
import type { Lesson } from "@/lib/learn/types";
import { getFunctionName } from "convex/server";

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, user: { id: "reader", fullName: "Reader One", username: "reader", imageUrl: "" } }) }));
const backend = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn(), loadMore: vi.fn(), page: { results: [], status: "Exhausted" }, assessments: [] as { kind: "quiz"; id: string; title: string; questionCount: number }[] }));
vi.mock("convex/react", () => ({
  useConvex: () => backend,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePaginatedQuery: () => ({ ...backend.page, loadMore: backend.loadMore }),
  useQueries: (requests: Record<string, unknown>) => Object.fromEntries(Object.keys(requests).map(key => [key, { page: [], isDone: true, continueCursor: "" }])),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => args === "skip" ? undefined : getFunctionName(ref) === "learnFrontend:attachedQuizzes" ? backend.assessments : ["learnCommunity:rank", "learnPersonal:listModuleFollows", "courses:listPublic"].includes(getFunctionName(ref)) ? [] : getFunctionName(ref) === "forms:list" ? { owned: [], shared: [] } : null,
  useMutation: () => backend.mutation,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard/learn",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const { default: LessonReader } = await import("@/components/learn/reader/LessonReader");
const { default: LearnHome } = await import("@/app/[lang]/(app)/dashboard/learn/page");
const { default: HandoffDialog } = await import("@/components/learn/reader/HandoffDialog");
const { default: PublishDialog } = await import("@/components/learn/editor/PublishDialog");
const { default: ReportDialog } = await import("@/components/learn/reader/ReportDialog");

const AXE = { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } };
const t = (text: string, styles = {}) => ({ type: "text", text, styles });

function lesson(language = "en"): Lesson {
  const meta = { title: language === "ar" ? "ارتفاع ضغط الوريد البابي" : "Portal hypertension", description: "Causes and collaterals.", tags: ["liver"], language, curricula: [], indexing: "noindex" as const };
  const content = [
    { id: "h1", type: "heading", props: { level: 1 }, content: [t("Causes")], children: [] },
    { id: "p1", type: "paragraph", props: {}, content: [t("Cirrhosis raises "), t("resistance", { bold: true }), { type: "citation", props: { sourceId: "s1", locator: "page 23" } }], children: [] },
    { id: "c1", type: "callout", props: { tone: "warning" }, content: [t("Check for varices.")], children: [] },
    { id: "h2", type: "heading", props: { level: 2 }, content: [t("Collaterals")], children: [] },
    { id: "l1", type: "bulletListItem", props: {}, content: [t("Oesophageal")], children: [] },
    { id: "tb", type: "table", props: {}, content: { type: "tableContent", headerRows: 1, rows: [{ cells: [[t("Site")], [t("Risk")]] }, { cells: [[t("Rectal")], [t("Low")]] }] }, children: [] },
    { id: "yt", type: "youtube", props: { videoId: "dQw4w9WgXcQ", start: 30, end: 90, caption: "Why it matters" }, children: [] },
    { id: "src", type: "source", props: { sourceId: "s1", locator: "slides 4–9" }, children: [] },
  ];
  return {
    id: "lesson_a11y", ownerId: "author", ownerName: "Mona", draft: { meta, content, updatedAt: 1 },
    published: { version: 2, meta, content, publishedAt: Date.UTC(2026, 8, 1) }, publishedDraftAt: 1, visibility: "public",
    sources: [{ id: "s1", kind: "pdf", title: "GIT Lecture 8", shortLabel: "Lecture 8", owner: "Cairo University" }],
    quizzes: [], stats: { views: 3, saves: 1, helpful: 0, notHelpful: 0, forks: 0 }, moderation: "ok", quality: "reviewed", createdAt: 1, updatedAt: 1,
  };
}

function seed(l: Lesson) {
  localStorage.setItem("chaos.learn.v1", JSON.stringify({ v: 1, lessons: { [l.id]: l }, versions: [], folders: {}, folderItems: [], curriculum: {}, people: {}, flashcards: {}, threads: [], reports: [], mine: {} }));
}

const inWorkspace = (ui: React.ReactNode, locale: "en" | "ar" = "en") => render(<LocaleProvider initial={locale}><div className="workspace-ui">{ui}</div></LocaleProvider>);

// jsdom has no matchMedia; the reader asks for phone and reduced-motion media queries.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;

beforeEach(() => { backend.assessments = []; localStorage.clear(); push.mockReset(); backend.mutation.mockReset().mockResolvedValue("lesson_created"); backend.query.mockReset().mockResolvedValue(null); });

describe("lesson reader", () => {
  it("has a labelled article and outline without an empty Practice section, and no axe violations", async () => {
    const l = lesson();
    seed(l);
    inWorkspace(<LessonReader lesson={l} />);
    expect(screen.getByRole("heading", { level: 1, name: "Portal hypertension" })).toBeInTheDocument();
    // Desktop and phone outlines are the same list; CSS shows one at a time.
    const outline = screen.getAllByRole("navigation", { name: "Lesson outline" })[0];
    expect(within(outline).getAllByRole("link").map((a) => a.textContent)).toEqual(["Causes", "Collaterals"]);
    expect(screen.queryByRole("region", { name: "Practice" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lecture 8 · page 23" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Check for varices.");
    expect(screen.getByRole("columnheader", { name: "Site" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play video, 0:30–1:30/ })).toBeInTheDocument();
    expect((await axe(document.body, AXE)).violations).toEqual([]);
  });

  it("opens a citation's source in a dialog and returns focus on Escape", async () => {
    const l = lesson();
    seed(l);
    inWorkspace(<LessonReader lesson={l} />);
    const chip = screen.getByRole("button", { name: "Lecture 8 · page 23" });
    chip.focus();
    fireEvent.click(chip);
    const dialog = screen.getByRole("dialog", { name: "GIT Lecture 8" });
    expect(dialog).toHaveTextContent("© Cairo University");
    expect((await axe(document.body, AXE)).violations).toEqual([]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it("lays out right to left for Arabic lessons and Arabic chrome", () => {
    const l = lesson("ar");
    seed(l);
    const { container } = inWorkspace(<LessonReader lesson={l} />, "ar");
    expect(container.querySelector(".lx-reader-root")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("article")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("article")).toHaveAttribute("lang", "ar");
    expect(screen.getAllByRole("navigation", { name: "مخطط الدرس" }).length).toBeGreaterThan(0);
  });

  it("keeps practice inside the lesson without a separate tab", () => {
    backend.assessments = [{ kind: "quiz", id: "quiz", title: "Checkpoint", questionCount: 3 }];
    const l = lesson(); seed(l); inWorkspace(<LessonReader lesson={l} />);
    expect(screen.queryByRole("tab", { name: "Practice" })).toBeNull();
    expect(screen.getByRole("region", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByText("Checkpoint")).toBeInTheDocument();
  });
});

describe("Learn home", () => {
  it("shows empty states without axe violations", async () => {
    inWorkspace(<LearnHome />);
    expect(await screen.findByRole("heading", { level: 1, name: "Learn" })).toBeInTheDocument();
    expect(screen.getByText(/Lessons you start show up here/)).toBeInTheDocument();
    expect((await axe(document.body, AXE)).violations).toEqual([]);
  });

  it("New lesson opens a blank lesson in the editor", async () => {
    inWorkspace(<LearnHome />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New lesson" }))[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/learn/lessons/lesson_created"));
    expect(getFunctionName(backend.mutation.mock.calls[0][0])).toBe("lessons:create");
    expect(backend.mutation.mock.calls[0][1]).toMatchObject({ document: { schemaVersion: 1, blocks: [] }, metadata: { language: "en", indexing: "noindex" } });
  });
});

describe("dialogs", () => {
  it("Ask ChatGPT shows exactly what is shared and updates as context is toggled", async () => {
    inWorkspace(<HandoffDialog input={{ lessonTitle: "Liver", selection: "Portal vein", section: "Anatomy", sources: ["Lecture 8 · page 23"], target: "chatgpt" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Ask ChatGPT" });
    const preview = () => dialog.querySelector("pre")!.textContent!;
    expect(preview()).toContain("Section: Anatomy");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Section heading/ }));
    expect(preview()).not.toContain("Section: Anatomy");
    expect(within(dialog).getByRole("radiogroup", { name: "What to ask" })).toBeInTheDocument();
    expect((await axe(document.body, AXE)).violations).toEqual([]);
  });

  it("publish options are labelled groups and search indexing needs a public lesson", async () => {
    const l = lesson();
    inWorkspace(<PublishDialog lesson={{ ...l, published: undefined }} onClose={() => {}} onPublish={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Publish lesson" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Only me/ }));
    expect(within(dialog).getByRole("radio", { name: /Allow Google/ })).toBeDisabled();
    expect((await axe(document.body, AXE)).violations).toEqual([]);
  });

  it("an 'incorrect information' report needs details before sending", async () => {
    inWorkspace(<ReportDialog target={{ kind: "lesson", id: "x" }} title="Liver" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Incorrect or dangerous/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please add a few words");
    expect((await axe(document.body, AXE)).violations).toEqual([]);
  });
});

describe("Learn pages", () => {
  const pages = [
    ["Library", () => import("@/app/[lang]/(app)/dashboard/learn/library/page")],
    ["Chaos Learn", () => import("@/components/learn/ExploreBrowser")],
    ["Saved", () => import("@/app/[lang]/(app)/dashboard/learn/saved/page")],
    ["My courses", () => import("@/app/[lang]/(app)/dashboard/learn/courses/page")],
    ["Flashcards", () => import("@/app/[lang]/(app)/dashboard/learn/flashcards/page")],
  ] as const;
  for (const [title, load] of pages) {
    it(`${title} has a heading and no axe violations`, async () => {
      const l = lesson();
      seed({ ...l, ownerId: "reader" });
      const stored = JSON.parse(localStorage.getItem("chaos.learn.v1")!);
      stored.folders = { f1: { id: "f1", ownerId: "reader", name: "Year 4", createdAt: 1, updatedAt: 1 }, f2: { id: "f2", ownerId: "reader", name: "GIT", parentId: "f1", createdAt: 1, updatedAt: 1 } };
      localStorage.setItem("chaos.learn.v1", JSON.stringify(stored));
      const { default: Page } = await load();
      inWorkspace(<Page />);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect((await axe(document.body, AXE)).violations).toEqual([]);
    });
  }
});
