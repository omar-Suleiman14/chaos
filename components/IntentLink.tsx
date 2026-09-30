"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string };

/** Restore Next's route prefetch after hover, focus or touch intent. */
export function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }: Props) {
  const [intentHref, setIntentHref] = useState<string | null>(null);
  const eligible = href.startsWith("/") && !href.startsWith("//")
    && (!props.target || props.target === "_self") && !props.download
    && props["aria-current"] !== "page";
  const warm = () => { if (eligible) setIntentHref(href); };

  return <Link {...props} href={href} prefetch={eligible && intentHref === href ? null : false}
    onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) warm(); }}
    onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) warm(); }}
    onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) warm(); }}
  />;
}
