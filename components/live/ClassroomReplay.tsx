"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale, formatNumber } from "@/lib/i18n";
import { Select } from "@/components/workspace/Select";
import { ArrowLeft, Pause, Play } from "lucide-react";
import "./classroom.css";

export default function ClassroomReplay({
  gameId,
}: {
  gameId: Id<"liveGames">;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [qi, setQi] = useState(0),
    [at, setAt] = useState(0),
    [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState("");
  const replay = useQuery(api.live.questionReplay, {
    gameId,
    questionIndex: qi,
  });
  const duration = replay?.durationMs ?? 30_000;
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(
      () =>
        setAt((previous) => {
          const next = Math.min(duration, previous + 100);
          return next;
        }),
      100,
    );
    return () => clearInterval(interval);
  }, [playing, duration]);
  useEffect(() => {
    if (at >= duration) setPlaying(false);
  }, [at, duration]);
  const chooseQuestion = (value: string) => {
    setQi(Number(value));
    setAt(0);
    setPlaying(false);
  };
  return (
    <div className="classroom-page workspace-ui">
      <Link className="ws-link-quiet" href="/dashboard?tab=games">
        <ArrowLeft size={16} aria-hidden="true" className="rtl:rotate-180" />
        {ar ? "الألعاب" : "Games"}
      </Link>
      <header>
        <p className="ws-page-subtitle">
          {ar ? "آلة زمن الفصل" : "Classroom time machine"}
        </p>
        <h1 className="ws-page-title">
          {replay?.title ?? (ar ? "إعادة المشاهدة" : "Classroom replay")}
        </h1>
        <p className="ws-page-subtitle">
          {ar
            ? "حرّك المؤشر لمشاهدة الإجابات والنتائج كما وصلت."
            : "Scrub through answers and scores as they arrived."}
        </p>
      </header>
      {replay === undefined ? (
        <p role="status">{ar ? "جارٍ التحميل…" : "Loading replay…"}</p>
      ) : replay === null ? (
        <p>
          {ar
            ? "غير متاح. أكمل اللعبة أولًا."
            : "Replay unavailable. Finish the game first."}
        </p>
      ) : (
        <>
          {replay.historical && (
            <p className="ws-page-subtitle">
              {ar
                ? "تستخدم الألعاب القديمة أوقات الإجابات المحفوظة وموعد إعلان تقريبي."
                : "Older games use saved answer times and an estimated reveal time."}
              {replay.sampled &&
                (ar
                  ? " تُعرض عينة من ١٠٠ طالب."
                  : " Showing a sample of 100 students.")}
            </p>
          )}
          <section className="classroom-panel">
            <div className="classroom-controls">
              <Select
                label={ar ? "السؤال" : "Question"}
                value={String(qi)}
                onChange={chooseQuestion}
                options={Array.from(
                  { length: replay.questionCount },
                  (_, i) => ({
                    value: String(i),
                    label: `${ar ? "السؤال" : "Question"} ${formatNumber(locale, i + 1)}`,
                  }),
                )}
              />
              <Select
                label={ar ? "إعادة طالب" : "Ghost replay"}
                value={ghost}
                onChange={setGhost}
                options={[
                  { value: "", label: ar ? "كل الفصل" : "Whole classroom" },
                  ...replay.players.map((p) => ({
                    value: p.id,
                    label: p.nickname,
                  })),
                ]}
              />
              <button
                type="button"
                className="ws-btn"
                aria-pressed={playing}
                onClick={() => {
                  if (at >= duration) setAt(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? (
                  <Pause size={16} aria-hidden="true" />
                ) : (
                  <Play size={16} aria-hidden="true" />
                )}
                {playing
                  ? ar
                    ? "إيقاف مؤقت"
                    : "Pause"
                  : ar
                    ? "تشغيل"
                    : "Play"}
              </button>
            </div>
            <label className="classroom-timeline">
              {ar ? "وقت السؤال" : "Question time"}:{" "}
              {formatNumber(locale, at / 1000)} /{" "}
              {formatNumber(locale, duration / 1000)} {ar ? "ثانية" : "seconds"}
              <input
                type="range"
                min={0}
                max={duration}
                step={100}
                value={at}
                aria-valuetext={`${(at / 1000).toFixed(1)} ${ar ? "ثانية" : "seconds"}`}
                onChange={(e) => {
                  setAt(Number(e.target.value));
                  setPlaying(false);
                }}
              />
            </label>
            <h2>{replay.question.text}</h2>
            <ul className="classroom-options">
              {replay.question.options.map((o) => {
                const votes = replay.players.filter(
                  (p) =>
                    p.answer &&
                    p.answer.at <= at &&
                    p.answer.optionIds.includes(o.id),
                ).length;
                return (
                  <li key={o.id}>
                    <span>
                      {o.label}
                      {replay.revealedAtMs !== null &&
                      at >= replay.revealedAtMs &&
                      replay.question.correct.includes(o.id)
                        ? ar
                          ? " · صحيحة"
                          : " · Correct"
                        : ""}
                    </span>
                    <strong>{formatNumber(locale, votes)}</strong>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="classroom-panel">
            <h2>
              {ghost
                ? ar
                  ? "إعادة الطالب"
                  : "Ghost replay"
                : ar
                  ? "لوحة الصدارة"
                  : "Leaderboard"}
            </h2>
            <ol className="classroom-options">
              {replay.players
                .map((p) => ({
                  ...p,
                  score:
                    p.scoreBefore +
                    (p.answer &&
                    replay.revealedAtMs !== null &&
                    at >= replay.revealedAtMs
                      ? p.answer.points
                      : 0),
                }))
                .sort(
                  (a, b) =>
                    b.score - a.score || a.nickname.localeCompare(b.nickname),
                )
                .filter((p) => !ghost || p.id === ghost)
                .slice(0, 10)
                .map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.nickname}
                      <small>
                        {p.answer && p.answer.at <= at
                          ? ar
                            ? `أجاب بعد ${(p.answer.at / 1000).toFixed(1)} ثانية`
                            : `Answered at ${(p.answer.at / 1000).toFixed(1)}s`
                          : ar
                            ? "بانتظار الإجابة"
                            : "Waiting for an answer"}
                      </small>
                    </span>
                    <strong>{formatNumber(locale, p.score)}</strong>
                  </li>
                ))}
            </ol>
            {replay.players.length === 0 && (
              <p>
                {ar ? "لا طلاب في هذه اللعبة." : "No students in this game."}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
