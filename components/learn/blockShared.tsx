"use client";

import { AlertTriangle, BookMarked, FileText, Info, Lightbulb, Link2, Presentation, Star, Stethoscope, Video } from "lucide-react";
import type { LessonSource, SourceKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

/* Block copy, callout tones and source labels shared by the lesson editor and the reader. Kept out of
   editor/blocks.tsx so the public reader doesn't load BlockNote. */

const copy = {
  en: {
    tones: { info: "Note", tip: "Tip", warning: "Caution", clinical: "Clinical", key: "Key point" },
    toneLabel: "Callout style", equation: "Add an equation", equationPlaceholder: "LaTeX, e.g. \\frac{a}{b}", equationError: "This equation has an error.",
    ytPaste: "Paste a YouTube link", ytInvalid: "That isn't a YouTube link.", ytStart: "From", ytEnd: "To", ytCaption: "Why watch this part (optional)", ytTimeHelp: "mm:ss",
    ytRangeError: "End must be after start.", ytWatch: (range: string) => `Watch ${range}`,
    sourcePick: "Choose a source", sourceAdd: "Add or edit sources…", sourceNone: "This lesson has no sources yet.", sourceMissing: "Source removed", locator: "Where (e.g. page 23, slide 4)",
    citationMissing: "Missing source", kinds: { pdf: "PDF", slides: "Slides", link: "Link", video: "Video", book: "Book", article: "Article", reference: "Reference" } as Record<SourceKind, string>,
    open: "Open", altMissing: "No description yet", diagram: "Diagram", credit: "Credit",
  },
  ar: {
    tones: { info: "ملاحظة", tip: "نصيحة", warning: "تنبيه", clinical: "سريري", key: "نقطة أساسية" },
    toneLabel: "نمط التنبيه", equation: "أضف معادلة", equationPlaceholder: "LaTeX، مثل \\frac{a}{b}", equationError: "في هذه المعادلة خطأ.",
    ytPaste: "الصق رابط YouTube", ytInvalid: "هذا ليس رابط YouTube.", ytStart: "من", ytEnd: "إلى", ytCaption: "لماذا تشاهد هذا الجزء (اختياري)", ytTimeHelp: "د:ث",
    ytRangeError: "يجب أن تكون النهاية بعد البداية.", ytWatch: (range: string) => `شاهد ${range}`,
    sourcePick: "اختر مصدرًا", sourceAdd: "أضف المصادر أو عدّلها…", sourceNone: "لا مصادر لهذا الدرس بعد.", sourceMissing: "المصدر محذوف", locator: "الموضع (مثل صفحة 23، شريحة 4)",
    citationMissing: "مصدر مفقود", kinds: { pdf: "PDF", slides: "شرائح", link: "رابط", video: "فيديو", book: "كتاب", article: "مقال", reference: "مرجع" } as Record<SourceKind, string>,
    open: "فتح", altMissing: "لا وصف بعد", diagram: "رسم توضيحي", credit: "المصدر",
  },
};

export const useBlockCopy = () => useCopy(copy);

export const CALLOUT_TONES = ["info", "tip", "warning", "clinical", "key"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
export const calloutIcon: Record<CalloutTone, typeof Info> = { info: Info, tip: Lightbulb, warning: AlertTriangle, clinical: Stethoscope, key: Star };

export const sourceIcon: Record<SourceKind, typeof FileText> = { pdf: FileText, slides: Presentation, link: Link2, video: Video, book: BookMarked, article: FileText, reference: BookMarked };

export function sourceLabel(source: LessonSource | undefined, locator?: string): string {
  const base = source ? source.shortLabel || source.title : "";
  return [base, locator?.trim()].filter(Boolean).join(" · ");
}
