"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Inside an iframe, only the page the frame first loaded may show. The server
 * decides framing per document (frame-ancestors, see lib/embed.ts), but a
 * client-side navigation swaps pages without a new document, so it would skip
 * that check. When the path changes while framed, hide the page and reload:
 * the reload is a real request, and the browser blocks it unless the new page
 * may be framed by this site too. /dashboard, /admin and the rest never may.
 */
export default function FrameGuard() {
  const pathname = usePathname();
  const first = useRef<string | null>(null);
  useLayoutEffect(() => {
    let framed = true;
    try {
      framed = window.self !== window.top;
    } catch {
      framed = true;
    }
    if (!framed) return;
    if (first.current === null) {
      first.current = pathname;
      return;
    }
    if (pathname !== first.current) {
      document.documentElement.style.visibility = "hidden";
      window.location.reload();
    }
  }, [pathname]);
  return null;
}
