import { describe, expect, it } from "vitest";
import { buildIndex, normalize, search, searchIndex, splitByRanges, stripStopwords, withinOneEdit } from "@/lib/search";

describe("normalize", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalize("Café Ünï")).toBe("cafe uni");
  });
  it("normalizes Arabic", () => {
    expect(normalize("مَدْرَسَة")).toBe("مدرسه");
    expect(normalize("أحمد إبراهيم آمن")).toBe("احمد ابراهيم امن");
    expect(normalize("مصطفى")).toBe("مصطفي");
    expect(normalize("كتـــاب")).toBe("كتاب");
  });
});

describe("withinOneEdit", () => {
  it("accepts one substitution, insertion or deletion", () => {
    expect(withinOneEdit("survey", "surwey")).toBe(true);
    expect(withinOneEdit("survey", "surveys")).toBe(true);
    expect(withinOneEdit("survey", "surve")).toBe(true);
    expect(withinOneEdit("survey", "sruvey")).toBe(false);
  });
});

const docs = [
  { id: "a", title: "Customer feedback", extra: "Form", body: "How satisfied are you with our delivery? Options: Very happy, Unhappy" },
  { id: "b", title: "Math quiz", extra: "Quiz", body: "What is the capital of France? Paris, Berlin, Madrid. Customer" },
  { id: "c", title: "Events", extra: "Form", body: "Which workshop will you attend? Photography, Pottery" },
  { id: "d", title: "استبيان المدرسة", extra: "Form", body: "ما رأيك في المدرسة؟" },
];

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search(docs, "  ")).toEqual([]);
  });

  it("matches by title prefix and ranks title above body", () => {
    const r = search(docs, "custom");
    expect(r.map((x) => x.doc.id)).toEqual(["a", "b"]);
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });

  it("requires every word to match", () => {
    expect(search(docs, "customer delivery").map((x) => x.doc.id)).toEqual(["a"]);
    expect(search(docs, "customer zebra")).toEqual([]);
  });

  it("finds words deep inside the body and returns a highlighted snippet", () => {
    const [hit] = search(docs, "potter");
    expect(hit.doc.id).toBe("c");
    expect(hit.snippet).toBeDefined();
    const marked = splitByRanges(hit.snippet!.text, hit.snippet!.ranges).filter((p) => p.mark).map((p) => p.text);
    expect(marked).toEqual(["Potter"]);
  });

  it("marks the typed prefix in the title", () => {
    const [hit] = search(docs, "math");
    expect(splitByRanges(hit.doc.title, hit.titleRanges).filter((p) => p.mark).map((p) => p.text)).toEqual(["Math"]);
  });

  it("matches the kind", () => {
    expect(search(docs, "quiz")[0].doc.id).toBe("b");
  });

  it("is diacritic and Arabic-variant insensitive", () => {
    expect(search(docs, "مدرسة").map((x) => x.doc.id)).toContain("d");
    expect(search(docs, "مَدرسه").map((x) => x.doc.id)).toContain("d");
    expect(search([{ id: "x", title: "Café menu" }], "cafe")).toHaveLength(1);
  });

  it("tolerates one typo in words of 5+ letters, scored lower", () => {
    const exact = search(docs, "photography")[0];
    const typo = search(docs, "photografy");
    expect(typo).toHaveLength(0); // two edits
    const one = search(docs, "photogrphy");
    expect(one[0].doc.id).toBe("c");
    expect(one[0].score).toBeLessThan(exact.score);
    // Short words do not get typo tolerance.
    expect(search(docs, "mth")).toHaveLength(0);
  });

  it("puts an exact title above a partial one and keeps input order on ties", () => {
    const list = [{ id: "1", title: "Events planning" }, { id: "2", title: "Events" }, { id: "3", title: "Events planning" }];
    expect(search(list, "events").map((x) => x.doc.id)).toEqual(["2", "1", "3"]);
  });

  it("respects the limit and reuses an index", () => {
    const index = buildIndex(docs);
    expect(searchIndex(index, "o", 1)).toHaveLength(1);
    expect(searchIndex(index, "france")[0].doc.id).toBe("b");
  });
});

describe("splitByRanges", () => {
  it("splits text around ranges", () => {
    expect(splitByRanges("hello world", [[6, 11]])).toEqual([{ text: "hello ", mark: false }, { text: "world", mark: true }]);
  });
});

describe("stripStopwords", () => {
  it("turns a question into its keywords", () => {
    expect(stripStopwords("How do I change my username?")).toBe("change username");
  });
  it("keeps the query when only filler words are present", () => {
    expect(stripStopwords("how to")).toBe("how to");
  });
});
