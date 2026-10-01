"use client";

import { useCopy, useLocale, formatDateTime, formatNumber } from "@/lib/i18n";
import { homeworkCopy } from "./copy";

export type AttemptProgress = { number: number; startedAt: number; submittedAt: number | null; score: number | null; maxScore: number | null };
export default function AttemptHistory({ rows }: { rows: AttemptProgress[] | undefined }) {
  const t = useCopy(homeworkCopy), { locale } = useLocale();
  if (!rows) return <p role="status">{t.loading}</p>;
  if (!rows.length) return <p className="ws-muted">{t.none}</p>;
  return <div className="overflow-x-auto"><table className="w-full text-start"><caption className="text-start font-semibold py-3">{t.history}</caption><thead><tr>{[t.number, t.started, t.submitted, t.score].map(label => <th key={label} scope="col" className="text-start p-2">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.number}><th scope="row" className="text-start p-2">{formatNumber(locale, row.number)}</th><td className="p-2">{formatDateTime(locale, row.startedAt)}</td><td className="p-2">{row.submittedAt === null ? t.pending : formatDateTime(locale, row.submittedAt)}</td><td className="p-2">{row.score === null ? "—" : `${formatNumber(locale, row.score)} / ${formatNumber(locale, row.maxScore ?? 0)}`}</td></tr>)}</tbody></table></div>;
}
