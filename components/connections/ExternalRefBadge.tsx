"use client";

import { ExternalLink, Link2 } from "lucide-react";
import type { ExternalRef } from "@/lib/learn/types";
import { useLocale } from "@/lib/i18n";
import { externalRefText } from "./externalRef";

/**
 * Where a lesson (or other asset) came from in a connected app, with a link back when the
 * app gave one. Reads "Created from Max page: GIT Notes · Open in Max" for Max and the same
 * neutral pattern for any other app.
 */
export default function ExternalRefBadge({ externalRef, className = "" }: { externalRef: ExternalRef; className?: string }) {
  const { locale } = useLocale();
  const { text, openLabel, href } = externalRefText(externalRef, locale);
  return (
    <p className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground ${className}`} data-external-app={externalRef.app}>
      <Link2 size={14} aria-hidden="true" />
      <span>{text}</span>
      {href && openLabel && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="ws-link-quiet inline-flex items-center gap-1 underline underline-offset-2">
          {openLabel}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </p>
  );
}
