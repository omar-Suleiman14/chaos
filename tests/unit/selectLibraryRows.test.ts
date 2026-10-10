import { describe, expect, it } from "vitest";
import { selectLibraryRows } from "../../lib/library/selectLibraryRows";
const rows = [
  { kind: "form" as const, title: "Form 2", status: "live" as const, responses: 12, updatedAt: 10 },
  { kind: "form" as const, title: "Form 10", status: "draft" as const, responses: 4, updatedAt: 20 },
  { kind: "quiz" as const, title: "Quiz", status: "live" as const, responses: 30, updatedAt: 30 },
  { kind: "form" as const, title: "Archived", status: "archived" as const, responses: 50, updatedAt: 40 },
];
describe("library row selector", () => {
  it("never includes archived entries or a different tab", () => {
    expect(selectLibraryRows(rows, "Forms", [], "edited", "desc").map(r => r.title)).toEqual(["Form 10", "Form 2"]);
    expect(selectLibraryRows(rows, "Quizzes", [], "edited", "desc").map(r => r.title)).toEqual(["Quiz"]);
  });
  it("preserves filtering, natural numeric name sorting and directions", () => {
    expect(selectLibraryRows(rows, "Forms", ["live"], "responses", "asc").map(r => r.title)).toEqual(["Form 2"]);
    expect(selectLibraryRows(rows, "Forms", [], "name", "asc").map(r => r.title)).toEqual(["Form 2", "Form 10"]);
    expect(selectLibraryRows(rows, "Forms", [], "name", "desc").map(r => r.title)).toEqual(["Form 10", "Form 2"]);
  });
  it("does not mutate cached Convex rows", () => {
    const original = [...rows]; selectLibraryRows(rows, "Forms", [], "edited", "asc"); expect(rows).toEqual(original);
  });
});
