"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import type { Activity } from "./ActivityContext";
/** Foreground time on this device; this is a study-session duration, not verified attention. */
export function useReadingSeconds(key: string, active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let total = 0;
    try { total = Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { /* unavailable */ }
    setSeconds(total);
    let last = Date.now(), ticks = 0;
    const save = () => { try { localStorage.setItem(key, String(Math.floor(total))); } catch { /* unavailable */ } };
    const timer = window.setInterval(() => { const now = Date.now(); if (active && document.visibilityState === "visible") { total += Math.min(2, (now - last) / 1000); setSeconds(Math.floor(total)); } last = now; if (++ticks % 10 === 0) save(); }, 1000);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(timer); save(); window.removeEventListener("pagehide", save); };
  }, [key, active]);
  return seconds;
}
export default function ActivitySummary({ seconds, activities }: { seconds: number; activities: Activity[] }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const checkpoints = activities.filter(a => a.kind !== "flashcards").length;
  const decks = activities.filter(a => a.kind === "flashcards" && typeof a.known === "number" && typeof a.total === "number");
  const known = decks.reduce((n, a) => n + (a.known ?? 0), 0), total = decks.reduce((n, a) => n + (a.total ?? 0), 0);
  const metrics: string[] = [];
  if (seconds > 0) metrics.push(seconds >= 60 ? (ar ? `${Math.round(seconds / 60)} د دراسة` : `${Math.round(seconds / 60)} min studying`) : (ar ? `${seconds} ث دراسة` : `${seconds} sec studying`));
  if (checkpoints) metrics.push(ar ? `${checkpoints} اختبارات مكتملة` : `${checkpoints} completed ${checkpoints === 1 ? "checkpoint" : "checkpoints"}`);
  if (total) metrics.push(ar ? `${known}/${total} بطاقات معروفة` : `${known}/${total} flashcards known`);
  return metrics.length ? <p className="lx-activity-summary" aria-live="polite">{metrics.join(" · ")}</p> : null;
}
