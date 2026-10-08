"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Plus, Radio, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ThemePresetId } from "@/convex/formLogic";
import { DEFAULT_TIME_LIMIT, TIME_LIMITS } from "@/convex/liveLogic";
import { ThemePicker } from "@/components/ThemePicker";
import GameHistory from "@/components/live/GameHistory";
import { themeFromPreset } from "@/components/forms/formThemes";
import { useHostLive } from "@/components/live/HostLiveButton";
import { useCreateForm } from "@/components/workspace/useCreateForm";
import { newGameArgs } from "./newGame";
import { WsSwitch } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { useCopy, useLocale } from "@/lib/i18n";
import "./games.css";
import { hostHref } from "@/lib/hosts";
import { useConfirmedQuery } from "@/lib/confirmedQuery";

const copy = {
  en: {
    title: "Games", lead: "Create a quiz or host a published one. Players join at /play with a PIN.",
    create: "Create a game", creating: "Creating…", guide: "Hosting guide",
    setup: "Session settings", setupHelp: "You can change these in the lobby too.",
    theme: "Theme", themeLabel: "Game theme", inherit: "Flow (default)",
    themeHelp: "Use Flow or choose another theme.",
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
    theme: "المظهر", themeLabel: "مظهر اللعبة", inherit: "انسيابي (الافتراضي)",
    themeHelp: "استخدم المظهر الانسيابي أو اختر مظهرًا آخر.",
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

/** Games: create or host quizzes live, session settings and history. Shown as the Library's Games tab. */
export default function GamesHub({ embedded = false }: { embedded?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const forms = useConfirmedQuery(api.forms.listMyForms).data;
  const [preset, setPreset] = useState<ThemePresetId>();
  const [timeLimitSec, setTimeLimitSec] = useState<number>(DEFAULT_TIME_LIMIT);
  const [showAnswerLabels, setShowAnswerLabels] = useState(true);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState({ published: 12, drafts: 12 });
  const matches = (title: string) => search.trim().toLocaleLowerCase().split(/\s+/).every(word => title.toLocaleLowerCase().includes(word));
  const { create, busy } = useCreateForm();
  const host = useHostLive();
  const router = useRouter();
  const createRehearsal = useMutation(api.live.createRehearsal);
  const [practising, setPractising] = useState(false);
  const [practiceError, setPracticeError] = useState("");
  const practise = async (target: Parameters<typeof createRehearsal>[0]) => {
    if (practising) return;
    setPractising(true); setPracticeError("");
    try { const gameId = await createRehearsal(target); router.push(hostHref(`/dashboard/live/${gameId}`)); }
    catch (error) { setPracticeError(error instanceof Error ? error.message : "Could not start rehearsal."); }
    finally { setPractising(false); }
  };
  const quizzes = forms ? [...forms.owned, ...forms.shared.filter((f) => f.role === "editor")].filter((f) => f.quizMode && f.status !== "archived") : [];
  const loaded = forms !== undefined;

  const createGame = () => {
    void create(newGameArgs(locale, preset ?? "flow"));
  };
  const reportHost = async (target: Parameters<typeof host.start>[0]) => {
    await host.start({ ...target, timeLimitSec, showAnswerLabels, ...(preset ? { theme: themeFromPreset(preset) } : {}) });
  };
  const quizRows = (published: boolean) => {
    const key = published ? "published" : "drafts";
    const filtered = quizzes.filter(quiz => (quiz.publishedVersion !== undefined) === published && matches(quiz.title));
    const count = filtered.length;
    return <div className="games-quiz-list">
    {filtered.slice(0, shown[key]).map((quiz) => <article key={quiz._id}>
      <div className="games-quiz-list__title"><Link href={hostHref(`/dashboard/forms/${quiz._id}`)}><h3>{quiz.title}</h3></Link><p>{published ? t.published : t.draftStatus}</p></div>
      <div className="games-quiz-list__actions"><Link className="ws-btn" href={hostHref(`/dashboard/forms/${quiz._id}`)}>{published ? t.edit : t.finish}<ArrowRight size={15} aria-hidden="true" className="rtl:rotate-180" /></Link>
        {published && <button type="button" className="ws-btn" disabled={practising} onClick={() => void practise({ formId: quiz._id })}>{locale === "ar" ? "تدرّب" : "Rehearse"}</button>}
        {published && <button type="button" disabled={host.busy} className="ws-btn ws-btn--primary" onClick={() => void reportHost({ formId: quiz._id })}><Radio size={16} aria-hidden="true" />{host.label}</button>}
      </div>
    </article>)}
    {loaded && count === 0 && <p className="games-empty">{published ? t.emptyReady : t.emptyDrafts}</p>}
    {count > shown[key] && <button type="button" className="ws-btn" onClick={() => setShown(previous => ({...previous,[key]:previous[key]+12}))}>{locale === "ar" ? "عرض المزيد" : "Show more"} ({count-shown[key]})</button>}
  </div>; };

  return <div className="games-hub">
    {practiceError && <p role="alert" className="games-help">{practiceError}</p>}
    {/* In the Library, games start from a quiz (New → Quiz, then Host); the standalone header only appears outside it. */}
    {!embedded && <header className="ws-page-header games-header">
      <div><h1 className="ws-page-title">{t.title}</h1><p className="games-help">{t.lead}</p></div>
      <div className="games-actions"><Link href={hostHref("/docs/live-games")} className="ws-btn"><BookOpen size={16} aria-hidden="true" />{t.guide}</Link><button type="button" className="ws-btn ws-btn--primary" disabled={busy} onClick={createGame}><Plus size={18} aria-hidden="true" />{busy ? t.creating : t.create}</button></div>
    </header>}
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
    <label className="ws-search"><Search size={16} aria-hidden/><input type="search" value={search} aria-label={locale === "ar" ? "ابحث عن اختبار لاستضافته" : "Find a quiz to host"} placeholder={locale === "ar" ? "ابحث عن اختبار لاستضافته…" : "Find a quiz to host…"} onChange={event=> {setSearch(event.target.value);setShown({published:12,drafts:12});}}/></label>
    {!loaded && <output className="games-help" >{t.loading}</output>}
    {loaded && <>
      <section className="games-library" aria-labelledby="games-published-title"><details className="games-toggle" open><summary><h2 id="games-published-title">{t.ready}</h2><span>{quizzes.filter(q => q.publishedVersion !== undefined).length}</span></summary><p className="games-help">{t.hostingNote}</p>{quizRows(true)}</details></section>
      <section className="games-library" aria-labelledby="games-drafts-title"><details className="games-toggle"><summary><h2 id="games-drafts-title">{t.draft}</h2><span>{quizzes.filter(q => q.publishedVersion === undefined).length}</span></summary><p className="games-help">{t.draftNote}</p>{quizRows(false)}</details></section>
      <section className="games-library" aria-labelledby="games-history-title"><details className="games-toggle"><summary><h2 id="games-history-title">{t.history}</h2></summary><p className="games-help">{t.historyHelp}</p><GameHistory /></details></section>
    </>}
  </div>;
}
