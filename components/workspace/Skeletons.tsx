"use client";

import { useEffect } from "react";
import posthog from "@/lib/analytics";

/**
 * Placeholders shaped like the content they stand in for, so the page doesn't jump when data
 * arrives. They announce themselves once to screen readers and are otherwise hidden from them.
 */

/**
 * Skeletons stay invisible for this long (the ws-skeleton-in delay in app/workspace.css), so a load
 * that finishes sooner shows nothing at all. Tune it from the `loading_state` durations below.
 */
export const SKELETON_DELAY_MS = 200;

/** Reports how long each loading state lasted, so the delay follows real load times. */
function useLoadingTiming(surface: string) {
  useEffect(() => {
    const start = performance.now();
    return () => {
      const ms = Math.round(performance.now() - start);
      // A warm reload hides skeletons behind the cached copy (lib/confirmedQuery.ts).
      const warm = document.documentElement.hasAttribute("data-ws-warm");
      posthog.captureLater("loading_state", { surface, ms, warm, shown: !warm && ms >= SKELETON_DELAY_MS });
    };
  }, [surface]);
}

export function LibrarySkeleton({ label, view = "gallery", count = 6 }: { label: string; view?: "gallery" | "list"; count?: number }) {
  useLoadingTiming(`library-${view}`);
  return (
    <output  aria-busy="true">
      <span className="sr-only">{label}</span>
      {view === "gallery" ? (
        <ul className="ws-gallery" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="ws-skeleton-card">
              <span className="ws-skeleton ws-skeleton--thumb" />
              <span className="ws-skeleton-card__body">
                <span className="ws-skeleton ws-skeleton--line" style={{ width: `${60 + ((i * 17) % 30)}%`, height: 16 }} />
                <span className="ws-skeleton ws-skeleton--line" style={{ width: "45%" }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-2" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => <span key={i} className="ws-skeleton" style={{ height: 48 }} />)}
        </div>
      )}
    </output>
  );
}

/** Stand-in for a whole workspace page while its code or data loads (see app/dashboard/loading.tsx). */
export function PageSkeleton({ label }: { label: string }) {
  useLoadingTiming("page");
  return (
    <output  aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-5">
        <span className="ws-skeleton ws-skeleton--title" />
        <span className="ws-skeleton ws-skeleton--line" style={{ width: "30%" }} />
        <span className="ws-skeleton ws-skeleton--panel" />
      </div>
    </output>
  );
}
