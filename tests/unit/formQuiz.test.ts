import { describe, expect, it } from "vitest";
import { checkDefinition, emptyDefinition } from "@/convex/formLogic";
import { gradeQuiz, publicQuizDefinition } from "@/convex/formQuiz";

describe("form quiz mode", () => {
  const quiz = () => {
    const def = emptyDefinition("Knowledge check");
    def.quiz = { enabled: true };
    def.fields = [
      { id: "single", type: "choice", label: "One", required: true, options: [
        { id: "a", label: "A", score: 10 }, { id: "b", label: "B" },
      ], quiz: { correctOptionIds: ["a"], points: 2 } },
      { id: "multi", type: "multi_choice", label: "Many", required: false, options: [
        { id: "x", label: "X" }, { id: "y", label: "Y" }, { id: "z", label: "Z" },
      ], quiz: { correctOptionIds: ["x", "z"], points: 3 } },
    ];
    return def;
  };

  it("grades exact choice sets against the published definition", () => {
    expect(gradeQuiz(quiz(), { single: "a", multi: ["z", "x"] })).toMatchObject({ score: 5, maxScore: 5 });
    expect(gradeQuiz(quiz(), { single: "b", multi: ["x"] })).toMatchObject({ score: 0, maxScore: 5 });
    expect(gradeQuiz(quiz(), { single: "a" })).toMatchObject({ score: 2, maxScore: 5 });
  });

  it("does not send answer keys or option scores to respondents", () => {
    const source = quiz();
    const publicDef = publicQuizDefinition(source);
    expect(publicDef.fields[0].quiz).toBeUndefined();
    expect(publicDef.fields[0].options?.[0].score).toBeUndefined();
    expect(source.fields[0].quiz?.correctOptionIds).toEqual(["a"]);
    expect(source.fields[0].options?.[0].score).toBe(10);
    source.quiz = { enabled: false };
    expect(publicQuizDefinition(source).fields[0].quiz).toBeUndefined();
  });

  it("blocks invalid answer keys and calculated scores before publication", () => {
    const def = quiz();
    expect(checkDefinition(def).errors.join(" ")).toMatch(/remove calculated option scores/i);
    delete def.fields[0].options?.[0].score;
    def.fields[1].quiz!.correctOptionIds = ["missing"];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/missing option/i);
  });
});
