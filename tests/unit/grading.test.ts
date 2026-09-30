import { describe, expect, it } from "vitest";
import { emptyDefinition } from "@/convex/formLogic";
import { gradeQuiz } from "@/convex/formQuiz";
import { encodeMultiAnswer, parseMultiAnswer, gradeMulti, gradeSingle, gradeWritten, matchKeywords, normalizeText } from "@/convex/grading";

describe("normalizeText", () => {
  it("folds case, Arabic diacritics, tatweel and letter variants", () => {
    expect(normalizeText("  HeLLo   World ")).toBe("hello world");
    expect(normalizeText("مُحَمَّد")).toBe(normalizeText("محمد"));
    expect(normalizeText("الإسلام")).toBe(normalizeText("الاسلام"));
    expect(normalizeText("مدرسة")).toBe(normalizeText("مدرسه"));
    expect(normalizeText("على")).toBe(normalizeText("علي"));
    expect(normalizeText("كــتاب")).toBe(normalizeText("كتاب"));
  });
});

describe("single choice", () => {
  it("matches after trim and case-fold, otherwise 0", () => {
    expect(gradeSingle("  TRUE ", "true", 4)).toEqual({ isCorrect: true, points: 4 });
    expect(gradeSingle("false", "true", 4)).toEqual({ isCorrect: false, points: 0 });
    expect(gradeSingle("", "", 4).points).toBe(0);
  });
});

describe("multi-select", () => {
  const correct = ["Red", "Blue"];
  it("needs the exact set", () => {
    expect(gradeMulti(["blue", " red"], correct, 6).points).toBe(6);
    expect(gradeMulti(["red"], correct, 6).points).toBe(0);
    expect(gradeMulti(["red", "blue", "green"], correct, 6).points).toBe(0);
  });
  it("does not let duplicates help", () => {
    expect(gradeMulti(["red", "red"], correct, 6).points).toBe(0);
    expect(gradeMulti(["red", "red", "blue"], correct, 6).points).toBe(6);
    expect(gradeMulti(["red", "red", "green"], correct, 6).points).toBe(0);
  });
});

describe("written keywords", () => {
  it("matches whole words, not substrings", () => {
    expect(matchKeywords("concatenate strings", ["cat"]).matched).toBe(0);
    expect(matchKeywords("The cat sat.", ["cat"]).matched).toBe(1);
    expect(matchKeywords("The cat-sat", ["Cat"]).matched).toBe(1);
  });
  it("matches phrases in order as whole words", () => {
    expect(matchKeywords("uses solar   energy daily", ["solar energy"]).matched).toBe(1);
    expect(matchKeywords("energy from solar", ["solar energy"]).matched).toBe(0);
  });
  it("matches Arabic with variants and diacritics", () => {
    expect(matchKeywords("الشَّمْسُ مصدر الطاقة", ["الشمس", "الطاقه"]).matched).toBe(2);
    expect(matchKeywords("أحمد ذهب إلى المدرسة", ["احمد", "مدرسه"]).matched).toBe(2); // the article is ignored
    expect(matchKeywords("ذهبنا بالسيارة وللمدرسة", ["سيارة", "المدرسة"]).matched).toBe(2);
    expect(matchKeywords("ليل طويل", ["ليل"]).matched).toBe(1); // short words keep their first letters
    expect(matchKeywords("أحمد ذهب إلى مدرسة", ["احمد", "مدرسه"]).matched).toBe(2);
  });
  it("never scores a blank answer", () => {
    expect(gradeWritten("   ", [], 10)).toEqual({ isCorrect: false, points: 0 });
    expect(gradeWritten("", ["sun"], 10)).toEqual({ isCorrect: false, points: 0 });
  });
  it("gives full marks when all match", () => {
    expect(gradeWritten("Sun and water", ["sun", "water"], 10)).toEqual({ isCorrect: true, points: 10 });
  });
  it("gives half marks at and above the threshold, 0 below", () => {
    const kws = ["a", "b", "c", "d"];
    expect(gradeWritten("a b", kws, 10, 50)).toEqual({ isCorrect: false, points: 5 }); // exactly 50%
    expect(gradeWritten("a", kws, 10, 50)).toEqual({ isCorrect: false, points: 0 }); // 25%
    expect(gradeWritten("a b c", kws, 10, 75)).toEqual({ isCorrect: false, points: 5 });
    expect(gradeWritten("a b", kws, 10, 75).points).toBe(0);
    expect(gradeWritten("a b", kws, 10).points).toBe(5); // default 50
    expect(gradeWritten("a", ["a", "b"], 5, 50).points).toBe(2.5);
    expect(gradeWritten("nothing", kws, 10, 0).points).toBe(0);
  });
  it("gives full marks when no keywords are set", () => {
    expect(gradeWritten("anything", [], 3).points).toBe(3);
  });
});

describe("quiz-mode forms", () => {
  const def = () => {
    const d = emptyDefinition("Quiz");
    d.quiz = { enabled: true };
    d.fields = [
      { id: "s", type: "choice", label: "S", required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 2 } },
      { id: "d", type: "dropdown", label: "D", required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["b"], points: 2 } },
      { id: "m", type: "multi_choice", label: "M", required: false, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], quiz: { correctOptionIds: ["x", "y"], points: 3 } },
    ];
    return d;
  };
  it("scores unanswered questions 0 and never exceeds the max", () => {
    expect(gradeQuiz(def(), {})).toMatchObject({ score: 0, maxScore: 7 });
    const full = gradeQuiz(def(), { s: "a", d: "b", m: ["x", "y"] })!;
    expect(full.score).toBe(7);
    expect(full.score).toBeLessThanOrEqual(full.maxScore);
  });
  it("ignores duplicates in checkboxes and requires the exact set", () => {
    expect(gradeQuiz(def(), { m: ["x", "x"] })!.score).toBe(0);
    expect(gradeQuiz(def(), { m: ["x", "x", "y"] })!.score).toBe(3);
    expect(gradeQuiz(def(), { m: ["x"] })!.score).toBe(0);
  });
  it("does not accept a list for a single-choice field", () => {
    expect(gradeQuiz(def(), { s: ["a", "a"] })!.score).toBe(0);
    expect(gradeQuiz(def(), { s: ["a", "b"] })!.score).toBe(0);
  });
});

describe("multi-select answer encoding", () => {
  const correct = ["Paris, France", "Lyon"];
  it("round-trips option text that contains a comma", () => {
    const sent = encodeMultiAnswer(["Lyon", "Paris, France"]);
    expect(parseMultiAnswer(sent)).toEqual(["Lyon", "Paris, France"]);
    expect(gradeMulti(parseMultiAnswer(sent), correct, 4)).toEqual({ isCorrect: true, points: 4 });
  });
  it("still reads the old comma-joined format", () => {
    expect(parseMultiAnswer("a,b, c")).toEqual(["a", "b", "c"]);
    expect(gradeMulti(parseMultiAnswer("Lyon,Berlin"), ["Lyon", "Berlin"], 2).isCorrect).toBe(true);
    expect(parseMultiAnswer("[draft, notes")).toEqual(["[draft", "notes"]);
  });
  it("is all or nothing: a missing, extra or wrong choice scores 0", () => {
    expect(gradeMulti(["Lyon"], correct, 4).points).toBe(0);
    expect(gradeMulti(["Lyon", "Paris, France", "Nice"], correct, 4).points).toBe(0);
    expect(gradeMulti([], correct, 4)).toEqual({ isCorrect: false, points: 0 });
  });
});
