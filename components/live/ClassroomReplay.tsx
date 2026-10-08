"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateLocale, useCopy, useLocale, formatNumber } from "@/lib/i18n";
import { Select } from "@/components/workspace/Select";
import { Check, ChevronLeft, ChevronDown, ChevronUp, Ghost, Info, Pause, Play, RotateCcw } from "lucide-react";
import { ShapeIcon, shapeAt } from "./tiles";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import "./timemachine.css";

type Replay = NonNullable<FunctionReturnType<typeof api.live.questionReplay>>;
type Player = Replay["players"][number];

const copy = {
  en: {
    games: "Games", eyebrow: "Classroom time machine", loading: "Opening the time machine…",
    unavailable: "This replay isn't available", unavailableBody: "Replays open once a game has ended. Only the host can watch them.",
    question: (n: string) => `Question ${n}`, of: (n: string, total: string) => `Question ${n} of ${total}`,
    earlier: "Earlier question", later: "Later question", timeline: "Questions",
    play: "Play", pause: "Pause", restart: "Play again", next: "Next question", speed: "Playback speed",
    scrub: "Question time", seconds: "seconds", answersArrived: "Answers as they arrived",
    answering: "Answering", revealed: "Answer revealed", reveal: "Reveal",
    answered: (n: string, total: string) => `${n} of ${total} answered`,
    leaderboard: "Leaderboard", noStudents: "No students played this game.",
    answeredAt: (s: string) => `Answered at ${s} s`, waiting: "Waiting…", noAnswer: "No answer",
    ghost: "Ghost replay", wholeClass: "Whole class", following: (name: string) => `Following ${name}`,
    ghostAnswered: (choice: string, s: string) => `Picked ${choice} at ${s} s`, ghostWaiting: "Hasn't answered yet", ghostMissed: "Didn't answer this question",
    correct: "Correct", wrong: "Not correct", points: (n: string) => `+${n}`,
    historical: "An older game: answer times are saved, the reveal time is estimated.", sampled: "Showing 100 of the students.",
    keys: "Up and down arrows move between questions. Space plays and pauses.",
  },
  ar: {
    games: "الألعاب", eyebrow: "آلة زمن الفصل", loading: "جارٍ فتح آلة الزمن…",
    unavailable: "إعادة المشاهدة غير متاحة", unavailableBody: "تُفتح إعادة المشاهدة بعد انتهاء اللعبة، ويشاهدها المضيف فقط.",
    question: (n: string) => `السؤال ${n}`, of: (n: string, total: string) => `السؤال ${n} من ${total}`,
    earlier: "السؤال السابق", later: "السؤال التالي", timeline: "الأسئلة",
    play: "تشغيل", pause: "إيقاف مؤقت", restart: "أعد التشغيل", next: "السؤال التالي", speed: "سرعة التشغيل",
    scrub: "وقت السؤال", seconds: "ثانية", answersArrived: "الإجابات كما وصلت",
    answering: "وقت الإجابة", revealed: "كُشفت الإجابة", reveal: "الكشف",
    answered: (n: string, total: string) => `أجاب ${n} من ${total}`,
    leaderboard: "لوحة الصدارة", noStudents: "لم يلعب أي طالب هذه اللعبة.",
    answeredAt: (s: string) => `أجاب عند ${s} ث`, waiting: "بانتظار الإجابة…", noAnswer: "لم يُجب",
    ghost: "تتبّع طالب", wholeClass: "كل الفصل", following: (name: string) => `تتبّع ${name}`,
    ghostAnswered: (choice: string, s: string) => `اختار ${choice} عند ${s} ث`, ghostWaiting: "لم يُجب بعد", ghostMissed: "لم يُجب عن هذا السؤال",
    correct: "صحيحة", wrong: "غير صحيحة", points: (n: string) => `+${n}`,
    historical: "لعبة قديمة: أوقات الإجابات محفوظة، وموعد الكشف تقديري.", sampled: "تُعرض ١٠٠ من الطلاب.",
    keys: "تنقّل بين الأسئلة بالسهمين لأعلى ولأسفل، وشغّل أو أوقف بالمسافة.",
  },
};

const SPEEDS = [1, 2, 4] as const;
/** Windows shown receding behind the current question. */
const DEPTH = 4;
/** Bars in the answer waveform under the scrubber. */
const BINS = 48;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Replays a finished game like Time Machine: the current question is the front window, earlier
 * questions recede behind it, and the timeline on the trailing edge jumps between them. Inside a
 * question, play or scrub through answers and scores as they arrived; ghost replay follows one student.
 */
export default function ClassroomReplay({ gameId }: { gameId: Id<"liveGames"> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const secs = (ms: number) => (ms / 1000).toLocaleString(dateLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const [qi, setQi] = useState(0);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [ghost, setGhost] = useState("");
  const live = useQuery(api.live.questionReplay, { gameId, questionIndex: qi });
  // Keep the last question on screen while the next one loads, so the stack never blinks empty.
  const [replay, setReplay] = useState<Replay | null | undefined>(undefined);
  useEffect(() => { if (live !== undefined) setReplay(live); }, [live]);
  const loadingQuestion = live === undefined;
  const duration = replay?.durationMs ?? 30_000;
  const count = replay?.questionCount ?? 1;

  // Playback: frame-accurate time, rendered in 50 ms steps.
  const clock = useRef(0);
  useEffect(() => { clock.current = at; }, [at]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      clock.current = Math.min(duration, clock.current + (now - last) * speed);
      last = now;
      setAt(Math.round(clock.current / 50) * 50);
      if (clock.current >= duration) { setAt(duration); setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration]);

  const go = useCallback((index: number) => {
    if (index < 0 || index >= count || index === qi) return;
    setQi(index); setAt(0); setPlaying(false);
  }, [count, qi]);
  const togglePlay = () => {
    if (!replay) return;
    if (!playing && at >= duration) { clock.current = 0; setAt(0); }
    setPlaying(!playing);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("input, [role='listbox'], [role='combobox'], button[aria-haspopup]")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); go(qi - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); go(qi + 1); }
    else if (e.key === " " && !el.closest("button, a")) { e.preventDefault(); togglePlay(); }
  };

  const current = replay && replay.questionIndex === qi ? replay : null;
  const ended = !!current && at >= duration;
  return (
    <div className="tm workspace-ui" dir={locale === "ar" ? "rtl" : "ltr"} onKeyDown={onKey}>
      <div className="tm-space" aria-hidden />
      <header className="tm-top">
        <Link className="tm-capsule" href="/dashboard?tab=games"><ChevronLeft size={17} aria-hidden className="rtl:rotate-180" />{t.games}</Link>
        <div className="tm-top__title">
          <p>{t.eyebrow}</p>
          <h1 dir="auto">{replay?.title ?? " "}</h1>
        </div>
        <div className="tm-top__end">
          {replay && replay.players.length > 0 && (
            <div className="tm-ghost-pick">
              <Ghost size={15} aria-hidden />
              <Select size="sm" label={t.ghost} value={ghost} onChange={setGhost} className="tm-ghost-select"
                options={[{ value: "", label: t.wholeClass }, ...[...replay.players].sort((a, b) => a.nickname.localeCompare(b.nickname, locale)).map((p) => ({ value: p.id, label: p.nickname }))]} />
            </div>
          )}
        </div>
      </header>

      {replay === undefined ? (
        <main className="tm-stage" aria-busy="true">
          <div className="tm-stack"><section className="tm-window tm-window--skeleton" style={{ ["--d" as string]: 0 }}><p role="status" className="tm-loading">{t.loading}</p></section></div>
        </main>
      ) : replay === null ? (
        <main className="tm-stage">
          <div className="tm-empty ws-glass">
            <span className="tm-empty__icon" aria-hidden><RotateCcw size={22} /></span>
            <h2>{t.unavailable}</h2>
            <p>{t.unavailableBody}</p>
            <Link className="ws-btn ws-btn--primary" href="/dashboard?tab=games">{t.games}</Link>
          </div>
        </main>
      ) : (
        <main className="tm-stage">
          <p className="sr-only" aria-live="polite">{t.of(fmt(qi + 1), fmt(count))}</p>
          <div className="tm-stack">
            {Array.from({ length: count }, (_, i) => i).filter((i) => qi - i <= DEPTH && i - qi <= 1).map((i) => {
              const d = qi - i;
              return (
                <section key={i} className="tm-window" data-depth={d < 0 ? "ahead" : d} style={{ ["--d" as string]: Math.max(0, d) }}
                  aria-hidden={d !== 0 || undefined} aria-label={d === 0 ? t.of(fmt(i + 1), fmt(count)) : undefined}
                  onClick={d > 0 ? () => go(i) : undefined}>
                  <header className="tm-window__bar">
                    <span className="tm-window__count">{t.of(fmt(i + 1), fmt(count))}</span>
                    {d === 0 && current && (
                      <span className="tm-phase" data-phase={current.revealedAtMs !== null && at >= current.revealedAtMs ? "revealed" : "answering"}>
                        {current.revealedAtMs !== null && at >= current.revealedAtMs ? <><Check size={13} aria-hidden />{t.revealed}</> : t.answering}
                      </span>
                    )}
                  </header>
                  {d === 0 && current ? (
                    <QuestionScene replay={current} at={at} ghost={ghost} t={t} fmt={fmt} secs={secs} stale={loadingQuestion} />
                  ) : (
                    <div className="tm-window__ghost-body" aria-hidden><span /><span /><span /></div>
                  )}
                  {d === 0 && current && (
                    <Transport replay={current} at={at} duration={duration} playing={playing} ended={ended} speed={speed} ghost={ghost} t={t} secs={secs}
                      onScrub={(ms) => { setPlaying(false); clock.current = ms; setAt(ms); }} onToggle={togglePlay} onSpeed={setSpeed}
                      onNext={qi + 1 < count ? () => go(qi + 1) : undefined} />
                  )}
                </section>
              );
            })}
          </div>

          <nav className="tm-timeline" aria-label={t.timeline}>
            <button type="button" className="tm-arrow" aria-label={t.earlier} disabled={qi === 0} onClick={() => go(qi - 1)}><ChevronUp size={18} aria-hidden /></button>
            <ol>
              {Array.from({ length: count }, (_, i) => (
                <li key={i}>
                  <button type="button" aria-current={i === qi ? "step" : undefined} aria-label={t.question(fmt(i + 1))} onClick={() => go(i)} data-label={(i + 1) % 5 === 0 || i === 0 || i === count - 1 || undefined}>
                    <span className="tm-timeline__label">{fmt(i + 1)}</span>
                    <span className="tm-timeline__tick" />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="tm-arrow" aria-label={t.later} disabled={qi >= count - 1} onClick={() => go(qi + 1)}><ChevronDown size={18} aria-hidden /></button>
          </nav>

          {(replay.historical || replay.sampled) && (
            <p className="tm-footnote"><Info size={14} aria-hidden />{replay.historical ? t.historical : ""}{replay.sampled ? ` ${t.sampled}` : ""}</p>
          )}
          <p className="sr-only">{t.keys}</p>
        </main>
      )}
    </div>
  );
}

type T = (typeof copy)["en"];

function scored(replay: Replay, at: number) {
  const revealed = replay.revealedAtMs !== null && at >= replay.revealedAtMs;
  return replay.players
    .map((p) => ({ ...p, score: p.scoreBefore + (revealed && p.answer ? p.answer.points : 0), answeredNow: !!p.answer && p.answer.at <= at }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
}

/** The front window: the question, its answers filling in, and the leaderboard re-sorting at the reveal. */
function QuestionScene({ replay, at, ghost, t, fmt, secs, stale }: { replay: Replay; at: number; ghost: string; t: T; fmt: (n: number) => string; secs: (ms: number) => string; stale: boolean }) {
  const revealed = replay.revealedAtMs !== null && at >= replay.revealedAtMs;
  const total = replay.players.length;
  const answered = replay.players.filter((p) => p.answer && p.answer.at <= at).length;
  const ranking = useMemo(() => scored(replay, at), [replay, at]);
  const follow = ghost ? ranking.find((p) => p.id === ghost) : undefined;
  const followRank = follow ? ranking.indexOf(follow) + 1 : 0;
  const top = ranking.slice(0, 8);
  const rows = follow && followRank > 8 ? [...top, follow] : top;
  const list = useFlip<HTMLOListElement>(rows.map((p) => p.id).join("|"));
  const optionIndex = new Map(replay.question.options.map((o, i) => [o.id, i]));
  return (
    <div className="tm-scene" data-stale={stale || undefined}>
      <div className="tm-question">
        <h2 dir="auto">{replay.question.text}</h2>
        <p className="tm-progress">{t.answered(fmt(answered), fmt(total))}</p>
        <ul className="tm-options">
          {replay.question.options.map((o, i) => {
            const votes = replay.players.filter((p) => p.answer && p.answer.at <= at && p.answer.optionIds.includes(o.id)).length;
            const correct = replay.question.correct.includes(o.id);
            const ghostHere = follow?.answer && follow.answeredNow && follow.answer.optionIds.includes(o.id);
            return (
              <li key={o.id} data-shape={shapeAt(i)} data-result={revealed ? (correct ? "correct" : "wrong") : undefined}>
                <span className="tm-option__fill" style={{ transform: `scaleX(${total ? votes / total : 0})` }} aria-hidden />
                <span className="tm-option__shape" aria-hidden><ShapeIcon shape={shapeAt(i)} size={16} color="currentColor" /></span>
                <span className="tm-option__label" dir="auto">{o.label}</span>
                {ghostHere && <span className="tm-ghost-dot" title={follow.nickname} aria-label={t.following(follow.nickname)}><Ghost size={13} aria-hidden /></span>}
                {revealed && correct && <span className="tm-option__check"><Check size={14} aria-hidden /><span className="sr-only">{t.correct}</span></span>}
                <strong className="tm-option__votes"><AnimatedNumber value={votes} format={fmt} duration={280} /></strong>
              </li>
            );
          })}
        </ul>
        {follow && (
          <div className="tm-follow" role="status">
            <span className="tm-follow__avatar" aria-hidden>{follow.nickname.slice(0, 1).toLocaleUpperCase()}</span>
            <span className="tm-follow__text">
              <strong dir="auto">{t.following(follow.nickname)}</strong>
              <span>
                {follow.answer && follow.answeredNow
                  ? t.ghostAnswered(follow.answer.optionIds.map((id) => replay.question.options[optionIndex.get(id) ?? -1]?.label).filter(Boolean).join(", ") || "—", secs(follow.answer.at))
                  : follow.answer || !revealed ? t.ghostWaiting : t.ghostMissed}
                {revealed && follow.answer && <> · {follow.answer.correct ? t.correct : t.wrong}{follow.answer.points > 0 ? ` ${t.points(fmt(follow.answer.points))}` : ""}</>}
              </span>
            </span>
            <span className="tm-follow__rank">#{fmt(followRank)}</span>
          </div>
        )}
      </div>
      <aside className="tm-board" aria-label={t.leaderboard}>
        <h3>{t.leaderboard}</h3>
        {total === 0 ? <p className="tm-muted">{t.noStudents}</p> : (
          <ol ref={list}>
            {rows.map((p) => {
              const rank = ranking.indexOf(p) + 1;
              return (
                <li key={p.id} data-flip={p.id} data-ghost={p.id === ghost || undefined} data-gap={rank > 8 || undefined}>
                  <span className="tm-board__rank">{fmt(rank)}</span>
                  <span className="tm-board__name">
                    <span dir="auto">{p.nickname}</span>
                    <small>{p.answeredNow && p.answer ? t.answeredAt(secs(p.answer.at)) : revealed ? t.noAnswer : t.waiting}</small>
                  </span>
                  <span className="tm-board__dot" data-state={revealed && p.answer ? (p.answer.correct ? "correct" : "wrong") : p.answeredNow ? "in" : "waiting"} aria-hidden />
                  <strong className="tm-board__score"><AnimatedNumber value={p.score} format={fmt} /></strong>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}

/** Play, scrub and speed, over a waveform of when answers arrived. */
function Transport({ replay, at, duration, playing, ended, speed, ghost, t, secs, onScrub, onToggle, onSpeed, onNext }: {
  replay: Replay; at: number; duration: number; playing: boolean; ended: boolean; speed: number; ghost: string; t: T; secs: (ms: number) => string;
  onScrub: (ms: number) => void; onToggle: () => void; onSpeed: (s: (typeof SPEEDS)[number]) => void; onNext?: () => void;
}) {
  const bins = useMemo(() => {
    const counts = Array<number>(BINS).fill(0);
    for (const p of replay.players) if (p.answer) counts[Math.min(BINS - 1, Math.floor((p.answer.at / Math.max(1, duration)) * BINS))]++;
    const max = Math.max(1, ...counts);
    return counts.map((c) => c / max);
  }, [replay.players, duration]);
  const ghostAt = ghost ? replay.players.find((p: Player) => p.id === ghost)?.answer?.at : undefined;
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / Math.max(1, duration)) * 100))}%`;
  return (
    // Media controls keep playing left to right in Arabic too, as in Apple's and Google's players.
    <footer className="tm-transport" dir="ltr">
      <button type="button" className="tm-play" onClick={onToggle} aria-label={playing ? t.pause : ended ? t.restart : t.play}>
        {playing ? <Pause size={18} fill="currentColor" aria-hidden /> : ended ? <RotateCcw size={18} aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden className="tm-play__icon" />}
      </button>
      <div className="tm-scrubber">
        <div className="tm-wave" aria-hidden title={t.answersArrived}>
          {bins.map((h, i) => <span key={i} data-past={(i + 0.5) / BINS <= at / duration || undefined} style={{ height: `${Math.max(8, h * 100)}%` }} />)}
        </div>
        <div className="tm-track" aria-hidden>
          <span className="tm-track__fill" style={{ width: pct(at) }} />
          {replay.revealedAtMs !== null && <span className="tm-track__reveal" style={{ insetInlineStart: pct(replay.revealedAtMs) }} title={t.reveal} />}
          {ghostAt !== undefined && <span className="tm-track__ghost" style={{ insetInlineStart: pct(ghostAt) }}><Ghost size={11} /></span>}
        </div>
        <input type="range" min={0} max={duration} step={100} value={at} aria-label={t.scrub}
          aria-valuetext={`${secs(at)} ${t.seconds}`} onChange={(e) => onScrub(Number(e.target.value))} />
      </div>
      <span className="tm-time"><span>{secs(at)}</span> / {secs(duration)}</span>
      <div className="tm-speed" role="group" aria-label={t.speed}>
        {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => onSpeed(s)}>{s}×</button>)}
      </div>
      {ended && onNext && <button type="button" className="tm-next" onClick={onNext}>{t.next}<ChevronDown size={15} aria-hidden /></button>}
    </footer>
  );
}

/** Slides re-ordered rows from their old place to their new one (transforms only). */
function useFlip<E extends HTMLElement>(order: string) {
  const ref = useRef<E>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = new Map<string, number>();
    const still = reducedMotion();
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((row) => {
      const id = row.dataset.flip!, top = row.offsetTop;
      next.set(id, top);
      const before = positions.current.get(id);
      if (!still && before !== undefined && before !== top) row.animate?.([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    });
    positions.current = next;
  }, [order]);
  return ref;
}
