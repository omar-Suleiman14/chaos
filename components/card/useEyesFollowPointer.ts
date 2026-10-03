import { useEffect, type RefObject } from "react";
import { onDeviceTilt } from "./deviceTilt";

/** The avatar's eyes (.mc-eyes, tagged in lib/memberCard.ts) glance toward the pointer, or the way a phone tilts, a few units at most. */
export function useEyesFollowPointer(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, x = 0, y = 0, movedAt = 0, tilt: { x: number; y: number } | null = null;
    const look = (eyes: SVGGElement, dx: number, dy: number) => { eyes.style.transform = `translate(${(dx * 4).toFixed(2)}px, ${(dy * 3).toFixed(2)}px)`; };
    const aim = () => {
      frame = 0;
      root.current?.querySelectorAll<SVGGElement>(".mc-eyes").forEach((eyes) => {
        if (tilt) { look(eyes, tilt.x, tilt.y); return; }
        const box = (eyes.ownerSVGElement ?? eyes).getBoundingClientRect();
        if (!box.width) return;
        const dx = Math.max(-1, Math.min(1, (x - (box.left + box.width / 2)) / 260));
        const dy = Math.max(-1, Math.min(1, (y - (box.top + box.height / 2)) / 260));
        look(eyes, dx, dy);
      });
    };
    const move = (e: PointerEvent) => { tilt = null; movedAt = performance.now(); x = e.clientX; y = e.clientY; if (!frame) frame = requestAnimationFrame(aim); };
    window.addEventListener("pointermove", move, { passive: true });
    const stopTilt = onDeviceTilt((tx, ty) => {
      // A finger or mouse that just moved wins over the phone's tilt for a second.
      if (performance.now() - movedAt < 1000) return;
      tilt = { x: tx, y: ty }; if (!frame) frame = requestAnimationFrame(aim); });
    return () => { window.removeEventListener("pointermove", move); stopTilt(); cancelAnimationFrame(frame); };
  }, [root]);
}
