"use client";

import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";

/** Structured external reference sent by a connected app (convex/integrationContract.ts parseSource). */
export type ExternalSource = { type: string; id?: string; url?: string; title?: string; fetchedAt?: number };

const copy = {
  en: { type: "Type", id: "Reference", link: "Open source", fetched: "Fetched", label: "Source details" },
  ar: { type: "النوع", id: "المرجع", link: "افتح المصدر", fetched: "جُلب في", label: "تفاصيل المصدر" },
};

/** Provenance shown to people editing the form. Never rendered on respondent pages. */
export default function SourceDetails({ source }: { source: ExternalSource }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const parts: React.ReactNode[] = [<span key="type">{t.type}: <code dir="ltr">{source.type}</code></span>];
  if (source.id) parts.push(<span key="id">{t.id}: <code dir="ltr" className="break-all">{source.id}</code></span>);
  if (source.fetchedAt) parts.push(<span key="at">{t.fetched} {formatDateTime(locale, source.fetchedAt, { dateStyle: "medium", timeStyle: "short" })}</span>);
  if (source.url) {
    parts.push(<a key="url" href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="underline" dir="ltr">{t.link}</a>);
  }
  return (
    <span className="block mt-1" aria-label={t.label}>
      {parts.map((part, i) => <span key={i}>{i > 0 && " · "}{part}</span>)}
    </span>
  );
}
