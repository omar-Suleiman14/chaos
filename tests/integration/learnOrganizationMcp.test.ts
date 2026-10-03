import { describe, it, expect } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
const q = (name: string) =>
  makeFunctionReference<"query">("mcpOrganization:" + name);
const m = (name: string) =>
  makeFunctionReference<"mutation">("mcpOrganization:" + name);
const userId = "organization_owner",
  other = "organization_other";
const paginationOpts = { numItems: 20, cursor: null };
async function setup() {
  const t = createTestConvex();
  await t.run(async (ctx) => {
    for (const clerkId of [userId, other])
      await ctx.db.insert("users", {
        clerkId,
        username: clerkId,
        name: clerkId,
        email: clerkId + "@example.com",
        createdAt: 0,
      });
  });
  return t;
}
describe("organization trusted MCP actors", () => {
  it("requires existing active accounts on reads and writes", async () => {
    const t = await setup();
    await expect(
      t.query(q("listInstitutions"), { userId: "missing", paginationOpts }),
    ).rejects.toThrow("ACCOUNT_REQUIRED");
    await t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
        .first();
      await ctx.db.patch("users", u!._id, { isBanned: true });
    });
    await expect(
      t.query(q("listFolders"), { userId, parentId: null, paginationOpts }),
    ).rejects.toThrow("ACCOUNT_RESTRICTED");
    await expect(
      t.mutation(m("createFolder"), { userId, name: "x", parentId: null }),
    ).rejects.toThrow("ACCOUNT_RESTRICTED");
  });
  it("isolates folders, rejects cycles and makes repeat moves safe", async () => {
    const t = await setup();
    const root = await t.mutation(m("createFolder"), {
      userId,
      name: "root",
      parentId: null,
    });
    const child = await t.mutation(m("createFolder"), {
      userId,
      name: "child",
      parentId: root,
    });
    await expect(
      t.query(q("listFolderContents"), {
        userId: other,
        folderId: root,
        paginationOpts,
      }),
    ).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(
      t.mutation(m("moveFolder"), { userId, folderId: root, parentId: child }),
    ).rejects.toThrow("FOLDER_CYCLE");
    await expect(
      t.mutation(m("createFolder"), {
        userId: other,
        name: "foreign",
        parentId: root,
      }),
    ).rejects.toThrow("FOLDER_NOT_FOUND");
    for (let i = 0; i < 2; i++)
      await t.mutation(m("moveFolder"), {
        userId,
        folderId: child,
        parentId: null,
      });
    expect(
      (
        await t.query(q("listFolders"), {
          userId,
          parentId: null,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(2);
  });
  it("rejects foreign assets and filters stale ownership without exposing bytes", async () => {
    const t = await setup();
    const folderId = await t.mutation(m("createFolder"), {
      userId,
      name: "root",
      parentId: null,
    });
    const sourceId = await t.run((ctx) =>
      ctx.db.insert("learnSources", {
        ownerId: other,
        uploadedBy: other,
        metadata: { title: "private", kind: "file", origin: "upload" },
        metadataVisibility: "private",
        contentVisibility: "private",
        createdAt: 0,
        status: "active",
      }),
    );
    await expect(
      t.mutation(m("addFolderMember"), {
        userId,
        folderId,
        asset: { kind: "source", id: sourceId },
      }),
    ).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    await t.run((ctx) =>
      ctx.db.insert("folderMembers", {
        ownerId: userId,
        folderId,
        asset: { kind: "source", id: sourceId },
        createdAt: 0,
      }),
    );
    expect(
      (
        await t.query(q("listFolderContents"), {
          userId,
          folderId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
  });
  it("rejects cross-version curriculum parents", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => {
      const institutionId = await ctx.db.insert("curriculumInstitutions", {
        name: "School",
        key: "school",
      });
      const programId = await ctx.db.insert("curriculumPrograms", {
        institutionId,
        name: "Course",
        key: "course",
      });
      const versionId = await ctx.db.insert("curriculumVersions", {
        programId,
        name: "v1",
        key: "v1",
      });
      const otherVersion = await ctx.db.insert("curriculumVersions", {
        programId,
        name: "v2",
        key: "v2",
      });
      const parentId = await ctx.db.insert("curriculumNodes", {
        versionId: otherVersion,
        parentId: null,
        key: "node",
        name: "Node",
        kind: "subject",
        conceptKeys: [],
      });
      return { versionId, parentId };
    });
    await expect(
      t.query(q("listNodes"), { userId, ...ids, paginationOpts }),
    ).rejects.toThrow("Parent version mismatch");
  });
});

describe("organization durable limits and mapping coverage", () => {
  it("bounds depth and move traversal atomically", async () => {
    const t = await setup();
    let parentId = null;
    for (let i = 0; i < 8; i++)
      parentId = await t.mutation(m("createFolder"), {
        userId,
        name: "depth",
        parentId,
      });
    await expect(
      t.mutation(m("createFolder"), { userId, name: "overflow", parentId }),
    ).rejects.toThrow("FOLDER_DEPTH_LIMIT");
    const root = await t.mutation(m("createFolder"), {
      userId,
      name: "wide",
      parentId: null,
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 256; i++)
        await ctx.db.insert("folders", {
          ownerId: userId,
          name: "child",
          parentId: root,
          createdAt: 0,
          updatedAt: 0,
        });
    });
    await expect(
      t.mutation(m("moveFolder"), { userId, folderId: root, parentId: null }),
    ).rejects.toThrow("FOLDER_MOVE_LIMIT");
  });
  it("writes only owned current blocks and valid version/concept coverage", async () => {
    const t = await setup();
    const lessonId = (
      await t.mutation(
        makeFunctionReference<"mutation">("mcpLearn:createLesson"),
        {
          userId,
          metadata: {
            title: "Lesson",
            description: "",
            language: "en",
            tags: [],
          },
          document: {
            schemaVersion: 1,
            blocks: [
              {
                id: "current",
                type: "paragraph",
                text: "Text",
                citations: [],
                conceptIds: [],
              },
            ],
          },
        },
      )
    ).lessonId;
    const ids = await t.run(async (ctx) => {
      const institutionId = await ctx.db.insert("curriculumInstitutions", {
        key: "s",
        name: "School",
      });
      const programId = await ctx.db.insert("curriculumPrograms", {
        institutionId,
        key: "p",
        name: "Program",
      });
      const versionId = await ctx.db.insert("curriculumVersions", {
        programId,
        key: "v1",
        name: "One",
      });
      const otherVersion = await ctx.db.insert("curriculumVersions", {
        programId,
        key: "v2",
        name: "Two",
      });
      const nodeId = await ctx.db.insert("curriculumNodes", {
        versionId,
        parentId: null,
        key: "n",
        name: "Node",
        kind: "subject",
        conceptKeys: ["concept"],
      });
      return { versionId, otherVersion, nodeId };
    });
    const input = {
      userId,
      lessonId,
      versionId: ids.versionId,
      nodeId: ids.nodeId,
      conceptKeys: ["concept"],
      blockIds: ["current"],
    };
    await expect(
      t.mutation(m("createLessonMapping"), { ...input, userId: other }),
    ).rejects.toThrow("unauthorized");
    await expect(
      t.mutation(m("createLessonMapping"), {
        ...input,
        versionId: ids.otherVersion,
      }),
    ).rejects.toThrow("Node version mismatch");
    await expect(
      t.mutation(m("createLessonMapping"), { ...input, blockIds: ["stale"] }),
    ).rejects.toThrow("Invalid draft block ID");
    await expect(
      t.mutation(m("createLessonMapping"), {
        ...input,
        conceptKeys: ["unknown"],
      }),
    ).rejects.toThrow("Unknown concept");
    await expect(
      t.mutation(m("createLessonMapping"), {
        ...input,
        conceptKeys: [],
        blockIds: [],
      }),
    ).rejects.toThrow("Coverage required");
    await t.mutation(m("createLessonMapping"), { ...input, blockIds: [] });
    const mappings = await t.query(q("listLessonMappings"), {
      userId,
      lessonId,
      paginationOpts,
    });
    expect(mappings.page).toHaveLength(1);
    expect(mappings.page[0]).toMatchObject({
      lessonId,
      nodeId: ids.nodeId,
      conceptKeys: ["concept"],
      blockIds: [],
    });
    await expect(
      t.query(q("listLessonMappings"), {
        userId: other,
        lessonId,
        paginationOpts,
      }),
    ).rejects.toThrow("unauthorized");
    await t.run((ctx) =>
      ctx.db.patch("lessons", lessonId, { visibility: "public" }),
    );
    await expect(
      t.query(q("listLessonMappings"), {
        userId: other,
        lessonId,
        paginationOpts,
      }),
    ).rejects.toThrow("unauthorized");
    await expect(
      t.query(q("listLessonMappings"), {
        userId: "missing",
        lessonId,
        paginationOpts,
      }),
    ).rejects.toThrow("ACCOUNT_REQUIRED");
    await expect(
      t.query(q("listLessonMappings"), {
        userId,
        lessonId,
        paginationOpts: { numItems: 51, cursor: null },
      }),
    ).rejects.toThrow("Invalid pagination");
    await expect(t.mutation(m("createLessonMapping"), input)).rejects.toThrow(
      "Mapping already exists",
    );
    const secondNode = await t.run((ctx) =>
      ctx.db.insert("curriculumNodes", {
        versionId: ids.versionId,
        parentId: null,
        key: "second",
        name: "Second",
        kind: "module",
        conceptKeys: ["concept"],
      }),
    );
    await t.mutation(m("createLessonMapping"), {
      ...input,
      nodeId: secondNode,
    });
    const firstPage = await t.query(q("listLessonMappings"), {
      userId,
      lessonId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await t.query(q("listLessonMappings"), {
      userId,
      lessonId,
      paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
    });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
    expect(
      new Set(
        [...firstPage.page, ...secondPage.page].map(
          (mapping) => mapping.nodeId,
        ),
      ),
    ).toEqual(new Set([ids.nodeId, secondNode]));
  });
});

describe("curriculum module lookup", () => {
  it("resolves version-scoped natural names, keys and aliases without private content", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => {
      const institutionId = await ctx.db.insert("curriculumInstitutions", {
        key: "school",
        name: "School",
      });
      const programId = await ctx.db.insert("curriculumPrograms", {
        institutionId,
        key: "medicine",
        name: "Medicine",
      });
      const versionId = await ctx.db.insert("curriculumVersions", {
        programId,
        key: "v1",
        name: "One",
      });
      const otherVersion = await ctx.db.insert("curriculumVersions", {
        programId,
        key: "v2",
        name: "Two",
      });
      const nodeId = await ctx.db.insert("curriculumNodes", {
        versionId,
        parentId: null,
        key: "cardio-101",
        name: "Cardiovascular Physiology",
        kind: "module",
        conceptKeys: ["heart"],
      });
      const foreignId = await ctx.db.insert("curriculumNodes", {
        versionId: otherVersion,
        parentId: null,
        key: "cardio-101",
        name: "Cardiovascular Physiology",
        kind: "module",
        conceptKeys: [],
      });
      await ctx.db.insert("curriculumNodes", {
        versionId,
        parentId: null,
        key: "subject",
        name: "Cardiovascular Subject",
        kind: "subject",
        conceptKeys: [],
      });
      await ctx.db.insert("curriculumAliases", {
        scope: `nodes:${versionId}`,
        alias: "heart module",
        targetId: nodeId,
      });
      await ctx.db.insert("curriculumAliases", {
        scope: `nodes:${versionId}`,
        alias: "foreign alias",
        targetId: foreignId,
      });
      return { versionId, nodeId };
    });
    for (const query of ["cardiovascular", " CARDIO-101 ", "Heart Module"]) {
      const result = await t.query(q("searchModules"), {
        userId,
        versionId: ids.versionId,
        query,
        limit: 1,
      });
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]._id).toBe(ids.nodeId);
      expect(result.modules[0]).not.toHaveProperty("draft");
      expect(result.modules[0]).not.toHaveProperty("storageId");
    }
    expect(
      (
        await t.query(q("searchModules"), {
          userId,
          versionId: ids.versionId,
          query: "foreign alias",
        })
      ).modules,
    ).toEqual([]);
    await expect(
      t.query(q("searchModules"), {
        userId: "missing",
        versionId: ids.versionId,
        query: "heart",
      }),
    ).rejects.toThrow("ACCOUNT_REQUIRED");
    for (const input of [
      { query: " " },
      { query: "heart", limit: 51 },
      { query: "heart", limit: 1.5 },
    ])
      await expect(
        t.query(q("searchModules"), {
          userId,
          versionId: ids.versionId,
          ...input,
        }),
      ).rejects.toThrow("Invalid module search");
    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
        .unique();
      await ctx.db.patch("users", account!._id, { isBanned: true });
    });
    await expect(
      t.query(q("searchModules"), {
        userId,
        versionId: ids.versionId,
        query: "heart",
      }),
    ).rejects.toThrow("ACCOUNT_RESTRICTED");
  });
});
