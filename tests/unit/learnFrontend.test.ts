import { describe, expect, it } from "vitest";
import { cloneWithNewIds, diffDocuments, excerpt, formatTimestamp, outline, parseAnnotations, parseTimestamp, parseYouTube, readingMinutes, youTubeEmbedUrl, type Block } from "@/lib/learn/doc";
import { formatLocator, fromChaosDocument, parseLocator, toChaosDocument } from "@/lib/learn/chaosDocument";
import { buildHandoffPrompt, handoffUrl, HANDOFF_URL_LIMIT } from "@/lib/learn/handoff";
import { lessonIndexable, lessonMetadata, lessonStructuredData } from "@/lib/learn/seo";
import { ancestors, searchLessons } from "@/lib/learn/search";
import { locateHighlights } from "@/components/learn/reader/BlockRenderer";
import type { CurriculumNode, Highlight, Lesson, LessonMeta } from "@/lib/learn/types";

const text = (t: string, styles: Record<string, boolean> = {}) => ({ type: "text", text: t, styles });
const block = (id: string, type: string, content: unknown = [], props: Record<string, unknown> = {}, children: Block[] = []): Block => ({ id, type, props, content: content as Block["content"], children });

const meta = (patch: Partial<LessonMeta> = {}): LessonMeta => ({ title: "Portal hypertension", description: "", tags: [], language: "en", curricula: [], indexing: "index", ...patch });
function lesson(patch: Partial<Lesson> = {}, metaPatch: Partial<LessonMeta> = {}): Lesson {
  const m = meta(metaPatch);
  const content = [block("h1", "heading", [text("Causes")], { level: 1 }), block("p1", "paragraph", [text("Cirrhosis raises resistance.")])];
  return {
    id: "lesson_1", ownerId: "u1", ownerName: "Mona", draft: { meta: m, content, updatedAt: 2 },
    published: { version: 1, meta: m, content, publishedAt: Date.UTC(2026, 8, 1) }, publishedDraftAt: 2,
    visibility: "public", sources: [], quizzes: [], stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 },
    moderation: "ok", quality: "none", createdAt: 1, updatedAt: 2, ...patch,
  };
}

describe("YouTube links and ranges", () => {
  it("accepts common link shapes and reads the start time", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90")).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
    expect(parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=1m30s")).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
    expect(parseYouTube("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ" });
    expect(parseYouTube("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ" });
  });
  it("rejects other hosts, bad ids and non-http schemes", () => {
    expect(parseYouTube("https://vimeo.com/123")).toBeNull();
    expect(parseYouTube("https://youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTube("javascript:alert(1)")).toBeNull();
    expect(parseYouTube("not a url")).toBeNull();
  });
  it("parses and formats timestamps", () => {
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("12:30")).toBe(750);
    expect(parseTimestamp("2m")).toBe(120);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("soon")).toBeNull();
    expect(formatTimestamp(3723)).toBe("1:02:03");
    expect(formatTimestamp(65)).toBe("1:05");
  });
  it("embeds privacy-enhanced with a valid range only", () => {
    expect(youTubeEmbedUrl("dQw4w9WgXcQ", 60, 120)).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ?");
    expect(youTubeEmbedUrl("dQw4w9WgXcQ", 60, 120)).toMatch(/start=60.*end=120/);
    expect(youTubeEmbedUrl("dQw4w9WgXcQ", 120, 60)).not.toContain("end=");
  });
});

describe("lesson documents", () => {
  const doc = [
    block("a", "heading", [text("Liver")], { level: 1 }),
    block("b", "paragraph", [text("Portal vein carries "), text("75%", { bold: true }), text(" of hepatic blood.")]),
    block("c", "heading", [text("")], { level: 2 }),
    block("d", "heading", [text("Collaterals")], { level: 4 }, [block("e", "paragraph", [text("Nested")])]),
  ];
  it("builds an outline from non-empty headings, capping levels at 3", () => {
    expect(outline(doc)).toEqual([{ id: "a", level: 1, text: "Liver" }, { id: "d", level: 3, text: "Collaterals" }]);
  });
  it("estimates at least one minute of reading", () => {
    expect(readingMinutes(doc)).toBe(1);
    expect(readingMinutes([block("x", "paragraph", [text(Array(1000).fill("word").join(" "))])])).toBe(5);
  });
  it("diffs by block id", () => {
    const after = [doc[0], block("b", "paragraph", [text("Changed")]), block("z", "paragraph", [text("New")])];
    const changes = diffDocuments(doc, after);
    expect(changes.find((c) => c.blockId === "b")?.kind).toBe("changed");
    expect(changes.find((c) => c.blockId === "z")?.kind).toBe("added");
    expect(changes.filter((c) => c.kind === "removed").map((c) => c.blockId).sort()).toEqual(["c", "d", "e"]);
  });
  it("gives forks fresh block ids without touching the source", () => {
    let n = 0;
    const copy = cloneWithNewIds(doc, () => `n${n++}`);
    expect(copy.map((b) => b.id)).toEqual(["n0", "n1", "n2", "n3"]);
    expect(copy[3].children[0].id).toBe("n4");
    expect(doc[0].id).toBe("a");
  });
  it("keeps only valid hotspot annotations", () => {
    expect(parseAnnotations("")).toEqual({ v: 1, items: [] });
    expect(parseAnnotations("{broken")).toEqual({ v: 1, items: [] });
    const layer = parseAnnotations(JSON.stringify({ v: 1, items: [{ id: "1", x: 0.5, y: 0.2, label: "Portal vein" }, { id: "2", x: 3, y: 0, label: "off image" }] }));
    expect(layer.items.map((a) => a.id)).toEqual(["1"]);
  });
  it("shortens excerpts at a word boundary", () => {
    expect(excerpt("alpha beta gamma delta epsilon", 20)).toBe("alpha beta gamma…");
    // A boundary that would drop most of the excerpt is not used.
    expect(excerpt("one two three four five", 12)).toBe("one two thre…");
  });
});

describe("citation locators", () => {
  it("parses English, Arabic and time locators", () => {
    expect(parseLocator("page 23")).toEqual({ kind: "page", page: 23 });
    expect(parseLocator("p. 7")).toEqual({ kind: "page", page: 7 });
    expect(parseLocator("صفحة ٢٣")).toEqual({ kind: "page", page: 23 });
    expect(parseLocator("slide 4")).toEqual({ kind: "slide", slide: 4 });
    expect(parseLocator("1:00-2:30")).toEqual({ kind: "time", start: 60, end: 150 });
    expect(parseLocator("Portal hypertension section")).toEqual({ kind: "section", label: "Portal hypertension section" });
    expect(parseLocator("2:30-1:00")).toEqual({ kind: "section", label: "2:30-1:00" });
  });
  it("formats locators back for readers", () => {
    expect(formatLocator({ kind: "page", page: 23 })).toBe("page 23");
    expect(formatLocator({ kind: "slide", slide: 4 }, "ar")).toBe("شريحة 4");
  });
});

describe("backend document conversion", () => {
  const editorDoc = [
    block("h", "heading", [text("Causes")], { level: 2 }),
    block("p", "paragraph", [text("Bold", { bold: true }), { type: "citation", props: { sourceId: "src1", locator: "page 23" } }]),
    block("l", "bulletListItem", [text("Item")], {}, [block("l2", "bulletListItem", [text("Nested")])]),
    block("co", "callout", [text("Watch out")], { tone: "warning" }),
    block("dv", "divider"),
    block("yt", "youtube", undefined, { videoId: "dQw4w9WgXcQ", start: 10, end: 0, caption: "Why" }),
    block("im", "image", undefined, { url: "chaos-learn-file:x", alt: "Liver", caption: "" }),
  ];
  it("maps supported blocks, keeps text of unsupported ones and reports every loss", () => {
    const { document, lost } = toChaosDocument(editorDoc);
    expect(document.schemaVersion).toBe(1);
    expect(document.blocks.find((b) => b.id === "p")?.citations).toEqual([{ sourceId: "src1", locator: { kind: "page", page: 23 } }]);
    expect(document.blocks.find((b) => b.id === "l2")?.parentId).toBe("l");
    expect(document.blocks.find((b) => b.id === "co")).toMatchObject({ type: "paragraph", text: "Watch out" });
    expect(document.blocks.find((b) => b.id === "yt")).toMatchObject({ type: "youtube", start: 10 });
    expect(document.blocks.some((b) => b.id === "im")).toBe(false);
    expect(new Set(lost)).toEqual(new Set(["formatting", "callout", "divider", "imageUrl"]));
  });
  it("uploads resolve images to backend sources", () => {
    const { document, lost } = toChaosDocument([editorDoc[6]], { imageSourceId: () => "srcImg" });
    expect(document.blocks[0]).toMatchObject({ type: "image", sourceId: "srcImg", alt: "Liver" });
    expect(lost).toEqual([]);
  });
  it("round-trips structure back into editor blocks", () => {
    const { document } = toChaosDocument(editorDoc.slice(0, 3));
    const back = fromChaosDocument(document);
    expect(back.map((b) => b.id)).toEqual(["h", "p", "l"]);
    expect(back[2].children[0].id).toBe("l2");
    expect(JSON.stringify(back[1].content)).toContain("\"citation\"");
  });
});

describe("Ask ChatGPT / Ask Claude handoff", () => {
  it("includes only what the person kept", () => {
    const prompt = buildHandoffPrompt({ action: "simplify", language: "en", lessonTitle: "Liver", selection: "Portal vein\ncarries blood", sources: ["Lecture 8 · page 23"] });
    expect(prompt).toContain("simpler words");
    expect(prompt).toContain("> Portal vein\n> carries blood");
    expect(prompt).toContain("Lecture 8 · page 23");
    expect(prompt).not.toContain("http");
  });
  it("uses the person's question and Arabic labels", () => {
    const prompt = buildHandoffPrompt({ action: "explain", language: "ar", lessonTitle: "الكبد", selection: "نص", question: "لماذا؟" });
    expect(prompt.startsWith("سؤالي: لماذا؟")).toBe(true);
  });
  it("pre-fills short prompts and falls back to the clipboard for long ones", () => {
    expect(handoffUrl("chatgpt", "hello")).toEqual({ url: "https://chatgpt.com/?q=hello", prefilled: true });
    expect(handoffUrl("claude", "a b").url).toBe("https://claude.ai/new?q=a%20b");
    const long = handoffUrl("claude", "x".repeat(HANDOFF_URL_LIMIT));
    expect(long).toEqual({ url: "https://claude.ai/new", prefilled: false });
  });
});

describe("lesson SEO", () => {
  it("indexes only public, published, opted-in lessons in good standing", () => {
    expect(lessonIndexable(lesson())).toBe(true);
    expect(lessonIndexable(lesson({ visibility: "unlisted" }))).toBe(false);
    expect(lessonIndexable(lesson({ moderation: "under_review" }))).toBe(false);
    expect(lessonIndexable(lesson({}, { indexing: "noindex" }))).toBe(false);
    expect(lessonIndexable(lesson({ published: undefined }))).toBe(false);
  });
  it("builds canonical metadata and structured data from the published version", () => {
    const md = lessonMetadata(lesson());
    expect(md.alternates?.canonical).toBe("/learn/lesson_1");
    expect(md.robots).toEqual({ index: true, follow: true });
    const ld = lessonStructuredData(lesson(), "https://chaos.fail");
    expect(ld?.["@type"]).toBe("LearningResource");
    expect(ld?.hasPart[0]).toMatchObject({ name: "Causes", url: "https://chaos.fail/learn/lesson_1#h1" });
    expect(lessonStructuredData(lesson({ visibility: "unlisted" }), "https://chaos.fail")).toBeNull();
  });
  it("hides unavailable lessons from search", () => {
    expect(lessonMetadata(null).robots).toEqual({ index: false, follow: false });
    expect(lessonMetadata(lesson({ moderation: "removed" })).robots).toEqual({ index: false, follow: false });
  });
});

describe("Explore search", () => {
  const nodes: Record<string, CurriculumNode> = {
    uni: { id: "uni", kind: "university", name: "Cairo University" },
    prog: { id: "prog", kind: "program", name: "Medicine", parentId: "uni" },
    v26: { id: "v26", kind: "version", name: "2026", parentId: "prog", current: true },
    mod: { id: "mod", kind: "module", name: "GIT", parentId: "v26" },
  };
  const ref = { moduleId: "mod", versionId: "v26", path: ["Cairo University", "Medicine", "GIT"], versionLabel: "2026" };
  const a = lesson({ id: "a" }, { curricula: [ref], tags: ["liver"] });
  const b = lesson({ id: "b", ownerId: "u2" }, { title: "Renal physiology", language: "ar" });
  it("walks up the curriculum tree", () => {
    expect(ancestors(nodes, "mod").map((n) => n.id)).toEqual(["mod", "v26", "prog", "uni"]);
  });
  it("filters by university, topic, language and author", () => {
    expect(searchLessons([a, b], nodes, { universityId: "uni" }).map((l) => l.id)).toEqual(["a"]);
    expect(searchLessons([a, b], nodes, { topic: "Liver" }).map((l) => l.id)).toEqual(["a"]);
    expect(searchLessons([a, b], nodes, { language: "ar" }).map((l) => l.id)).toEqual(["b"]);
    expect(searchLessons([a, b], nodes, { creatorId: "u2" }).map((l) => l.id)).toEqual(["b"]);
  });
  it("matches text in the title and module path", () => {
    expect(searchLessons([a, b], nodes, { q: "renal" }).map((l) => l.id)).toEqual(["b"]);
    expect(searchLessons([a, b], nodes, { q: "GIT" }).map((l) => l.id)).toEqual(["a"]);
  });
});

describe("private highlights", () => {
  const h = (quote: string, offset: number): Highlight => ({ id: quote + offset, lessonId: "l", blockId: "b", quote, offset, color: "yellow", createdAt: 0 });
  it("anchors to the occurrence nearest the saved offset", () => {
    const text = "vein ... vein ... vein";
    expect(locateHighlights(text, [h("vein", 9)])[0]).toMatchObject({ start: 9, end: 13 });
    expect(locateHighlights(text, [h("vein", 30)])[0].start).toBe(18);
  });
  it("drops highlights whose text no longer exists", () => {
    expect(locateHighlights("edited text", [h("vein", 0)])).toEqual([]);
  });
});
