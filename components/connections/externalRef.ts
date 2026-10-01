// Pure: the provenance line for content a connected app created or linked
// ("Created from Max page: GIT Notes" + "Open in Max"). Product-neutral: the wording comes
// from ExternalRef.appName and .kind, so any connected app reads the same way.

import type { ExternalRef } from "@/lib/learn/types";
import type { Locale } from "@/lib/locale";

export interface ExternalRefText {
  text: string;
  /** Link label, only when `href` is set. */
  openLabel: string | null;
  /** Safe http(s) address, or null when there is none. */
  href: string | null;
}

/** Only plain http(s) links are followed; anything else (javascript:, file:, data:) is dropped. */
export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const KINDS: Record<Locale, Record<string, string>> = {
  en: { page: "page", note: "note", document: "document", doc: "document", notebook: "notebook", folder: "folder", section: "section", file: "file" },
  ar: { page: "صفحة", note: "ملاحظة", document: "مستند", doc: "مستند", notebook: "دفتر", folder: "مجلد", section: "قسم", file: "ملف" },
};

export function externalRefText(ref: Pick<ExternalRef, "appName" | "kind" | "title" | "url">, locale: Locale): ExternalRefText {
  const app = ref.appName.trim();
  const kind = KINDS[locale][ref.kind.trim().toLowerCase()] ?? "";
  const title = ref.title.trim();
  const href = safeExternalUrl(ref.url);
  let text: string;
  if (locale === "ar") {
    const source = app ? `${kind ? `${kind} في ` : ""}${app}` : "تطبيق متصل";
    text = title ? `أُنشئ من ${source}: ${title}` : `أُنشئ من ${source}`;
  } else {
    const source = app ? `${app}${kind ? ` ${kind}` : ""}` : "a connected app";
    text = title ? `Created from ${source}: ${title}` : `Created from ${source}`;
  }
  const openLabel = href ? (locale === "ar" ? (app ? `افتح في ${app}` : "افتح في التطبيق المتصل") : app ? `Open in ${app}` : "Open in the connected app") : null;
  return { text, openLabel, href };
}
