import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
type View = FunctionReturnType<typeof api.live.playerView>;
export interface RehearsalTransport {
  join: (nickname: string, token: string) => Promise<unknown>;
  watch: (token: string, update: (view: View) => void) => () => void;
  answer: (
    token: string,
    questionIndex: number,
    optionIds: string[],
  ) => Promise<unknown>;
}
export interface RehearsalStats {
  joined: number;
  received: number;
  duplicates: number;
  missed: number;
  errors: number;
  maxLatencyMs: number;
}
/** Browser and release tests share this harness; every simulated phone has its own subscription. */
export function runRehearsal(
  transport: RehearsalTransport,
  count: number,
  chaos: boolean,
  update: (stats: RehearsalStats) => void,
) {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unsubscribe: (() => void)[] = [];
  const stats: RehearsalStats = {
    joined: 0,
    received: 0,
    duplicates: 0,
    missed: 0,
    errors: 0,
    maxLatencyMs: 0,
  };
  const emit = () => {
    if (!stopped) update({ ...stats });
  };
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) fn();
    }, ms);
    timers.add(timer);
  };
  const send = async (
    token: string,
    qi: number,
    choice: string[],
    duplicate: boolean,
  ) => {
    const started = performance.now();
    try {
      await transport.answer(token, qi, choice);
      if (stopped) return;
      stats.maxLatencyMs = Math.max(
        stats.maxLatencyMs,
        Math.round(performance.now() - started),
      );
      if (duplicate) stats.duplicates++;
      else stats.received++;
    } catch {
      if (!stopped) stats.errors++;
    }
    emit();
  };
  const join = async (index: number) => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    try {
      await transport.join(`Practice ${index + 1}`, token);
      if (stopped) return;
      stats.joined++;
      emit();
      const seen = new Set<number>();
      unsubscribe.push(
        transport.watch(token, (view) => {
          if (
            stopped ||
            view.state !== "question" ||
            view.answered ||
            seen.has(view.questionIndex)
          )
            return;
          seen.add(view.questionIndex);
          if (chaos && index % 10 === 0) {
            stats.missed++;
            emit();
            return;
          }
          const qi = view.questionIndex;
          const choice = [
            view.question.options[index % view.question.options.length].id,
          ];
          // Slow phones, lost sends, retries and duplicate delivery remain subject to the real deadline.
          const delay =
            chaos && index % 7 === 0
              ? Math.max(0, view.endsAt - Date.now() + 250)
              : 700 + (index % 20) * 170;
          later(() => {
            void send(token, qi, choice, false);
            if (chaos && index % 5 === 0)
              later(() => {
                void send(token, qi, choice, true);
              }, 300);
          }, delay);
        }),
      );
    } catch {
      if (!stopped) {
        stats.errors++;
        emit();
      }
    }
  };
  // Ten concurrent joins keeps the harness usable on a teacher's laptop.
  let next = 0;
  const workers = Array.from({ length: Math.min(10, count) }, async () => {
    while (!stopped && next < count) {
      const index = next++;
      await join(index);
    }
  });
  void Promise.allSettled(workers);
  return () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    for (const off of unsubscribe) off();
  };
}
