import { expect, it, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

it("pages owned forms past the legacy 500-row inventory cap", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await t.run(async (ctx) => {
    for (let index = 0; index < 501; index++) {
      const title = `Inventory form ${index}`;
      await ctx.db.insert("forms", {
        ownerId: creatorIdentity.subject,
        title,
        shareId: `inventory-${index}`,
        status: "draft",
        draft: emptyDefinition(title),
        draftRevision: 1,
        settings: defaultFormSettings,
        responseCount: 0,
        partialCount: 0,
        createdAt: index,
        updatedAt: index,
      });
    }
  });

  const ids = new Set<string>();
  const source = "owned" as const;
  let cursor: string | null = null;
  let done = false;
  while (!done) {
    const result: FunctionReturnType<typeof api.forms.listMyFormsPage> = await owner.query(api.forms.listMyFormsPage, { source, paginationOpts: { numItems: 50, cursor } });
    expect(result.page.owned.length).toBeLessThanOrEqual(50);
    for (const form of result.page.owned) ids.add(form._id);
    expect(result.page.searchIndex).toHaveLength(result.page.owned.length);
    done = result.isDone;
    cursor = result.continueCursor;
  }

  expect(ids.size).toBe(501);
  const mcpResults = await t.query(internal.mcp.searchForms, { userId: creatorIdentity.subject, limit: 50 });
  expect(mcpResults.total).toBe(500);
  expect(mcpResults.truncated).toBe(true);
});
