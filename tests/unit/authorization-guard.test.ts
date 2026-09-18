import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const quizFunctions = readSource("convex/quizFunctions.ts");
const aiQuizMutations = readSource("convex/aiQuizMutations.ts");
const aiEditorChat = readSource("convex/aiEditorChat.ts");
const aiQuiz = readSource("convex/aiQuiz.ts");

function exportedBlock(source: string, name: string) {
  const marker = `export const ${name} =`;
  const start = source.indexOf(marker);
  expect(start, `${name} should remain exported`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/\nexport const /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("authorization helper guard", () => {
  it("keeps creator ownership comparisons centralized in authz.ts", () => {
    const directOwnershipComparison =
      /(creatorId|clerkId)\s*(?:===|!==)\s*identity\.subject|identity\.subject\s*(?:===|!==)\s*(creatorId|clerkId)/;

    expect(quizFunctions).not.toMatch(directOwnershipComparison);
    expect(aiQuizMutations).not.toMatch(directOwnershipComparison);
  });

  it.each([
    ["updateQuiz", "requireQuizOwner"],
    ["deleteQuiz", "requireQuizOwner"],
    ["addQuestion", "requireQuizOwner"],
    ["updateQuestion", "requireQuestionOwner"],
    ["deleteQuestion", "requireQuestionOwner"],
    ["getQuiz", "getQuizIfOwnerOrAdmin"],
    ["getQuizForOwner", "getQuizIfOwner"],
    ["getQuestions", "getQuizIfOwnerOrAdmin"],
    ["getQuizSessions", "getQuizIfOwner"],
    ["getSessionDetail", "getSessionIfOwnerOrAdmin"],
    ["overrideScore", "requireSessionOwner"],
    ["getQuizStatsEnhanced", "getQuizIfOwner"],
    ["getQuizBySlug", "canViewQuizAsRespondent"],
    ["getQuizByUsernameSlug", "canViewQuizAsRespondent"],
  ])("%s uses %s", (name, helper) => {
    expect(exportedBlock(quizFunctions, name)).toContain(helper);
  });

  it("guards AI job and editor entry points through owner-scoped queries/helpers", () => {
    expect(exportedBlock(aiQuizMutations, "cancelAIJob")).toContain("requireAIJobOwner");
    expect(exportedBlock(aiQuizMutations, "getAIJob")).toContain("getAIJobIfOwner");
    expect(exportedBlock(aiEditorChat, "editQuizWithAI")).toContain("getQuizForOwner");
    expect(exportedBlock(aiQuiz, "runAIQuizGeneration")).toContain("getAIJob");
  });
});
