"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { useModal } from "./useModal";

const copy = { en: { close: "Close", undo: "Undo", dismiss: "Dismiss", cancel: "Cancel" }, ar: { close: "إغلاق", undo: "تراجع", dismiss: "إخفاء", cancel: "إلغاء" } };

/** Modal dialog rendered inside the workspace tree so it inherits workspace styling. */
/* oxlint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role -- Backdrop mouse dismissal complements the modal Escape handler and labelled Close button. This custom dialog uses the existing focus, Escape and dismissal lifecycle; a native dialog would require a different open and top-layer lifecycle. */
export function WsDialog({ title, description, onClose, children, wide, initialFocusRef }: {
  title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useCopy(copy);
  const panel = useModal({ onClose, initialFocusRef });
  const descriptionId = useId();
  return (
    <div className="ws-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-describedby={description ? descriptionId : undefined} className={`ws-dialog ws-glass ${wide ? "ws-dialog--wide" : ""}`}>
        <div className="ws-dialog__header">
          <div>
            <h2 className="ws-dialog__title">{title}</h2>
            {description && <p id={descriptionId} className="ws-page-subtitle !mt-1 text-[13px]">{description}</p>}
          </div>
          <button type="button" data-close className="ws-icon-button" onClick={onClose} aria-label={t.close}><X size={16} /></button>
        </div>
        <div className="ws-dialog__body">{children}</div>
      </div>
    </div>
  );
}
/* oxlint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role */

/** Confirmation dialog that replaces window.confirm: says what will happen, cancel is the default focus. */
export function WsConfirm({ title, body, confirmLabel, danger = true, onConfirm, onClose }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const t = useCopy(copy);
  return (
    <WsDialog title={title} description={body} onClose={onClose}>
      <div className="flex justify-end gap-2">
        <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
        <button type="button" className={`ws-btn ${danger ? "ws-btn--danger" : ""}`} onClick={() => { onClose(); onConfirm(); }}>{confirmLabel}</button>
      </div>
    </WsDialog>
  );
}

/** Small dropdown menu anchored to a "…" button. */
export function WsMenu({ label, children, align = "end", trigger, triggerClassName = "ws-icon-button", menuClassName }: {
  label: string; children: (close: () => void) => React.ReactNode; align?: "start" | "end"; trigger?: React.ReactNode; triggerClassName?: string; menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const firstItem = useRef<"first" | "last">("first");
  const search = useRef({ text: "", time: 0 });
  const id = useId();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const close = () => setOpen(false);
  useLayoutEffect(() => {
    setPortalRoot(root.current?.closest<HTMLElement>('[role="dialog"], .workspace-ui') ?? document.body);
  }, [open]);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    .filter((item) => !item.matches(':disabled, [aria-disabled="true"]'));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("focusin", onFocus); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !portalRoot) return;
    const trigger = triggerRef.current;
    const update = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const popup = menu.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const rtl = getComputedStyle(triggerRef.current!).direction === "rtl";
      const left = (align === "end") !== rtl ? anchor.right - popup.width : anchor.left;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - popup.width - 8)),
        top: Math.max(8, anchor.bottom + 4 + popup.height > window.innerHeight - 8 ? anchor.top - popup.height - 4 : anchor.bottom + 4),
      });
    };
    update();
    const available = items();
    available.forEach((item) => { item.tabIndex = -1; });
    (firstItem.current === "last" ? available.at(-1) : available[0])?.focus();
    search.current = { text: "", time: 0 };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true);
      queueMicrotask(() => { if (document.activeElement === document.body) trigger?.focus(); });
    };
  }, [open, align, portalRoot]);
  return (
    <div ref={root} className="relative" data-open={open}>
      <button ref={triggerRef} type="button" className={triggerClassName} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); firstItem.current = e.key === "ArrowUp" ? "last" : "first"; setOpen(true);
          }
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); firstItem.current = "first"; setOpen((v) => !v); }}>
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open && portalRoot && createPortal(
        <div ref={menu} id={id} role="menu" tabIndex={-1} aria-label={label} className={`ws-menu ws-glass${menuClassName ? ` ${menuClassName}` : ""}`} style={{ position: "fixed", ...position, maxHeight: "calc(100dvh - 16px)", overflowY: "auto" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
            if (e.key === "Tab") { triggerRef.current?.focus(); close(); return; }
            const available = items();
            const current = available.indexOf(document.activeElement as HTMLElement);
            let next: HTMLElement | undefined;
            if (e.key === "ArrowDown") next = available[(current + 1) % available.length];
            else if (e.key === "ArrowUp") next = available[(current - 1 + available.length) % available.length];
            else if (e.key === "Home") next = available[0];
            else if (e.key === "End") next = available.at(-1);
            else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
              const now = e.timeStamp;
              const text = (now - search.current.time < 700 ? search.current.text : "") + e.key.toLowerCase();
              search.current = { text, time: now };
              const term = new Set(text).size === 1 ? text[0] : text;
              const start = term.length === 1 ? current + 1 : Math.max(current, 0);
              next = Array.from({ length: available.length }, (_, i) => available[(start + i) % available.length])
                .find((item) => item.textContent?.trim().toLowerCase().startsWith(term));
            }
            if (next) { e.preventDefault(); next.focus(); }
          }}
          onClick={(e) => e.stopPropagation()}>
          {children(close)}
        </div>, portalRoot
      )}
    </div>
  );
}

/** Tabs with an indicator that slides between the selected tab. */
export function WsTabs<T extends string>({ tabs, value, onChange, label, badge, icons, labels }: {
  tabs: readonly T[]; value: T; onChange: (tab: T) => void; label: string; badge?: (tab: T) => React.ReactNode;
  /** Display text per tab when it differs from the tab's value (for translation). */
  labels?: Partial<Record<T, string>>;
  /** A small line icon shown before each label. */
  icons?: Partial<Record<T, LucideIcon>>;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Which edges have tabs scrolled out of view, so a phone shows that the row scrolls.
  const [overflow, setOverflow] = useState({ start: false, end: false });
  const updateOverflow = () => {
    const box = bar.current;
    if (!box) return;
    // scrollLeft runs negative in right-to-left layouts; the distance from the start is what matters.
    const from = Math.abs(box.scrollLeft), max = box.scrollWidth - box.clientWidth;
    const next = { start: from > 1, end: from < max - 1 };
    setOverflow(prior => prior.start === next.start && prior.end === next.end ? prior : next);
  };
  useLayoutEffect(() => {
    const measure = () => {
      const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (el) {
        setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
        // Keep the active tab in view when the row scrolls on a phone.
        const box = bar.current!;
        if (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) {
          box.scrollTo({ left: el.offsetLeft - 16 });
        }
      }
    };
    const update = () => { measure(); updateOverflow(); };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [value, tabs]);
  return (
    <div className="ws-tabs-wrap" data-overflow-start={overflow.start || undefined} data-overflow-end={overflow.end || undefined}>
    <div ref={bar} className="ws-tabs" role="tablist" tabIndex={-1} aria-label={label} onScroll={updateOverflow}
      onKeyDown={(e) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const i = tabs.indexOf(value);
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        const forward = (e.key === "ArrowRight") !== rtl;
        const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (forward ? 1 : tabs.length - 1)) % tabs.length];
        onChange(next);
        requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
      }}>
      {tabs.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={value === tab} tabIndex={value === tab ? 0 : -1} className="ws-tab" onClick={() => onChange(tab)}>
          {(() => { const Icon: LucideIcon | undefined = icons?.[tab]; return Icon ? <Icon size={16} aria-hidden /> : null; })()}
          {labels?.[tab] ?? tab}{badge?.(tab)}
        </button>
      ))}
      {indicator && <span className="ws-tab-indicator" style={indicator} aria-hidden="true" />}
    </div>
    {overflow.end && (
      // Pointer shortcut only: keyboard users move between tabs with the arrow keys.
      <button type="button" className="ws-tabs-more" tabIndex={-1} aria-hidden="true"
        onClick={() => {
          const box = bar.current;
          if (!box) return;
          const rtl = getComputedStyle(box).direction === "rtl";
          box.scrollBy({ left: (rtl ? -1 : 1) * box.clientWidth * 0.7, behavior: "smooth" });
        }}>
        <ChevronRight size={16} />
      </button>
    )}
    </div>
  );
}

export function WsSwitch({ checked, onChange, label, disabled, hideLabel }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; hideLabel?: boolean }) {
  return (
    <label className="ws-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-checked={checked} />
      <span className="ws-switch__track" aria-hidden="true" />
      <span className={hideLabel ? "sr-only" : "ws-switch__label"}>{label}</span>
    </label>
  );
}

/**
 * Quick tooltips for icon-only controls (.ws-icon-button, or anything with
 * data-tip): after a short hover or on keyboard focus, never on touch. Uses the
 * control's title or aria-label, so every icon button explains itself.
 */
export function WsTooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let title: string | null = null;
    const find = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>(".ws-icon-button, [data-tip]") : null);
    const hide = () => {
      clearTimeout(timer);
      if (current && title !== null) current.setAttribute("title", title);
      current = null; title = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip || title || el.getAttribute("aria-label");
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const below = r.bottom + 40 < window.innerHeight;
      setTip({ text, x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)), y: below ? r.bottom + 6 : r.top - 6, below });
    };
    const start = (el: HTMLElement, delay: number) => {
      if (el === current) return;
      hide();
      if (el.matches(":disabled")) return;
      current = el;
      // Suppress the slow native tooltip while ours is in charge.
      title = el.getAttribute("title");
      if (title !== null) el.removeAttribute("title");
      timer = setTimeout(() => show(el), delay);
    };
    const over = (e: PointerEvent) => { if (e.pointerType === "touch") return; const el = find(e.target); if (el) start(el, 350); else if (current) hide(); };
    const focus = (e: FocusEvent) => { const el = find(e.target); if (el && el.matches(":focus-visible")) start(el, 0); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  if (!tip) return null;
  return <div className="ws-tooltip ws-glass" data-below={tip.below} style={{ left: tip.x, top: tip.y }} aria-hidden="true">{tip.text}</div>;
}
