"use client";
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !!document.querySelector(".reduce-motion"));

/**
 * A number that counts to its new value instead of jumping, easing out over half a second.
 * Screen readers get only the settled value; reduced motion shows it at once.
 */
export function AnimatedNumber({ value, format = String, duration = 520 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (reduced() || typeof requestAnimationFrame !== "function") { current.current = value; setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (value - from) * (1 - (1 - p) ** 3));
      current.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <><span aria-hidden>{format(shown)}</span><span className="sr-only">{format(value)}</span></>;
}
