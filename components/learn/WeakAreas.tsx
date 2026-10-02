"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { Target } from "lucide-react";
import { studyReads, useStudyEvidence } from "@/lib/learn/studyClient";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Weak areas", lead: "Review suggestions from your opted-in, server-graded quiz responses. This is not a mastery score.",
    empty: "No ingested practice evidence yet. Signed-in completed quiz responses must be explicitly added to study evidence before they appear here.",
    signIn: "Sign in to view your private study evidence.", loading: "Loading study evidence…", refresh: "Refresh evidence", next: "Next concepts", previous: "Previous concepts",
    states: { weak: "Needs practice", review: "Review", insufficient: "Insufficient evidence" },
    attempts: (n: number) => `${n} independent completed responses (last 30 days)`, accuracy: "Average server-graded accuracy", last: "Last answered", confidence: "Evidence confidence",
    low: "Low", moderate: "Moderate", practice: "Practice suggestions", none: "No eligible practice suggestions in the bounded owned-quiz pool. Normal quiz access rules still apply.",
    recent: "Recently answered", start: "Open quiz", unavailable: "Quiz is no longer available.", bounded: "This list covers concepts in up to 200 of your ingested evidence rows; it is not an exhaustive history.",
  },
  ar: {
    title: "نقاط الضعف", lead: "اقتراحات مراجعة من إجابات الاختبارات المصحّحة على الخادم التي اخترت إضافتها. ليست درجة إتقان.",
    empty: "لا توجد أدلة تدريب مضافة بعد. يجب إضافة إجابات الاختبارات المكتملة أثناء تسجيل الدخول صراحةً إلى أدلة الدراسة قبل ظهورها هنا.",
    signIn: "سجّل الدخول لعرض أدلة دراستك الخاصة.", loading: "جارٍ تحميل أدلة الدراسة…", refresh: "حدّث الأدلة", next: "المفاهيم التالية", previous: "المفاهيم السابقة",
    states: { weak: "يحتاج تدريبًا", review: "مراجعة", insufficient: "أدلة غير كافية" },
    attempts: (n: number) => `${n} إجابات مكتملة مستقلة (آخر ٣٠ يومًا)`, accuracy: "متوسط الدقة المصحّحة على الخادم", last: "آخر إجابة", confidence: "الثقة في الأدلة",
    low: "منخفضة", moderate: "متوسطة", practice: "اقتراحات التدريب", none: "لا توجد اقتراحات مؤهّلة ضمن مجموعة اختباراتك المحدودة. تبقى قواعد الوصول المعتادة سارية.",
    recent: "أُجيب عنه مؤخرًا", start: "افتح الاختبار", unavailable: "لم يعد الاختبار متاحًا.", bounded: "تشمل القائمة مفاهيم من ٢٠٠ سجل أدلة مضافة كحد أقصى؛ وليست سجلًا كاملًا.",
  },
};

function PracticeLink({ formId, version, recentlyAnswered }: { formId: Id<"forms">; version: number; recentlyAnswered: boolean }) {
  const t = useCopy(copy);
  const link = useQuery(studyReads.practiceLink, { formId, version });
  if (link === undefined) return <p className="lx-muted" role="status">{t.loading}</p>;
  if (!link) return <p className="lx-muted">{t.unavailable}</p>;
  return <div className="lx-row"><span className="lx-row__main"><strong>{link.title}</strong>{recentlyAnswered && <small className="lx-muted">{t.recent}</small>}</span><Link className="ws-btn ws-btn--sm" href={link.href}>{t.start}</Link></div>;
}

export default function WeakAreas() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const auth = useConvexAuth();
  const catalog = useQuery(studyReads.myConcepts, auth.isAuthenticated ? {} : "skip");
  const [offset, setOffset] = useState(0);
  const concepts = catalog?.concepts.slice(offset, offset + 10) ?? [];
  const { states, practice, refresh } = useStudyEvidence(concepts.map(c => c.id));
  const references = [...new Map((practice ?? []).map(p => [`${p.formId}:${p.version}`, p])).values()];
  if (auth.isLoading || (auth.isAuthenticated && catalog === undefined)) return <p className="lx-muted" role="status">{t.loading}</p>;
  if (!auth.isAuthenticated) return <p className="lx-muted">{t.signIn}</p>;
  return <section className="lx-section" aria-labelledby="weak-areas-title">
    <header><h2 id="weak-areas-title">{t.title}</h2><button className="ws-btn ws-btn--sm" type="button" onClick={refresh}>{t.refresh}</button></header>
    <p className="lx-help">{t.lead}</p>
    <p className="lx-muted">{t.bounded}</p>
    {!concepts.length ? <p className="lx-muted">{t.empty}</p> : states === undefined ? <p role="status">{t.loading}</p> : <div className="lx-list">{states.map(state => <article key={state.conceptId} className="lx-panel">
      <div className="lx-panel__row"><strong><Target size={14} aria-hidden /> {concepts.find(c => c.id === state.conceptId)?.title}</strong><span className="lx-badge" data-tone={state.state === "weak" ? "amber" : undefined}>{t.states[state.state]}</span></div>
      <p className="lx-help">{state.reason}</p>
      <p className="lx-muted">{t.attempts(state.attempts)}</p>
      {state.accuracy !== null && <p className="lx-muted">{t.accuracy}: {Math.round(state.accuracy * 100)}%</p>}
      <p className="lx-muted">{t.confidence}: {t[state.confidence]}</p>
      {state.lastAnsweredAt !== null && <p className="lx-muted">{t.last}: {formatDate(locale, state.lastAnsweredAt)}</p>}
    </article>)}</div>}
    {(catalog?.concepts.length ?? 0) > 10 && <div className="lx-actions"><button className="ws-btn ws-btn--sm" type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 10))}>{t.previous}</button><button className="ws-btn ws-btn--sm" type="button" disabled={offset + 10 >= (catalog?.concepts.length ?? 0)} onClick={() => setOffset(offset + 10)}>{t.next}</button></div>}
    {concepts.length > 0 && <><h3>{t.practice}</h3>{practice === undefined ? <p role="status">{t.loading}</p> : references.length ? references.map(p => <PracticeLink key={`${p.formId}:${p.version}`} {...p} />) : <p className="lx-muted">{t.none}</p>}</>}
  </section>;
}
