import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineBoxes, NarrationFollower, rangeFor, textIndex } from "@/lib/learn/narration/follow";
import type { SpeechStep } from "@/lib/learn/narration/sequence";
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, sanitizePrefs, writePrefs } from "@/lib/learn/readerPrefs";
import { readSectionSpeeds, writeSectionSpeed } from "@/lib/learn/narration/speeds";

const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);

function page(dir: "ltr" | "rtl" = "ltr") {
  document.body.innerHTML = `
    <article dir="${dir}">
      <div class="lx-block" id="p1" data-block-id="p1">
        <div class="lx-block__handle"><button>⋯</button></div>
        <p>Cirrhosis raises <strong>portal</strong> resistance<button class="lx-cite">Lecture 8</button>. It <mark class="lx-hl">matters</mark>.</p>
        <div class="lx-note-inline">My private note</div>
        <div class="lx-children"><div class="lx-block" id="c1" data-block-id="c1"><p>Child text</p></div></div>
      </div>
      <div class="lx-block" id="ar" data-block-id="ar"><p>يزداد الضغط في CSF.</p></div>
      <div class="lx-block" id="q" data-block-id="q"><p>Quiz</p></div>
    </article>`;
  const article = document.querySelector("article")!;
  const layer = article.appendChild(document.createElement("span"));
  layer.className = "lx-narr-layer";
  return { article, layer };
}

const step = (target: string, sentence?: [number, number]): SpeechStep => ({ kind: "speech", target, section: 0, lang: "en", text: "x", map: [], sentence, sentenceStart: true });

describe("mapping display offsets to the page", () => {
  beforeEach(() => page());

  it("indexes only the block's own text: no menus, citations, notes or child blocks", () => {
    const index = textIndex(document.getElementById("p1")!);
    expect(index.nodes.map((n) => n.data).join("")).toBe("Cirrhosis raises portal resistance. It matters.");
  });

  it("builds a range over displayed words across formatting and highlights", () => {
    const index = textIndex(document.getElementById("p1")!);
    const text = "Cirrhosis raises portal resistance. It matters.";
    expect(rangeFor(index, text.indexOf("portal"), text.indexOf("portal") + 6)!.toString()).toBe("portal");
    expect(rangeFor(index, text.indexOf("It"), text.length)!.toString()).toBe("It matters.");
    expect(rangeFor(index, 0, 0)).toBeNull();
  });

  it("works on right-to-left Arabic text with English inside", () => {
    page("rtl");
    const index = textIndex(document.getElementById("ar")!);
    const at = "يزداد الضغط في CSF.".indexOf("CSF");
    expect(rangeFor(index, at, at + 3)!.toString()).toBe("CSF");
  });

  it("merges an inline run's rects into one box per line", () => {
    expect(lineBoxes([rect(10, 100, 40, 20), rect(50, 101, 30, 18), rect(0, 0, 0, 0), rect(10, 130, 60, 20)])).toEqual([
      { x: 10, y: 100, w: 70, h: 20 }, { x: 10, y: 130, w: 60, h: 20 },
    ]);
  });
});

describe("following narration", () => {
  let restore: () => void;
  beforeEach(() => {
    const original = Range.prototype.getClientRects;
    // jsdom has no layout: every range is one line box, every element a block box.
    Range.prototype.getClientRects = function () { return [rect(100, 300, 8 * this.toString().length, 20)] as unknown as DOMRectList; };
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn() as typeof window.scrollTo;
    restore = () => { Range.prototype.getClientRects = original; };
  });
  afterEach(() => restore());

  it("tints the sentence, then moves a word box inside it without touching the lesson text", () => {
    const { article, layer } = page();
    const before = article.querySelector("#p1")!.innerHTML;
    const f = new NarrationFollower(article, layer);
    f.setMode("word"); f.setColor("green");
    f.showStep(step("p1", [0, 35]), null);
    const lines = layer.querySelectorAll<HTMLElement>(".lx-narr-line[data-on='true']");
    expect(lines).toHaveLength(1);
    // The citation chip inside the sentence is tinted with it ("Lecture 8": 9 more characters).
    expect(lines[0].style.width).toBe(`${8 * (35 + 9) + 6}px`);
    expect(layer.dataset).toMatchObject({ mode: "word", color: "green", words: "unknown" });
    f.showWord([17, 23]);
    const word = layer.querySelector<HTMLElement>(".lx-narr-word")!;
    expect(word.dataset.on).toBe("true");
    expect(word.style.width).toBe(`${8 * 6 + 4}px`);
    expect(layer.dataset.words).toBe("on");
    expect(article.querySelector("#p1")!.innerHTML).toBe(before);
    expect(layer.getAttribute("aria-live")).toBeNull();
    f.destroy();
    expect(layer.childElementCount).toBe(0);
  });

  it("shows the whole sentence when the voice has no word timing", () => {
    const { article, layer } = page();
    const f = new NarrationFollower(article, layer);
    f.setMode("word");
    f.showStep(step("p1", [0, 35]), false);
    expect(layer.dataset.words).toBe("none");
    expect(layer.querySelector<HTMLElement>(".lx-narr-word")!.dataset.on).toBe("false");
  });

  it("follows paragraphs as one box, and draws nothing when following is off", () => {
    const { article, layer } = page();
    const f = new NarrationFollower(article, layer);
    f.setMode("paragraph");
    f.showStep(step("p1", [0, 35]), true);
    expect(layer.querySelector<HTMLElement>(".lx-narr-block")!.dataset.on).toBe("true");
    expect(layer.querySelectorAll(".lx-narr-line[data-on='true']")).toHaveLength(0);
    f.setMode("off");
    expect(layer.querySelectorAll("[data-on='true']")).toHaveLength(0);
  });

  it("stops pulling the page back once the reader scrolls, until they ask or it is on screen again", () => {
    const { article, layer } = page();
    const onDetach = vi.fn();
    const f = new NarrationFollower(article, layer, { onDetach });
    Object.defineProperty(window, "innerHeight", { value: 200, configurable: true });
    f.showStep(step("p1", [0, 35]), true); // line at y=300 is below the 200px screen
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("wheel"));
    expect(onDetach).toHaveBeenLastCalledWith(true);
    f.showStep(step("p1", [36, 47]), true);
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    f.reattach();
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(onDetach).toHaveBeenLastCalledWith(false);
    f.destroy();
    window.dispatchEvent(new Event("wheel"));
    expect(onDetach).toHaveBeenCalledTimes(2);
  });

  it("scrolls without animation when motion is reduced (system or Chaos setting)", () => {
    const { article, layer } = page();
    document.documentElement.classList.add("reduce-motion");
    Object.defineProperty(window, "innerHeight", { value: 200, configurable: true });
    new NarrationFollower(article, layer).showStep(step("p1", [0, 35]), true);
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    document.documentElement.classList.remove("reduce-motion");
  });

  it("marks a reached checkpoint, brings it into view, and clears the mark when reading continues", () => {
    const { article, layer } = page();
    const f = new NarrationFollower(article, layer);
    f.showStep(step("p1", [0, 35]), true);
    f.showCheckpoint("q");
    const quiz = document.getElementById("q")!;
    expect(quiz.dataset.narrationCheckpoint).toBe("true");
    expect(quiz.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    expect(layer.querySelectorAll("[data-on='true']")).toHaveLength(0);
    f.showStep(step("ar", [0, 5]), true);
    expect(quiz.dataset.narrationCheckpoint).toBeUndefined();
  });
});

describe("reader preferences", () => {
  beforeEach(() => localStorage.clear());

  it("persists narration settings next to the existing reading settings", () => {
    writePrefs({ size: "large" });
    writePrefs({ follow: "word", narrationColor: "purple", speed: 1.5, oneSpeed: false, voices: { ar: "Maged" }, outline: "closed" });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ size: "large", follow: "word", narrationColor: "purple", speed: 1.5, oneSpeed: false, voices: { ar: "Maged" }, outline: "closed" });
    expect(readPrefs()).toMatchObject({ size: "large", follow: "word", outline: "closed" });
  });

  it("defaults to sentence following, one speed, and an open outline; ignores damaged values", () => {
    expect(readPrefs()).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ follow: "sentence", oneSpeed: true, speed: 1, outline: "open" });
    expect(sanitizePrefs({ follow: "letters", narrationColor: "neon", speed: 9, voices: { en: 4 } })).toMatchObject({ follow: "sentence", narrationColor: "blue", speed: 2, voices: { en: undefined } });
    localStorage.setItem(PREFS_KEY, "{not json");
    expect(readPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("keeps per-section speeds per lesson and clears them individually", () => {
    writeSectionSpeed("lesson1", "h2", 1.75);
    writeSectionSpeed("lesson1", "h3", 0.75);
    expect(writeSectionSpeed("lesson1", "h3", null)).toEqual({ h2: 1.75 });
    expect(readSectionSpeeds("lesson1")).toEqual({ h2: 1.75 });
    expect(readSectionSpeeds("lesson2")).toEqual({});
  });
});
