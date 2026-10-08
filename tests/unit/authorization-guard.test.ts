import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/protectedRoutes";
import { topLevelRouteFolders } from "../routeFolders";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const quizFunctions = readSource("convex/quizFunctions.ts");

describe("authorization helper guard", () => {
  it("keeps creator ownership comparisons centralized in authz.ts", () => {
    const directOwnershipComparison =
      /(creatorId|clerkId)\s*(?:===|!==)\s*identity\.subject|identity\.subject\s*(?:===|!==)\s*(creatorId|clerkId)/;

    expect(quizFunctions).not.toMatch(directOwnershipComparison);
  });

  it("requires sign-in in the proxy for every signed-in-only page", () => {
    for (const root of ["/dashboard", "/admin", "/print", "/homework", "/auth"]) {
      for (const prefix of ["", "/en", "/ar"]) {
        expect(isProtectedPath(prefix + root)).toBe(true);
        expect(isProtectedPath(prefix + root + "/nested")).toBe(true);
        expect(isProtectedPath(prefix + root + "-public")).toBe(false);
      }
    }
    // Every page folder under app/ that is not public must be listed above.
    const publicTop = new Set(["ai", "forms-quizzes", "live-games", "open-source", "teams", "status", "changelog","[username]", "f", "sign-in", "sign-up", "docs", "chatgpt", "claude", "connect", "pricing", "privacy", "cookies", "terms", "copyright", "api", "mcp", ".well-known", "opengraph-image",
      // Live game players join with a PIN and no account (host screens live under /dashboard).
      "play", "compare", "support", "faq", "card", "sitemap",
      // Published lessons, profiles and collections are readable without an account; writing needs sign-in.
      "learn"]);
    for (const folder of topLevelRouteFolders()) {
      if (publicTop.has(folder)) continue;
      expect(isProtectedPath(`/${folder}`), `app/${folder} is neither public nor protected`).toBe(true);
    }
  });
});
