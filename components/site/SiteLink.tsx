"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/locale";
import { hostHref } from "@/lib/hosts";
import { warmHref } from "@/lib/convexCache";

/**
 * next/link for public pages:
 * - marketing pages point at the reader's language ("/pricing" becomes "/ar/pricing" in Arabic);
 *   and every path at its own host (lib/hosts.ts);
 * - prefetch waits for intent (hover, focus or touch). Public pages carry long link lists (footer,
 *   docs, site map, course grids), and prefetching each one on sight cost dozens of requests per
 *   visit, including server renders of course pages nobody opened. Pass `prefetch` to override.
 */
export default function SiteLink({ href, prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const { locale } = useLocale();
  const [intent, setIntent] = useState(false);
  // Intent also starts the next page's Convex data (lessons, courses), not only its code.
  const warm = () => { setIntent(true); if (typeof href === "string") warmHref(href); };
  return (
    <Link
      {...props}
      href={typeof href === "string" ? hostHref(localePath(href, locale)) : href}
      prefetch={prefetch ?? (intent ? null : false)}
      onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) warm(); }}
      onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) warm(); }}
      onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) warm(); }}
    />
  );
}
