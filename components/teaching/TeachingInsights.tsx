"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy, useLocale, formatDateTime, formatNumber } from "@/lib/i18n";
import { useModal } from "@/components/workspace/useModal";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Clock, History, Info, SearchCheck, Sparkles, Timer, Zap } from "lucide-react";
import "./teaching.css";

type Target = { formId: Id<"forms">; quizId?: never } | { quizId: Id<"quizzes">; formId?: never };
type Report = NonNullable<FunctionReturnType<typeof api.formResults.getTeachingInsights>> | NonNullable<FunctionReturnType<typeof api.quizFunctions.getTeachingInsights>>;
type Quality = Report["questions"][number];
type Version = Report["versions"][number];
type VQuestion = Version["questions"][number];
type Flag = Quality["flags"][number];

const copy = {
  en: {
    title: "Teaching insights",
    detective: "Question detective", detectiveHelp: "Find the questions that trip students up",
    history: "Version history", historyHelp: "Browse every version side by side",
    loading: "Looking through the answers…", unavailable: "Insights aren't available for this quiz.",
    basedOn: (n: string) => `Based on the latest ${n} completed attempts.`, capped: "Older attempts aren't included.",
    missing: "Some older attempts have no saved copy of their questions, so they're left out.",
    worthALook: "Worth a look", all: "All questions", filter: "Show",
    summary: (n: string, k: string) => `${n} questions · ${k} worth a look`,
    noneFlagged: "Nothing stands out. Every question with enough answers looks healthy.",
    empty: "Insights appear once marked questions have answers.",
    correct: "correct", median: "median", answers: (n: string) => `${n} answers`, seconds: (n: string) => `${n} s`,
    flags: {
      negative_discrimination: { title: "Check the answer key", body: "Students with higher overall scores got this wrong more often than others. The key may be wrong, or the wording may mislead strong students." },
      difficult: { title: "Most students missed this", body: "Fewer than 4 in 10 answered correctly. Review the wording, or teach the idea again." },
      easy: { title: "Almost everyone got this", body: "More than 95% answered correctly. Good for checking the basics; it won't separate students." },
      small_sample: { title: "Too few answers yet", body: "Fewer than 10 answers. Wait for more before drawing conclusions." },
    } as Record<Flag, { title: string; body: string }>,
    healthy: "Looks healthy", fastTitle: "Some answers came too fast to read",
    commonWrong: "Most picked wrong answer", students: (n: string) => `${n} students`,
    tooFast: (n: string) => `${n} answers came faster than anyone can read the question. Worth a quiet look; marks are not changed.`,
    timed: (n: string) => `Answer time was recorded for ${n} answers.`,
    browse: "Browse versions", done: "Done", current: "Current version", older: "Older version", newer: "Newer version",
    versionN: (key: string) => `Version ${key}`, snapshotN: (n: string) => `Snapshot ${n}`, attempts: (n: string) => `${n} attempts`,
    timeline: "Versions", now: "Now", showing: "Showing", showCurrent: "Current", showPast: "Earlier",
    onlyOne: "There's only one version so far. Each time you publish changes, the earlier version appears here.",
    snapshotsNote: "Snapshots are the questions saved with each attempt. Question pools can draw different sets, so a new snapshot is not always a new publication.",
    changes: (c: string, a: string, r: string) => `${c} changed · ${a} added · ${r} removed`, noChanges: "No changes from the current version",
    added: "Added", removed: "Removed", changed: "Changed", keyChanged: "Answer key changed",
    marks: (n: number, f: string) => (n === 1 ? "1 mark" : `${f} marks`), limit: (n: string) => `${n} s limit`, answerKey: "Correct answer",
  },
  ar: {
    title: "رؤى التدريس",
    detective: "محقق الأسئلة", detectiveHelp: "اعثر على الأسئلة التي تُربك الطلاب",
    history: "سجل النسخ", historyHelp: "تصفّح كل النسخ جنبًا إلى جنب",
    loading: "جارٍ فحص الإجابات…", unavailable: "الرؤى غير متاحة لهذا الاختبار.",
    basedOn: (n: string) => `استنادًا إلى أحدث ${n} محاولة مكتملة.`, capped: "المحاولات الأقدم غير مشمولة.",
    missing: "بعض المحاولات القديمة بلا نسخة محفوظة من أسئلتها، لذلك لم تُحتسب.",
    worthALook: "تستحق النظر", all: "كل الأسئلة", filter: "عرض",
    summary: (n: string, k: string) => `${n} سؤال · ${k} تستحق النظر`,
    noneFlagged: "لا شيء لافت. كل سؤال لديه إجابات كافية يبدو سليمًا.",
    empty: "تظهر الرؤى بعد وصول إجابات على الأسئلة المصححة.",
    correct: "صحيحة", median: "الوسيط", answers: (n: string) => `${n} إجابة`, seconds: (n: string) => `${n} ث`,
    flags: {
      negative_discrimination: { title: "راجع مفتاح الإجابة", body: "أخطأ فيه أصحاب الدرجات الأعلى أكثر من غيرهم. ربما المفتاح خاطئ أو الصياغة تضلل الطلاب المتفوقين." },
      difficult: { title: "أخطأ فيه معظم الطلاب", body: "أجاب أقل من ٤ من كل ١٠ إجابة صحيحة. راجع الصياغة أو أعد شرح الفكرة." },
      easy: { title: "أجاب عنه الجميع تقريبًا", body: "أجاب أكثر من ٩٥٪ إجابة صحيحة. مناسب للتحقق من الأساسيات، لكنه لا يميّز بين الطلاب." },
      small_sample: { title: "الإجابات قليلة بعد", body: "أقل من ١٠ إجابات. انتظر المزيد قبل الاستنتاج." },
    } as Record<Flag, { title: string; body: string }>,
    healthy: "يبدو سليمًا", fastTitle: "بعض الإجابات أسرع من القراءة",
    commonWrong: "أكثر إجابة خاطئة اختيارًا", students: (n: string) => `${n} طالب`,
    tooFast: (n: string) => `${n} إجابة وصلت أسرع من أن يقرأ أحد السؤال. تستحق نظرة هادئة؛ الدرجات لا تتغير.`,
    timed: (n: string) => `سُجّل زمن الإجابة لـ ${n} إجابة.`,
    browse: "تصفّح النسخ", done: "تم", current: "النسخة الحالية", older: "نسخة أقدم", newer: "نسخة أحدث",
    versionN: (key: string) => `النسخة ${key}`, snapshotN: (n: string) => `اللقطة ${n}`, attempts: (n: string) => `${n} محاولة`,
    timeline: "النسخ", now: "الآن", showing: "عرض", showCurrent: "الحالية", showPast: "الأقدم",
    onlyOne: "توجد نسخة واحدة حتى الآن. كلما نشرت تغييرات تظهر النسخة السابقة هنا.",
    snapshotsNote: "اللقطات هي الأسئلة المحفوظة مع كل محاولة. قد تسحب بنوك الأسئلة مجموعات مختلفة، فاللقطة الجديدة ليست دائمًا نشرًا جديدًا.",
    changes: (c: string, a: string, r: string) => `${c} تغيّر · ${a} أُضيف · ${r} أُزيل`, noChanges: "لا تغييرات عن النسخة الحالية",
    added: "أُضيف", removed: "أُزيل", changed: "تغيّر", keyChanged: "تغيّر مفتاح الإجابة",
    marks: (n: number, f: string) => (n === 1 ? "درجة واحدة" : n === 2 ? "درجتان" : n >= 3 && n <= 10 ? `${f} درجات` : `${f} درجة`), limit: (n: string) => `مهلة ${n} ث`, answerKey: "الإجابة الصحيحة",
  },
};
type T = (typeof copy)["en"];

/** The report loads only once a tool is opened, so these tools add no work to the results page. */
function useReport(target: Target) {
  const form = useQuery(api.formResults.getTeachingInsights, target.formId ? { formId: target.formId } : "skip");
  const quiz = useQuery(api.quizFunctions.getTeachingInsights, target.quizId ? { quizId: target.quizId } : "skip");
  return (target.formId ? form : quiz) as Report | null | undefined;
}

export default function TeachingInsights(target: Target) {
  const t = useCopy(copy);
  const [detective, setDetective] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  return (
    <section className="ti" aria-label={t.title}>
      <div className="ti-group">
        <button type="button" className="ti-row" aria-expanded={detective} onClick={() => setDetective(!detective)}>
          <span className="ti-row__icon" data-tone="blue" aria-hidden><SearchCheck size={17} /></span>
          <span className="ti-row__text"><strong>{t.detective}</strong><small>{t.detectiveHelp}</small></span>
          <ChevronDown size={18} aria-hidden className="ti-row__chevron" data-open={detective || undefined} />
        </button>
        {detective && <Detective target={target} t={t} />}
        <button type="button" className="ti-row" aria-haspopup="dialog" onClick={() => setBrowsing(true)}>
          <span className="ti-row__icon" data-tone="purple" aria-hidden><History size={17} /></span>
          <span className="ti-row__text"><strong>{t.history}</strong><small>{t.historyHelp}</small></span>
          <ChevronRight size={18} aria-hidden className="ti-row__chevron rtl:rotate-180" />
        </button>
      </div>
      {browsing && <VersionBrowser target={target} t={t} onClose={() => setBrowsing(false)} />}
    </section>
  );
}

/* ── Question detective ─────────────────────────────────────────────── */

const SEVERITY: Record<Flag, number> = { negative_discrimination: 0, difficult: 1, easy: 2, small_sample: 3 };
const worth = (q: Quality) => q.flags.some((f) => f !== "small_sample") || q.reviewCount > 0;
const severity = (q: Quality) => Math.min(4, ...q.flags.map((f) => SEVERITY[f]), q.reviewCount > 0 ? 2.5 : 4);
const toneOf = (q: Quality) => q.flags.includes("negative_discrimination") ? "red" : q.flags.includes("difficult") ? "orange" : q.flags.includes("easy") || q.reviewCount > 0 ? "yellow" : q.flags.includes("small_sample") ? "gray" : "green";

function Detective({ target, t }: { target: Target; t: T }) {
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const report = useReport(target);
  const flagged = report ? report.questions.filter(worth).length : 0;
  const [view, setView] = useState<"worth" | "all" | null>(null);
  const shown = view ?? (flagged ? "worth" : "all");
  const [open, setOpen] = useState<string | null>(null);
  const questions = useMemo(() => {
    if (!report) return [];
    const list = shown === "worth" ? report.questions.filter(worth) : report.questions;
    return [...list].sort((a, b) => severity(a) - severity(b) || (a.correctRate ?? 101) - (b.correctRate ?? 101));
  }, [report, shown]);
  if (report === undefined) return <div className="ti-panel" role="status"><div className="ti-skeleton" aria-hidden><span /><span /><span /></div><span className="sr-only">{t.loading}</span></div>;
  if (report === null) return <div className="ti-panel"><p className="ti-note">{t.unavailable}</p></div>;
  if (!report.questions.length) return <div className="ti-panel"><p className="ti-empty"><Sparkles size={18} aria-hidden />{t.empty}</p></div>;
  return (
    <div className="ti-panel">
      <div className="ti-summary">
        <div>
          <p className="ti-summary__headline">{t.summary(fmt(report.questions.length), fmt(flagged))}</p>
          <p className="ti-note">{t.basedOn(fmt(report.sampleCount))}{report.capped ? ` ${t.capped}` : ""}{report.missingSnapshots > 0 ? ` ${t.missing}` : ""}</p>
        </div>
        <div className="ws-segmented" role="group" aria-label={t.filter}>
          <button type="button" aria-pressed={shown === "worth"} onClick={() => setView("worth")}>{t.worthALook}{flagged ? <span className="ti-count">{fmt(flagged)}</span> : null}</button>
          <button type="button" aria-pressed={shown === "all"} onClick={() => setView("all")}>{t.all}</button>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="ti-empty"><Check size={18} aria-hidden />{t.noneFlagged}</p>
      ) : (
        <ul className="ti-questions">
          {questions.map((q) => {
            const tone = toneOf(q);
            const expanded = open === q.id;
            const lead = [...q.flags].sort((a, b) => SEVERITY[a] - SEVERITY[b])[0];
            return (
              <li key={q.id} className="ti-q" data-tone={tone}>
                <button type="button" className="ti-q__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : q.id)}>
                  <span className="ti-q__glyph" aria-hidden>{tone === "green" ? <Check size={15} strokeWidth={2.5} /> : tone === "gray" ? <Info size={15} /> : <AlertTriangle size={14} strokeWidth={2.3} />}</span>
                  <span className="ti-q__main">
                    <span className="ti-q__title" dir="auto">{q.text}</span>
                    <span className="ti-q__verdict">{lead ? t.flags[lead].title : q.reviewCount > 0 ? t.fastTitle : t.healthy}</span>
                    <span className="ti-q__stats">
                      <span className="ti-meter" aria-hidden><span style={{ width: `${q.correctRate ?? 0}%` }} /></span>
                      <span>{q.correctRate === null ? "—" : `${fmt(q.correctRate)}%`} {t.correct}</span>
                      {q.medianSeconds !== null && <span><Timer size={12} aria-hidden /> {t.seconds(fmt(Math.round(q.medianSeconds * 10) / 10))} {t.median}</span>}
                      <span>{t.answers(fmt(q.answered))}</span>
                    </span>
                  </span>
                  <ChevronDown size={16} aria-hidden className="ti-row__chevron" data-open={expanded || undefined} />
                </button>
                {expanded && (
                  <div className="ti-q__detail">
                    {[...q.flags].sort((a, b) => SEVERITY[a] - SEVERITY[b]).map((flag) => (
                      <p key={flag} className="ti-reason"><strong>{t.flags[flag].title}</strong>{t.flags[flag].body}</p>
                    ))}
                    {q.commonWrong && (
                      <div className="ti-wrong">
                        <span className="ti-wrong__label">{t.commonWrong}</span>
                        <span className="ti-wrong__value" dir="auto">{q.commonWrong.label}</span>
                        <span className="ti-wrong__count">{t.students(fmt(q.commonWrong.count))}</span>
                      </div>
                    )}
                    {q.reviewCount > 0 && <p className="ti-fact"><Zap size={14} aria-hidden />{t.tooFast(fmt(q.reviewCount))}</p>}
                    {q.timingCount > 0 && <p className="ti-fact"><Clock size={14} aria-hidden />{t.timed(fmt(q.timingCount))}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Version history: Preview's "Browse All Versions" ───────────────── */

type Change = "added" | "removed" | "changed" | "same";
const same = (a: VQuestion, b: VQuestion) => JSON.stringify(a) === JSON.stringify(b);
function compare(base: Version | undefined, other: Version | undefined) {
  const theirs = new Map(other?.questions.map((q) => [q.id, q]) ?? []);
  const mine = new Map(base?.questions.map((q) => [q.id, q]) ?? []);
  const change = (q: VQuestion, side: "base" | "other"): Change => {
    const counterpart = side === "base" ? theirs.get(q.id) : mine.get(q.id);
    if (!counterpart) return side === "base" ? "added" : "removed";
    return same(q, counterpart) ? "same" : "changed";
  };
  const counts = { changed: 0, added: 0, removed: 0 };
  for (const q of base?.questions ?? []) { const c = change(q, "base"); if (c === "changed" || c === "added") counts[c]++; }
  for (const q of other?.questions ?? []) if (!mine.has(q.id)) counts.removed++;
  return { theirs, mine, change, counts };
}

function VersionBrowser({ target, t, onClose }: { target: Target; t: T; onClose: () => void }) {
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const report = useReport(target);
  const dialog = useModal<HTMLDivElement>({ onClose });
  const [selected, setSelected] = useState(0);
  const [phoneView, setPhoneView] = useState<"past" | "current">("past");
  const versions = report?.versions ?? [];
  const current = versions[0];
  const past = versions.slice(1);
  const pick = (i: number) => { if (i >= 0 && i < past.length) { setSelected(i); setPhoneView("past"); } };
  const name = (v: Version) => (target.formId ? t.versionN(v.key) : t.snapshotN(fmt(versions.length - versions.indexOf(v))));
  const when = (v: Version) => formatDateTime(locale, v.at, { dateStyle: "medium", timeStyle: "short" });
  const diff = compare(current, past[selected]);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); setSelected((s) => Math.min(past.length - 1, s + 1)); }
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [dialog, past.length]);
  const totals = diff.counts;
  return (
    <div ref={dialog} className="vb" role="dialog" aria-modal="true" aria-label={t.history} tabIndex={-1} dir={locale === "ar" ? "rtl" : "ltr"} data-phone-view={phoneView}>
      <div className="vb-backdrop" aria-hidden />
      {report === undefined ? (
        <p className="vb-status" role="status">{t.loading}</p>
      ) : report === null || !current ? (
        <p className="vb-status">{t.unavailable}</p>
      ) : (
        <>
          <div className="vb-phone-switch ws-segmented" role="group" aria-label={t.showing}>
            <button type="button" aria-pressed={phoneView === "past"} disabled={!past.length} onClick={() => setPhoneView("past")}>{t.showPast}</button>
            <button type="button" aria-pressed={phoneView === "current"} onClick={() => setPhoneView("current")}>{t.showCurrent}</button>
          </div>
          <div className="vb-layout">
            <section className="vb-pane vb-pane--current" aria-label={t.current}>
              <div className="vb-stack">
                <VersionDoc version={current} title={name(current)} t={t} fmt={fmt} change={past[selected] ? (q) => diff.change(q, "base") : undefined} counterpart={diff.theirs} side="base" />
              </div>
              <p className="vb-caption"><strong>{t.current}</strong><span>{when(current)}</span></p>
            </section>
            <section className="vb-pane vb-pane--past" aria-label={past[selected] ? `${name(past[selected])}, ${when(past[selected])}` : t.older}>
              {past.length === 0 ? (
                <div className="vb-stack"><div className="vb-doc vb-doc--empty"><History size={26} aria-hidden /><p>{t.onlyOne}</p></div></div>
              ) : (
                <div className="vb-stack">
                  {past.map((v, i) => {
                    const d = i - selected;
                    if (d > 3 || d < -1) return null;
                    return (
                      <div key={v.key} className="vb-card" data-depth={d < 0 ? "ahead" : d} style={{ ["--d" as string]: Math.max(0, d) }} aria-hidden={d !== 0 || undefined}
                        onClick={d > 0 ? () => pick(i) : undefined}>
                        <VersionDoc version={v} title={name(v)} t={t} fmt={fmt} change={d === 0 ? (q) => diff.change(q, "other") : undefined} counterpart={diff.mine} side="other" />
                      </div>
                    );
                  })}
                </div>
              )}
              {past[selected] && <p className="vb-caption"><strong>{name(past[selected])}</strong><span>{when(past[selected])} · {t.attempts(fmt(past[selected].attempts))}</span></p>}
            </section>
            {past.length > 0 && (
              <nav className="vb-timeline" aria-label={t.timeline}>
                <button type="button" className="vb-arrow" aria-label={t.older} disabled={selected >= past.length - 1} onClick={() => pick(selected + 1)}><ChevronUp size={18} aria-hidden /></button>
                <ol>
                  {[...past].reverse().map((v) => {
                    const i = past.indexOf(v);
                    return (
                      <li key={v.key}>
                        <button type="button" aria-current={i === selected ? "true" : undefined} onClick={() => pick(i)} aria-label={`${name(v)}, ${when(v)}`}>
                          <span className="vb-timeline__label">{formatDateTime(locale, v.at, { month: "short", day: "numeric" })}</span>
                          <span className="vb-timeline__tick" />
                        </button>
                      </li>
                    );
                  })}
                  <li aria-hidden className="vb-timeline__now"><span className="vb-timeline__label">{t.now}</span><span className="vb-timeline__tick" /></li>
                </ol>
                <button type="button" className="vb-arrow" aria-label={t.newer} disabled={selected <= 0} onClick={() => pick(selected - 1)}><ChevronDown size={18} aria-hidden /></button>
              </nav>
            )}
          </div>
          <footer className="vb-bar">
            {past[selected] && (
              <p className="vb-changes" aria-live="polite">
                {totals.changed + totals.added + totals.removed === 0 ? t.noChanges : t.changes(fmt(totals.changed), fmt(totals.added), fmt(totals.removed))}
              </p>
            )}
            {!target.formId && past.length > 0 && <p className="vb-footnote">{t.snapshotsNote}</p>}
            <button type="button" data-close className="vb-done" onClick={onClose}>{t.done}</button>
          </footer>
        </>
      )}
    </div>
  );
}

/** One version as a sheet of paper; changes are marked against the version it is compared with. */
function VersionDoc({ version, title, t, fmt, change, counterpart, side }: {
  version: Version; title: string; t: T; fmt: (n: number) => string;
  change?: (q: VQuestion) => Change; counterpart: Map<string, VQuestion>; side: "base" | "other";
}) {
  const label: Record<Exclude<Change, "same">, string> = { added: t.added, removed: t.removed, changed: t.changed };
  return (
    <article className="vb-doc">
      <header className="vb-doc__head"><History size={14} aria-hidden /><span>{title}</span></header>
      <ol className="vb-questions">
        {version.questions.map((q, n) => {
          const c = change?.(q) ?? "same";
          const other = counterpart.get(q.id);
          const compared = c === "changed" && other;
          const keyChanged = compared && JSON.stringify([...q.answerKey].sort()) !== JSON.stringify([...other.answerKey].sort());
          return (
            <li key={q.id} className="vb-q" data-change={c}>
              <div className="vb-q__head">
                <span className="vb-q__num">{fmt(n + 1)}</span>
                <p dir="auto">{compared && other.text !== q.text ? <mark>{q.text}</mark> : q.text}</p>
                {c !== "same" && <span className="vb-badge" data-change={c}>{label[c]}</span>}
              </div>
              {q.options.length > 0 && (
                <ul className="vb-q__options">
                  {q.options.map((o, i) => {
                    const isKey = q.answerKey.includes(o);
                    const novel = compared && !other.options.includes(o);
                    return (
                      <li key={`${i}-${o}`} data-key={isKey || undefined} data-diff={novel ? (side === "base" ? "added" : "removed") : undefined}>
                        <span className="vb-q__mark" aria-hidden>{isKey ? <Check size={11} strokeWidth={3} /> : null}</span>
                        <span dir="auto">{o}</span>
                        {isKey && <span className="sr-only">{t.answerKey}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="vb-q__meta">
                {compared && other.points !== q.points ? <mark>{t.marks(q.points, fmt(q.points))}</mark> : t.marks(q.points, fmt(q.points))}
                {q.timeLimit !== null && <> · {t.limit(fmt(q.timeLimit))}</>}
                {keyChanged && <span className="vb-q__key">{t.keyChanged}</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
