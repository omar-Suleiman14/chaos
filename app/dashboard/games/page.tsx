"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, Plus, Radio } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ThemePresetId } from "@/convex/formLogic";
import { emptyDefinition } from "@/convex/formLogic";
import { DEFAULT_TIME_LIMIT, TIME_LIMITS } from "@/convex/liveLogic";
import { ThemePicker } from "@/components/ThemePicker";
import GameHistory from "@/components/live/GameHistory";
import { themeFromPreset } from "@/components/forms/formThemes";
import { useHostLive } from "@/components/live/HostLiveButton";
import { useCreateForm } from "@/components/workspace/useCreateForm";
import { WsSwitch } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { useCopy, useLocale } from "@/lib/i18n";
import "./games.css";

const copy = {
  en: {
    title: "Games", lead: "Create a quiz or host a published one. Players join at /play with a PIN.",
    create: "Create a game", creating: "Creating…", guide: "Hosting guide",
    setup: "Session settings", setupHelp: "You can change these in the lobby too.",
    theme: "Theme", themeLabel: "Game theme", inherit: "Use quiz theme",
    themeHelp: "Keep the quiz’s design or pick a theme.",
    time: "Time per question", seconds: (n: number) => `${n} seconds`,
    labels: "Show answers on phones", labelsHelp: "Players see the answer text on their phones.",
    ready: "Ready to host", draft: "Drafts", published: "Published", draftStatus: "Draft",
    host: "Host live", edit: "Edit quiz", finish: "Finish & publish",
    hostingNote: "Hosting uses the published version. Publish any edits before your next game.",
    draftNote: "Add choice questions with correct answers, then publish to host a live game.",
    emptyReady: "No published quizzes yet.", emptyDrafts: "No drafts.", loading: "Loading your games…",
    untitled: "Untitled game", history: "History", historyHelp: "Games you hosted. Open a running game or see the saved results.",
  },
  ar: {
    title: "الألعاب", lead: "أنشئ اختبارًا أو استضف اختبارًا منشورًا. ينضم اللاعبون عبر /play برمز اللعبة.",
    create: "أنشئ لعبة", creating: "جارٍ الإنشاء…", guide: "دليل الاستضافة",
    setup: "إعدادات الجلسة", setupHelp: "يمكنك تعديلها في الردهة أيضًا.",
    theme: "المظهر", themeLabel: "مظهر اللعبة", inherit: "استخدم مظهر الاختبار",
    themeHelp: "احتفظ بتصميم الاختبار أو اختر مظهرًا.",
    time: "وقت كل سؤال", seconds: (n: number) => `${n} ثانية`,
    labels: "اعرض الإجابات على الهواتف", labelsHelp: "يرى اللاعبون نص الإجابات على هواتفهم.",
    ready: "جاهزة للاستضافة", draft: "المسودات", published: "منشور", draftStatus: "مسودة",
    host: "استضف مباشرة", edit: "عدّل الاختبار", finish: "أكمل وانشر",
    hostingNote: "تستخدم الاستضافة النسخة المنشورة. انشر تعديلاتك قبل اللعبة التالية.",
    draftNote: "أضف أسئلة اختيار بإجابات صحيحة، ثم انشر لاستضافة لعبة مباشرة.",
    emptyReady: "لا اختبارات منشورة بعد.", emptyDrafts: "لا مسودات.", loading: "جارٍ تحميل ألعابك…",
    untitled: "لعبة بلا عنوان", history: "السجل", historyHelp: "الألعاب التي استضفتها. افتح لعبة جارية أو اطّلع على النتائج المحفوظة.",
  },
};

export default function GamesPage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const forms = useQuery(api.forms.listMyForms);
  const legacy = useQuery(api.quizFunctions.getMyQuizzes);
  const [preset, setPreset] = useState<ThemePresetId>();
  const [timeLimitSec, setTimeLimitSec] = useState<number>(DEFAULT_TIME_LIMIT);
  const [showAnswerLabels, setShowAnswerLabels] = useState(true);
  const [error, setError] = useState("");
  const { create, busy } = useCreateForm(setError);
  const host = useHostLive();
  const quizzes = forms ? [...forms.owned, ...forms.shared.filter((f) => f.role === "editor")].filter((f) => f.quizMode && f.status !== "archived") : [];
  const loaded = forms !== undefined && legacy !== undefined;

  const createGame = () => {
    setError("");
    const definition = {
      ...emptyDefinition(t.untitled), theme: themeFromPreset(preset ?? "paper"),
      quiz: { enabled: true }, defaultLanguage: locale, languages: [locale], presentation: "conversational" as const,
    };
    void create({ definition, quizMode: true, title: definition.title });
  };
  const reportHost = async (target: Parameters<typeof host.start>[0]) => {
    setError("");
    const message = await host.start({ ...target, timeLimitSec, showAnswerLabels, ...(preset ? { theme: themeFromPreset(preset) } : {}) });
    if (message) setError(message);
  };
  const quizRows = (published: boolean) => <div className="games-quiz-list">
    {quizzes.filter((quiz) => (quiz.publishedVersion !== undefined) === published).map((quiz) => <article key={quiz._id}>
      <div className="games-quiz-list__title"><Link href={`/dashboard/forms/${quiz._id}`}><h3>{quiz.title}</h3></Link><p>{published ? t.published : t.draftStatus}</p></div>
      <div className="games-quiz-list__actions"><Link className="ws-btn" href={`/dashboard/forms/${quiz._id}`}>{published ? t.edit : t.finish}<ArrowRight size={15} aria-hidden="true" className="rtl:rotate-180" /></Link>
        {published && <button type="button" disabled={host.busy} className="ws-btn ws-btn--primary" onClick={() => void reportHost({ formId: quiz._id })}><Radio size={16} aria-hidden="true" />{host.label}</button>}
      </div>
    </article>)}
    {legacy?.filter((quiz) => quiz.isPublished === published).map((quiz) => <article key={quiz._id}>
      <div className="games-quiz-list__title"><Link href={`/dashboard/editor?id=${quiz._id}`}><h3>{quiz.title}</h3></Link><p>{published ? t.published : t.draftStatus}</p></div>
      <div className="games-quiz-list__actions"><Link href={`/dashboard/editor?id=${quiz._id}`} className="ws-btn">{published ? t.edit : t.finish}</Link>
        {published && <button type="button" className="ws-btn ws-btn--primary" disabled={host.busy} onClick={() => void reportHost({ quizId: quiz._id })}><Radio size={16} aria-hidden="true" />{host.label}</button>}
      </div>
    </article>)}
    {loaded && !quizzes.some((quiz) => (quiz.publishedVersion !== undefined) === published) && !legacy?.some((quiz) => quiz.isPublished === published) && <p className="games-empty">{published ? t.emptyReady : t.emptyDrafts}</p>}
  </div>;

  return <div className="games-hub">
    <header className="ws-page-header games-header">
      <div><h1 className="ws-page-title">{t.title}</h1><p className="games-help">{t.lead}</p></div>
      <div className="games-actions"><Link href="/docs/live-games" className="ws-btn"><BookOpen size={16} aria-hidden="true" />{t.guide}</Link><button type="button" className="ws-btn ws-btn--primary" disabled={busy} onClick={createGame}><Plus size={18} aria-hidden="true" />{busy ? t.creating : t.create}</button></div>
    </header>
    {error && <p className="text-destructive" role="alert">{error}</p>}
    <section className="games-session" aria-labelledby="games-session-title">
      <h2 id="games-session-title">{t.setup}</h2><p className="games-help">{t.setupHelp}</p>
      <div className="games-session__fields">
        <div className="games-session__theme"><h3>{t.theme}</h3><p className="games-help">{t.themeHelp}</p>
          <ThemePicker value={preset} onChange={setPreset} label={t.themeLabel} defaultOption={{ label: t.inherit, onSelect: () => setPreset(undefined) }} />
        </div>
        <div className="games-session__controls">
          <div className="games-time"><span>{t.time}</span><Select label={t.time} value={String(timeLimitSec)} onChange={(value) => setTimeLimitSec(Number(value))} options={TIME_LIMITS.map((seconds) => ({ value: String(seconds), label: t.seconds(seconds) }))} /></div>
          <div className="games-labels"><WsSwitch label={t.labels} checked={showAnswerLabels} onChange={setShowAnswerLabels} /><p className="games-help">{t.labelsHelp}</p></div>
        </div>
      </div>
    </section>
    {!loaded && <p className="games-help" role="status">{t.loading}</p>}
    {loaded && <>
      <section className="games-library" aria-labelledby="games-published-title"><h2 id="games-published-title">{t.ready}</h2><p className="games-help">{t.hostingNote}</p>{quizRows(true)}</section>
      <section className="games-library" aria-labelledby="games-drafts-title"><h2 id="games-drafts-title">{t.draft}</h2><p className="games-help">{t.draftNote}</p>{quizRows(false)}</section>
      <section className="games-library" aria-labelledby="games-history-title"><h2 id="games-history-title">{t.history}</h2><p className="games-help">{t.historyHelp}</p><GameHistory /></section>
    </>}
  </div>;
}
