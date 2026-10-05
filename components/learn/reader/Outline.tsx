"use client";

import { useEffect, useRef, useState } from "react";
import { useModal } from "@/components/workspace/useModal";
import { ListTree, X } from "lucide-react";
import type { OutlineItem } from "@/lib/learn/doc";
import { useCopy } from "@/lib/i18n";

const copy = { en: { title: "On this page", nav: "Lesson outline", close: "Close outline" }, ar: { title: "في هذه الصفحة", nav: "مخطط الدرس", close: "أغلق المخطط" } };

/** The heading currently being read: the last one above a line a third of the way down the screen. */
export function useActiveHeading(items: OutlineItem[]): string | undefined {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current: string | undefined = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= line) current = item.id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [items]);
  return active;
}

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
  // Move focus for keyboard and screen-reader users without scrolling again.
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  el.dataset.flash = "true";
  setTimeout(() => { delete el.dataset.flash; }, 1600);
}

export function OutlineNav({ items, active, onNavigate }: { items: OutlineItem[]; active?: string; onNavigate?: () => void }) {
  const t = useCopy(copy);
  if (!items.length) return null;
  return (
    <nav className="lx-toc" aria-label={t.nav}>
      {items.map((item) => (
        <a key={item.id} dir="auto" href={`#${item.id}`} data-level={item.level} aria-current={active === item.id ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); jumpTo(item.id); onNavigate?.(); }}>
          {item.text}
        </a>
      ))}
    </nav>
  );
}

export function Outline({ items, active }: { items: OutlineItem[]; active?: string }) {
  const t = useCopy(copy);
  if (!items.length) return null;
  return (
    <div>
      <p className="lx-toc__title">{t.title}</p>
      <OutlineNav items={items} active={active} />
    </div>
  );
}

/** Phones and tablets: the same outline, folded above the lesson. */
export function MobileOutline({ items, active }: { items: OutlineItem[]; active?: string }) {
  const t = useCopy(copy);
  const [open, setOpen] = useState(false);
  useEffect(() => { const media = window.matchMedia("(min-width: 1100px)"); const close = () => { if (media.matches) setOpen(false); }; media.addEventListener("change", close); return () => media.removeEventListener("change", close); }, []);
  if (!items.length) return null;
  const current = items.find((i) => i.id === active);
  return (
    <div className="lx-toc-mobile">
      <button type="button" className="lx-toc-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><ListTree size={16} aria-hidden /><span>{t.title}</span>{current && <span dir="auto" className="lx-toc-current">{current.text}</span>}</button>
      {open && <OutlineDrawer items={items} active={active} onClose={() => setOpen(false)} />}
    </div>
  );
}
/** Slide-up time; closing waits for it before the sheet leaves the page. */
const SHEET_MS = 260;

/**
 * Bottom sheet on phones: slides up on a spring with the page dimming behind it, and slides back down to
 * close (the close button, the scrim, Escape, a chosen section, or a drag down on the handle).
 */
function OutlineDrawer({ items, active, onClose }: { items: OutlineItem[]; active?: string; onClose: () => void }) {
  const t = useCopy(copy);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState<{ start: number; y: number; at: number; pointer: number; height: number } | null>(null);
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setDrag(null);
    setShown(false);
    window.setTimeout(onClose, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SHEET_MS);
  };
  const panel = useModal<HTMLDivElement>({ onClose: close });
  useEffect(() => {
    // Mount below the screen, then slide up on the next frame.
    const frame = requestAnimationFrame(() => setShown(true));
    panel.current?.querySelector<HTMLElement>('[aria-current="location"]')?.scrollIntoView?.({ block: "center" });
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  const offset = drag ? Math.max(0, drag.y - drag.start) : 0;
  const height = drag?.height ?? 1;
  return <>
    <div className="lx-sheet-scrim lx-outline-scrim" data-shown={shown || undefined} data-modal-backdrop onClick={close} aria-hidden
      style={drag ? { opacity: Math.max(0, 1 - offset / height) } : undefined} />
    <div ref={panel} className="lx-sheet lx-outline-drawer ws-glass" role="dialog" aria-modal="true" aria-label={t.nav} tabIndex={-1}
      data-shown={shown || undefined} data-dragging={drag ? true : undefined} style={{ "--sheet-drag": `${offset}px` } as React.CSSProperties}>
      <header className="lx-outline-drawer__head"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ start: e.clientY, y: e.clientY, at: performance.now(), pointer: e.pointerId, height: panel.current?.offsetHeight || 1 });
        }}
        onPointerMove={(e) => { if (drag?.pointer === e.pointerId) setDrag({ ...drag, y: e.clientY }); }}
        onPointerUp={() => {
          if (!drag) return;
          // A short fast flick or a pull past a quarter of the sheet closes it; anything less springs back.
          const speed = offset / Math.max(1, performance.now() - drag.at);
          if (offset > height / 4 || (offset > 24 && speed > 0.6)) close(); else setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}>
        <span className="lx-outline-drawer__grab" aria-hidden />
        <div className="lx-panel__row"><strong>{t.title}</strong><button type="button" className="ws-icon-button" aria-label={t.close} onClick={close}><X size={20} aria-hidden /></button></div>
      </header>
      <OutlineNav items={items} active={active} onNavigate={close} />
    </div>
  </>;
}
