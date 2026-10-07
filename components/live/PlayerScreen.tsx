"use client";

import { clearLiveAnswer, readLiveAnswer, saveLiveAnswer } from "@/lib/liveRecovery";
import TeamPanel, { TEAMS_ENABLED } from "./TeamPanel";

import "./live.css";
import "./apple.css";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { Check, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { NICKNAME_MAX } from "@/convex/liveLogic";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/lib/sfx";
import { parseError } from "@/lib/errors";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { AnswerTile } from "./tiles";
import { Announcer, Countdown, StartCountdown, usePrefersReducedMotion, useServerClock } from "./clock";
import Link from "next/link";
import { gameSound, gameThemeProps } from "./GameTheme";
import Logo from "@/components/Logo";
import { startJourney, useUsableMark } from "@/lib/journeys";
import { hostHref } from "@/lib/hosts";

const SESSION_KEY = "chaos-live-session";
type PlayerView = FunctionReturnType<typeof api.live.playerView>;

interface Session { gameId: Id<"liveGames">; token: string; pin: string }

function readSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const value = raw ? (JSON.parse(raw) as Session) : null;
    return value && typeof value.gameId === "string" && /^[a-f0-9]{32,128}$/.test(value.token) ? value : null;
  } catch {
    return null;
  }
}
function writeSession(session: Session | null) {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode: the game still works until the tab closes */ }
}
function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const copy = {
  en: {
    liveLabel: "Live game", joinLead: "Enter the PIN from your host to join.", details: "Game details", createGame: "Create a game", noAccount: "No account needed to play", hostHelp: "Make a quiz, publish it, then choose Host live.",
    title: "Join a game", pin: "Game PIN", pinHint: "The 6 digits on the big screen", nickname: "Nickname", nicknameHint: `Up to ${NICKNAME_MAX} letters or numbers`,
    join: "Join", joining: "Joining…", notFound: "No game with that PIN. Check the number on the big screen.",
    errors: {
      NICKNAME_EMPTY: "Enter a nickname.", NICKNAME_TOO_LONG: `Use at most ${NICKNAME_MAX} characters.`, NICKNAME_CHARACTERS: "Use letters, numbers, spaces and . _ - ' only.",
      NICKNAME_BLOCKED: "Choose a different nickname.", NICKNAME_TAKEN: "Someone already has that nickname. Choose another.", LIVE_FULL: "This game is full.",
      LIVE_KICKED: "The host removed you from this game.", LIVE_TOO_LATE: "Time was up before your answer arrived.", LIVE_CLOSED: "This question is closed.",
      RATE_LIMITED: "Too many tries. Wait a moment and try again.", NETWORK: "You seem to be offline. Your answer will be sent when you reconnect.",
    } as Record<string, string>,
    youreIn: "You're in!", waitStart: "Starting soon",
    questionOf: (i: number, n: number) => `Question ${i} of ${n}`, pickMany: "Pick every right answer, then press Submit.", submit: "Submit",
    saving: "Saved on this device · saving…", deviceSaved: "Saved on this device · waiting to send", backupUnavailable: "Device backup unavailable", retry: "Retry saved answer", closedBackup: "Your saved answer could not reach the server before this question closed.",
    sent: "Answer saved", waitOthers: "Waiting for the others…", tooSlow: "Time's up", noAnswer: "You didn't answer this one.",
    correct: "Correct", wrong: "Not quite", points: (n: string) => `+${n} points`, streak: (n: number, bonus: string) => `${n} in a row: +${bonus} bonus`,
    rank: (n: string) => `You are in place ${n}`, score: (n: string) => `${n} points`, lookUp: "Look at the big screen for the leaderboard.",
    finalRank: (n: string) => `You finished in place ${n}`, correctCount: (n: number, total: number) => `${n} of ${total} correct`, podium: "Top 3",
    kicked: "The host removed you from this game.", ended: "This game has ended.", playAgain: "Join another game",
    reconnecting: "Reconnecting…", mute: "Mute sounds", unmute: "Turn sounds on", language: "العربية",
    announceQuestion: (i: number, text: string) => `Question ${i}. ${text}`, announceResult: (ok: boolean, pts: string) => (ok ? `Correct, ${pts} points` : "Not correct, no points"),
    shortcuts: "Tip: keys 1 to 4 choose an answer.",
  },
  ar: {
    liveLabel: "لعبة مباشرة", joinLead: "أدخل الرمز من المضيف للانضمام.", details: "تفاصيل اللعبة", createGame: "أنشئ لعبة", noAccount: "العب بلا حساب", hostHelp: "أنشئ اختبارًا وانشره ثم اختر استضف مباشرة.",
    title: "انضم إلى لعبة", pin: "رمز اللعبة", pinHint: "الأرقام الستة على الشاشة الكبيرة", nickname: "الاسم المستعار", nicknameHint: `حتى ${NICKNAME_MAX} حرفًا أو رقمًا`,
    join: "انضم", joining: "جارٍ الانضمام…", notFound: "لا توجد لعبة بهذا الرمز. تحقّق من الرقم على الشاشة الكبيرة.",
    errors: {
      NICKNAME_EMPTY: "اكتب اسمًا مستعارًا.", NICKNAME_TOO_LONG: `استخدم ${NICKNAME_MAX} حرفًا على الأكثر.`, NICKNAME_CHARACTERS: "استخدم الحروف والأرقام والمسافات و . _ - ' فقط.",
      NICKNAME_BLOCKED: "اختر اسمًا مستعارًا آخر.", NICKNAME_TAKEN: "هذا الاسم مستخدم. اختر اسمًا آخر.", LIVE_FULL: "هذه اللعبة مكتملة.",
      LIVE_KICKED: "أزالك المضيف من هذه اللعبة.", LIVE_TOO_LATE: "انتهى الوقت قبل وصول إجابتك.", LIVE_CLOSED: "أُغلق هذا السؤال.",
      RATE_LIMITED: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.", NETWORK: "يبدو أنك غير متصل. ستُرسل إجابتك عند عودة الاتصال.",
    } as Record<string, string>,
    youreIn: "انضممت!", waitStart: "تبدأ قريبًا",
    questionOf: (i: number, n: number) => `السؤال ${i} من ${n}`, pickMany: "اختر كل الإجابات الصحيحة، ثم اضغط إرسال.", submit: "إرسال",
    saving: "محفوظ على الجهاز · جارٍ الإرسال…", deviceSaved: "محفوظ على الجهاز · بانتظار الإرسال", backupUnavailable: "الحفظ على الجهاز غير متاح", retry: "أعد إرسال الإجابة المحفوظة", closedBackup: "لم تصل إجابتك المحفوظة إلى الخادم قبل إغلاق السؤال.",
    sent: "حُفظت الإجابة", waitOthers: "بانتظار الآخرين…", tooSlow: "انتهى الوقت", noAnswer: "لم تُجب عن هذا السؤال.",
    correct: "صحيح", wrong: "ليست صحيحة", points: (n: string) => `+${n} نقطة`, streak: (n: number, bonus: string) => `${n} على التوالي: مكافأة +${bonus}`,
    rank: (n: string) => `ترتيبك ${n}`, score: (n: string) => `${n} نقطة`, lookUp: "انظر إلى الشاشة الكبيرة لرؤية لوحة الصدارة.",
    finalRank: (n: string) => `أنهيت في المركز ${n}`, correctCount: (n: number, total: number) => `${n} من ${total} صحيحة`, podium: "المراكز الثلاثة الأولى",
    kicked: "أزالك المضيف من هذه اللعبة.", ended: "انتهت هذه اللعبة.", playAgain: "انضم إلى لعبة أخرى",
    reconnecting: "جارٍ إعادة الاتصال…", mute: "كتم الأصوات", unmute: "تشغيل الأصوات", language: "English",
    announceQuestion: (i: number, text: string) => `السؤال ${i}. ${text}`, announceResult: (ok: boolean, pts: string) => (ok ? `صحيح، ${pts} نقطة` : "ليست صحيحة، بلا نقاط"),
    shortcuts: "تلميح: المفاتيح من 1 إلى 4 تختار إجابة.",
  },
};
type Copy = (typeof copy)["en"];

function errorText(t: Copy, e: unknown): string {
  const { code, message } = parseError(e);
  return t.errors[code] ?? message;
}

export default function PlayerScreen({ initialPin }: { initialPin?: string }) {
  return <PlayerSession key={initialPin ?? ""} initialPin={initialPin} />;
}

function PlayerSession({ initialPin }: { initialPin?: string }) {
  const t = useCopy(copy);
  const { locale, setLocale } = useLocale();
  const calm = usePrefersReducedMotion();
  const connection = useConvexConnectionState();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sound, setSound] = useState(true);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const stored = readSession();
    // A link with a different PIN starts a new join; the old game is left behind.
    setSession(stored && (!initialPin || stored.pin === initialPin) ? stored : null);
    setSound(sfx.isEnabled());
    setLoaded(true);
  }, [initialPin]);

  const leave = useCallback(() => { writeSession(null); setSession(null); }, []);
  const toggleSound = () => { const next = !sound; sfx.setEnabled(next); setSound(next); };
  const offline = loaded && !connection.isWebSocketConnected && connection.hasEverConnected;
  const activeView = useQuery(api.live.playerView, session ? { gameId: session.gameId, token: session.token } : "skip");
  const appearance = activeView && "appearance" in activeView ? activeView.appearance : "apple";
  const theme = activeView && "theme" in activeView ? activeView.theme : null;

  return (
    <div {...gameThemeProps(theme, appearance)} data-calm={calm} data-joining={!session}>
      <Announcer text={announce} />
      <header className="live-bar">
        <Link href="/" className="live-bar__title live-brand"><Logo size={28} />Chaos<span>live</span></Link>
        {offline && <span className="live-muted live-pulse" role="status">{t.reconnecting}</span>}
        <button type="button" className="live-icon-btn" onClick={toggleSound} aria-label={sound ? t.mute : t.unmute} aria-pressed={!sound}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
        <button type="button" className="live-btn" onClick={() => setLocale((locale === "ar" ? "en" : "ar") as Locale)} lang={locale === "ar" ? "en" : "ar"}>{t.language}</button>
      </header>
      <main className={`live-main ${session ? "live-phone" : "live-join-main"}`}>
        {!loaded ? null : session
          ? <InGame key={`${session.gameId}:${session.token}:${activeView?.state}:${activeView && "questionIndex" in activeView ? activeView.questionIndex : ""}`} session={session} view={activeView} t={t} onLeave={leave} setAnnounce={setAnnounce} />
          : <JoinForm t={t} initialPin={initialPin ?? ""} onJoined={(s) => { writeSession(s); setSession(s); }} />}
      </main>
    </div>
  );
}

function JoinForm({ t, initialPin, onJoined }: { t: Copy; initialPin: string; onJoined: (s: Session) => void }) {
  const join = useMutation(api.live.joinGame);
  const [pin, setPin] = useState(initialPin.replace(/\D/g, "").slice(0, 6));
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const joining = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (initialPin) nameRef.current?.focus(); }, [initialPin]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining.current || pin.length !== 6 || !nickname.trim()) return;
    joining.current = true;
    setBusy(true);
    startJourney("live.join");
    setError("");
    const token = newToken();
    try {
      const result = await join({ pin, nickname, token });
      if (!active.current) return;
      if (result.status === "not_found") { setError(t.notFound); haptics.error(); return; }
      haptics.success();
      onJoined({ gameId: result.gameId, token, pin });
    } catch (err) {
      if (!active.current) return;
      haptics.error();
      setError(errorText(t, err));
    } finally {
      joining.current = false;
      if (active.current) setBusy(false);
    }
  };

  return (
    <div className="live-join-layout">
      <div className="live-join-story"><p className="live-join-eyebrow">{t.liveLabel}</p><h1 className="form-heading">{t.title}</h1><p className="live-muted">{t.joinLead}</p></div>
      <div className="live-join-panel">
      <form className="live-join-form" onSubmit={submit} noValidate>
      <h2 className="sr-only">{t.details}</h2>
      <label className="live-field">
        <span className="font-semibold">{t.pin}</span>
        <input className="live-input live-input--pin" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={6} required
          placeholder="000 000" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby="pin-hint" autoFocus={!initialPin} />
        <span id="pin-hint" className="live-muted text-sm">{t.pinHint}</span>
      </label>
      <label className="live-field">
        <span className="font-semibold">{t.nickname}</span>
        <input ref={nameRef} className="live-input" autoComplete="nickname" maxLength={NICKNAME_MAX} required
          value={nickname} onChange={(e) => setNickname(e.target.value)} aria-describedby="nick-hint" />
        <span id="nick-hint" className="live-muted text-sm">{t.nicknameHint}</span>
      </label>
      {error && <p className="live-error" role="alert">{error}</p>}
      <button type="submit" className="live-btn live-btn--primary w-full" disabled={busy || pin.length !== 6 || !nickname.trim()}>{busy ? t.joining : t.join}</button>
      </form>
      <div className="live-create-callout"><Link href={hostHref("/dashboard?tab=games")} prefetch={false}>{t.createGame} <span aria-hidden="true">↗</span></Link><p>{t.hostHelp}</p></div>
      </div>
    </div>
  );
}

function InGame({ session, view, t, onLeave, setAnnounce }: { session: Session; view: PlayerView | undefined; t: Copy; onLeave: () => void; setAnnounce: (s: string) => void }) {
  const { locale } = useLocale();
  const submit = useMutation(api.live.submitAnswer);
  const connection = useConvexConnectionState();
  const [backupStatus, setBackupStatus] = useState<"saving" | "deviceSaved" | "backupUnavailable" | null>(null);
  useUsableMark("live.join", !!view);
  const offset = useServerClock();
  const pack = gameSound(view && "theme" in view ? view.theme : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  const [sent, setSent] = useState(false);
  const fmt = (n: number) => formatNumber(locale, n);

  const phase = view ? `${view.state}:${"questionIndex" in view ? view.questionIndex : ""}` : "";
  const lastPhase = useRef("");
  useEffect(() => {
    if (!view || phase === lastPhase.current) return;
    lastPhase.current = phase;
    setPicked([]);
    setError("");
    if (view.state === "question") {
      haptics.medium();
      setAnnounce(t.announceQuestion(view.questionIndex + 1, view.question.text));
    }
    if (view.state === "reveal") {
      if (view.correct) { haptics.success(); sfx.play("correct", pack); } else { haptics.error(); sfx.play("wrong", pack); }
      setAnnounce(t.announceResult(view.correct, fmt(view.points)));
    }
    if (view.state === "ended") sfx.play("finish", pack);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per phase
  }, [phase]);

  const send = useCallback(async (ids: string[]) => {
    if (!view || view.state !== "question" || view.answered || sent || pending.current) return;
    pending.current = true;
    const questionIndex = view.questionIndex;
    const backedUp = saveLiveAnswer(session.gameId, { token: session.token, questionIndex, optionIds: ids });
    setBackupStatus(backedUp ? "saving" : "backupUnavailable");
    setPicked(ids);
    setSending(true);
    setError("");
    haptics.select();
    sfx.play("select", pack);
    try {
      await submit({ gameId: session.gameId, token: session.token, questionIndex: view.questionIndex, optionIds: ids });
      clearLiveAnswer(session.gameId, questionIndex);
      setBackupStatus(null);
      setSent(true);
    } catch (e) {
      setBackupStatus(backedUp ? "deviceSaved" : "backupUnavailable");
      setError(errorText(t, e));
      haptics.error();
    } finally {
      pending.current = false;
      setSending(false);
    }
  }, [view, sent, submit, session, t, pack]);

  const recoverSaved = useEffectEvent(() => {
    if (!view || !("questionIndex" in view)) return;
    const saved = readLiveAnswer(session.gameId, session.token, view.questionIndex);
    if (!saved) return;
    if ("myAnswer" in view && view.myAnswer) { clearLiveAnswer(session.gameId, view.questionIndex); return; }
    if (view.state === "question") {
      setPicked(saved.optionIds);
      if (!pending.current && !sent) void send(saved.optionIds);
    } else if (view.state === "reveal" || view.state === "leaderboard") setError(t.closedBackup);
  });
  const answered = view?.state === "question" ? view.answered : false;
  useEffect(() => { recoverSaved(); }, [phase, connection.isWebSocketConnected, answered]);
  useEffect(() => {
    const online = () => recoverSaved();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);

  const choose = useCallback((id: string) => {
    if (!view || view.state !== "question" || view.answered || sent || pending.current) return;
    if (view.question.kind === "single") void send([id]);
    else { haptics.light(); setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  }, [view, sent, send]);

  // Keys 1–4 pick a tile.
  useEffect(() => {
    if (!view || view.state !== "question" || view.answered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const n = Number(e.key);
      const option = view.question.options[n - 1];
      if (option) { e.preventDefault(); choose(option.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, choose]);

  if (view === undefined) return <div className="live-center live-muted" role="status">…</div>;
  if (view.state === "missing" || view.state === "unknown" || view.state === "kicked") {
    return (
      <div className="live-center">
        <p className="text-2xl font-bold" role="status">{view.state === "kicked" ? t.kicked : t.ended}</p>
        <button type="button" className="live-btn live-btn--primary" onClick={onLeave}>{t.playAgain}</button>
      </div>
    );
  }

  const header = view.state !== "lobby" && "nickname" in view && (
    <p className="live-muted text-center">{t.questionOf(Math.max(1, view.questionIndex + 1), view.questionCount)} · <strong>{view.nickname}</strong></p>
  );

  switch (view.state) {
    case "lobby":
      return (
        <div className="live-center">
          {view.startsAt ? <StartCountdown startsAt={view.startsAt} offset={offset} onTick={() => sfx.play("tap", pack)} /> : <p className="text-4xl font-bold live-pop">{t.youreIn}</p>}
          <p className="text-2xl font-semibold">{view.nickname}</p>
          {!view.startsAt && <p className="live-muted live-pulse">{t.waitStart}</p>}
          {TEAMS_ENABLED && <TeamPanel gameId={session.gameId} token={session.token} frozen={view.startsAt != null} />}
        </div>
      );
    case "question": {
      const multi = view.question.kind === "multi";
      const locked = view.answered || sent || sending;
      return (
        <div className="live-player-question">
          {header}
          <div className="live-player-question__heading">
            <Countdown endsAt={view.endsAt} total={Math.round((view.endsAt - view.startedAt) / 1000)} offset={offset} onAnnounce={setAnnounce} />
            <h1 className="form-heading">{view.question.text}</h1>
          </div>
          {view.answered || sent ? (
            <div className="live-center">
              <Check size={56} aria-hidden="true" />
              <p className="text-2xl font-bold" role="status">{t.sent}</p>
              {view.myAnswer && <p className="live-muted">{view.myAnswer.map((id) => view.question.options.find((o) => o.id === id)?.label).filter(Boolean).join(", ")}</p>}
              <p className="live-muted live-pulse">{t.waitOthers}</p>
            </div>
          ) : (
            <>
              {multi && <p className="live-muted">{t.pickMany}</p>}
              <div className="live-tiles live-player-answers" data-labelled={view.showAnswerLabels} role="group" aria-label={view.question.text}>
                {view.question.options.map((o, i) => (
                  <AnswerTile key={o.id} index={i} label={o.label} showLabel={view.showAnswerLabels} toggle={multi} selected={picked.includes(o.id)} disabled={locked} onSelect={() => choose(o.id)} />
                ))}
              </div>
              {multi && <button type="button" className="live-btn live-btn--primary w-full" disabled={locked || picked.length === 0} onClick={() => void send(picked)}>{t.submit}</button>}
              <p className="live-muted text-sm sr-only">{t.shortcuts}</p>
            </>
          )}
          {backupStatus && <p className="live-muted" role="status">{t[backupStatus]}</p>}
          {error && <p className="live-error" role="alert">{error}</p>}
          {error && picked.length > 0 && !view.answered && !sent && <button type="button" className="live-btn" disabled={sending} onClick={() => void send(picked)}>{t.retry}</button>}
        </div>
      );
    }
    case "reveal":
    case "leaderboard": {
      const answered = !!view.myAnswer;
      return (
        <div className="live-center">
          {header}
          <div className={`live-result ${view.correct ? "live-result--good" : "live-result--bad"} live-pop`}>
            {view.correct ? <Check size={64} aria-hidden="true" /> : <X size={64} aria-hidden="true" />}
            <span>{view.correct ? t.correct : answered ? t.wrong : t.tooSlow}</span>
            {view.correct && <span className="text-xl">{t.points(fmt(view.points))}</span>}
            {!answered && <span className="text-base font-semibold">{t.noAnswer}</span>}
          </div>
          {error && <p className="live-error" role="alert">{error}</p>}
          {view.bonus > 0 && <p className="text-lg font-semibold">{t.streak(view.streak, fmt(view.bonus))}</p>}
          {view.rank !== null && <p className="text-2xl font-bold">{t.rank(fmt(view.rank))}</p>}
          <p className="live-muted">{t.score(fmt(view.score))}</p>
          {view.state === "leaderboard" && <><p className="live-muted">{t.lookUp}</p>{TEAMS_ENABLED && <TeamPanel gameId={session.gameId} token={session.token} frozen />}</>}
        </div>
      );
    }
    case "ended":
      return (
        <div className="live-center">
          <Trophy size={56} aria-hidden="true" />
          <p className="text-3xl font-bold" role="status">{view.rank !== null ? t.finalRank(fmt(view.rank)) : t.ended}</p>
          <p className="text-xl">{t.score(fmt(view.score))} · {t.correctCount(view.correctCount, view.questionCount)}</p>
          {TEAMS_ENABLED && <TeamPanel gameId={session.gameId} token={session.token} frozen />}
          {view.podium.length > 0 && (
            <section className="live-card w-full" aria-label={t.podium}>
              <h2 className="font-bold mb-2">{t.podium}</h2>
              <ol className="flex flex-col gap-1 text-start">
                {view.podium.map((p) => <li key={`${p.rank}-${p.nickname}`}>{fmt(p.rank)}. {p.nickname} · {t.score(fmt(p.score))}</li>)}
              </ol>
            </section>
          )}
          <button type="button" className="live-btn" onClick={onLeave}>{t.playAgain}</button>
        </div>
      );
  }
}
