"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** The reader's sticky top bar; a callout never tucks under it. */
const TOP_BAR = 64;
const GAP = 12;

type Place = { top: number; left: number; arrow: number; side: "above" | "below" | "inside" } | "away";

/**
 * A touch block's actions, in a callout that points at the block like iOS's edit menu:
 * just above the block, or just below it when there is no room above. It follows the
 * block as the page scrolls and steps aside once the block leaves the screen.
 */
export function BlockCallout({ blockId, label, onClose, children }: { blockId: string; label: string; onClose: () => void; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    const el = bar.current;
    if (!target || !el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = target.getBoundingClientRect();
      if (r.bottom < TOP_BAR || r.top > window.innerHeight) { setPlace("away"); return; }
      const w = el.offsetWidth, h = el.offsetHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const side = r.top - h - GAP >= TOP_BAR ? "above" : r.bottom + h + GAP <= window.innerHeight ? "below" : "inside";
      const top = side === "above" ? r.top - h - GAP : side === "below" ? r.bottom + GAP : TOP_BAR + 8;
      const center = r.left + r.width / 2;
      const left = Math.max(8, Math.min(vw - w - 8, center - w / 2));
      setPlace({ top, left, arrow: Math.max(20, Math.min(w - 20, center - left)), side });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(target);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [blockId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Taps inside the lesson belong to the reader: they move the callout to another block or close it.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!bar.current?.contains(target) && !target?.closest?.(".lx-article")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true); };
  }, [onClose]);
  const shown = place && place !== "away" ? place : null;
  return (
    <div ref={bar} className="lx-actbar ws-glass" role="toolbar" aria-label={label} data-side={shown?.side ?? "above"} data-away={place === "away" || undefined}
      style={shown ? { top: shown.top, left: shown.left, ["--arrow" as string]: `${shown.arrow}px` } : { top: 0, left: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}
