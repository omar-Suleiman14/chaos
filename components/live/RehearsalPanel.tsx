"use client";
import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { runRehearsal, type RehearsalStats } from "@/lib/liveRehearsal";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { Lock, Minus, Plus, Square, UserPlus, Users } from "lucide-react";
import { WsSwitch } from "@/components/workspace/primitives";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import type { Id } from "@/convex/_generated/dataModel";

const copy = {
  en: {
    title: "Rehearsal classroom", lead: "Practise with simulated students before class. Nothing here reaches student records.", private: "Private",
    students: "Simulated students", studentsHelp: (max: string) => `Up to ${max}`, fewer: "Fewer students", more: "More students",
    chaos: "Chaos mode", chaosHelp: "Missed answers, late phones and duplicate retries, like real school Wi-Fi.",
    add: (n: string) => `Add ${n} students`, addSome: "Add students", stop: "Stop simulation",
    startHint: "Then start the game as usual.", runningHint: "Students are playing along. Start the game when you're ready.", addedHint: "Simulated students have joined.", lobbyOnly: "Add students while the game is in the lobby.",
    joined: "Joined", received: "Answers saved", duplicates: "Retries", missed: "Missed", errors: "Rejected", latency: "Slowest reply",
  },
  ar: {
    title: "فصل التدريب", lead: "تدرّب مع طلاب افتراضيين قبل الحصة. لا يصل شيء من هنا إلى سجلات الطلاب.", private: "خاص",
    students: "طلاب افتراضيون", studentsHelp: (max: string) => `حتى ${max}`, fewer: "طلاب أقل", more: "طلاب أكثر",
    chaos: "وضع الفوضى", chaosHelp: "إجابات مفقودة وهواتف متأخرة ومحاولات مكررة، مثل شبكة المدرسة الحقيقية.",
    add: (n: string) => `أضف ${n} من الطلاب`, addSome: "أضف طلابًا", stop: "أوقف المحاكاة",
    startHint: "ثم ابدأ اللعبة كالمعتاد.", runningHint: "الطلاب يلعبون. ابدأ اللعبة عندما تكون جاهزًا.", addedHint: "انضم الطلاب الافتراضيون.", lobbyOnly: "أضف الطلاب ما دامت اللعبة في الردهة.",
    joined: "انضموا", received: "إجابات محفوظة", duplicates: "محاولات مكررة", missed: "مفقودة", errors: "مرفوضة", latency: "أبطأ رد",
  },
};

export default function RehearsalPanel({
  gameId,
  pin,
  maxPlayers,
  lobby,
}: {
  gameId: Id<"liveGames">;
  pin: string;
  maxPlayers: number;
  lobby: boolean;
}) {
  const convex = useConvex();
  const { locale } = useLocale();
  const t = useCopy(copy);
  const fmt = (n: number) => formatNumber(locale, n);
  const [count, setCount] = useState(20);
  const [chaos, setChaos] = useState(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RehearsalStats | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const start = () => {
    if (stop.current || (stats?.joined ?? 0) > 0 || !Number.isInteger(count) || count < 1 || count > Math.min(300, maxPlayers)) return;
    setRunning(true);
    stop.current = runRehearsal(
      {
        join: (nickname, token) =>
          convex.mutation(api.live.joinGame, { pin, nickname, token }),
        answer: (token, questionIndex, optionIds) =>
          convex.mutation(api.live.submitAnswer, {
            gameId,
            token,
            questionIndex,
            optionIds,
          }),
        watch: (token, update) => {
          const watch = convex.watchQuery(api.live.playerView, {
            gameId,
            token,
          });
          const off = watch.onUpdate(() => {
            const value = watch.localQueryResult();
            if (value) update(value);
          });
          const value = watch.localQueryResult();
          if (value) update(value);
          return off;
        },
      },
      count,
      chaos,
      setStats,
    );
  };
  const limit = Math.min(300, maxPlayers);
  const valid = Number.isInteger(count) && count >= 1 && count <= limit;
  const joined = stats?.joined ?? 0;
  const locked = running || !lobby;
  const step = (delta: number) => setCount((n) => Math.min(limit, Math.max(1, (Number.isFinite(n) ? n : 0) + delta)));
  const tiles: { key: keyof RehearsalStats; label: string; unit?: string; warn?: boolean }[] = [
    { key: "joined", label: t.joined },
    { key: "received", label: t.received },
    { key: "duplicates", label: t.duplicates },
    { key: "missed", label: t.missed },
    { key: "errors", label: t.errors, warn: true },
    { key: "maxLatencyMs", label: t.latency, unit: "ms" },
  ];
  return (
    <section className="rh" aria-labelledby="rehearsal-title">
      <header className="rh-head">
        <span className="rh-icon" aria-hidden><Users size={18} /></span>
        <div className="rh-head__text">
          <h2 id="rehearsal-title">{t.title}</h2>
          <p>{t.lead}</p>
        </div>
        <span className="rh-private"><Lock size={12} aria-hidden />{t.private}</span>
      </header>
      <div className="rh-group">
        <div className="rh-row">
          <label htmlFor="rehearsal-count" className="rh-row__text"><strong>{t.students}</strong><small>{t.studentsHelp(fmt(limit))}</small></label>
          <div className="rh-stepper">
            <button type="button" aria-label={t.fewer} disabled={locked || count <= 1} onClick={() => step(-5)}><Minus size={15} aria-hidden /></button>
            <input id="rehearsal-count" type="number" inputMode="numeric" min={1} max={limit} value={Number.isFinite(count) ? count : ""} disabled={locked}
              onChange={(e) => setCount(e.target.value === "" ? NaN : Number(e.target.value))} aria-invalid={!valid || undefined} />
            <button type="button" aria-label={t.more} disabled={locked || count >= limit} onClick={() => step(5)}><Plus size={15} aria-hidden /></button>
          </div>
        </div>
        <div className="rh-row">
          <span className="rh-row__text"><strong>{t.chaos}</strong><small>{t.chaosHelp}</small></span>
          <WsSwitch checked={chaos} onChange={setChaos} disabled={locked} label={t.chaos} hideLabel />
        </div>
      </div>
      <div className="rh-actions">
        {running ? (
          <button type="button" className="rh-btn" onClick={() => { stop.current?.(); stop.current = null; setRunning(false); }}>
            <Square size={13} fill="currentColor" aria-hidden />{t.stop}
          </button>
        ) : (
          <button type="button" className="rh-btn rh-btn--primary" disabled={!lobby || joined > 0 || !valid} onClick={start}>
            <UserPlus size={16} aria-hidden />{valid ? t.add(fmt(count)) : t.addSome}
          </button>
        )}
        <p className="rh-hint">{running ? <><span className="rh-live" aria-hidden />{t.runningHint}</> : joined > 0 ? t.addedHint : lobby ? t.startHint : t.lobbyOnly}</p>
      </div>
      {stats && (
        <dl className="rh-stats">
          {tiles.map(({ key, label, unit, warn }) => (
            <div key={key} data-warn={(warn && stats[key] > 0) || undefined}>
              <dt>{label}</dt>
              <dd><AnimatedNumber value={stats[key]} format={fmt} />{unit && <small> {unit}</small>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
