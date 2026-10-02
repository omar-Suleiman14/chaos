"use client";

import { useState } from "react";
import type { LessonMeta } from "@/lib/learn/types";
import { pluralForm, useCopy, useLocale } from "@/lib/i18n";
import { countBlockChanges, diffLessonMeta } from "./lessonChanges";
import type { BlockChange, MetaField } from "./lessonChanges";

export type { BlockChange } from "./lessonChanges";

const copy = {
  en: {
    previewTitle: (app: string) => `Changes from ${app}`,
    conflictTitle: "This lesson changed in both places",
    previewIntro: "Nothing changes until you choose. Your published lesson stays as it is either way.",
    conflictIntro: (app: string) => `You and ${app} both changed this lesson. Your edits are kept here until you choose.`,
    newLesson: "New lesson draft",
    settings: "Lesson details", blocks: "Content",
    fields: { title: "Title", description: "Description", tags: "Tags", language: "Language", curricula: "Curricula", license: "Licence", authorDisplay: "Author shown", coverUrl: "Cover image", indexing: "Search engines" } as Record<MetaField, string>,
    empty: "(empty)", before: "Before", after: "After",
    kinds: { added: "Added", removed: "Removed", changed: "Changed" },
    counts: (added: number, changed: number, removed: number, locale: "en" | "ar") => [
      added && `${added} ${pluralForm(locale, added, { one: "block added", other: "blocks added" })}`,
      changed && `${changed} ${pluralForm(locale, changed, { one: "block changed", other: "blocks changed" })}`,
      removed && `${removed} ${pluralForm(locale, removed, { one: "block removed", other: "blocks removed" })}`,
    ].filter(Boolean).join(" · "),
    noChanges: "No differences.",
    showAll: (n: number) => `Show all ${n} changes`,
    preview: { mine: "Keep my version", theirs: "Accept changes", merge: "Review side by side" },
    conflict: { mine: "Keep mine (overwrite theirs)", theirs: "Load their version", merge: "Merge by hand" },
    fallbackApp: "the connected app",
  },
  ar: {
    previewTitle: (app: string) => `تغييرات من ${app}`,
    conflictTitle: "تغيّر هذا الدرس في المكانين",
    previewIntro: "لا يتغير شيء حتى تختار. يبقى درسك المنشور كما هو في الحالتين.",
    conflictIntro: (app: string) => `غيّرت أنت و${app} هذا الدرس. تبقى تعديلاتك هنا حتى تختار.`,
    newLesson: "مسودة درس جديدة",
    settings: "تفاصيل الدرس", blocks: "المحتوى",
    fields: { title: "العنوان", description: "الوصف", tags: "الوسوم", language: "اللغة", curricula: "المناهج", license: "الترخيص", authorDisplay: "اسم المؤلف الظاهر", coverUrl: "صورة الغلاف", indexing: "محركات البحث" } as Record<MetaField, string>,
    empty: "(فارغ)", before: "قبل", after: "بعد",
    kinds: { added: "أُضيف", removed: "حُذف", changed: "تغيّر" },
    counts: (added: number, changed: number, removed: number, locale: "en" | "ar") => [
      added && `${pluralForm(locale, added, { one: "أُضيفت كتلة واحدة", two: "أُضيفت كتلتان", few: `أُضيفت ${added} كتل`, other: `أُضيفت ${added} كتلة` })}`,
      changed && `${pluralForm(locale, changed, { one: "تغيّرت كتلة واحدة", two: "تغيّرت كتلتان", few: `تغيّرت ${changed} كتل`, other: `تغيّرت ${changed} كتلة` })}`,
      removed && `${pluralForm(locale, removed, { one: "حُذفت كتلة واحدة", two: "حُذفت كتلتان", few: `حُذفت ${removed} كتل`, other: `حُذفت ${removed} كتلة` })}`,
    ].filter(Boolean).join(" · "),
    noChanges: "لا فروق.",
    showAll: (n: number) => `اعرض كل التغييرات (${n})`,
    preview: { mine: "أبقِ نسختي", theirs: "اقبل التغييرات", merge: "راجعها جنبًا إلى جنب" },
    conflict: { mine: "أبقِ نسختي (استبدال نسختهم)", theirs: "حمّل نسختهم", merge: "ادمج يدويًا" },
    fallbackApp: "التطبيق المتصل",
  },
};

export interface ChangePreviewProps {
  /** "preview": a connected app proposes changes. "conflict": both sides changed the lesson. */
  mode?: "preview" | "conflict" | "comparison";
  /** Connection label. Leave empty for a neutral "the connected app". */
  appName?: string;
  /** Current lesson details; null when the app proposes a new lesson. */
  before: LessonMeta | null;
  after: LessonMeta;
  changes: BlockChange[];
  onKeepMine?: () => void;
  onTakeTheirs?: () => void;
  onMerge?: () => void;
  busy?: boolean;
}

const PREVIEW_LIMIT = 8;

/**
 * Before/after view of a lesson update from a connected app. Buttons appear only for the
 * callbacks given, so the same component serves a read-only preview, a review step and a
 * conflict. Mirrors the forms editor's conflict banner ("Load their version" / "Keep mine").
 */
export default function ChangePreview({ mode = "preview", appName, before, after, changes, onKeepMine, onTakeTheirs, onMerge, busy }: ChangePreviewProps) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const app = appName?.trim() || t.fallbackApp;
  const meta = diffLessonMeta(before, after);
  const counts = countBlockChanges(changes);
  const shown = showAll ? changes : changes.slice(0, PREVIEW_LIMIT);
  const labels = mode === "conflict" ? t.conflict : t.preview;
  const comparisonTitle = locale === "ar" ? "مقارنة المسودة الحالية بالنسخة المنشورة" : "Current draft compared with published version";
  const comparisonIntro = locale === "ar" ? "هذه التغييرات موجودة بالفعل في المسودة. المقارنة للقراءة فقط ولا تمثل طلب موافقة. لا تتغير النسخة المنشورة." : "These changes are already applied to the draft. This is a read-only comparison, not a pending approval. The published version is unchanged.";
  const summary = t.counts(counts.added, counts.changed, counts.removed, locale);

  return (
    <section className={`chaos-card bg-card p-4 space-y-4 text-sm ${mode === "conflict" ? "border-destructive" : ""}`} aria-label={mode === "comparison" ? comparisonTitle : mode === "conflict" ? t.conflictTitle : t.previewTitle(app)} role={mode === "conflict" ? "alert" : undefined}>
      <header className="space-y-1">
        <h2 className="font-bold text-base">{mode === "comparison" ? comparisonTitle : mode === "conflict" ? t.conflictTitle : before ? t.previewTitle(app) : t.newLesson}</h2>
        <p className="ws-row__help">{mode === "comparison" ? comparisonIntro : mode === "conflict" ? t.conflictIntro(app) : t.previewIntro}</p>
        {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
      </header>

      {meta.length > 0 && (
        <div>
          <h3 className="ws-section-label mb-1">{t.settings}</h3>
          <dl className="divide-y divide-foreground/10 border-y border-foreground/10">
            {meta.map((m) => (
              <div key={m.field} className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
                <dt className="font-medium">{t.fields[m.field]}</dt>
                <dd className="grid gap-1">
                  {before && <span className="line-through text-muted-foreground break-words"><span className="sr-only">{t.before}: </span>{m.before || t.empty}</span>}
                  <span className="break-words"><span className="sr-only">{t.after}: </span>{m.after || t.empty}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="ws-section-label mb-1">{t.blocks}</h3>
        {changes.length === 0 ? <p className="text-muted-foreground">{t.noChanges}</p> : (
          <ul className="divide-y divide-foreground/10 border-y border-foreground/10">
            {shown.map((c) => (
              <li key={`${c.kind}-${c.blockId}`} className="py-2 grid gap-1" data-change={c.kind}>
                <span className={`ws-pill ${c.kind === "added" ? "ws-pill--green" : c.kind === "removed" ? "ws-pill--purple" : "ws-pill--blue"} w-fit`}>{t.kinds[c.kind]}</span>
                {c.kind !== "added" && c.beforeText !== undefined && (
                  <del className="text-muted-foreground whitespace-pre-wrap break-words"><span className="sr-only">{t.before}: </span>{c.beforeText || t.empty}</del>
                )}
                {c.kind !== "removed" && c.afterText !== undefined && (
                  <ins className="no-underline whitespace-pre-wrap break-words"><span className="sr-only">{t.after}: </span>{c.afterText || t.empty}</ins>
                )}
              </li>
            ))}
          </ul>
        )}
        {!showAll && changes.length > PREVIEW_LIMIT && (
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm mt-2" onClick={() => setShowAll(true)}>{t.showAll(changes.length)}</button>
        )}
      </div>

      {mode !== "comparison" && (onKeepMine || onTakeTheirs || onMerge) && (
        <div className="flex flex-wrap justify-end gap-2">
          {onMerge && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={busy} onClick={onMerge}>{labels.merge}</button>}
          {onKeepMine && <button type="button" className={`ws-btn ws-btn--sm ${mode === "conflict" ? "ws-btn--danger" : ""}`} disabled={busy} onClick={onKeepMine}>{labels.mine}</button>}
          {onTakeTheirs && <button type="button" className={`ws-btn ws-btn--sm ${mode === "preview" ? "ws-btn--primary" : ""}`} disabled={busy} onClick={onTakeTheirs}>{labels.theirs}</button>}
        </div>
      )}
    </section>
  );
}
