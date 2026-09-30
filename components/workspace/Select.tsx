"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** A second, quieter line under the label. */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<V extends string = string> {
  value: V;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  /** Accessible name when no visible <label> wraps or points at the select. */
  label?: string;
  /** Id of a visible element that names the select. */
  labelledBy?: string;
  id?: string;
  /** Shown when the value matches no option. */
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Classes for the trigger button, e.g. width utilities. */
  className?: string;
  /** Called with true/false as the list opens and closes. */
  onOpenChange?: (open: boolean) => void;
}

const TYPEAHEAD_MS = 600;

/**
 * The workspace dropdown: a button that opens a listbox styled like our menus.
 * Follows the WAI-ARIA "select-only combobox" pattern: focus stays on the button and the
 * highlighted option is announced through aria-activedescendant. Keys: ↑/↓ (Alt+↓ opens),
 * Home/End, PageUp/PageDown, Enter/Space to choose, Escape to close without changing,
 * Tab chooses the highlighted option and moves on, and typing jumps to a matching option.
 * On phones the list opens as a bottom sheet with large rows.
 */
export function Select<V extends string = string>({
  value, onChange, options, label, labelledBy, id, placeholder = "", disabled, size = "md", className = "", onOpenChange,
}: SelectProps<V>) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const optionId = (i: number) => `${listId}-${i}`;
  // Phones get a bottom sheet; decided when the list opens (no listener needed, and safe where matchMedia is missing).
  const [phone, setPhone] = useState(false);
  const [open, setOpenState] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<React.CSSProperties>({ left: 0, top: 0 });
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", time: 0 });
  const openChange = useRef(onOpenChange);
  useLayoutEffect(() => { openChange.current = onOpenChange; });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabled = useCallback((i: number) => i >= 0 && i < options.length && !options[i].disabled, [options]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState((prev) => {
      if (prev !== next) openChange.current?.(next);
      return next;
    });
  }, []);

  const firstEnabled = useCallback((from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) if (enabled(i)) return i;
    return -1;
  }, [enabled, options.length]);

  const openAt = (index: number) => {
    if (disabled) return;
    setActive(index >= 0 ? index : firstEnabled(0, 1));
    setPhone(typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches);
    setOpen(true);
  };

  const choose = (index: number) => {
    if (!enabled(index)) return;
    setOpen(false);
    if (options[index].value !== value) onChange(options[index].value);
  };

  /** Type-ahead: repeated letters cycle through options starting with that letter. */
  const match = (key: string, from: number) => {
    const now = Date.now();
    const text = (now - typed.current.time < TYPEAHEAD_MS ? typed.current.text : "") + key.toLocaleLowerCase();
    typed.current = { text, time: now };
    const term = new Set(text).size === 1 ? text[0] : text;
    const start = term.length === 1 ? from + 1 : Math.max(from, 0);
    for (let n = 0; n < options.length; n++) {
      const i = (start + n) % options.length;
      if (enabled(i) && options[i].label.trim().toLocaleLowerCase().startsWith(term)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ";
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : e.key === "ArrowUp" ? firstEnabled(options.length - 1, -1) : firstEnabled(0, 1));
      } else if (e.key === "Home") { e.preventDefault(); openAt(firstEnabled(0, 1)); }
      else if (e.key === "End") { e.preventDefault(); openAt(firstEnabled(options.length - 1, -1)); }
      else if (printable) {
        e.preventDefault();
        const hit = match(e.key, selectedIndex);
        openAt(hit >= 0 ? hit : selectedIndex);
      }
      return;
    }
    const move = (to: number) => { e.preventDefault(); if (to >= 0) setActive(to); };
    switch (e.key) {
      case "ArrowDown": { const next = firstEnabled(active + 1, 1); return move(next >= 0 ? next : active); }
      case "ArrowUp": {
        if (e.altKey) { e.preventDefault(); choose(active); return; }
        const prev = active > 0 ? firstEnabled(active - 1, -1) : -1;
        return move(prev >= 0 ? prev : active);
      }
      case "Home": return move(firstEnabled(0, 1));
      case "End": return move(firstEnabled(options.length - 1, -1));
      case "PageDown": return move(firstEnabled(Math.min(active + 10, options.length - 1), -1));
      case "PageUp": return move(firstEnabled(Math.max(active - 10, 0), 1));
      case "Enter": case " ": e.preventDefault(); choose(active); return;
      case "Escape": e.preventDefault(); e.stopPropagation(); setOpen(false); return;
      case "Tab": choose(active); setOpen(false); return;
      default:
        if (printable) { const hit = match(e.key, active); move(hit >= 0 ? hit : active); }
    }
  };

  // Render the list next to the nearest dialog or workspace root, so it inherits the tokens and stays out of inert branches.
  useLayoutEffect(() => {
    if (open) setPortalRoot(button.current?.closest<HTMLElement>('[role="dialog"], .workspace-ui') ?? document.body);
  }, [open]);

  // Place the popover under (or above) the button; on phones it is a bottom sheet placed by CSS.
  useLayoutEffect(() => {
    if (!open || !portalRoot || phone) return;
    const update = () => {
      const anchor = button.current?.getBoundingClientRect();
      const popup = list.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const rtl = getComputedStyle(button.current!).direction === "rtl";
      const width = Math.max(anchor.width, popup.width);
      const left = rtl ? anchor.right - width : anchor.left;
      const below = window.innerHeight - anchor.bottom - 12;
      const above = anchor.top - 12;
      const up = popup.height > below && above > below;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: up ? Math.max(8, anchor.top - 4 - Math.min(popup.height, above)) : anchor.bottom + 4,
        minWidth: anchor.width,
        maxHeight: Math.max(160, up ? above : below),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, portalRoot, phone]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    const el = document.getElementById(optionId(active));
    el?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from stable ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Close on a press outside, or when focus leaves.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open, setOpen]);

  return (
    <>
      <button
        ref={button}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={label}
        aria-labelledby={labelledBy}
        disabled={disabled}
        data-size={size}
        className={`ws-select ${className}`}
        onKeyDown={onKeyDown}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
      >
        <span className="ws-select__value" data-placeholder={!selected || undefined}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={size === "sm" ? 14 : 16} aria-hidden="true" className="ws-select__chevron" />
      </button>
      {open && portalRoot && createPortal(
        <>
          {phone && <div className="ws-listbox-scrim" aria-hidden="true" onPointerDown={(e) => { e.preventDefault(); setOpen(false); }} />}
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            aria-labelledby={label ? undefined : labelledBy ?? id}
            tabIndex={-1}
            className={`ws-menu ws-glass ws-listbox ${phone ? "ws-listbox--sheet" : ""}`}
            style={phone ? undefined : { position: "fixed", ...position }}
            // Keep focus on the button while choosing with the pointer.
            onMouseDown={(e) => e.preventDefault()}
          >
            {phone && label && <p className="ws-listbox__title" aria-hidden="true">{label}</p>}
            {options.map((o, i) => (
              <div
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                className="ws-option"
                onPointerMove={() => { if (enabled(i) && i !== active) setActive(i); }}
                onClick={() => { choose(i); button.current?.focus(); }}
              >
                <span className="ws-option__text">
                  <span>{o.label}</span>
                  {o.description && <small>{o.description}</small>}
                </span>
                {o.value === value && <Check size={15} aria-hidden="true" className="ws-option__check" />}
              </div>
            ))}
          </div>
        </>, portalRoot,
      )}
    </>
  );
}
