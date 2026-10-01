import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

export const siteDescription = "Forms, surveys, quizzes and live quiz games. Run it from ChatGPT, connect it with an API and webhooks, or host it yourself. Open source, in English and Arabic.";

/** Use the same page address and copy in search results and shared links. */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "Chaos", type: "website" },
    twitter: { card: "summary_large_image", title, description },
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
