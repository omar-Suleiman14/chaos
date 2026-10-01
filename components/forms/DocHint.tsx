"use client";

import { BookOpen } from "lucide-react";
import { useCopy } from "@/lib/i18n";

const copy = { en: { guide: "Read the guide" }, ar: { guide: "اقرأ الدليل" } };

/** One quiet line pointing to a /docs guide. Opens in a new tab so unsaved work stays put. */
export default function DocHint({ slug, children, link, className = "" }: { slug: string; children?: React.ReactNode; link?: string; className?: string }) {
  const t = useCopy(copy);
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {children}{children ? " " : ""}
      <a href={`/docs/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
        <BookOpen size={12} aria-hidden="true" />{link ?? t.guide}
      </a>
    </p>
  );
}
