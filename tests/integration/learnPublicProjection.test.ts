import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

const metadata = { title: "Shared public projection", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "intro", type: "paragraph" as const, text: "Published content", citations: [], conceptIds: [] }] };

describe("single and batch public lesson projections", () => {
  it("returns identical published version data in both endpoints, preserving duplicate order", async () => {
    const t = createTestConvex();
    const creator = t.withIdentity(creatorIdentity);
    const lessonId = await creator.mutation(api.lessons.create, { metadata, document });
    expect((await creator.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" })).ok).toBe(true);

    const one = await t.query(api.learnFrontend.publicLesson, { id: lessonId });
    expect(one?.version.document).toEqual(document);
    const many = await t.query(api.learnFrontend.publicLessonsBatch, { ids: ["not-an-id", lessonId, lessonId] });
    expect(many).toEqual([one, one]);
  });

  it("returns null for a private lesson and omits it from batch reads, even for its owner", async () => {
    const t = createTestConvex();
    const creator = t.withIdentity(creatorIdentity);
    const lessonId = await creator.mutation(api.lessons.create, { metadata, document });
    expect(await creator.query(api.learnFrontend.publicLesson, { id: lessonId })).toBeNull();
    expect(await creator.query(api.learnFrontend.publicLessonsBatch, { ids: [lessonId] })).toEqual([]);
  });
});
