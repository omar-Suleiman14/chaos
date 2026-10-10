import type { Doc } from "./_generated/dataModel";

/** Shared metadata-only projection for public course cards.
 * Publication, ownership and audience checks belong to each caller, not here.
 */
export function publicCourseMetadata(metadata: Doc<"collectionVersions">["metadata"]) {
  return {
    title: metadata.title,
    description: metadata.description,
    coverUrl: metadata.coverUrl,
    icon: metadata.icon,
    language: metadata.language,
    tags: metadata.tags,
  };
}
