import { isCoverUrl } from "@/lib/learn/covers";
import type { Metadata } from "next";
import { defaultOgImage } from "@/lib/seo";
import { excerpt, outline } from "./doc";
import type { Lesson } from "./types";

/**
 * Search/social presentation of a public lesson. Indexing needs all of: published, public
 * (not unlisted/private), author opted in, and no moderation restriction. Everything else
 * is `noindex` even when readable by link.
 */
export function lessonIndexable(lesson: Pick<Lesson, "published" | "visibility" | "moderation" | "archived">): boolean {
  return !!lesson.published && lesson.visibility === "public" && lesson.published.meta.indexing === "index" && lesson.moderation === "ok" && !lesson.archived;
}

export const lessonPath = (id: string) => `/learn/${encodeURIComponent(id)}`;

export function lessonMetadata(lesson: Lesson | null): Metadata {
  if (!lesson?.published || lesson.moderation === "removed" || lesson.archived) {
    return { title: "Lesson unavailable", robots: { index: false, follow: false } };
  }
  const meta = lesson.published.meta;
  const title = meta.title || "Untitled lesson";
  const description = excerpt(meta.description || outline(lesson.published.content).map((h) => h.text).join(" · ") || `A lesson by ${lesson.ownerName} on Chaos.`, 200);
  const path = lessonPath(lesson.id);
  // Social previews can't show SVG, so colour covers are left out.
  // Without a photo cover the lesson shares the default Chaos card.
  const image = isCoverUrl(meta.coverUrl) && !meta.coverUrl.endsWith(".svg") ? [{ url: meta.coverUrl, alt: title }] : [defaultOgImage];
  return {
    title,
    description,
    alternates: { canonical: path },
    authors: [{ name: meta.authorDisplay || lesson.ownerName }],
    openGraph: { title, description, url: path, siteName: "Chaos", type: "article", locale: meta.language === "ar" ? "ar_EG" : "en_US", images: image, publishedTime: new Date(lesson.published.publishedAt).toISOString(), tags: meta.tags },
    twitter: { card: "summary_large_image", title, description, images: image },
    robots: { index: lessonIndexable(lesson), follow: lessonIndexable(lesson) },
  };
}

/** schema.org LearningResource. Only emitted for indexable lessons. */
export function lessonStructuredData(lesson: Lesson, origin: string) {
  if (!lessonIndexable(lesson) || !lesson.published) return null;
  const meta = lesson.published.meta;
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: meta.title,
    description: meta.description || undefined,
    inLanguage: meta.language,
    url: `${origin}${lessonPath(lesson.id)}`,
    author: { "@type": "Person", name: meta.authorDisplay || lesson.ownerName },
    datePublished: new Date(lesson.published.publishedAt).toISOString(),
    keywords: meta.tags.length ? meta.tags.join(", ") : undefined,
    license: meta.license || undefined,
    isBasedOn: lesson.forkedFrom ? `${origin}${lessonPath(lesson.forkedFrom.sourceId)}` : undefined,
    educationalAlignment: meta.curricula.map((c) => ({ "@type": "AlignmentObject", alignmentType: "educationalSubject", targetName: c.path.at(-1), educationalFramework: `${c.path.slice(0, -1).join(" › ")} (${c.versionLabel})` })),
    hasPart: outline(lesson.published.content).filter((h) => h.level <= 2).map((h) => ({ "@type": "CreativeWork", name: h.text, url: `${origin}${lessonPath(lesson.id)}#${h.id}` })),
  };
}
