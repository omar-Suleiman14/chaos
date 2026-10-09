"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clockOffset, secondsLeft } from "@/convex/liveLogic";
import { useCopy } from "@/lib/i18n";

/**
 * Offset between the server's clock and this device's (serverNow − localNow). Countdowns
 * use it so a phone whose clock is a minute off still shows the server's time. It is
 * measured on load, every minute and whenever the tab wakes up.
 */
export function useServerClock(): number {
  const serverNow = useMutation(api.live.serverNow);
  const [offset, setOffset] = useState(0);
  const sync = useCallback(async () => {
    try {
      const sentAt = Date.now();
      const server = await serverNow({});
      setOffset(clockOffset(sentAt, Date.now(), server));
    } catch {
      /* offline: keep the last offset */
    }
  }, [serverNow]);
  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => void sync(), 60_000);
    const wake = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", wake);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); };
  }, [sync]);
  return offset;
}

/** Whole seconds left until the server's `endsAt`, ticking four times a second. */
export function useSecondsLeft(endsAt: number | null | undefined, offset: number, now: () => number = Date.now): number {
  const [left, setLeft] = useState(() => (endsAt ? secondsLeft(endsAt, now(), offset) : 0));
  useEffect(() => {
    if (!endsAt) { setLeft(0); return; }
    const tick = () => setLeft(secondsLeft(endsAt, now(), offset));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, offset, now]);
  return left;
}

const copy = {
  en: { left: (n: number) => `${n} ${n === 1 ? "second" : "seconds"} left`, up: "Time is up" },
  ar: { left: (n: number) => (n === 1 ? "بقيت ثانية واحدة" : n === 2 ? "بقيت ثانيتان" : n <= 10 ? `بقيت ${n} ثوانٍ` : `بقيت ${n} ثانية`), up: "انتهى الوقت" },
};

/**
 * The countdown. The number is hidden from screen readers while it ticks; instead the
 * `onAnnounce` callback receives a sentence at 10 and 5 seconds and at zero.
 */
export function Countdown({ endsAt, total, offset, size = "phone", onAnnounce, onTick, now }: {
  endsAt: number;
  total: number;
  offset: number;
  size?: "phone" | "host";
  onAnnounce?: (text: string) => void;
  onTick?: (secondsLeft: number) => void;
  now?: () => number;
}) {
  const t = useCopy(copy);
  const left = useSecondsLeft(endsAt, offset, now);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current === left) return;
    last.current = left;
    onTick?.(left);
    if (left === 10 || left === 5) onAnnounce?.(t.left(left));
    if (left === 0) onAnnounce?.(t.up);
  }, [left, onAnnounce, onTick, t]);
  const share = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <div className={`live-timer live-timer--${size}${left <= 5 ? " live-timer--low" : ""}`} role="timer" aria-label={t.left(left)}>
      <svg viewBox="0 0 36 36" aria-hidden="true" className="live-timer__ring">
        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${share * 100.5} 100.5`} transform="rotate(-90 18 18)" strokeLinecap="round" />
      </svg>
      <span className="live-timer__value" aria-hidden="true" data-testid="countdown-value">{left}</span>
    </div>
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** A polite live region; set `text` to announce it. */
export function Announcer({ text }: { text: string }) {
  return <output className="sr-only"  aria-live="polite" aria-atomic="true">{text}</output>;
}

/** The 5-4-3-2-1 before the first question, on the host screen and on phones. */
export function StartCountdown({ startsAt, offset, onTick }: { startsAt: number; offset: number; onTick?: (left: number) => void }) {
  const left = Math.max(1, useSecondsLeft(startsAt, offset));
  const last = useRef(0);
  useEffect(() => {
    if (left === last.current) return;
    last.current = left;
    onTick?.(left);
  }, [left, onTick]);
  return <div className="live-start-count" role="timer" aria-live="assertive"><span key={left} className="live-pop">{left}</span></div>;
}
