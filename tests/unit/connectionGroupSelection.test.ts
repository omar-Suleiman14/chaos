import { expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveModuleLessons } from "@/components/connections/groupSelection";
import { diffDraftBlocks } from "@/components/connections/lessonChanges";
import type { LessonDocument } from "@/convex/learnModel";

it("resolves only active owned lessons, follows mapping cursors and grants no group/future access", async () => {
  const query = vi.fn(async (ref, args) => {
    const name = getFunctionName(ref);
    if (name === "lessons:listOwned") return { page: [{ _id: "a", status: "active", metadata: { title: "A" } }, { _id: "b", status: "archived", metadata: { title: "B" } }], isDone: true, continueCursor: "" };
    if (name === "curricula:listLessonMappings") return args.paginationOpts.cursor === null ? { page: [], isDone: false, continueCursor: "next" } : { page: [{ nodeId: "module", versionId: "version" }], isDone: true, continueCursor: "" };
    throw new Error(name);
  });
  const result = await resolveModuleLessons({ query } as unknown as Pick<ConvexReactClient, "query">, "module" as Id<"curriculumNodes">, "version" as Id<"curriculumVersions">, "Module");
  expect(result.lessons).toEqual([{ ref: "lesson_a", title: "A" }]);
  expect(query).toHaveBeenCalledTimes(3);
});

it("fails closed when the bounded owned-lesson catalog is incomplete", async () => {
  const query = vi.fn(async () => ({ page: Array.from({ length: 50 }, (_, index) => ({ _id: String(index), status: "active", metadata: { title: "A" } })), isDone: false, continueCursor: "next" }));
  await expect(resolveModuleLessons({ query } as unknown as Pick<ConvexReactClient, "query">, "m" as Id<"curriculumNodes">, "v" as Id<"curriculumVersions">, "Module")).rejects.toThrow("More than 500 lessons");
});

it("compares applied draft formatting, references and removals as well as text", () => {
  const block = { id: "p", type: "paragraph" as const, text: "Same text", citations: [], conceptIds: [] };
  const before: LessonDocument = { schemaVersion: 1, blocks: [block, { ...block, id: "removed" }] };
  const after: LessonDocument = { schemaVersion: 1, blocks: [{ ...block, conceptIds: ["concept"] }, { ...block, id: "added" }] };
  expect(diffDraftBlocks(before, after).map(change => [change.blockId, change.kind])).toEqual([["p", "changed"], ["added", "added"], ["removed", "removed"]]);
});
