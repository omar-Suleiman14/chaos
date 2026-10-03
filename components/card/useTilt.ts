import { useEffect, useRef, type RefObject } from "react";

/**
 * Tilts the card toward the pointer. The easing runs here, one frame at a time, rather than as a CSS
 * transition: Chrome paints a transitioning layer from a low-resolution snapshot, which blurs the card's
 * text until it settles. Setting the transform directly each frame keeps it sharp.
 */
export function useTilt(stage: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = stage.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, rx = 0, ry = 0, toX = 0, toY = 0;
    const step = () => {
      // Slow, heavy easing so the card drifts toward the pointer instead of snapping to it.
      rx += (toX - rx) * 0.12; ry += (toY - ry) * 0.12;
      if (Math.abs(toX - rx) < 0.01 && Math.abs(toY - ry) < 0.01) { rx = toX; ry = toY; frame = 0; }
      else frame = requestAnimationFrame(step);
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`); el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };
    const aim = (x: number, y: number) => { toX = x; toY = y; if (!frame) frame = requestAnimationFrame(step); };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
      aim(-y * 10, x * 14);
    };
    const leave = () => aim(0, 0);
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(frame); };
  }, [stage]);
}

/**
 * Turns the card to `turn` degrees over 0.7s, frame by frame, for the same reason as useTilt: as a CSS
 * transition the card was blurry for the whole flip and a moment after it landed.
 */
export function useFlip(card: RefObject<HTMLElement | null>, turn: number) {
  const shown = useRef(turn);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const from = shown.current;
    const set = (deg: number) => { shown.current = deg; el.style.setProperty("--flip", `${deg}deg`); };
    if (from === turn || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { set(turn); return; }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      set(from + (turn - from) * (1 - Math.pow(1 - p, 4))); // ease-out
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [card, turn]);
}
