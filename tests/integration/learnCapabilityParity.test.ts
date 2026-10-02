import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

it("negotiates identical enforced Learn limits through MCP and integration v2", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Parity", access: "selected", itemRefs: [], scopes: ["lessons:read"] });
  const capabilities = await t.query(internal.learnIntegrations.capabilities, { tokenId: connection.tokenId, now: Date.now() });
  const mcp = await t.query(makeFunctionReference<"query", { userId: string }, { schemaVersion: number; limits: Record<string, number> }>("mcpLearn:getCapabilities"), { userId: creatorIdentity.subject });
  expect(capabilities.status).toBe(200);
  const body = capabilities.body as { lessonSchemaVersion: number; platformLimits: Record<string, number>; operations: string[]; scopes: string[] };
  expect(body.lessonSchemaVersion).toBe(mcp.schemaVersion);
  expect(body.platformLimits).toEqual(mcp.limits);
  expect(body.platformLimits.contextExcerpts).toBe(10);
  expect(body.platformLimits.flashcardsPerSet).toBe(500);
  expect(body.platformLimits.progressCompletedBlocks).toBe(body.platformLimits.blocks);
  expect(body.operations).toContain("progress.write");
  expect(body.operations).toContain("community.directory");
  expect(body.scopes).toEqual(["lessons:read"]);
  expect(body.operations).not.toContain("lesson.publish");
  await expect(t.query(makeFunctionReference<"query">("mcpLearn:getCapabilities"), { userId: "guessed" })).rejects.toThrow();
});
