import { useEffect, type RefObject } from "react";

/** The avatar's eyes (.mc-eyes, tagged in lib/memberCard.ts) glance toward the pointer, a few units at most. */
export function useEyesFollowPointer(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, x = 0, y = 0;
    const aim = () => {
      frame = 0;
      root.current?.querySelectorAll<SVGGElement>(".mc-eyes").forEach((eyes) => {
        const box = (eyes.ownerSVGElement ?? eyes).getBoundingClientRect();
        if (!box.width) return;
        const dx = Math.max(-1, Math.min(1, (x - (box.left + box.width / 2)) / 260));
        const dy = Math.max(-1, Math.min(1, (y - (box.top + box.height / 2)) / 260));
        eyes.style.transform = `translate(${(dx * 4).toFixed(2)}px, ${(dy * 3).toFixed(2)}px)`;
      });
    };
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!frame) frame = requestAnimationFrame(aim); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, [root]);
}
