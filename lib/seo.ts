import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import { localePath, type Locale } from "@/lib/locale";

/** About 155 characters, so search results show it whole. */
export const siteDescription = "Create forms, quizzes, lessons, courses and live games in one free, open-source workspace. English and Arabic, with MCP, an API, webhooks and self-hosting.";

/** The generic share card, app/opengraph-image/route.tsx. Pages with their own picture (a course or lesson cover) replace it. */
export const defaultOgImageAlt = "Chaos: Create. Teach. Learn. Test. Forms, quizzes, lessons, courses and live games.";
export const defaultOgImage = { url: "/opengraph-image", width: 1200, height: 630, alt: defaultOgImageAlt };

/**
 * Use the same page address and copy in search results and shared links. Setting openGraph here
 * replaces the root segment's file-based image, so the default card is listed explicitly.
 */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "Chaos", type: "website", images: [defaultOgImage] },
    twitter: { card: "summary_large_image", title, description, images: [defaultOgImage] },
  };
}

/** Props of a page under app/[lang]/(site). */
export type SitePageProps = { params: Promise<{ lang: string }> };
export type SitePageCopy = Record<Locale, { title: string; description: string }>;

/** hreflang links for a marketing page: English unprefixed (also x-default), Arabic under /ar. */
export function languageAlternates(path: string): Record<"en" | "ar" | "x-default", string> {
  return { en: path, ar: localePath(path, "ar"), "x-default": path };
}

/** pageMetadata() for a marketing page in its URL language, with canonical and hreflang alternates. */
export function sitePageMetadata(lang: string, copy: SitePageCopy, path: string, options: { absoluteTitle?: boolean } = {}): Metadata {
  const locale: Locale = lang === "ar" ? "ar" : "en";
  const { title, description } = copy[locale];
  const url = localePath(path, locale);
  const base = pageMetadata(title, description, url);
  return {
    ...base,
    ...(options.absoluteTitle ? { title: { absolute: title } } : {}),
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: { ...base.openGraph, locale: locale === "ar" ? "ar_EG" : "en_US", alternateLocale: [locale === "ar" ? "en_US" : "ar_EG"] },
  };
}

type PublicForm = { state: string; title?: string; allowIndexing?: boolean; definition?: { description?: string } };

export function formMetadata(form: PublicForm, shareId: string): Metadata {
  const available = form.state !== "unavailable";
  const title = available ? form.title || "Untitled form" : "Form unavailable";
  const description = form.state === "open"
    ? form.definition?.description?.trim().slice(0, 200) || "A form shared with you on Chaos."
    : "This form is not accepting responses.";
  return {
    ...pageMetadata(title, description, `/f/${encodeURIComponent(shareId)}`),
    robots: { index: form.state === "open" && form.allowIndexing === true, follow: false },
  };
}

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Chaos",
  url: siteUrl,
  description: siteDescription,
  inLanguage: ["en", "ar"],
};

/** Escape '<' so a configured value cannot end a JSON-LD script element. */
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
