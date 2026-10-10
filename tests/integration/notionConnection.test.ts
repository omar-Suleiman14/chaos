import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { sha256Hex } from "@/convex/serverUtils";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

beforeEach(() => {
  vi.stubEnv("NOTION_CLIENT_ID", "notion-test-client");
  vi.stubEnv("NOTION_CLIENT_SECRET", "notion-test-secret");
  vi.stubEnv("NOTION_REDIRECT_URI", "https://example.convex.site/api/notion/oauth/callback");
  vi.stubEnv("NOTION_ENCRYPTION_KEY", "notion-test-key-01234567890123456789");
  vi.stubEnv("CHAOS_APP_URL", "https://chaos.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("Notion connection: ownership and OAuth", () => {
  it("reports whether Notion OAuth is configured without exposing its settings", async () => {
    const t = createTestConvex();
    expect(await t.query(api.notion.available, {})).toBe(true);
    vi.stubEnv("NOTION_ENCRYPTION_KEY", "too-short");
    expect(await t.query(api.notion.available, {})).toBe(false);
  });

  it("requires a one-use, expiring OAuth state and never shows the stored token", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const authorizeUrl = new URL(await owner.mutation(api.notion.beginConnect, { locale: "en" }));
    expect(authorizeUrl.hostname).toBe("api.notion.com");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toContain("/api/notion/oauth/callback");
    const state = authorizeUrl.searchParams.get("state")!;
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    const payload = {
      stateHash: await sha256Hex(state), workspaceId: "workspace-1",
      workspaceName: "My Notion", tokenCiphertext: "private-encrypted-value", botId: "bot-1",
    };
    await t.mutation(internal.notion.oauthComplete, payload);
    expect(await owner.query(api.notion.connection, {})).toEqual({
      workspaceName: "My Notion", workspaceId: "workspace-1",
      dataSourceTitle: null, dataSourceId: null, connected: true,
    });
    expect(JSON.stringify(await owner.query(api.notion.connection, {}))).not.toContain("private-encrypted-value");
    await expect(t.mutation(internal.notion.oauthComplete, payload)).rejects.toThrow(/state expired or already used/);
  });

  it("keeps Notion state and draft creation isolated to the authenticated owner", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    const other = t.withIdentity(otherCreatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    const connectionId = await t.run(ctx => ctx.db.insert("notionConnections", {
      ownerId: creatorIdentity.subject, workspaceId: "ws", workspaceName: "Notes",
      tokenCiphertext: "ciphertext", botId: "bot", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const metadata = { title: "Imported private lesson", description: "Notes", language: "en", tags: [] };
    const document = { schemaVersion: 1 as const, blocks: [
      { id: "intro", type: "paragraph" as const, text: "Source page", citations: [], conceptIds: [] },
    ] };
    expect(await other.query(api.notion.connection, {})).toBeNull();
    await expect(other.mutation(internal.notion.createImportedLesson, {
      connectionId, pageId: "a".repeat(32), metadata, document,
    })).rejects.toThrow(/NOTION_NOT_CONNECTED/);
    const first = await owner.mutation(internal.notion.createImportedLesson, {
      connectionId, pageId: "a".repeat(32), metadata, document,
    });
    const duplicate = await owner.mutation(internal.notion.createImportedLesson, {
      connectionId, pageId: "a".repeat(32), metadata, document,
    });
    expect(duplicate).toBe(first);
    const stored = await t.run(ctx => ctx.db.get("lessons", first));
    expect(stored).toMatchObject({ ownerId: creatorIdentity.subject, visibility: "private", revision: 0 });
    expect(stored?.publishedVersionId).toBeUndefined();
    await other.mutation(api.notion.disconnect, {});
    expect(await owner.query(api.notion.connection, {})).toMatchObject({ connected: true });
    await expect(other.mutation(internal.notion.storeDataSource, { connectionId, dataSourceId: "b".repeat(32), title: "Scores" })).rejects.toThrow(/NOTION_NOT_CONNECTED/);
    await owner.mutation(api.notion.disconnect, {});
    expect(await owner.query(api.notion.connection, {})).toBeNull();
  });
});
