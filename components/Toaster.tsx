"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, ChevronDown, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { toast, toastStore, type ToastItem } from "@/lib/toast";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { region: "Notifications (Alt+T)", close: "Dismiss notification", undo: "Undo", more: "Show more", less: "Show less" },
  ar: { region: "الإشعارات (Alt+T)", close: "إخفاء الإشعار", undo: "تراجع", more: "عرض المزيد", less: "عرض أقل" },
};
/** Toasts drawn in the collapsed stack; the rest wait behind them. */
const VISIBLE = 3;
const GAP = 10;
/** How far each older toast peeks out above the newest one. */
const PEEK = 12;

const ICONS = {
  default: Bell, success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info, loading: LoaderCircle,
} as const;

/** Mounted once in the root layout. Newest toast in front; hover, focus or a tap fans the stack out. */
export default function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get, () => toastStore.empty);
  const t = useCopy(copy);
  const region = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  // Newest first: index 0 is the front of the stack.
  const ordered = [...items].reverse();
  const live = ordered.filter(item => !item.leaving);
  const front = heights[live[0]?.id ?? ""] ?? 0;
  useEffect(() => { if (!live.length) setExpanded(false); }, [live.length]);
  // Development only: fire toasts from the console while designing.
  useEffect(() => { if (process.env.NODE_ENV !== "production") (window as unknown as { __chaosToast?: typeof toast }).__chaosToast = toast; }, []);
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    const onKey = (e: KeyboardEvent) => {
      // Alt+T jumps to the notifications, as in Sonner.
      if (e.altKey && e.code === "KeyT" && items.length) { e.preventDefault(); setExpanded(true); region.current?.querySelector<HTMLElement>("[data-toast]")?.focus(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("visibilitychange", onVisibility); document.removeEventListener("keydown", onKey); };
  }, [items.length]);
  const offsets: number[] = [];
  let total = 0;
  for (const item of ordered) { offsets.push(total); if (!item.leaving) total += (heights[item.id] ?? 0) + GAP; }
  const stackHeight = expanded ? Math.max(0, total - GAP) : front + Math.min(live.length - 1, VISIBLE - 1) * PEEK;
  return (
    <section ref={region} className="chaos-toaster" aria-label={t.region} tabIndex={-1} data-expanded={expanded || undefined}
      style={{ height: live.length ? stackHeight : 0 }}
      onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false); }}>
      <ol aria-live="polite" aria-relevant="additions text">
        {ordered.map((item, index) => {
          const depth = live.indexOf(item);
          return <ToastCard key={item.id} item={item} t={t} depth={depth < 0 ? index : depth} offset={offsets[index]} expanded={expanded} frontHeight={front}
            paused={expanded || hidden} onHeight={(height) => setHeights(prior => prior[item.id] === height ? prior : { ...prior, [item.id]: height })} />;
        })}
      </ol>
    </section>
  );
}

function ToastCard({ item, t, depth, offset, expanded, frontHeight, paused, onHeight }: {
  item: ToastItem; t: (typeof copy)["en"]; depth: number; offset: number; expanded: boolean; frontHeight: number; paused: boolean; onHeight: (height: number) => void;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [swipe, setSwipe] = useState<{ start: number; dx: number; pointer: number } | null>(null);
  const [swiped, setSwiped] = useState(0);
  // Collapsed, a toast is one line. The chevron appears when the title is cut off or there is more to read.
  const title = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = title.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title]);
  const expandable = open || clipped || !!item.description;
  const remaining = useRef(item.duration);
  const version = useRef(item.version);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    onHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHeight is a fresh closure each render; the element is stable
  }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(frame); }, []);
  // The timer pauses while the stack is open, the toast is expanded or the tab is hidden, and restarts when the toast is updated.
  useEffect(() => {
    if (version.current !== item.version) { version.current = item.version; remaining.current = item.duration; }
    if (item.leaving || !Number.isFinite(item.duration) || paused || open) return;
    const started = Date.now();
    const timer = setTimeout(() => toast.dismiss(item.id), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [item.id, item.version, item.duration, item.leaving, paused, open]);
  const Icon = ICONS[item.kind];
  const hiddenBehind = !expanded && depth >= VISIBLE;
  const y = expanded ? -offset : -depth * PEEK;
  const scale = expanded ? 1 : 1 - depth * 0.05;
  const dx = swipe?.dx ?? swiped;
  return (
    <li data-toast data-kind={item.kind} data-mounted={mounted || undefined} data-leaving={item.leaving || undefined} data-front={depth === 0 || undefined}
      data-swiping={swipe ? true : undefined} role={item.kind === "error" ? "alert" : "status"} tabIndex={0}
      className="chaos-toast ws-glass" aria-hidden={hiddenBehind || undefined}
      // Position comes in as variables; CSS composes them with the enter and exit motion.
      style={{
        zIndex: 100 - depth,
        "--toast-x": `${dx}px`, "--toast-y": `${y}px`, "--toast-scale": scale,
        "--toast-opacity": hiddenBehind ? 0 : swipe ? Math.max(0.3, 1 - Math.abs(dx) / 220) : 1,
        height: !expanded && depth > 0 && frontHeight ? frontHeight : undefined,
      } as React.CSSProperties}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); toast.dismiss(item.id); } }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setSwipe({ start: e.clientX, dx: 0, pointer: e.pointerId });
      }}
      onPointerMove={(e) => { if (swipe?.pointer === e.pointerId) setSwipe({ ...swipe, dx: e.clientX - swipe.start }); }}
      onPointerUp={() => {
        if (!swipe) return;
        // A decisive flick sideways dismisses; anything less springs back.
        if (Math.abs(swipe.dx) > 70) { setSwiped(swipe.dx > 0 ? 420 : -420); toast.dismiss(item.id); }
        setSwipe(null);
      }}
      onPointerCancel={() => setSwipe(null)}>
      <div ref={inner} className="chaos-toast__body" data-dim={!expanded && depth > 0 || undefined} data-open={open || undefined}>
        <span className="chaos-toast__lead">
          <Icon size={16} className="chaos-toast__icon" aria-hidden="true" />
          <button type="button" className="chaos-toast__close" aria-label={t.close} onClick={() => toast.dismiss(item.id)}><X size={14} aria-hidden="true" /></button>
        </span>
        <div className="chaos-toast__text">
          <strong ref={title} dir="auto">{item.title}</strong>
          {item.description && open && <p dir="auto">{item.description}</p>}
        </div>
        {(item.undo || item.action) && (
          <button type="button" className="chaos-toast__action" onClick={() => { (item.action?.onClick ?? item.undo)?.(); toast.dismiss(item.id); }}>
            {item.action?.label ?? t.undo}
          </button>
        )}
        {expandable && (
          <button type="button" className="chaos-toast__more" aria-expanded={open} aria-label={open ? t.less : t.more} onClick={() => setOpen(!open)}>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

