/// <reference types="vite/client" />
import { convexTest } from "convex-test";

import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";

import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");
const identity = (subject: string) => ({
  subject,
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: `https://chaos.test.clerk.accounts.dev|${subject}`,
});
const paginationOpts = { cursor: null, numItems: 1 };
async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("admins", {
      clerkId: "admin",
      email: "a@example.com",
      grantedAt: 0,
    }),
  );
  const admin = t.withIdentity(identity("admin")),
    owner = t.withIdentity(identity("owner")),
    stranger = t.withIdentity(identity("stranger"));
  const institutionId = await admin.mutation(api.curricula.createInstitution, {
    key: "School",
    name: "School",
  });
  const programId = await admin.mutation(api.curricula.createProgram, {
    institutionId,
    key: "science",
    name: "Science",
  });
  const versionId = await admin.mutation(api.curricula.createVersion, {
    programId,
    key: "2025",
    name: "2025 edition",
  });
  const newVersionId = await admin.mutation(api.curricula.createVersion, {
    programId,
    key: "2026",
    name: "2026 edition",
  });
  const nodeId = await admin.mutation(api.curricula.createNode, {
    versionId,
    parentId: null,
    key: "cells",
    name: "Cells",
    kind: "subject",
    conceptKeys: ["cell"],
  });
  const lessonId = await t.run((ctx) =>
    ctx.db.insert("lessons", {
      ownerId: "owner",
      metadata: { title: "Cells", description: "", language: "en", tags: [] },
      revision: 1,
      status: "active",
      visibility: "private",
      communityState: "ok",
      createdAt: 0,
      updatedAt: 0,
      searchText: "cells",
      draft: {
        schemaVersion: 1,
        blocks: [
          {
            id: "block-1",
            text: "Cells",
            type: "paragraph",
            citations: [],
            conceptIds: [],
          },
        ],
      },
    }),
  );
  return {
    t,
    admin,
    owner,
    stranger,
    institutionId,
    programId,
    versionId,
    newVersionId,
    nodeId,
    lessonId,
    mapping: {
      lessonId,
      versionId,
      nodeId,
      conceptKeys: ["cell"],
      blockIds: ["block-1"],
    },
  };
}
describe("canonical curricula", () => {
  it("requires authentication and persisted admin status for every canonical write", async () => {
    const s = await setup();
    const writes = [
      () =>
        s.stranger.mutation(api.curricula.createInstitution, {
          key: "other",
          name: "Other",
        }),
      () =>
        s.stranger.mutation(api.curricula.createProgram, {
          institutionId: s.institutionId,
          key: "other",
          name: "Other",
        }),
      () =>
        s.stranger.mutation(api.curricula.createVersion, {
          programId: s.programId,
          key: "other",
          name: "Other",
        }),
      () =>
        s.stranger.mutation(api.curricula.createNode, {
          versionId: s.versionId,
          parentId: null,
          key: "other",
          name: "Other",
          kind: "custom",
          conceptKeys: [],
        }),
      () =>
        s.stranger.mutation(api.curricula.addAlias, {
          targetId: s.nodeId,
          alias: "Other",
        }),
    ];
    for (const write of writes)
      await expect(write()).rejects.toThrow("admin access");
    await expect(
      s.t.mutation(api.curricula.createInstitution, {
        key: "other",
        name: "Other",
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      s.t
        .withIdentity({ ...identity("stranger"), role: "admin" })
        .mutation(api.curricula.createInstitution, {
          key: "other",
          name: "Other",
        }),
    ).rejects.toThrow("admin access");
  });
  it("preserves old editions, rejects duplicates and cross-version parents, and allows flexible nesting", async () => {
    const s = await setup();
    await expect(
      s.admin.mutation(api.curricula.createVersion, {
        programId: s.programId,
        key: " 2025 ",
        name: "Replacement",
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      s.admin.mutation(api.curricula.createInstitution, {
        key: " SCHOOL ",
        name: "Replacement",
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      s.admin.mutation(api.curricula.createNode, {
        versionId: s.newVersionId,
        parentId: s.nodeId,
        key: "bad",
        name: "Bad",
        kind: "year",
        conceptKeys: [],
      }),
    ).rejects.toThrow("version mismatch");
    for (const kind of [
      "year",
      "semester",
      "module",
      "subject",
      "custom",
    ] as const) {
      await s.admin.mutation(api.curricula.createNode, {
        versionId: s.versionId,
        parentId: s.nodeId,
        key: kind,
        name: kind,
        kind,
        conceptKeys: [],
      });
    }
    const newNodeId = await s.admin.mutation(api.curricula.createNode, {
      versionId: s.newVersionId,
      parentId: null,
      key: "cells",
      name: "New cells",
      kind: "custom",
      conceptKeys: [],
    });
    expect(newNodeId).not.toBe(s.nodeId);
    await s.owner.mutation(api.curricula.createLessonMapping, s.mapping);
    const page1 = await s.t.query(api.curricula.listVersions, {
      programId: s.programId,
      paginationOpts,
    });
    const page2 = await s.t.query(api.curricula.listVersions, {
      programId: s.programId,
      paginationOpts: { ...paginationOpts, cursor: page1.continueCursor },
    });
    expect([...page1.page, ...page2.page].map((x) => x._id)).toEqual([
      s.versionId,
      s.newVersionId,
    ]);
    expect(page2.isDone).toBe(true);
    expect(
      (
        await s.t.query(api.curricula.listNodes, {
          versionId: s.versionId,
          parentId: null,
          paginationOpts,
        })
      ).page[0]._id,
    ).toBe(s.nodeId);
    expect(
      (
        await s.t.query(api.curricula.listPrograms, {
          institutionId: s.institutionId,
          paginationOpts,
        })
      ).page[0]._id,
    ).toBe(s.programId);
    expect(
      (await s.t.query(api.curricula.listInstitutions, { paginationOpts }))
        .page[0]._id,
    ).toBe(s.institutionId);
  });
  it("keeps aliases immutable and version-scoped", async () => {
    const s = await setup();
    const aliasId = await s.admin.mutation(api.curricula.addAlias, {
      targetId: s.nodeId,
      alias: " Cytology ",
    });
    expect(
      await s.admin.mutation(api.curricula.addAlias, {
        targetId: s.nodeId,
        alias: "cytology",
      }),
    ).toBe(aliasId);
    const other = await s.admin.mutation(api.curricula.createNode, {
      versionId: s.versionId,
      parentId: null,
      key: "other",
      name: "Other",
      kind: "module",
      conceptKeys: [],
    });
    await expect(
      s.admin.mutation(api.curricula.addAlias, {
        targetId: other,
        alias: "cytology",
      }),
    ).rejects.toThrow("already assigned");
    const newer = await s.admin.mutation(api.curricula.createNode, {
      versionId: s.newVersionId,
      parentId: null,
      key: "cells",
      name: "New cells",
      kind: "module",
      conceptKeys: [],
    });
    await s.admin.mutation(api.curricula.addAlias, {
      targetId: newer,
      alias: "cytology",
    });
    expect(
      (
        await s.t.query(api.curricula.resolveAlias, {
          scope: `nodes:${s.versionId}`,
          alias: "CYTOLOGY",
        })
      )?.targetId,
    ).toBe(s.nodeId);
  });
  it("restricts mapping writes, reads and removal to lesson owners, including admins", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.curricula.createLessonMapping, s.mapping),
    ).rejects.toThrow("Not authenticated");
    for (const actor of [s.stranger, s.admin])
      await expect(
        actor.mutation(api.curricula.createLessonMapping, s.mapping),
      ).rejects.toThrow("unauthorized");
    const mappingId = await s.owner.mutation(
      api.curricula.createLessonMapping,
      s.mapping,
    );
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, s.mapping),
    ).rejects.toThrow("already exists");
    for (const actor of [s.stranger, s.admin, s.t]) {
      await expect(
        actor.query(api.curricula.listLessonMappings, {
          lessonId: s.lessonId,
          paginationOpts,
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.curricula.removeLessonMapping, { mappingId }),
      ).rejects.toThrow();
    }
    expect(
      (
        await s.owner.query(api.curricula.listLessonMappings, {
          lessonId: s.lessonId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(1);
    await s.owner.mutation(api.curricula.removeLessonMapping, { mappingId });
    expect(
      (
        await s.owner.query(api.curricula.listLessonMappings, {
          lessonId: s.lessonId,
          paginationOpts,
        })
      ).page,
    ).toHaveLength(0);
  });
  it("rejects wrong versions, unknown concepts, stale/invalid blocks and invalid coverage", async () => {
    const s = await setup();
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, {
        ...s.mapping,
        versionId: s.newVersionId,
      }),
    ).rejects.toThrow("version mismatch");
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, {
        ...s.mapping,
        conceptKeys: ["unknown"],
      }),
    ).rejects.toThrow("Unknown concept");
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, {
        ...s.mapping,
        blockIds: ["published-only"],
      }),
    ).rejects.toThrow("Invalid draft block");
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, {
        ...s.mapping,
        blockIds: ["block-1", "block-1"],
      }),
    ).rejects.toThrow("Invalid coverage");
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, {
        ...s.mapping,
        blockIds: [],
        conceptKeys: [],
      }),
    ).rejects.toThrow("Coverage required");
    await s.t.run((ctx) =>
      ctx.db.patch("lessons", s.lessonId, {
        draft: { schemaVersion: 1, blocks: [] },
      }),
    );
    await expect(
      s.owner.mutation(api.curricula.createLessonMapping, s.mapping),
    ).rejects.toThrow("Invalid draft block");
  });
});
