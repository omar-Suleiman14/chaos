"use client";

import "./live.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, Maximize, Minimize, Pause, Play, Users, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BREAKS, TIME_LIMITS } from "@/convex/liveLogic";
import { qrSvg } from "@/lib/qr";
import { sfx } from "@/lib/sfx";
import { parseError } from "@/lib/errors";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { WsConfirm } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { AnswerTile, shapeAt, ShapeIcon } from "./tiles";
import { Announcer, Countdown, StartCountdown, usePrefersReducedMotion, useSecondsLeft, useServerClock } from "./clock";
import { gameSound, gameThemeProps } from "./GameTheme";
import { ThemePicker } from "@/components/ThemePicker";
import { themeFromPreset } from "@/components/forms/formThemes";
import TeamPanel from "./TeamPanel";

const copy = {
  en: {
    loading: "Loading game…", missing: "This game was not found, or you are not its host.", back: "Back to games", settings: "Game settings", theme: "Theme", answerLabels: "Show answer text on phones",
    autoplay: "Autoplay", breakTime: "Pause between questions", autoStart: "Start when this many join", manual: "When I press Start",
    nextIn: (n: number) => `Next in ${n}`, pause: "Pause", cancel: "Cancel", startNow: "Start now",
    joinAt: "Join at", withPin: "Game PIN", scan: "Or scan to join",
    players: (n: number) => `${n} ${n === 1 ? "player" : "players"}`, waiting: "Waiting for players…",
    remove: (name: string) => `Remove ${name}`, confirmRemove: (name: string) => `Remove ${name} from the game?`,
    time: "Time per question", seconds: (n: number) => `${n} s`, start: "Start", skipped: (n: number) => `${n} question${n === 1 ? "" : "s"} skipped (live games need 2–4 choices).`,
    questionOf: (i: number, n: number) => `Question ${i} of ${n}`, answered: (a: number, n: number) => `${a} of ${n} answered`, answeredShort: (n: number) => `of ${n} answered`,
    showAnswer: "Show answer", next: "Next", nextQuestion: "Next question", finish: "Finish", leaderboard: "Leaderboard",
    correctIs: (labels: string) => `Correct: ${labels}`, multi: "More than one answer can be right",
    podium: "Podium", finalBoard: "Final scores", points: (n: string) => `${n} pts`,
    saving: "Saving everyone's answers to Results…", saved: (n: number) => `${n} response${n === 1 ? "" : "s"} saved to Results.`, unsaved: (n: number) => `${n} could not be saved because the limit was reached.`,
    openResults: "Open Results", endGame: "End game", confirmEnd: "End the game for everyone now? Answers so far are saved.",
    mute: "Mute sounds", unmute: "Turn sounds on", fullscreen: "Full screen", exitFullscreen: "Exit full screen",
    ended: "Game over", endedIdle: "This game ended after three hours without activity.",
    announceQuestion: (i: number, text: string) => `Question ${i}: ${text}`, announceJoin: (name: string) => `${name} joined`,
    announceReveal: (labels: string) => `Time is up. Correct answer: ${labels}`, announceBoard: (name: string) => `Leaderboard. ${name} is first.`,
    announceEnd: (name: string) => `Game over. ${name} wins.`,
  },
  ar: {
    loading: "جارٍ تحميل اللعبة…", missing: "لم نجد هذه اللعبة، أو لست مضيفها.", back: "العودة إلى الألعاب", settings: "إعدادات اللعبة", theme: "المظهر", answerLabels: "اعرض نص الإجابات على الهواتف",
    autoplay: "تشغيل تلقائي", breakTime: "الاستراحة بين الأسئلة", autoStart: "ابدأ عند انضمام هذا العدد", manual: "عندما أضغط ابدأ",
    nextIn: (n: number) => `التالي بعد ${n}`, pause: "إيقاف مؤقت", cancel: "إلغاء", startNow: "ابدأ الآن",
    joinAt: "انضم عبر", withPin: "رمز اللعبة", scan: "أو امسح الرمز للانضمام",
    players: (n: number) => (n === 1 ? "لاعب واحد" : n === 2 ? "لاعبان" : n >= 3 && n <= 10 ? `${n} لاعبين` : `${n} لاعبًا`), waiting: "بانتظار اللاعبين…",
    remove: (name: string) => `إزالة ${name}`, confirmRemove: (name: string) => `هل تريد إزالة ${name} من اللعبة؟`,
    time: "الوقت لكل سؤال", seconds: (n: number) => `${n} ث`, start: "ابدأ", skipped: (n: number) => `تُرك ${n === 1 ? "سؤال واحد" : `${n} من الأسئلة`} (تحتاج الألعاب إلى 2–4 خيارات).`,
    questionOf: (i: number, n: number) => `السؤال ${i} من ${n}`, answered: (a: number, n: number) => `أجاب ${a} من ${n}`, answeredShort: (n: number) => `من ${n} أجابوا`,
    showAnswer: "أظهر الإجابة", next: "التالي", nextQuestion: "السؤال التالي", finish: "إنهاء", leaderboard: "لوحة الصدارة",
    correctIs: (labels: string) => `الصحيح: ${labels}`, multi: "قد تكون أكثر من إجابة صحيحة",
    podium: "منصة الفائزين", finalBoard: "النتائج النهائية", points: (n: string) => `${n} نقطة`,
    saving: "جارٍ حفظ إجابات الجميع في النتائج…", saved: (n: number) => `حُفظ ${n} ردًّا في النتائج.`, unsaved: (n: number) => `تعذّر حفظ ${n} لأن الحد الأقصى اكتمل.`,
    openResults: "افتح النتائج", endGame: "أنهِ اللعبة", confirmEnd: "هل تريد إنهاء اللعبة للجميع الآن؟ تُحفظ الإجابات حتى الآن.",
    mute: "كتم الأصوات", unmute: "تشغيل الأصوات", fullscreen: "ملء الشاشة", exitFullscreen: "الخروج من ملء الشاشة",
    ended: "انتهت اللعبة", endedIdle: "انتهت هذه اللعبة بعد ثلاث ساعات بلا نشاط.",
    announceQuestion: (i: number, text: string) => `السؤال ${i}: ${text}`, announceJoin: (name: string) => `انضم ${name}`,
    announceReveal: (labels: string) => `انتهى الوقت. الإجابة الصحيحة: ${labels}`, announceBoard: (name: string) => `لوحة الصدارة. ${name} في المركز الأول.`,
    announceEnd: (name: string) => `انتهت اللعبة. الفائز ${name}.`,
  },
};

export default function HostScreen({ gameId }: { gameId: Id<"liveGames"> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const game = useQuery(api.live.hostView, { gameId });
  const advance = useMutation(api.live.advance);
  const endGame = useMutation(api.live.endGameNow);
  const kick = useMutation(api.live.kickPlayer);
  const setTime = useMutation(api.live.setTimeLimit);
  const setSettings = useMutation(api.live.setGameSettings);
  const setCountdown = useMutation(api.live.setCountdown);
  const setAutoplay = useMutation(api.live.setAutoplay);
  const pack = gameSound(game?.theme);
  const offset = useServerClock();
  const calm = usePrefersReducedMotion();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [announce, setAnnounce] = useState("");
  const [sound, setSound] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setSound(sfx.isEnabled()); }, []);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://chaos.fail";
  const joinUrl = game ? `${origin}/play?pin=${game.pin}` : "";
  const qr = useMemo(() => (joinUrl ? qrSvg(joinUrl) : ""), [joinUrl]);

  // Sounds and announcements follow state changes.
  const lastState = useRef<string>("");
  const lastCount = useRef<number>(0);
  useEffect(() => {
    if (!game) return;
    const key = `${game.state}:${game.questionIndex}`;
    if (key !== lastState.current) {
      const first = lastState.current === "";
      lastState.current = key;
      if (!first) {
        const correctLabels = game.question?.correct?.map((id) => game.question!.options.find((o) => o.id === id)?.label ?? "").join(", ") ?? "";
        if (game.state === "question") { sfx.play("start", pack); setAnnounce(t.announceQuestion(game.questionIndex + 1, game.question?.text ?? "")); }
        if (game.state === "reveal") { sfx.play("correct", pack); setAnnounce(t.announceReveal(correctLabels)); }
        if (game.state === "leaderboard") { sfx.play("next", pack); setAnnounce(t.announceBoard(game.players[0]?.nickname ?? "")); }
        if (game.state === "ended") { sfx.play("finish", pack); setAnnounce(t.announceEnd(game.players[0]?.nickname ?? "")); }
      }
      // Keep keyboard focus on the one button that moves the game on.
      window.setTimeout(() => nextRef.current?.focus(), 50);
    }
    if (game.state === "lobby" && game.playerCount > lastCount.current && lastCount.current > 0) {
      sfx.play("pop", pack);
      // Equal scores list newest first, so the newest player is first in the lobby.
      setAnnounce(t.announceJoin(game.players[0]?.nickname ?? ""));
    }
    lastCount.current = game.playerCount;
  }, [game, t, pack]);

  // Confetti for the podium, unless reduced motion is requested.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!game || game.state !== "ended" || calm || celebrated.current || !game.players.length) return;
    celebrated.current = true;
    void import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 140, spread: 90, origin: { y: 0.7 }, disableForReducedMotion: true })).catch(() => {});
  }, [game, calm]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(parseError(e).message); } finally { pending.current = false; setBusy(false); }
  }, []);
  const [confirming, setConfirming] = useState<{ body: string; label: string; run: () => void } | null>(null);

  const onTick = useCallback((left: number) => { if (left > 0 && left <= 5) sfx.play("tap", pack); }, [pack]);

  if (game === undefined) return <div className="live-root"><div className="live-center live-muted" role="status">{t.loading}</div></div>;
  if (game === null) {
    return (
      <div className="live-root">
        <div className="live-center">
          <p>{t.missing}</p>
          <Link href="/dashboard?tab=games" className="live-btn">{t.back}</Link>
        </div>
      </div>
    );
  }

  const step = () => {
    if (game.state === "ended") return;
    if (game.state === "lobby" && !game.startsAt) { void run(() => setCountdown({ gameId, running: true })); return; }
    void run(() => advance({ gameId, from: game.state as "lobby" | "question" | "reveal" | "leaderboard", questionIndex: game.questionIndex }));
  };
  const toggleSound = () => { const next = !sound; sfx.setEnabled(next); setSound(next); };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const resultsHref = game.formId ? `/dashboard/forms/${game.formId}/responses` : game.quizId ? `/dashboard/results?id=${game.quizId}` : "/dashboard";
  const fmt = (n: number) => formatNumber(locale, n);
  const question = game.question;
  const correct = new Set(question?.correct ?? []);
  const nextLabel = game.state === "lobby" ? (game.startsAt ? t.startNow : t.start) : game.state === "question" ? t.showAnswer : game.state === "reveal" ? t.leaderboard : game.questionIndex + 1 < game.questionCount ? t.nextQuestion : t.finish;
  const maxVotes = Math.max(1, ...Object.values(game.distribution ?? {}));

  return (
    <div {...gameThemeProps(game.theme, game.appearance)} data-calm={calm} data-role="host">
      {confirming && <WsConfirm title={confirming.label} body={confirming.body} confirmLabel={confirming.label} onClose={() => setConfirming(null)} onConfirm={confirming.run} />}
      <Announcer text={announce} />
      <header className="live-bar">
        <Link href="/dashboard?tab=games" className="live-icon-btn" aria-label={t.back}><ArrowLeft size={20} className="rtl:rotate-180" /></Link>
        <span className="live-bar__title">{game.title}</span>
        {game.state !== "lobby" && game.state !== "ended" && <span className="live-muted">{t.questionOf(game.questionIndex + 1, game.questionCount)}</span>}
        <span className="live-muted inline-flex items-center gap-1"><Users size={18} aria-hidden="true" /> {t.players(game.playerCount)}</span>
        <button type="button" className="live-icon-btn" onClick={toggleSound} aria-label={sound ? t.mute : t.unmute} aria-pressed={!sound}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
        <button type="button" className="live-icon-btn" onClick={toggleFullscreen} aria-label={fullscreen ? t.exitFullscreen : t.fullscreen}>{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
        {game.state !== "ended" && (
          <button type="button" className="live-btn live-btn--danger" onClick={() => setConfirming({ body: t.confirmEnd, label: t.endGame, run: () => void run(() => endGame({ gameId })) })}>{t.endGame}</button>
        )}
      </header>

      <main className="live-main" id="live-main">
        {error && <p className="live-error" role="alert">{error}</p>}
        <TeamPanel gameId={gameId} frozen={game.state !== "lobby" || game.startsAt != null} maxPlayers={game.settings.maxPlayers} players={game.players} />

        {game.state === "lobby" && game.startsAt && (
          <div className="live-center">
            <StartCountdown startsAt={game.startsAt} offset={offset} onTick={onTick} />
            <div className="flex gap-3">
              <button type="button" className="live-btn" onClick={() => void run(() => setCountdown({ gameId, running: false }))} disabled={busy}>{t.cancel}</button>
              <button ref={nextRef} type="button" className="live-btn live-btn--primary" onClick={step} disabled={busy}>{t.startNow}</button>
            </div>
          </div>
        )}

        {game.state === "lobby" && !game.startsAt && (
          <>
            <section className="live-join live-card" aria-label={t.withPin}>
              <div className="flex flex-col gap-3">
                <p className="text-2xl">{t.joinAt} <strong dir="ltr">{origin.replace(/^https?:\/\//, "")}/play</strong></p>
                <p className="live-muted text-xl">{t.withPin}</p>
                <p className="live-pin" aria-label={game.pin.split("").join(" ")}>{game.pin.slice(0, 3)} {game.pin.slice(3)}</p>
              </div>
              <figure className="flex flex-col items-center gap-2 m-0">
                <div className="live-qr" role="img" aria-label={t.scan} dangerouslySetInnerHTML={{ __html: qr }} />
                <figcaption className="live-muted">{t.scan}</figcaption>
              </figure>
            </section>
            <section className="flex flex-col gap-3" aria-live="off">
              <h2 className="text-2xl font-bold">{game.playerCount ? t.players(game.playerCount) : <span className="live-pulse">{t.waiting}</span>}</h2>
              <ul className="live-players" aria-label={t.players(game.playerCount)}>
                {game.players.map((p) => (
                  <li key={p._id} className="live-chip live-pop">
                    <span>{p.nickname}</span>
                    <button type="button" aria-label={t.remove(p.nickname)} onClick={() => setConfirming({ body: t.confirmRemove(p.nickname), label: t.remove(p.nickname), run: () => void run(() => kick({ gameId, playerId: p._id })) })}><X size={18} /></button>
                  </li>
                ))}
              </ul>
            </section>
            {game.skippedQuestions > 0 && <p className="live-muted">{t.skipped(game.skippedQuestions)}</p>}
            <details className="live-settings live-card">
              <summary>{t.settings}</summary>
              <div className="live-settings__content">
                <ThemePicker label={t.theme} value={game.appearance === "apple" ? undefined : game.theme?.preset ?? "chaos"} defaultOption={{ label: locale === "ar" ? "بأسلوب Apple (الافتراضي)" : "Apple style (default)", onSelect: () => void run(() => setSettings({ gameId, appearance: "apple" })) }} onChange={(preset) => void run(() => setSettings({ gameId, theme: themeFromPreset(preset), appearance: "theme" }))} />
                <label className="live-toggle"><input type="checkbox" checked={game.settings.showAnswerLabels !== false} disabled={busy} onChange={(e) => void run(() => setSettings({ gameId, showAnswerLabels: e.target.checked }))} /><span>{t.answerLabels}</span></label>
                <label className="live-toggle"><input type="checkbox" checked={!!game.settings.autoAdvance} disabled={busy} onChange={(e) => void run(() => setAutoplay({ gameId, autoAdvance: e.target.checked }))} /><span>{t.autoplay}</span></label>
                {game.settings.autoAdvance && (
                  <div className="flex items-center gap-2">
                    <span id="live-break-label">{t.breakTime}</span>
                    <Select labelledBy="live-break-label" value={String(game.settings.breakSec ?? 5)}
                      onChange={(v) => void run(() => setAutoplay({ gameId, breakSec: Number(v) }))}
                      options={[...new Set([...BREAKS, game.settings.breakSec ?? 5])].sort((a, b) => a - b).map((s) => ({ value: String(s), label: t.seconds(s) }))} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span id="live-autostart-label">{t.autoStart}</span>
                  <Select labelledBy="live-autostart-label" value={String(game.settings.startWhenPlayers ?? 0)}
                    onChange={(v) => void run(() => setSettings({ gameId, startWhenPlayers: Number(v) }))}
                    options={[{ value: "0", label: t.manual }, ...[...new Set([2, 5, 10, 20, 30, 50, game.settings.startWhenPlayers ?? 2])].filter((n) => n > 0 && n <= game.settings.maxPlayers).sort((a, b) => a - b).map((n) => ({ value: String(n), label: t.players(n) }))]} />
                </div>
              <div className="flex items-center gap-2">
                <span id="live-time-label">{t.time}</span>
                <Select labelledBy="live-time-label" value={String(game.settings.timeLimitSec)}
                  onChange={(v) => void run(() => setTime({ gameId, seconds: Number(v) }))}
                  options={[...new Set([...TIME_LIMITS, game.settings.timeLimitSec])].sort((a, b) => a - b).map((s) => ({ value: String(s), label: t.seconds(s) }))} />
              </div>
              </div>
            </details>
            <div className="flex items-center gap-3 flex-wrap mt-auto">
              <span className="flex-1" />
              <button ref={nextRef} type="button" className="live-btn live-btn--primary" onClick={step} disabled={busy || game.playerCount === 0}>{nextLabel}</button>
            </div>
          </>
        )}

        {(game.state === "question" || game.state === "reveal") && question && (
          <>
            <div className="live-host-question-heading">
              {game.state === "question" && game.questionEndsAt
                ? <Countdown endsAt={game.questionEndsAt} total={game.settings.timeLimitSec} offset={offset} size="host" onAnnounce={setAnnounce} onTick={onTick} />
                : <span />}
              <h1 className="live-question flex-1">{question.text}</h1>
              <div className="live-card text-center min-w-[7rem]" aria-label={t.answered(game.answeredCount, game.playerCount)}>
                <div className="text-4xl font-bold">{fmt(game.answeredCount)}</div>
                <div className="live-muted text-sm" aria-hidden="true">{t.answeredShort(game.playerCount)}</div>
              </div>
            </div>
            {question.kind === "multi" && <p className="live-muted text-center">{t.multi}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element -- creator-supplied URL, like form question images */}
            {question.image && <img src={question.image.url} alt={question.image.alt} className="live-question-image" />}
            {game.state === "reveal" && game.distribution && (
              <div className="live-bars" aria-hidden="true">
                {question.options.map((o, i) => {
                  const count = game.distribution![o.id] ?? 0;
                  const shape = shapeAt(i);
                  return (
                    <div key={o.id} className="live-bar-col" style={{ opacity: correct.has(o.id) ? 1 : 0.45 }}>
                      <span className="text-3xl font-bold">{fmt(count)}{correct.has(o.id) && <Check className="inline ms-1" size={28} />}</span>
                      <div className="live-bar-fill" style={{ height: `${(count / maxVotes) * 80}%`, background: "var(--live-accent)" }} />
                      <ShapeIcon shape={shape} size={24} color="var(--live-accent)" />
                    </div>
                  );
                })}
              </div>
            )}
            {game.state === "reveal" && <p className="sr-only">{t.correctIs(question.options.filter((o) => correct.has(o.id)).map((o) => o.label).join(", "))}</p>}
            <div className="live-tiles" role="list">
              {question.options.map((o, i) => (
                <AnswerTile key={o.id} index={i} label={o.label} size="host"
                  result={game.state === "reveal" ? (correct.has(o.id) ? "correct" : "wrong") : undefined}
                  count={game.state === "reveal" ? game.distribution?.[o.id] ?? 0 : undefined} />
              ))}
            </div>
            <div className="flex justify-end items-center gap-3 flex-wrap">
              {game.state === "reveal" && <AutoplayControls game={game} offset={offset} busy={busy} t={t} onToggle={(on) => void run(() => setAutoplay({ gameId, autoAdvance: on }))} />}
              <button ref={nextRef} type="button" className="live-btn live-btn--primary" onClick={step} disabled={busy}>{nextLabel}</button>
            </div>
          </>
        )}

        {game.state === "leaderboard" && (
          <div className="live-center">
            <h1 className="text-4xl font-bold">{t.leaderboard}</h1>
            <ol className="live-board">
              {game.players.slice(0, 5).map((p) => (
                <li key={p._id} className="live-pop">
                  <span className="live-board__rank">{fmt(p.rank)}</span>
                  <span className="live-board__name">{p.nickname}</span>
                  <span className="live-board__score">{t.points(fmt(p.score))}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <AutoplayControls game={game} offset={offset} busy={busy} t={t} onToggle={(on) => void run(() => setAutoplay({ gameId, autoAdvance: on }))} />
              <button ref={nextRef} type="button" className="live-btn live-btn--primary" onClick={step} disabled={busy}>{nextLabel}</button>
            </div>
          </div>
        )}

        {game.state === "ended" && (
          <div className="live-center">
            <h1 className="text-4xl font-bold">{t.ended}</h1>
            {game.endedReason === "idle" && <p className="live-muted">{t.endedIdle}</p>}
            {game.players.length > 0 && (
              <section aria-label={t.podium} className="live-podium">
                {[1, 0, 2].map((i) => {
                  const p = game.players[i];
                  const heights = ["36vh", "26vh", "18vh"];
                  const colours = ["#F2C230", "#C9CED6", "#D9955B"];
                  return (
                    <div key={i} className="live-podium__step">
                      {p && <span className="live-podium__name">{p.nickname}</span>}
                      {p && <span className="live-muted">{t.points(fmt(p.score))}</span>}
                      <div className="live-podium__block live-pop" style={{ height: p ? heights[i] : "4vh", background: p ? colours[i] : "var(--live-surface)" }} aria-hidden="true">{p ? fmt(p.rank) : ""}</div>
                    </div>
                  );
                })}
              </section>
            )}
            {game.players.length > 3 && (
              <>
                <h2 className="text-2xl font-bold">{t.finalBoard}</h2>
                <ol className="live-board">
                  {game.players.slice(3, 10).map((p) => (
                    <li key={p._id}>
                      <span className="live-board__rank">{fmt(p.rank)}</span>
                      <span className="live-board__name">{p.nickname}</span>
                      <span className="live-board__score">{t.points(fmt(p.score))}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="live-muted" role="status">
              {game.resultsStatus === "saved" ? `${t.saved(game.savedResponses)}${game.unsavedResponses ? ` ${t.unsaved(game.unsavedResponses)}` : ""}` : t.saving}
            </p>
            <Link href={resultsHref} className="live-btn live-btn--primary">{t.openResults}</Link>
          </div>
        )}
      </main>
    </div>
  );
}

/** "Next in 4" with pause and resume while autoplay waits on an answer or leaderboard screen. */
function AutoplayControls({ game, offset, busy, t, onToggle }: {
  game: { phaseEndsAt: number | null; settings: { autoAdvance?: boolean } };
  offset: number; busy: boolean; t: (typeof copy)["en"]; onToggle: (on: boolean) => void;
}) {
  const left = useSecondsLeft(game.phaseEndsAt, offset);
  const running = !!game.settings.autoAdvance && !!game.phaseEndsAt;
  return (
    <div className="live-autoplay">
      {running && <span className="live-muted live-autoplay__left">{t.nextIn(Math.max(1, left))}</span>}
      <button type="button" className="live-btn" onClick={() => onToggle(!running)} disabled={busy}>
        {running ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />} {running ? t.pause : t.autoplay}
      </button>
    </div>
  );
}
