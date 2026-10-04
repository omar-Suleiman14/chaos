import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { topLevelRouteFolders } from "../routeFolders";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const quizFunctions = readSource("convex/quizFunctions.ts");

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
  });

  it.each([
    ["updateQuiz", "requireQuizOwner"],
    ["deleteQuiz", "requireQuizOwner"],
    ["addQuestion", "requireQuizOwner"],
    ["updateQuestion", "requireQuestionOwner"],
    ["deleteQuestion", "requireQuestionOwner"],
    ["getQuiz", "getQuizIfOwnerOrAdmin"],
    ["getQuizForOwner", "getQuizIfOwner"],
    ["getQuestionsForOwner", "getQuizIfOwnerOrAdmin"],
    ["getQuizSessions", "getQuizIfOwner"],
    ["getSessionDetail", "getSessionIfOwnerOrAdmin"],
    ["overrideScore", "requireSessionOwner"],
    ["getQuizStatsEnhanced", "getQuizIfOwner"],
    ["getQuizByUsernameSlug", "canViewQuizAsRespondent"],
  ])("%s uses %s", (name, helper) => {
    expect(exportedBlock(quizFunctions, name)).toContain(helper);
  });

  it("requires sign-in in the proxy for every signed-in-only page, including the /print answer-key view", () => {
    const proxy = readSource("proxy.ts");
    const matcher = /createRouteMatcher\(\[([^\]]*)\]\)/.exec(proxy)?.[1] ?? "";
    for (const route of ["/dashboard(.*)", "/admin(.*)", "/print(.*)"]) expect(matcher).toContain(`"${route}"`);
    // Every page folder under app/ that is not public must be listed above.
    const publicTop = new Set(["[username]", "f", "sign-in", "sign-up", "docs", "chatgpt", "connect", "pricing", "privacy", "terms", "copyright", "api", "mcp", ".well-known", "opengraph-image",
      // Live game players join with a PIN and no account (host screens live under /dashboard).
      "play", "compare", "support", "card", "sitemap",
      // Published lessons, profiles and collections are readable without an account; writing needs sign-in.
      "learn"]);
    for (const folder of topLevelRouteFolders()) {
      if (publicTop.has(folder)) continue;
      expect(matcher, `app/${folder} is neither public nor protected`).toContain(`"/${folder}(.*)"`);
    }
  });
});
