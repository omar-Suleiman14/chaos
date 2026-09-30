"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const focusable = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

export function modalTabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusable)).filter((el) => {
    if (el.tabIndex < 0 || el.matches(":disabled") || el.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

type Layer = { element: HTMLElement; focus: () => void };
const layers: Layer[] = [];
let restoreIsolation = () => {};
let originalOverflow = "";

function isolateTopLayer() {
  restoreIsolation();
  const saved: { element: HTMLElement; inert: string | null; hidden: string | null }[] = [];
  let branch: HTMLElement | null = layers.at(-1)?.element ?? null;
  while (branch && branch !== document.body) {
    for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
      if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute("data-modal-backdrop")) continue;
      saved.push({ element: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    }
    branch = branch.parentElement;
  }
  restoreIsolation = () => {
    for (const { element, inert, hidden } of saved) {
      if (inert === null) element.removeAttribute("inert"); else element.setAttribute("inert", inert);
      if (hidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", hidden);
    }
  };
}

/**
 * Attach the returned ref to a named role="dialog" aria-modal="true" element
 * with tabIndex={-1}. FullPreview can use useModal({ onClose }) while mounted.
 * Handles nested layers, focus/return focus, Escape, inert background and scroll.
 * Mark a separate clickable scrim data-modal-backdrop (and aria-hidden="true").
 */
export function useModal<T extends HTMLElement = HTMLDivElement>({
  open = true, onClose, initialFocusRef, returnFocusRef,
}: {
  open?: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<T>(null);
  const options = useRef({ onClose, initialFocusRef, returnFocusRef });
  // Survives StrictMode's effect remount, when focus is already inside the dialog.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { options.current = { onClose, initialFocusRef, returnFocusRef }; });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const active = document.activeElement instanceof HTMLElement && !element.contains(document.activeElement) ? document.activeElement : null;
    const previous = options.current.returnFocusRef?.current ?? active ?? returnTo.current;
    returnTo.current = previous;
    const oldMarker = element.getAttribute("data-modal-root");
    element.setAttribute("data-modal-root", "");
    const focus = () => (options.current.initialFocusRef?.current ?? modalTabStops(element)[0] ?? element).focus();
    const layer = { element, focus };
    if (!layers.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    layers.push(layer);
    // Focus before hiding the trigger's branch from assistive technology.
    restoreIsolation();
    focus();
    isolateTopLayer();
    const onFocus = (event: FocusEvent) => {
      if (layers.at(-1) === layer && !element.contains(event.target as Node)) focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (layers.at(-1) !== layer || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        options.current.onClose();
      }
      if (event.key === "Tab") {
        const stops = modalTabStops(element);
        const first = stops[0];
        const last = stops.at(-1);
        if (!first || !element.contains(document.activeElement) || document.activeElement === element ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last ?? element : first ?? element).focus();
        }
      }
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKey);
      const wasTop = layers.at(-1) === layer;
      layers.splice(layers.indexOf(layer), 1);
      isolateTopLayer();
      if (oldMarker === null) element.removeAttribute("data-modal-root"); else element.setAttribute("data-modal-root", oldMarker);
      if (!layers.length) document.body.style.overflow = originalOverflow;
      if (wasTop) {
        // React may still be attaching sibling refs/removing inert during a
        // layout cleanup. Restore after the entire commit has settled.
        queueMicrotask(() => {
          // Remounted in place (StrictMode): the dialog is still open.
          if (layers.some((l) => l.element === element && element.isConnected)) return;
          if (previous?.isConnected && !previous.closest("[inert]")) previous.focus();
          else layers.at(-1)?.focus();
        });
      }
    };
  }, [open]);
  return ref;
}
