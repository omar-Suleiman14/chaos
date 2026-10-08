import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
const actor = "file_owner",
  other = "file_other";
const action = (name: string) =>
  makeFunctionReference<"action">(`studySourceUploads:${name}`);
const mutation = (name: string) =>
  makeFunctionReference<"mutation">(`studySourceUploads:${name}`);
async function setup() {
  const t = createTestConvex();
  await t.run(async (ctx) => {
    for (const clerkId of [actor, other])
      await ctx.db.insert("users", {
        clerkId,
        username: clerkId,
        name: clerkId,
        email: `${clerkId}@example.com`,
        plan: "pro",
        createdAt: 0,
      });
  });
  return t;
}
const args = {
  userId: actor,
  key: "client-transfer",
  totalChunks: 2,
  contentType: "application/pdf",
  metadata: {
    kind: "pdf" as const,
    title: "Lecture",
    origin: "Explicit Claude upload",
  },
};
it("resumes chunk transfer, verifies bytes, deduplicates completed files and authorizes file reads separately", async () => {
  const t = await setup();
  const first = await t.action(action("upload"), {
    ...args,
    index: 0,
    data: btoa("%PDF-1.7\n"),
  });
  expect(first).toMatchObject({ receivedChunks: 1, sourceId: null });
  expect(
    await t.action(action("upload"), {
      ...args,
      index: 0,
      data: btoa("%PDF-1.7\n"),
    }),
  ).toEqual(first);
  const done = await t.action(action("upload"), {
    ...args,
    index: 1,
    data: btoa("lecture data"),
  });
  expect(done.sourceId).not.toBeNull();
  expect(
    await t.action(action("upload"), {
      ...args,
      index: 1,
      data: btoa("lecture data"),
    }),
  ).toEqual(done);
  const content = await t.action(action("readContent"), {
    userId: actor,
    sourceId: done.sourceId,
  });
  expect(atob(content.data)).toBe("%PDF-1.7\nlecture data");
  expect(content.nextOffset).toBeNull();
  await expect(
    t.action(action("readContent"), { userId: other, sourceId: done.sourceId }),
  ).rejects.toThrow("FORBIDDEN");
  await t.action(action("upload"), {
    ...args,
    key: "other-transfer",
    index: 0,
    data: btoa("%PDF-1.7\n"),
  });
  expect(
    (
      await t.action(action("upload"), {
        ...args,
        key: "other-transfer",
        index: 1,
        data: btoa("lecture data"),
      })
    ).sourceId,
  ).toBe(done.sourceId);
  expect(
    await t.run((ctx) => ctx.db.query("learnSources").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
});
it("rejects altered retries, oversized chunks, invalid MIME signatures and missing chunk indices", async () => {
  const t = await setup();
  await t.action(action("upload"), {
    ...args,
    index: 0,
    data: btoa("not a pdf"),
  });
  await expect(
    t.action(action("upload"), {
      ...args,
      index: 0,
      data: btoa("changed bytes"),
    }),
  ).rejects.toThrow("retry cannot change");
  await expect(
    t.action(action("upload"), { ...args, index: 1, data: btoa("rest") }),
  ).rejects.toThrow("signature");
  await expect(
    t.action(action("upload"), { ...args, index: 2, data: btoa("rest") }),
  ).rejects.toThrow("chunk bounds");
  await expect(
    t.action(action("upload"), {
      ...args,
      key: "large",
      index: 0,
      data: btoa("x".repeat(128 * 1024 + 1)),
    }),
  ).rejects.toThrow("oversized chunk");
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
});
it("registers reusable references without claiming fetch or changing existing sharing", async () => {
  const t = await setup();
  const a = {
    userId: actor,
    metadata: {
      kind: "url",
      title: "Reference",
      origin: "User-selected source",
      url: "https://example.org/lecture",
    },
  };
  const first = await t.mutation(mutation("reference"), a);
  expect((await t.mutation(mutation("reference"), a)).sourceId).toBe(
    first.sourceId,
  );
  const data = await t.action(action("readContent"), {
    userId: actor,
    sourceId: first.sourceId,
  });
  expect(data).toMatchObject({
    data: null,
    totalBytes: 0,
    metadata: a.metadata,
  });
  await expect(
    t.mutation(mutation("reference"), {
      ...a,
      metadata: { ...a.metadata, url: "file:///etc/passwd" },
    }),
  ).rejects.toThrow("HTTPS");
});

it("publishes only authorized citation metadata and never exposes PDF bytes", async () => {
  const t = await setup();
  const { sourceId } = await t.action(action("upload"), {
    ...args,
    key: "citation-publication",
    totalChunks: 1,
    index: 0,
    data: btoa("%PDF-1.7\nLecture bytes"),
  });
  await expect(
    t.mutation(mutation("publishSource"), { userId: other, sourceId }),
  ).rejects.toThrow();
  await expect(
    t.mutation(mutation("publishSource"), {
      userId: actor,
      sourceId,
      includeImage: true,
    }),
  ).rejects.toThrow("Only explicitly selected image");
  const published = await t.mutation(mutation("publishSource"), {
    userId: actor,
    sourceId,
  });
  expect(published).toMatchObject({
    metadataVisibility: "public",
    contentVisibility: "private",
  });
  expect(
    await t.mutation(mutation("publishSource"), { userId: actor, sourceId }),
  ).toEqual(published);
  await expect(
    t.action(action("readContent"), { userId: other, sourceId }),
  ).rejects.toThrow("FORBIDDEN");
});
