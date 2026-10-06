"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/locale";
import { hostHref } from "@/lib/hosts";
import { warmHref } from "@/lib/convexCache";

/** `eager` prefetches the whole page as soon as the link is on screen, for the few places people go most (the workspace sidebar). */
type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string; eager?: boolean };

/** Restore Next's route prefetch after hover, focus or touch intent. */
export function IntentLink({ href: rawHref, eager, onMouseEnter, onFocus, onTouchStart, ...props }: Props) {
  // Marketing pages have an address per language (lib/locale.ts).
  const local = localePath(rawHref, useLocale().locale);
  // Each section lives on its own host (lib/hosts.ts); next/link still prefetches when that host is this one.
  const href = hostHref(local);
  const [intentHref, setIntentHref] = useState<string | null>(null);
  const eligible = local.startsWith("/") && !local.startsWith("//")
    && (!props.target || props.target === "_self") && !props.download
    && props["aria-current"] !== "page";
  const warm = () => { if (eligible) { setIntentHref(href); warmHref(local); } };

  return <Link {...props} href={href} prefetch={eligible ? (eager || intentHref === href ? true : null) : false}
    onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) warm(); }}
    onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) warm(); }}
    onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) warm(); }}
  />;
}
