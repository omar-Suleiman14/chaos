"use client";

import { useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { BarList, Columns, Sparkline, lastDays } from "./charts";
import { formatDuration, resultsCopy } from "./copy";
import DocHint from "@/components/forms/DocHint";

export type Analysis = NonNullable<FunctionReturnType<typeof api.formResults.getAnalysis>>;
type FieldResult = Analysis["fields"][number];

const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1));

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ws-stat">
      <dt>{label}</dt>
      <dd>
        <span className="ws-stat__value">{value}</span>
        {hint && <span className="ws-stat__hint">{hint}</span>}
      </dd>
    </div>
  );
}

/** The numbers every results page starts with: how many, how complete, how long, how recent, and quiz scores. */
export function SummaryHeader({ analysis }: { analysis: Analysis | undefined }) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const days = 30;
  const trend = useMemo(() => (analysis ? lastDays(analysis.perDay, days) : []), [analysis]);
  if (!analysis) return <div className="ws-stats ws-skeleton" style={{ minHeight: 88 }} aria-hidden="true" />;
  const a = analysis;
  const recent = trend.reduce((s, n) => s + n, 0);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <section className="ws-stats-wrap" aria-label={t.tabs.summary}>
      <dl className="ws-stats">
        <Stat label={t.statResponses} value={formatNumber(locale, a.responseCount)} hint={a.partialCount ? t.unfinished(a.partialCount) : undefined} />
        <Stat label={t.statCompletion} value={a.completionRate === null ? t.noData : pct(a.completionRate)} hint={a.collectPartial ? undefined : t.turnOnPartial} />
        <Stat label={t.statTime} value={formatDuration(a.averageDurationMs, locale)} hint={a.medianDurationMs !== null ? t.medianTime(formatDuration(a.medianDurationMs, locale)) : undefined} />
        <Stat label={t.statLast} value={a.lastResponseAt ? timeAgo(locale, a.lastResponseAt) : t.never} />
        {a.quiz && (
          <>
            <Stat label={t.statAverageScore} value={round(a.quiz.average)} hint={t.outOf(a.quiz.maxScore)} />
            <Stat label={t.statMedianScore} value={round(a.quiz.median)} hint={t.gradedOf(a.quiz.graded)} />
            <Stat label={t.statPassRate} value={pct(a.quiz.passRate)} />
          </>
        )}
      </dl>
      <div className="ws-trend">
        <Sparkline values={trend} />
        <p><span className="ws-trend__label">{t.last30}</span> <span className="ws-trend__value">{formatNumber(locale, recent)}</span><span className="sr-only"> {t.trend(recent, days)}</span></p>
      </div>
    </section>
  );
}

/** The summary carries a few answers per question; the rest load when someone opens or searches them. */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The bounded text-answer list is focusable to support keyboard scrolling. */
function TextAnswers({ field, formId }: { field: FieldResult; formId?: Id<"forms"> }) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const preview = field.texts ?? [];
  const more = !!formId && field.textCount > preview.length;
  const all = useQuery(api.formResults.getTextAnswers, more && (expanded || query.trim()) ? { formId, fieldId: field.fieldId } : "skip");
  const texts = all ?? preview;
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? texts.filter((x) => x.text.toLocaleLowerCase().includes(needle)) : texts;
  if (!texts.length) return <p className="ws-muted">{t.noTextAnswers}</p>;
  return (
    <div className="grid gap-2">
      {(texts.length > 5 || more) && (
        <label className="ws-search !max-w-none">
          <span className="sr-only">{t.searchAnswers}</span>
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchAnswers} />
        </label>
      )}
      <ul className="ws-text-answers" tabIndex={0} aria-label={field.label}>
        {shown.map((x) => (
          <li key={x.responseId}>
            <p>{x.text}</p>
            <time dateTime={new Date(x.submittedAt).toISOString()}>{formatDate(locale, x.submittedAt, { day: "numeric", month: "short", year: "numeric" })}</time>
          </li>
        ))}
        {!shown.length && <li className="ws-muted">{t.noTextMatches}</li>}
      </ul>
      {more && !all && !query.trim() && <button type="button" className="ws-btn ws-btn--ghost justify-self-start" onClick={() => setExpanded(true)} disabled={expanded}>{t.showAllAnswers(field.textCount)}</button>}
      {all && field.textCount > texts.length && <p className="ws-muted text-[13px]">{t.showingLatest(texts.length, field.textCount)}</p>}
    </div>
  );
}
/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */

function QuestionCard({ field, analysis, index, formId }: { field: FieldResult; analysis: Analysis; index: number; formId?: Id<"forms"> }) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const def = analysis.definition.fields.find((x) => x.id === field.fieldId);
  const matrix = (analysis.matrix as Record<string, Record<string, Record<string, number>>>)[field.fieldId];
  const correctIds = def?.quiz?.correctOptionIds ?? [];
  const extra = [field.notApplicable ? t.notShown(field.notApplicable) : "", field.notAsked ? t.notAsked(field.notAsked) : ""].filter(Boolean);
  const numberStats = field.numberStats;
  const dateStats = field.dateStats;
  const dateLabel = (key: string) => {
    if (!dateStats) return key;
    if (dateStats.unit === "year") return key;
    if (dateStats.unit === "month") return formatDate(locale, Date.parse(`${key}-01T00:00:00Z`), { month: "short", year: "2-digit", timeZone: "UTC" });
    return formatDate(locale, Date.parse(`${key}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const fullDate = (key: string) => formatDate(locale, Date.parse(`${key}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <section className="ws-question" aria-labelledby={`q-${field.fieldId}`}>
      <header className="ws-question__head">
        <span className="ws-question__num" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 id={`q-${field.fieldId}`} className="ws-question__title">{field.label}</h3>
          <p className="ws-question__meta">{t.answeredSkipped(field.answered, field.skipped)}{extra.length ? ` · ${extra.join(" · ")}` : ""}</p>
        </div>
        {field.quiz && field.quiz.correctRate !== null && (
          <span className="ws-pill ws-pill--green shrink-0">{t.correctRate(Math.round(field.quiz.correctRate * 100))}</span>
        )}
      </header>

      {field.distribution && <BarList rows={field.distribution} total={field.answered} highlight={correctIds} />}
      {field.type === "ranking" && <p className="ws-muted text-[13px]">{t.rankedFirst}</p>}
      {field.average !== null && (
        <p className="ws-inline-stats"><span>{t.average}</span> <strong>{round(field.average)}</strong></p>
      )}

      {field.quiz && (
        <dl className="ws-quiz-facts">
          <div><dt>{t.correctAnswer}</dt><dd>{field.quiz.correctLabels.join(", ")}</dd></div>
          <div><dt>{t.commonWrong}</dt><dd>{field.quiz.commonWrong ? `${field.quiz.commonWrong.label} · ${formatNumber(locale, field.quiz.commonWrong.count)}` : t.noWrong}</dd></div>
        </dl>
      )}

      {numberStats && (
        <>
          <dl className="ws-mini-stats">
            <div><dt>{t.min}</dt><dd>{round(numberStats.min)}</dd></div>
            <div><dt>{t.mean}</dt><dd>{round(numberStats.mean)}</dd></div>
            <div><dt>{t.median}</dt><dd>{round(numberStats.median)}</dd></div>
            <div><dt>{t.max}</dt><dd>{round(numberStats.max)}</dd></div>
          </dl>
          {numberStats.bins.length > 1 && (
            <Columns label={t.distribution} bins={numberStats.bins.map((b) => ({ label: b.from === b.to ? round(b.from) : `${round(b.from)}–${round(b.to)}`, count: b.count }))} />
          )}
        </>
      )}

      {dateStats && (
        <>
          <dl className="ws-mini-stats">
            <div><dt>{t.earliest}</dt><dd>{fullDate(dateStats.earliest)}</dd></div>
            <div><dt>{t.latest}</dt><dd>{fullDate(dateStats.latest)}</dd></div>
          </dl>
          {dateStats.buckets.length > 1 && <Columns label={t.distribution} bins={dateStats.buckets.map((b) => ({ label: dateLabel(b.label), count: b.count }))} />}
        </>
      )}

      {field.texts && <TextAnswers field={field} formId={formId} />}

      {matrix && def && (
        <div className="ws-matrix-wrap">
          <table className="ws-matrix">
            <thead><tr><th scope="col" aria-label={locale === "ar" ? "السؤال" : "Question"} />{def.options?.map((o) => <th key={o.id} scope="col">{o.label}</th>)}</tr></thead>
            <tbody>
              {def.rows?.map((row) => {
                const rowTotal = Object.values(matrix[row.id] ?? {}).reduce((s, n) => s + n, 0);
                return (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    {def.options?.map((o) => {
                      const n = matrix[row.id]?.[o.id] ?? 0;
                      return <td key={o.id} style={{ ["--heat" as string]: rowTotal ? n / rowTotal : 0 }}>{formatNumber(locale, n)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {field.type === "file" && <p className="ws-muted text-[13px]">{t.filesAnswered(field.answered)}</p>}
      {!field.distribution && !numberStats && !dateStats && !field.texts && !matrix && field.type !== "file" && field.average === null && (
        <p className="ws-muted text-[13px]">{t.readInResponses}</p>
      )}
    </section>
  );
}

/** Quiz questions ranked by correct rate, hardest first, from the same sample as the cards below. */
function QuestionPerformance({ analysis }: { analysis: Analysis }) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const rows = analysis.fields
    .filter((f) => f.quiz && f.quiz.correctRate !== null)
    .sort((x, y) => x.quiz!.correctRate! - y.quiz!.correctRate!);
  if (rows.length < 2) return null;
  return (
    <section className="ws-question" aria-labelledby="perf-title">
      <header className="ws-question__head">
        <div>
          <h3 id="perf-title" className="ws-question__title">{t.perfTitle}</h3>
          <p className="ws-question__meta">{t.perfHelp}</p>
        </div>
      </header>
      <div className="ws-matrix-wrap">
        <table className="ws-matrix ws-perf">
          <thead><tr><th scope="col">{t.colQuestion}</th><th scope="col">{t.colCorrect}</th><th scope="col">{t.colCommonWrong}</th><th scope="col">{t.colAnswered}</th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.fieldId}>
                <th scope="row"><a href={`#q-${f.fieldId}`} className="underline-offset-2 hover:underline">{f.label}</a></th>
                <td style={{ ["--heat" as string]: 1 - f.quiz!.correctRate! }}>{Math.round(f.quiz!.correctRate! * 100)}%</td>
                <td>{f.quiz!.commonWrong ? `${f.quiz!.commonWrong.label} · ${formatNumber(locale, f.quiz!.commonWrong.count)}` : "—"}</td>
                <td>{formatNumber(locale, f.quiz!.answered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Per-question summary cards, the default view of a results page. */
export function SummaryTab({ analysis, formId }: { analysis: Analysis | undefined; formId?: Id<"forms"> }) {
  const t = useCopy(resultsCopy);
  const { locale: lang } = useLocale();
  if (analysis === undefined) {
    return (
      <output  aria-busy="true" className="grid gap-4">
        <span className="sr-only">{t.analysing}</span>
        {[0, 1, 2].map((i) => <span key={i} aria-hidden="true" className="ws-skeleton" style={{ height: 180 }} />)}
      </output>
    );
  }
  const a = analysis;
  if (a.responseCount === 0 && a.partialCount === 0) {
    return (
      <div className="ws-empty">
        <h2 className="text-xl font-semibold">{t.emptyTitle}</h2>
        <p className="ws-muted max-w-sm">{t.emptyBody}</p>
        <DocHint slug="results">{t.emptyTips}</DocHint>
      </div>
    );
  }
  const languageName = (l: string) => (l === "ar" ? t.arabic : l === "en" ? t.english : l);
  const locale = lang;
  return (
    <div className="ws-summary">
      {(a.sampleLimited || a.editedResponses > 0) && (
        <div className="grid gap-1">
          {a.sampleLimited && <p className="ws-muted text-[13px]">{t.sampleNote(a.sampled)}</p>}
          {a.editedResponses > 0 && <p className="ws-muted text-[13px]">{t.edited(a.editedResponses)}</p>}
        </div>
      )}

      {a.quiz && (
        <section className="ws-question" aria-labelledby="scores-title">
          <header className="ws-question__head"><h3 id="scores-title" className="ws-question__title">{t.scoresTitle}</h3></header>
          <Columns label={t.scoresTitle} bins={a.quiz.bins.map((b) => ({ label: t.scoreBand(b.from, b.to), count: b.count }))} />
        </section>
      )}

      <QuestionPerformance analysis={a} />

      {a.fields.map((f, i) => <QuestionCard key={f.fieldId} field={f} analysis={a} index={i} formId={formId} />)}

      {(a.durationBins?.length ?? 0) > 1 && (
        <section className="ws-question" aria-labelledby="time-title">
          <header className="ws-question__head">
            <div>
              <h3 id="time-title" className="ws-question__title">{t.timeTitle}</h3>
              <p className="ws-question__meta">{t.timeHelp(a.durationBins.reduce((s, b) => s + b.count, 0))}</p>
            </div>
          </header>
          <Columns label={t.timeTitle} bins={a.durationBins.map((b) => ({ label: b.from === b.to ? formatDuration(b.from * 1000, locale) : `${formatDuration(b.from * 1000, locale)}–${formatDuration(b.to * 1000, locale)}`, count: b.count }))} />
        </section>
      )}

      {!a.collectPartial && <DocHint slug="results">{t.partialOff}</DocHint>}

      {a.collectPartial && a.partialCount > 0 && (
        <section className="ws-question" aria-labelledby="dropoff-title">
          <header className="ws-question__head">
            <div>
              <h3 id="dropoff-title" className="ws-question__title">{t.dropOffTitle}</h3>
              <p className="ws-question__meta">{t.dropOffHelp}</p>
            </div>
          </header>
          <BarList total={a.partialCount} rows={[
            ...(a.stoppedBeforeFirst > 0 ? [{ id: "__start", label: t.beforeAnything, count: a.stoppedBeforeFirst }] : []),
            ...a.fields.filter((f) => f.stoppedAfter > 0).map((f) => ({ id: f.fieldId, label: t.after(f.label), count: f.stoppedAfter })),
          ]} />
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {a.endings.length > 1 && (
          <section className="ws-question" aria-labelledby="endings-title">
            <header className="ws-question__head"><h3 id="endings-title" className="ws-question__title">{t.endingsTitle}</h3></header>
            <BarList total={a.sampled} rows={a.endings.map((e) => ({ id: e.id, label: e.title, count: e.count }))} />
          </section>
        )}
        {Object.keys(a.languages).length > 0 && (
          <section className="ws-question" aria-labelledby="languages-title">
            <header className="ws-question__head"><h3 id="languages-title" className="ws-question__title">{t.languagesTitle}</h3></header>
            <BarList total={a.sampled} rows={Object.entries(a.languages).map(([l, n]) => ({ id: l, label: languageName(l), count: n }))} />
          </section>
        )}
      </div>
    </div>
  );
}
