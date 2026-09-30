"use client";

import { formatNumber, useLocale } from "@/lib/i18n";

/** Horizontal bars with a count and share per row, like Google Forms' summary. */
export function BarList({ rows, total, highlight }: {
  rows: { id: string; label: string; count: number }[];
  /** What 100% means: people who answered (multi-select rows can add up to more than 100%). */
  total: number;
  /** Row ids drawn in the success colour, e.g. a quiz's correct option. */
  highlight?: string[];
}) {
  const { locale } = useLocale();
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="ws-bars">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <li key={r.id} className="ws-bars__row" data-highlight={highlight?.includes(r.id) || undefined} data-top={(r.count === top && r.count > 0) || undefined}>
            <span className="ws-bars__label">{r.label}</span>
            <span className="ws-bars__value"><span>{formatNumber(locale, r.count)}</span><span className="ws-bars__pct">{pct}%</span></span>
            <span className="ws-bars__track" aria-hidden="true"><span className="ws-bars__fill" style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical columns for number, date and score distributions. Screen readers get the same data as a list. */
export function Columns({ bins, label }: { bins: { label: string; count: number }[]; label: string }) {
  const { locale } = useLocale();
  const top = Math.max(1, ...bins.map((b) => b.count));
  return (
    <figure className="ws-columns">
      <div className="ws-columns__plot" aria-hidden="true">
        {bins.map((b, i) => (
          <div key={i} className="ws-columns__col" title={`${b.label}: ${b.count}`}>
            <span className="ws-columns__count">{b.count > 0 ? formatNumber(locale, b.count) : ""}</span>
            <span className="ws-columns__bar" style={{ height: `${Math.max(b.count > 0 ? 4 : 0, (b.count / top) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="ws-columns__axis" aria-hidden="true">
        {bins.map((b, i) => <span key={i}>{b.label}</span>)}
      </div>
      <figcaption className="sr-only">
        {label}: {bins.map((b) => `${b.label} ${b.count}`).join(", ")}
      </figcaption>
    </figure>
  );
}

/** A small area chart of daily responses. Decorative: the caption next to it states the numbers. */
export function Sparkline({ values, width = 160, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - (v / top) * (height - 4);
  const line = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="ws-sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" preserveAspectRatio="none">
      <path d={`${line} L${width},${height} L0,${height} Z`} className="ws-sparkline__area" />
      <path d={line} className="ws-sparkline__line" />
    </svg>
  );
}

/** Fills missing days with zero so the sparkline reads as time, ending today. */
export function lastDays(perDay: { day: string; count: number }[], days: number, now = Date.now()): number[] {
  const byDay = new Map(perDay.map((d) => [d.day, d.count]));
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(byDay.get(new Date(now - i * 86_400_000).toISOString().slice(0, 10)) ?? 0);
  return out;
}
