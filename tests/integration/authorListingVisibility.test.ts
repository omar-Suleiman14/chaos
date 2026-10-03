import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

afterEach(() => vi.unstubAllEnvs());

it("defaults to listed, hides all directory transports, and restores listings without changing publications", async () => {
  const t = createTestConvex();
  const identity = { ...creatorIdentity, subject: "user_authorvisibility", tokenIdentifier: `${creatorIdentity.issuer}|user_authorvisibility` };
  const owner = t.withIdentity(identity);
  const userId = await t.run(ctx => ctx.db.insert("users", { clerkId: identity.subject, username: "casey", name: "Casey", email: identity.email, createdAt: 1 }));
  const lessonId = await owner.mutation(api.lessons.create, {
    metadata: { title: "Public lesson", description: "", language: "en", tags: [] },
    document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Content", citations: [], conceptIds: [] }] },
  });
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  const paginationOpts = { numItems: 25, cursor: null };
  const publicArgs = { paginationOpts: { numItems: 24, cursor: null } };
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Directory", access: "selected", itemRefs: [], scopes: ["community:read"] });
  const secret = "author-list-mcp-test-secret-at-least-32-characters";
  vi.stubEnv("CHAOS_MCP_SECRET", secret);
  const assets = (await t.run(ctx => ctx.db.get("users", userId)))!.publicAuthorAssets;
  expect(assets).toBe(1);
  const directCard = await t.query(api.memberCards.byUsername, { username: "casey" });
  const checkLists = async (listed: boolean) => {
    expect((await t.query(api.publicAuthors.browse, publicArgs)).page).toHaveLength(listed ? 1 : 0);
    for (const creatorMatch of ["username", "name"] as const) {
      const input = { kind: "creator" as const, creatorMatch, text: "casey", paginationOpts };
      expect((await t.query(api.learnDiscovery.search, input)).page).toHaveLength(listed ? 1 : 0);
      const mcp = await t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId: identity.subject, tool: "search_learn_directory", input }) });
      expect(mcp.status).toBe(200);
      expect((await mcp.json()).result.page).toHaveLength(listed ? 1 : 0);
      const response = await t.fetch(`/api/integrations/v2/community/directory?kind=creator&creatorMatch=${creatorMatch}&text=casey&limit=25`, { headers: { Authorization: `Bearer ${connection.token}` } });
      expect(response.status).toBe(200);
      expect((await response.json()).page).toHaveLength(listed ? 1 : 0);
    }
  };
  await checkLists(true);
  await owner.mutation(api.publicAuthors.setListingVisibility, { visible: false });
  await checkLists(false);
  expect((await t.run(ctx => ctx.db.get("users", userId)))!.publicAuthorAssets).toBe(assets);
  expect(await t.query(api.memberCards.byUsername, { username: "casey" })).toEqual(directCard);
  expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))!.visibility).toBe("public");
  await owner.mutation(api.publicAuthors.setListingVisibility, { visible: true });
  await checkLists(true);
});

it("updates only the authenticated active account and rejects anonymous or supplied user IDs", async () => {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  await expect(t.mutation(api.publicAuthors.setListingVisibility, { visible: false })).rejects.toThrow("Not authenticated");
  await other.mutation(api.publicAuthors.setListingVisibility, { visible: false });
  expect((await owner.query(api.quizFunctions.getCurrentUser))!.hideFromAuthorLists).toBeUndefined();
  expect((await other.query(api.quizFunctions.getCurrentUser))!.hideFromAuthorLists).toBe(true);
  await expect(other.mutation(api.publicAuthors.setListingVisibility, { visible: false, userId: creatorIdentity.subject } as never)).rejects.toThrow();
  const otherUser = (await other.query(api.quizFunctions.getCurrentUser))!;
  await t.run(ctx => ctx.db.patch("users", otherUser._id, { isBanned: true }));
  await expect(other.mutation(api.publicAuthors.setListingVisibility, { visible: true })).rejects.toThrow("ACCOUNT_BANNED");
});

it("keeps pagination cursors when an opted-out author fills a scanned page", async () => {
  const t = createTestConvex();
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: "older", username: "older", name: "Older", email: "o@example.test", createdAt: 1, publicAuthorAssets: 1 });
    await ctx.db.insert("users", { clerkId: "hidden", username: "hidden", name: "Hidden", email: "h@example.test", createdAt: 2, publicAuthorAssets: 1, hideFromAuthorLists: true });
  });
  const first = await t.query(api.publicAuthors.browse, { paginationOpts: { numItems: 1, cursor: null } });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  const next = await t.query(api.publicAuthors.browse, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
  expect(next.page[0].username).toBe("older");
});
