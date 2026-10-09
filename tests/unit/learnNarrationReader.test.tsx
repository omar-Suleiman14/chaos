import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { Lesson } from "@/lib/learn/types";
import { getFunctionName } from "convex/server";
import { PREFS_KEY } from "@/lib/learn/readerPrefs";

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, user: { id: "reader", fullName: "Reader One", username: "reader", imageUrl: "" } }) }));
const backend = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn() }));
vi.mock("convex/react", () => ({
  useConvex: () => backend,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQueries: () => ({}),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => args === "skip" ? undefined : getFunctionName(ref) === "learnFrontend:attachedQuizzes" ? [] : null,
  useMutation: () => backend.mutation,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/learn", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

const { default: LessonReader } = await import("@/components/learn/reader/LessonReader");
const { default: Narration } = await import("@/components/learn/reader/Narration");

/* ── A speech engine the test drives ───────────────────────────────────── */
class FakeUtterance {
  text: string; lang = ""; rate = 1; volume = 1; voice: unknown = null;
  onboundary: ((e: { name: string; charIndex: number; charLength: number }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text = "") { this.text = text; }
}
const synth = {
  queue: [] as FakeUtterance[], spoken: [] as string[], cancels: 0, paused: false,
  get speaking() { return this.queue.length > 0; }, get pending() { return this.queue.length > 1; },
  speak(u: FakeUtterance) { if (u.text.trim()) { this.queue.push(u); this.spoken.push(u.text); } },
  cancel() { this.cancels++; this.queue = []; }, pause() {}, resume() {},
  getVoices: () => [{ name: "Samantha", lang: "en-US", voiceURI: "samantha", localService: true, default: true }, { name: "Maged", lang: "ar-SA", voiceURI: "maged", localService: true, default: false }],
  addEventListener() {}, removeEventListener() {},
  finish() { const u = this.queue.shift(); u?.onend?.(); },
};
function installSpeech() { Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance }); }
function removeSpeech() { Reflect.deleteProperty(window, "speechSynthesis"); Reflect.deleteProperty(window, "SpeechSynthesisUtterance"); }

const t = (text: string) => ({ type: "text", text, styles: {} });
function lesson(language = "en", extra: unknown[] = []): Lesson {
  const meta = { title: language === "ar" ? "الجهاز العصبي" : "Portal hypertension", description: "", tags: [], language, curricula: [], indexing: "noindex" as const };
  const content = [
    { id: "h1", type: "heading", props: { level: 1 }, content: [t("Causes")], children: [] },
    { id: "p1", type: "paragraph", props: {}, content: [t("Cirrhosis raises resistance. Varices form.")], children: [] },
    ...extra,
    { id: "h2", type: "heading", props: { level: 2 }, content: [t("Collaterals")], children: [] },
    { id: "p2", type: "paragraph", props: {}, content: [t("Oesophageal varices bleed.")], children: [] },
  ];
  return {
    id: "lesson_narr", ownerId: "author", ownerName: "Mona", draft: { meta, content, updatedAt: 1 }, published: { version: 1, meta, content, publishedAt: 1 }, publishedDraftAt: 1,
    visibility: "public", sources: [], quizzes: [], stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, moderation: "ok", quality: "reviewed", createdAt: 1, updatedAt: 1,
  } as Lesson;
}
const wrap = (ui: React.ReactNode, locale: "en" | "ar" = "en") => <ThemeProvider><LocaleProvider initial={locale}><div className="workspace-ui">{ui}</div></LocaleProvider></ThemeProvider>;
const inWorkspace = (ui: React.ReactNode, locale: "en" | "ar" = "en") => render(wrap(ui, locale));

let narrow = false;
const media = (query: string) => ({ matches: narrow && /max-width: 1180px|hover: none/.test(query), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false });
beforeEach(() => {
  localStorage.clear(); narrow = false; window.matchMedia = media as unknown as typeof window.matchMedia;
  Object.assign(synth, { queue: [], spoken: [], cancels: 0 });
  Element.prototype.scrollIntoView = vi.fn(); window.scrollTo = vi.fn() as typeof window.scrollTo;
  installSpeech();
  // Below the fold until a test scrolls: Listen starts from the top of the lesson.
  layout = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 1000, 600, 100));
});
afterEach(() => { removeSpeech(); layout.mockRestore(); });
let layout: ReturnType<typeof vi.spyOn>;

/** The Listen chip beside the reading time starts the lesson at once; the top-bar Listen icon opens its menu. */
const chip = () => document.querySelector<HTMLButtonElement>(".lx-listen-chip")!;
const listen = () => fireEvent.click(chip());
const player = () => screen.findByRole("region", { name: "Read aloud" });

describe("Listen", () => {
  it("loads nothing for speech until the reader asks", () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
    expect(document.querySelector(".lx-narr-layer")).toBeNull();
    expect(synth.spoken).toEqual([]);
  });

  it("reads the lesson from its blocks in a compact player and follows it in an aria-hidden layer", async () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    listen();
    const region = await player();
    await waitFor(() => expect(synth.spoken).toEqual(["Portal hypertension"]));
    expect(within(region).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(within(region).getByText("Portal hypertension")).toBeInTheDocument();
    act(() => synth.finish());
    act(() => synth.finish());
    expect(synth.spoken.slice(1)).toEqual(["Causes", "Cirrhosis raises resistance."]);
    expect(within(region).getByText("Section 2 of 3")).toBeInTheDocument();
    const layer = document.querySelector("article .lx-narr-layer")!;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(chip()).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(region).getByRole("button", { name: "Pause" }));
    expect(within(region).getByRole("button", { name: "Resume" })).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Next section" }));
    fireEvent.click(within(region).getByRole("button", { name: "Resume" }));
    expect(synth.spoken.at(-1)).toBe("Collaterals");

    const cancels = synth.cancels;
    fireEvent.click(within(region).getByRole("button", { name: "Stop and close" }));
    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
    expect(synth.cancels).toBeGreaterThan(cancels);
    expect(document.querySelector(".lx-narr-layer")).toBeNull();
  });

  it("starts from the section on screen once the reader has scrolled into the lesson", async () => {
    layout.mockImplementation(function (this: Element) { return new DOMRect(0, this.id === "h2" ? 100 : this.tagName === "ARTICLE" ? -900 : -400, 600, this.tagName === "ARTICLE" ? 2000 : 40); });
    inWorkspace(<LessonReader lesson={lesson()} />);
    act(() => { window.dispatchEvent(new Event("scroll")); });
    await waitFor(() => expect(document.querySelector('.lx-toc a[aria-current="location"]')).toHaveTextContent("Collaterals"));
    listen();
    await player();
    await waitFor(() => expect(synth.spoken).toEqual(["Collaterals"]));
  });

  it("cancels speech when the reader leaves the lesson", async () => {
    const view = inWorkspace(<LessonReader lesson={lesson()} />);
    listen();
    await player();
    await waitFor(() => expect(synth.queue).toHaveLength(1));
    view.unmount();
    expect(synth.queue).toHaveLength(0);
  });

  it("says when the browser cannot speak, without loading the player", async () => {
    removeSpeech();
    inWorkspace(<LessonReader lesson={lesson()} />);
    listen();
    expect(await screen.findByText("Read aloud isn't available in this browser.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
  });

  it("is labelled in Arabic for Arabic readers", async () => {
    inWorkspace(<LessonReader lesson={lesson("ar")} />, "ar");
    expect(chip()).toHaveAccessibleName("استمع");
    fireEvent.click(chip());
    const region = await screen.findByRole("region", { name: "القراءة بصوت عالٍ" });
    expect(within(region).getByRole("button", { name: "القسم التالي" })).toBeInTheDocument();
    expect(region.closest("[dir]")).toHaveAttribute("dir", "rtl");
  });
});

describe("checkpoints", () => {
  const quiz = { id: "q", type: "quiz", props: { assetKind: "quiz", assetId: "q1" }, children: [] };
  const props = (activities: Record<string, unknown>) => {
    const article = createRef<HTMLElement>();
    return { request: { id: 1, mode: "lesson" as const }, lessonId: "lesson_narr", content: lesson("en", [quiz]).draft.content, title: "Portal hypertension", article, activities, onClose: () => {} };
  };

  it("finishes the sentence, stops at the quiz, and resumes after it is completed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = props({});
    const view = inWorkspace(<><article ref={p.article}><div id="q" data-block-id="q" /></article><Narration {...p} /></>);
    await waitFor(() => expect(synth.spoken).toEqual(["Portal hypertension"]));
    for (let i = 0; i < 4; i++) act(() => synth.finish());
    expect(synth.spoken.at(-1)).toBe("Varices form.");
    expect(document.querySelector(".lx-narration__label")).toHaveTextContent("Checkpoint: finish the activity to continue");
    expect(synth.queue).toHaveLength(0);
    expect(document.getElementById("q")!.dataset.narrationCheckpoint).toBe("true");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(synth.queue).toHaveLength(0);

    view.rerender(wrap(<><article ref={p.article}><div id="q" data-block-id="q" /></article><Narration {...p} activities={{ "quiz:q1": { kind: "quiz", id: "q1" } }} /></>));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(synth.spoken.at(-1)).toBe("Collaterals");
    vi.useRealTimers();
  });

  it("lets the reader skip a checkpoint explicitly", async () => {
    const p = props({});
    inWorkspace(<><article ref={p.article} /><Narration {...p} /></>);
    await waitFor(() => expect(synth.spoken).toHaveLength(1));
    for (let i = 0; i < 4; i++) act(() => synth.finish());
    fireEvent.click(screen.getByRole("button", { name: "Continue reading" }));
    expect(synth.spoken.at(-1)).toBe("Collaterals");
  });
});

describe("selection read aloud", () => {
  const select = (text: string) => {
    const node = [...document.querySelectorAll("article p")].find((p) => p.textContent!.includes(text))!.firstChild as Text;
    const range = document.createRange();
    const at = node.data.indexOf(text);
    range.setStart(node, at); range.setEnd(node, at + text.length);
    range.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);
    act(() => { document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
  };

  it("speaks exactly the selection, and a new selection replaces the old one cleanly", async () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    select("raises resistance");
    fireEvent.click(await screen.findByRole("button", { name: "Read aloud" }));
    const region = await player();
    await waitFor(() => expect(synth.spoken).toEqual(["raises resistance"]));
    expect(within(region).getByText("Reading your selection")).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Next section" })).toBeNull();
    // Reading leaves saved highlights alone: nothing was added to the lesson.
    expect(document.querySelector("article mark")).toBeNull();

    select("Oesophageal varices");
    fireEvent.click(await screen.findByRole("button", { name: "Read aloud" }));
    await waitFor(() => expect(synth.spoken.at(-1)).toBe("Oesophageal varices"));
    expect(synth.queue.map((u) => u.text)).toEqual(["Oesophageal varices"]);
  });

  it("is not offered when the device cannot speak", async () => {
    removeSpeech();
    inWorkspace(<LessonReader lesson={lesson()} />);
    select("raises resistance");
    expect(await screen.findByRole("toolbar", { name: "Selection actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });
});

describe("reading settings", () => {
  it("keeps text settings and appearance only; the theme toggle stays an icon button", () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reading settings" }));
    const menu = screen.getByRole("menu", { name: "Reading settings" });
    expect(within(menu).getByRole("button", { name: /Use (light|dark) appearance/ })).toHaveClass("ws-icon-button");
    expect(within(menu).queryByRole("menuitemradio", { name: "Sentence" })).toBeNull();
  });
});

describe("Listen menu", () => {
  const open = () => { fireEvent.click(screen.getByRole("button", { name: "Listen", expanded: false })); return screen.getByRole("menu", { name: "Listen" }); };

  it("holds every read-aloud setting and saves them with the reading preferences", async () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    const menu = open();
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveAccessibleName("Listen to this lesson");
    const sentence = await within(menu).findByRole("menuitemradio", { name: "Sentence" });
    expect(sentence).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Word" }));
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Purple" }));
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "1.5×" }));
    fireEvent.click(within(within(menu).getByRole("group", { name: "Use one speed for whole lesson" })).getByRole("menuitemradio", { name: "Off" }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ follow: "word", narrationColor: "purple", speed: 1.5, oneSpeed: false });
    expect(within(menu).getByText(/word timing/)).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /English voice/ }));
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Back" })).toHaveFocus());
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /^Samantha/ }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).voices).toEqual({ en: "samantha" });
  });

  it("starts and stops the lesson from the menu", async () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    fireEvent.click(within(open()).getByRole("menuitem", { name: "Listen to this lesson" }));
    await player();
    await waitFor(() => expect(synth.spoken).toEqual(["Portal hypertension"]));
    fireEvent.click(within(open()).getByRole("menuitem", { name: "Stop listening" }));
    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
  });
});

describe("glossary card", () => {
  it("says only the word, in its own language, without opening the narration player", async () => {
    const { TermCard } = await import("@/components/learn/reader/Glossary");
    const entry = { term: "oligodendrocytes", pronunciation: "/ˌɒlɪɡəʊˈdɛndrəsaɪts/", definition: "CNS glial cells that form myelin around central axons.", translation: "الخلايا قليلة التغصن", explanation: "خلايا داعمة تكوّن الميالين.", language: "ar" };
    inWorkspace(<TermCard term={{ entry: entry as never, rect: new DOMRect(0, 0, 10, 10) }} onClose={() => {}} canSpeak />);
    const word = screen.getByRole("button", { name: /^Pronounce oligodendrocytes/ });
    expect(word).toHaveTextContent("/ˌɒlɪɡəʊˈdɛndrəsaɪts/");
    fireEvent.click(word);
    expect(synth.spoken).toEqual(["oligodendrocytes"]);
    expect([synth.queue[0].lang, word.getAttribute("aria-pressed")]).toEqual(["en-US", "true"]);
    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
    act(() => synth.finish());
    expect(word).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Pronounce الخلايا قليلة التغصن" }));
    expect([synth.spoken.at(-1), synth.queue[0].lang]).toEqual(["الخلايا قليلة التغصن", "ar-SA"]);
  });

  it("plays through the player with each language in its own voice", async () => {
    const entry = { term: "oligodendrocytes", definition: "Glial cells.", translation: "الخلايا قليلة التغصن", language: "ar" };
    const props = { request: { id: 1, mode: "selection" as const, text: "oligodendrocytes.\nGlial cells.\nالخلايا قليلة التغصن.", title: entry.term }, lessonId: "l", content: [], title: "", article: createRef<HTMLElement>(), activities: {}, onClose: () => {} };
    inWorkspace(<Narration {...props} />);
    const region = await player();
    expect(within(region).getByText("oligodendrocytes")).toBeInTheDocument();
    await waitFor(() => expect(synth.queue[0]?.text).toBe("oligodendrocytes."));
    act(() => synth.finish()); act(() => synth.finish());
    expect([synth.queue[0].text, synth.queue[0].lang]).toEqual(["الخلايا قليلة التغصن.", "ar-SA"]);
  });

  it("offers no speaker without speech", async () => {
    const { TermCard } = await import("@/components/learn/reader/Glossary");
    inWorkspace(<TermCard term={{ entry: { term: "x", definition: "y" } as never, rect: new DOMRect(0, 0, 1, 1) }} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Pronounce/ })).toBeNull();
  });
});

describe("outline sidebar", () => {
  it("folds and unfolds the desktop outline, remembering the choice", () => {
    const view = inWorkspace(<LessonReader lesson={lesson()} />);
    const toggle = screen.getByRole("button", { name: "Hide sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(body).not.toHaveAttribute("inert");
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Show sidebar");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("inert");
    expect(document.querySelector(".lx-reader")).toHaveAttribute("data-outline", "closed");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).outline).toBe("closed");
    view.unmount();
    inWorkspace(<LessonReader lesson={lesson()} />);
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the phone outline as a bottom sheet regardless of the desktop sidebar", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ outline: "closed" }));
    inWorkspace(<LessonReader lesson={lesson()} />);
    fireEvent.click(screen.getByRole("button", { name: /On this page/ }));
    const sheet = screen.getByRole("dialog", { name: "Lesson outline" });
    expect(within(sheet).getAllByRole("link").map((a) => a.textContent)).toEqual(["Causes", "Collaterals"]);
  });
});

describe("block actions on touch screens", () => {
  // jsdom lays nothing out: put every block mid-screen so the callout has room above it.
  beforeEach(() => { vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(16, 300, 343, 80)); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("opens the tapped block's actions in one tap, in a callout outside the lesson text", () => {
    narrow = true;
    inWorkspace(<LessonReader lesson={lesson()} />);
    fireEvent.click(screen.getByText("Cirrhosis raises resistance. Varices form."));
    const bar = screen.getByRole("toolbar", { name: "Actions for this part" });
    expect(document.querySelector("article")!.contains(bar)).toBe(false);
    expect(document.getElementById("p1")).toHaveAttribute("data-active", "true");
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual(["Save", "Note", "Discuss", "Copy link"]);
    expect(within(bar).getByRole("button", { name: "Save" })).toHaveAttribute("title", "Save this part");
    fireEvent.click(within(bar).getByRole("button", { name: "Note" }));
    expect(screen.queryByRole("toolbar", { name: "Actions for this part" })).toBeNull();
  });

  it("closes on a second tap of the block, on Escape and on a tap outside the lesson", () => {
    narrow = true;
    inWorkspace(<LessonReader lesson={lesson()} />);
    const block = screen.getByText("Cirrhosis raises resistance. Varices form.");
    fireEvent.click(block);
    expect(screen.getByRole("toolbar", { name: "Actions for this part" })).toBeInTheDocument();
    fireEvent.click(block);
    expect(screen.queryByRole("toolbar", { name: "Actions for this part" })).toBeNull();
    fireEvent.click(block);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: "Actions for this part" })).toBeNull();
    fireEvent.click(block);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("toolbar", { name: "Actions for this part" })).toBeNull();
  });

  it("does not show the bar on desktop, where the menu sits in the side gutter", () => {
    inWorkspace(<LessonReader lesson={lesson()} />);
    fireEvent.click(screen.getByText("Cirrhosis raises resistance. Varices form."));
    expect(screen.queryByRole("toolbar", { name: "Actions for this part" })).toBeNull();
  });
});
