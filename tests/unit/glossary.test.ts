import { describe, expect, it } from "vitest";
import { findEntry, glossaryMatcher, splitTerms, type GlossaryEntry } from "@/lib/learn/glossary";

const ventricle: GlossaryEntry = { term: "ventricle", aliases: ["ventricles"], definition: "A lower heart chamber.", translation: "بطين", language: "ar" };
const left: GlossaryEntry = { term: "left ventricle", definition: "The chamber that pumps blood to the body." };
const matcher = glossaryMatcher([ventricle, left]);

describe("glossary matching", () => {
  it("prefers the longest term, matches aliases and ignores case", () => {
    expect(splitTerms("The Left Ventricle and both ventricles", matcher, new Set())).toEqual(["The ", { text: "Left Ventricle", entry: left }, " and both ", { text: "ventricles", entry: ventricle }]);
  });
  it("marks each term once per seen set and never inside longer words", () => {
    const seen = new Set<GlossaryEntry>();
    expect(splitTerms("ventricle, ventricle, interventricles", matcher, seen)).toEqual([{ text: "ventricle", entry: ventricle }, ", ventricle, interventricles"]);
    expect(splitTerms("ventricle again", matcher, seen)).toEqual(["ventricle again"]);
  });
  it("matches Arabic terms on word boundaries", () => {
    const heart: GlossaryEntry = { term: "القلب", definition: "The heart." };
    expect(splitTerms("وظيفة القلب مهمة", glossaryMatcher([heart]), new Set())).toEqual(["وظيفة ", { text: "القلب", entry: heart }, " مهمة"]);
  });
  it("looks up a selection and handles an empty glossary", () => {
    expect(findEntry(matcher, " Ventricles ")).toBe(ventricle);
    expect(glossaryMatcher([])).toBeNull();
    expect(splitTerms("text", null, new Set())).toEqual(["text"]);
  });
});
