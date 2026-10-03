import { useEffect, useRef, type RefObject } from "react";
import { onDeviceTilt } from "./deviceTilt";

/**
 * The card shies away from the mouse, like a magnet facing the same pole: as the pointer comes near it slides
 * away (a little, so it can still be clicked) and tips its near edge back. On a phone it follows the tilt instead.
 *
 * Writes --rx/--ry (tilt), --tx/--ty (push) and --gx/--gy (glare) on `stage`. `measure` gives the element
 * whose box counts as the card (default: the stage itself); it must not move with the push. Both are looked
 * up on every move, so the stage may mount after this hook (as /card's does once authors load).
 *
 * The easing runs here, one frame at a time, rather than as a CSS transition: Chrome paints a transitioning
 * layer from a low-resolution snapshot, which blurs the card's text until it settles.
 */
export function useTilt(stage: RefObject<HTMLElement | null>, measure?: () => HTMLElement | null) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = () => measure?.() ?? stage.current;
    let frame = 0, movedAt = 0;
    const now = { rx: 0, ry: 0, tx: 0, ty: 0 }, to = { ...now };
    const step = () => {
      let moving = false;
      for (const k of ["rx", "ry", "tx", "ty"] as const) {
        // Slow, heavy easing so the card drifts rather than snaps.
        now[k] += (to[k] - now[k]) * 0.12;
        if (Math.abs(to[k] - now[k]) < 0.01) now[k] = to[k]; else moving = true;
      }
      frame = moving ? requestAnimationFrame(step) : 0;
      const el = stage.current; if (!el) return;
      el.style.setProperty("--rx", `${now.rx.toFixed(2)}deg`); el.style.setProperty("--ry", `${now.ry.toFixed(2)}deg`);
      el.style.setProperty("--tx", `${now.tx.toFixed(2)}px`); el.style.setProperty("--ty", `${now.ty.toFixed(2)}px`);
    };
    const aim = (next: typeof to) => { Object.assign(to, next); if (!frame) frame = requestAnimationFrame(step); };
    const rest = () => aim({ rx: 0, ry: 0, tx: 0, ty: 0 });

    // Mouse (and pen): x and y run from -0.5 to 0.5 across the card, and keep going past its edges.
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      movedAt = performance.now();
      const el = stage.current, card = box(); if (!el || !card) return;
      const r = card.getBoundingClientRect(); if (!r.width) return;
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      // Full strength over the card, fading out over 140px around it.
      const gap = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      const pull = Math.max(0, 1 - gap / 140);
      if (!pull) { rest(); return; }
      const nx = Math.max(-0.5, Math.min(0.5, x)), ny = Math.max(-0.5, Math.min(0.5, y));
      el.style.setProperty("--gx", `${(nx + 0.5) * 100}%`); el.style.setProperty("--gy", `${(ny + 0.5) * 100}%`);
      // The near edge tips away, and the card slides away from the pointer by up to 18px.
      aim({ rx: -ny * 10 * pull, ry: nx * 14 * pull, tx: -nx * 36 * pull, ty: -ny * 36 * pull });
    };
    const leave = (e: PointerEvent) => { if (!e.relatedTarget) rest(); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    const stopTilt = onDeviceTilt((x, y) => { if (performance.now() - movedAt > 1000) aim({ rx: -y * 10, ry: x * 14, tx: 0, ty: 0 }); });
    return () => {
      window.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave);
      stopTilt(); cancelAnimationFrame(frame);
    };
  }, [stage, measure]);
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
