"use client";
import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { runRehearsal, type RehearsalStats } from "@/lib/liveRehearsal";
import { useLocale } from "@/lib/i18n";
import { WsSwitch } from "@/components/workspace/primitives";
import type { Id } from "@/convex/_generated/dataModel";

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
  const ar = locale === "ar";
  const [count, setCount] = useState(20);
  const [chaos, setChaos] = useState(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RehearsalStats | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const start = () => {
    if (
      stop.current ||
      (stats?.joined ?? 0) > 0 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > Math.min(300, maxPlayers)
    )
      return;
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
  return (
    <section
      className="classroom-panel"
      aria-label={ar ? "فصل التدريب" : "Rehearsal classroom"}
    >
      <h2>{ar ? "فصل التدريب" : "Rehearsal classroom"}</h2>
      <p>
        {ar
          ? "غرفة خاصة. لا تُسجل نتائج التدريب ضمن إجابات الطلاب."
          : "Private room. Practice results stay out of student records."}
      </p>
      <div className="classroom-controls">
        <label>
          {ar ? "طلاب افتراضيون" : "Simulated students"}
          <input
            type="number"
            min={1}
            max={Math.min(300, maxPlayers)}
            value={count}
            disabled={running || !lobby}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <WsSwitch
          checked={chaos}
          onChange={setChaos}
          disabled={running || !lobby}
          label={ar ? "اختبار اضطراب الاتصال" : "Chaos mode"}
        />
        <button
          type="button"
          className="ws-btn"
          disabled={
            running ||
            !lobby ||
            (stats?.joined ?? 0) > 0 ||
            !Number.isInteger(count) ||
            count < 1 ||
            count > Math.min(300, maxPlayers)
          }
          onClick={start}
        >
          {ar ? "أضف الطلاب" : "Add students"}
        </button>
        {running && (
          <button
            type="button"
            className="ws-btn"
            onClick={() => {
              stop.current?.();
              stop.current = null;
              setRunning(false);
            }}
          >
            {ar ? "أوقف المحاكاة" : "Stop simulation"}
          </button>
        )}
      </div>
      <p>
        {ar
          ? "يتضمن وضع الاضطراب إجابات مفقودة ومتأخرة ومحاولات مكررة. ابدأ اللعبة بالطريقة المعتادة."
          : "Chaos mode includes missing answers, late phones and duplicate retries. Start the game as usual."}
      </p>
      {stats && (
        <p role="status">
          {ar ? "انضم" : "Joined"}: {stats.joined} · {ar ? "حُفظت" : "Received"}
          : {stats.received} · {ar ? "مكررة" : "Retries"}: {stats.duplicates} ·{" "}
          {ar ? "مفقودة" : "Missed"}: {stats.missed} ·{" "}
          {ar ? "مرفوضة" : "Rejected"}: {stats.errors} ·{" "}
          {ar ? "أقصى زمن" : "Max latency"}: {stats.maxLatencyMs} ms
        </p>
      )}
    </section>
  );
}
