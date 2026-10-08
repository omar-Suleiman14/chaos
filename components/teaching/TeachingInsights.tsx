"use client";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy, useLocale, formatNumber } from "@/lib/i18n";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock, History, Info, SearchCheck, Sparkles, Timer, Zap } from "lucide-react";
import VersionBrowser from "@/components/versions/VersionBrowser";
import { QuestionSheet, compareQuestions } from "@/components/versions/QuestionSheet";
import "./teaching.css";

type Target = { formId: Id<"forms"> };
type Report = NonNullable<FunctionReturnType<typeof api.formResults.getTeachingInsights>>;
type Quality = Report["questions"][number];
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
    current: "Current version",
    versionN: (key: string) => `Version ${key}`, attempts: (n: string) => `${n} attempts`,
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
    current: "النسخة الحالية",
    versionN: (key: string) => `النسخة ${key}`, attempts: (n: string) => `${n} محاولة`,
  },
};
type T = (typeof copy)["en"];

/** The report loads only once a tool is opened, so these tools add no work to the results page. */
function useReport(target: Target) {
  return useQuery(api.formResults.getTeachingInsights, { formId: target.formId });
}

export default function TeachingInsights(target: Target) {
  const t = useCopy(copy);
  const [detective, setDetective] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  return (
    <section className="ti" aria-label={t.title}>
      <div className="ti-group">
        <button type="button" className="ti-row" aria-expanded={detective} onClick={() => setDetective(!detective)}>
          <span className="ti-row__icon" aria-hidden><SearchCheck size={19} /></span>
          <span className="ti-row__text"><strong>{t.detective}</strong><small>{t.detectiveHelp}</small></span>
          <ChevronDown size={18} aria-hidden className="ti-row__chevron" data-open={detective || undefined} />
        </button>
        {detective && <Detective target={target} t={t} />}
        <button type="button" className="ti-row" aria-haspopup="dialog" onClick={() => setBrowsing(true)}>
          <span className="ti-row__icon" aria-hidden><History size={19} /></span>
          <span className="ti-row__text"><strong>{t.history}</strong><small>{t.historyHelp}</small></span>
          <ChevronRight size={18} aria-hidden className="ti-row__chevron rtl:rotate-180" />
        </button>
      </div>
      {browsing && <VersionHistory target={target} t={t} onClose={() => setBrowsing(false)} />}
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

/* ── Version history: the shared browser (components/versions) over quiz versions or snapshots ── */

function VersionHistory({ target, t, onClose }: { target: Target; t: T; onClose: () => void }) {
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const report = useReport(target);
  const versions = (report?.versions ?? []).map((v, i) => ({
    ...v, key: String(v.key), name: t.versionN(String(v.key)), detail: i > 0 ? t.attempts(fmt(v.attempts)) : undefined,
  }));
  return (
    <VersionBrowser label={t.history} status={report === undefined ? "loading" : report === null ? "unavailable" : "ready"}
      current={versions[0]} currentLabel={t.current} past={versions.slice(1)} onClose={onClose}
      counts={(a, b) => compareQuestions(a.questions, b.questions).counts}
      sheet={(v, { against, side }) => <QuestionSheet questions={v.questions} against={against?.questions} side={side} />} />
  );
}
