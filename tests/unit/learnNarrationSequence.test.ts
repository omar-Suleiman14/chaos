import { describe, expect, it } from "vitest";
import { buildNarration, buildTextNarration, sectionStart, stepForTarget, type SpeechStep } from "@/lib/learn/narration/sequence";
import { languageSpans, sentences, speakable, speakLatex, toDisplay } from "@/lib/learn/narration/speakable";

const t = (text: string, styles = {}) => ({ type: "text", text, styles });
const block = (id: string, type: string, content: unknown = [], props: Record<string, unknown> = {}, children: unknown[] = []) => ({ id, type, props, content, children });
const speech = (n: ReturnType<typeof buildNarration>) => n.steps.filter((s): s is SpeechStep => s.kind === "speech");
const spoken = (n: ReturnType<typeof buildNarration>) => speech(n).map((s) => s.text);

describe("narration sequence from lesson blocks", () => {
  const lesson = [
    block("h1", "heading", [t("Meninges")], { level: 1 }),
    block("p1", "paragraph", [t("The dura is tough. "), t("It protects the brain", { bold: true }), { type: "citation", props: { sourceId: "s1", locator: "p. 4" } }, t(".")]),
    block("c1", "callout", [t("Never puncture above L2.")], { tone: "warning" }),
    block("l1", "bulletListItem", [t("Dura mater")], {}, [block("l1a", "bulletListItem", [t("Periosteal layer")])]),
    block("code", "codeBlock", [t("const x = 1")]),
    block("yt", "youtube", undefined, { videoId: "dQw4w9WgXcQ", caption: "Watch this" }),
    block("src", "source", undefined, { sourceId: "s1" }),
    block("div", "divider"),
    block("img", "image", undefined, { url: "x.png", alt: "IMG_2041.png", caption: "" }),
    block("img2", "image", undefined, { url: "y.png", alt: "Spinal cord cross-section" }),
    block("h2", "heading", [t("Lumbar puncture")], { level: 2 }),
    block("q1", "quiz", undefined, { assetKind: "quiz", assetId: "abc", required: true }),
    block("p2", "paragraph", [t("After the quiz, continue.")]),
    block("fc", "flashcards", undefined, { setId: "deck1" }),
    block("tb", "table", { type: "tableContent", headerRows: 1, rows: [{ cells: [[t("Layer")], [t("Space")]] }, { cells: [[t("Dura")], [t("Epidural")]] }] }),
    block("eq", "equation", [t("\\frac{a}{b}^2")]),
  ];
  const n = buildNarration(lesson, { title: "Spinal cord", description: "A deep dive.", language: "en" });

  it("reads the title, lead, headings, paragraphs, callouts, nested list items, captions, tables and equations in order", () => {
    expect(spoken(n)).toEqual([
      "Spinal cord", "A deep dive.", "Meninges", "The dura is tough.", "It protects the brain.", "Warning. Never puncture above L2.", "Dura mater", "Periosteal layer",
      "Figure: Spinal cord cross-section", "Lumbar puncture", "After the quiz, continue.", "Layer: Dura, Space: Epidural.", "a over b squared.",
    ]);
    expect(speech(n).map((s) => s.target)).toContain("lesson-lead");
  });

  it("never speaks code, video, source cards, dividers, citations or file-name alt text", () => {
    const all = spoken(n).join(" ");
    for (const silent of ["const x", "Watch this", "p. 4", "IMG_2041"]) expect(all).not.toContain(silent);
    expect(speech(n).some((s) => ["code", "yt", "src", "div", "img"].includes(s.target))).toBe(false);
  });

  it("stops at quizzes and flashcards as checkpoints keyed like lesson activities", () => {
    const checkpoints = n.steps.filter((s) => s.kind === "checkpoint");
    expect(checkpoints).toEqual([
      expect.objectContaining({ target: "q1", activity: "quiz", key: "quiz:abc" }),
      expect.objectContaining({ target: "fc", activity: "flashcards", key: "flashcards:deck1" }),
    ]);
    const quiz = n.steps.findIndex((s) => s.target === "q1");
    expect(n.steps[quiz - 1]).toMatchObject({ text: "Lumbar puncture" });
    expect(n.steps[quiz + 1]).toMatchObject({ text: "After the quiz, continue." });
  });

  it("groups steps into sections at headings for section navigation", () => {
    expect(n.sections.map((s) => s.title)).toEqual(["Spinal cord", "Meninges", "Lumbar puncture"]);
    const inMeninges = stepForTarget(n, "c1");
    expect(sectionStart(n, inMeninges, 0)).toBe(stepForTarget(n, "h1"));
    expect(sectionStart(n, inMeninges, 1)).toBe(stepForTarget(n, "h2"));
    expect(sectionStart(n, inMeninges, -1)).toBe(0);
  });

  it("maps highlightable sentences to the block's displayed text, not the spoken rewrite", () => {
    const p1 = speech(n).filter((s) => s.target === "p1");
    const display = "The dura is tough. It protects the brain.";
    expect(p1.map((s) => display.slice(...s.sentence!))).toEqual(["The dura is tough.", "It protects the brain."]);
    // Tables, figures and equations are composed for listening: followed as a whole block.
    expect(speech(n).find((s) => s.target === "tb")?.sentence).toBeUndefined();
  });

  it("starts a callout prefix without a display range so word highlights never shift", () => {
    const c = speech(n).find((s) => s.target === "c1")!;
    expect(toDisplay(c.map, 0, 7)).toBeNull();
    const word = c.text.indexOf("puncture");
    expect(toDisplay(c.map, word, word + 8)).toEqual([6, 14]);
  });
});

describe("mixed Arabic and English", () => {
  it("splits sentences into language runs that keep numbers and punctuation with their text", () => {
    const text = "يزداد ضغط CSF عند 120 mmHg.";
    const spans = languageSpans(text, 0, text.length, "ar").map((s) => [s.lang, text.slice(s.start, s.end)]);
    expect(spans).toEqual([["ar", "يزداد ضغط "], ["en", "CSF "], ["ar", "عند 120 "], ["en", "mmHg."]]);
  });

  it("builds one continuous narration with per-language steps and English units after Arabic numbers", () => {
    const n = buildNarration([block("p", "paragraph", [t("يزداد ضغط CSF عند 120 mmHg. ثم يهبط.")])], { language: "ar" });
    expect(speech(n).map((s) => [s.lang, s.text])).toEqual([["ar", "يزداد ضغط "], ["en", "CSF "], ["ar", "عند 120 "], ["en", " millimetres of mercury."], ["ar", "ثم يهبط."]]);
    expect(speech(n).map((s) => s.sentenceStart)).toEqual([true, false, false, false, true]);
  });

  it("speaks symbols in the language around them", () => {
    expect(speakable("الضغط ↑").text).toBe("الضغط  increased ");
    expect(speakable("الضغط ↑", 0, 7, "ar").text).toBe("الضغط  ارتفاع ");
  });

  it("uses the lesson language for text without letters", () => {
    expect(languageSpans("120/80", 0, 6, "ar")).toEqual([{ lang: "ar", start: 0, end: 6 }]);
  });

  it("reads a selection as written, in its own languages", () => {
    const n = buildTextNarration("Dura mater الأم الجافية", "en");
    expect(speech(n).map((s) => [s.lang, s.text, s.target])).toEqual([["en", "Dura mater ", ""], ["ar", "الأم الجافية", ""]]);
  });
});

describe("spoken forms of technical text", () => {
  const say = (s: string) => speakable(s).text.replace(/\s+/g, " ").trim();
  it.each([
    ["BP 120/80 mmHg", "BP 120 over 80 millimetres of mercury"],
    ["Give 1 mg then 5 mg", "Give 1 milligram then 5 milligrams"],
    ["K+ and Na+ rise", "potassium and sodium rise"],
    ["HCO3- falls ↓", "bicarbonate falls decreased"],
    ["CO2 → acidosis", "CO2 leads to acidosis".replace("CO2", "carbon dioxide")],
    ["L4–L5 and 2-3 cm", "L4 to L5 and 2 to 3 centimetres"],
    ["e.g. sepsis vs. shock", "for example sepsis versus shock"],
    ["Temp ≥ 38 °C", "Temp greater than or equal to 38 degrees Celsius"],
    ["See https://example.com/a now [3]", "See now"],
    ["α and β receptors", "alpha and beta receptors"],
    ["Dx: 50% ✅", "diagnosis: 50 percent"],
  ])("%s", (input, expected) => expect(say(input)).toBe(expected));

  it("keeps the map from spoken words back to the displayed text", () => {
    const display = "Give 5 mg now";
    const s = speakable(display);
    const at = s.text.indexOf("milligrams");
    expect(display.slice(...toDisplay(s.map, at, at + 10)!)).toBe("mg");
    const now = s.text.indexOf("now");
    expect(display.slice(...toDisplay(s.map, now, now + 3)!)).toBe("now");
  });

  it("reads LaTeX equations in words", () => {
    expect(speakLatex("\\sqrt{x^2 + y^2} \\leq \\frac{a}{2}")).toBe("the square root of x squared plus y squared less than or equal to a over 2");
    expect(speakLatex("\\Delta G = \\Delta H - T\\Delta S")).toBe("delta G equals delta H minus T delta S");
  });
});

describe("sentence boundaries", () => {
  const split = (text: string) => sentences(text).map(([s, e]) => text.slice(s, e));
  it("does not end sentences at abbreviations, initials or decimals", () => {
    expect(split("Give approx. 2.5 mg, e.g. orally. Dr. Smith agreed! Then stop")).toEqual(["Give approx. 2.5 mg, e.g. orally.", "Dr. Smith agreed!", "Then stop"]);
  });
  it("ends Arabic sentences at the Arabic question mark", () => {
    expect(split("ما هو السائل؟ إنه شفاف.")).toEqual(["ما هو السائل؟", "إنه شفاف."]);
  });
  it("cuts very long sentences at a comma so each utterance stays short", () => {
    const long = `${"word ".repeat(30)}, ${"more ".repeat(30)}end.`;
    expect(sentences(long).length).toBeGreaterThan(1);
    expect(sentences(long).every(([s, e]) => e - s <= 180)).toBe(true);
  });
});
