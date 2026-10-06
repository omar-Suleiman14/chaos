import type { ReactNode } from "react";

/**
 * Wraps content that may come from the device cache (lib/confirmedQuery.ts).
 * Unconfirmed content is faded and busy, and its destructive controls are
 * disabled; it returns to full opacity once Convex confirms it.
 */
export function CacheState({ confirmed, children, className = "" }: { confirmed: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`cache-state ${className}`} data-cache-state={confirmed ? "live" : "cached"} aria-busy={!confirmed || undefined}>
      {children}
    </div>
  );
}
