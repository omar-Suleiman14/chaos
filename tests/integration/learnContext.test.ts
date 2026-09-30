import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
it("packages only explicitly selected permitted lesson material and metadata", async () => {
  const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const other = t.withIdentity(otherCreatorIdentity);
  const sourceId = await owner.mutation(api.learnSources.create, { metadata: { title: "Reference", kind: "reference", origin: "Publisher" }, metadataVisibility: "private", contentVisibility: "private" });
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Study", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [
    { id: "selected", type: "paragraph", text: "Selected material", citations: [{ sourceId, locator: { kind: "page", page: 23 } }], conceptIds: [] },
    { id: "unselected", type: "paragraph", text: "Unselected material", citations: [], conceptIds: [] },
  ] } });
  // Metadata sharing is explicit; file content remains private.
  await owner.mutation(api.learnSources.update, { sourceId, metadataVisibility: "public" });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("publish failed");
  const args = { lessonId, versionId: published.versionId, blockIds: ["selected"], sourceIds: [sourceId], includeMyProgress: false };
  const packet = await other.query(api.learnContext.assemble, args);
  expect(packet.blocks.map(b => b.id)).toEqual(["selected"]); expect(packet.sources[0].includesContent).toBe(false);
  expect(JSON.stringify(packet)).not.toContain("Unselected material"); expect(JSON.stringify(packet)).not.toContain("storageId");
  expect(packet.boundaries).toEqual({ sourceExcerptsIncluded: false, privateNotesIncluded: false, outsideKnowledgeIncluded: false });
  await expect(other.query(api.learnContext.assemble, { ...args, blockIds: ["unselected"] })).rejects.toThrow("cited");
  await owner.mutation(api.learnSources.update, { sourceId, metadataVisibility: "private" });
  await expect(other.query(api.learnContext.assemble, args)).rejects.toThrow("unavailable");
});
