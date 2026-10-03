import { useEffect, useRef, type RefObject } from "react";
import { onDeviceTilt } from "./deviceTilt";

type Motion = { rx: number; ry: number; tx: number; ty: number };
const REST: Motion = { rx: 0, ry: 0, tx: 0, ty: 0 };

/**
 * Cards shy away from the mouse, like magnets facing the same pole: as the pointer comes near, each card slides
 * away (a little, so it can still be clicked) and tips its near edge back. How much depends on how close the
 * pointer is to that card's centre, so in a stack the nearest card moves most. On a phone they follow the tilt.
 *
 * Each card is an element that stays put while its contents move: it is measured, and receives --rx/--ry
 * (tilt), --tx/--ty (push) and --gx/--gy (glare) for its CSS to use. By default that's `stage`; pass `cards`
 * for several (/card's stack). Both are looked up on every move, so they may mount after this hook.
 *
 * The easing runs here, one frame at a time, rather than as a CSS transition: Chrome paints a transitioning
 * layer from a low-resolution snapshot, which blurs the card's text until it settles.
 */
export function useTilt(stage: RefObject<HTMLElement | null>, cards?: () => HTMLElement[]) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const list = () => cards?.() ?? (stage.current ? [stage.current] : []);
    const moving = new Map<HTMLElement, { now: Motion; to: Motion }>();
    let frame = 0, movedAt = 0;
    const step = () => {
      let active = false;
      // The push lands on whole screen pixels: part-pixel offsets make Chrome blend each letter across two pixels.
      const dpr = window.devicePixelRatio || 1, snap = (v: number) => (Math.round(v * dpr) / dpr).toFixed(3);
      moving.forEach(({ now, to }, el) => {
        if (!el.isConnected) { moving.delete(el); return; }
        for (const k of ["rx", "ry", "tx", "ty"] as const) {
          // Slow, heavy easing so the card drifts rather than snaps.
          now[k] += (to[k] - now[k]) * 0.12;
          if (Math.abs(to[k] - now[k]) < 0.01) now[k] = to[k]; else active = true;
        }
        el.style.setProperty("--rx", `${now.rx.toFixed(2)}deg`); el.style.setProperty("--ry", `${now.ry.toFixed(2)}deg`);
        el.style.setProperty("--tx", `${snap(now.tx)}px`); el.style.setProperty("--ty", `${snap(now.ty)}px`);
      });
      frame = active ? requestAnimationFrame(step) : 0;
    };
    const aim = (el: HTMLElement, next: Motion) => {
      const entry = moving.get(el) ?? { now: { ...REST }, to: { ...REST } };
      moving.set(el, entry); Object.assign(entry.to, next);
      if (!frame) frame = requestAnimationFrame(step);
    };

    // Mouse (and pen): x and y run from -0.5 to 0.5 across a card, clamped at its edges.
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      movedAt = performance.now();
      for (const el of list()) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        // Strongest with the pointer on the card's centre, gone 160px beyond its corners.
        const reach = Math.hypot(r.width, r.height) / 2 + 160;
        const near = Math.max(0, 1 - Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / reach);
        if (!near) { aim(el, REST); continue; }
        const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)), y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
        el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
        // The near edge tips away, and the card slides away from the pointer.
        aim(el, { rx: -y * 14 * near, ry: x * 20 * near, tx: -x * 44 * near, ty: -y * 44 * near });
      }
    };
    const leave = (e: PointerEvent) => { if (!e.relatedTarget) list().forEach((el) => aim(el, REST)); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    const stopTilt = onDeviceTilt((x, y) => {
      // A mouse that just moved wins over the tilt for a second.
      if (performance.now() - movedAt > 1000) list().forEach((el) => aim(el, { rx: -y * 10, ry: x * 14, tx: 0, ty: 0 }));
    });
    return () => {
      window.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave);
      stopTilt(); cancelAnimationFrame(frame);
    };
  }, [stage, cards]);
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
