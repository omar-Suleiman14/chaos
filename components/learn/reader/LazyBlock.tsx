"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts a heavy lesson block (inline quiz, flashcards, diagram) only once it comes within a
 * screen or so of the viewport, and keeps it mounted after that. A long lesson used to open a
 * Convex subscription and run Mermaid for every block at once, before the reader saw any of them.
 */
const MARGIN = "900px 0px";

export function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    // No observer (old browsers, jsdom): mount straight away, as before.
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/** Reserves the block's space in the page's own shape; no "Loading…" text, which jumped around as blocks arrived. */
export function BlockPlaceholder({ label, height }: { label: string; height: number }) {
  return <div role="status" aria-busy="true" className="lx-block-wait" style={{ minHeight: height }}><span className="sr-only">{label}</span></div>;
}

export default function LazyBlock({ children, label, height }: { children: ReactNode; label: string; height: number }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  if (near) return <>{children}</>;
  return <div ref={ref}><BlockPlaceholder label={label} height={height} /></div>;
}
