"use client";

import { useMemo } from "react";
import VersionBrowser, { compareItems, ItemSheet, type SheetItem } from "@/components/versions/VersionBrowser";
import { asBlocks, blockText, excerpt, readingMinutes, walk, type Block } from "@/lib/learn/doc";
import { useLearnCapabilities, useLessonVersions } from "@/lib/learn/data";
import type { Lesson } from "@/lib/learn/types";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Version history", draft: "Your draft", version: (n: number) => `Version ${n}`, live: "live", by: (n: string) => `by ${n}`,
    minutes: (n: string) => `${n} min read`, blocks: { image: "Image", youtube: "Video", video: "Video", quiz: "Quiz", lessonQuiz: "Quiz", flashcards: "Flashcards", lessonFlashcards: "Flashcards", diagram: "Diagram", lessonDiagram: "Diagram", table: "Table", divider: "Divider", equation: "Equation", source: "Source", codeBlock: "Code" } as Record<string, string>,
    restore: "Restore to draft", restoreWarning: "Your current draft will be replaced by this version. Readers won't see it until you publish. The draft isn't kept, so publish it first if you need it.",
    restoreUnavailable: "Restoring needs the Learn service.", onlyOne: "Nothing published yet. Versions appear here each time you publish.",
  },
  ar: {
    title: "سجل الإصدارات", draft: "مسودتك", version: (n: number) => `الإصدار ${n}`, live: "منشور", by: (n: string) => `بواسطة ${n}`,
    minutes: (n: string) => `${n} د قراءة`, blocks: { image: "صورة", youtube: "فيديو", video: "فيديو", quiz: "اختبار", lessonQuiz: "اختبار", flashcards: "بطاقات", lessonFlashcards: "بطاقات", diagram: "مخطط", lessonDiagram: "مخطط", table: "جدول", divider: "فاصل", equation: "معادلة", source: "مصدر", codeBlock: "شيفرة" } as Record<string, string>,
    restore: "استعد إلى المسودة", restoreWarning: "ستُستبدل مسودتك الحالية بهذا الإصدار. لن يراه القرّاء حتى تنشر. لا تُحفظ المسودة، فانشرها أولًا إن احتجتها.",
    restoreUnavailable: "تحتاج الاستعادة إلى خدمة Learn.", onlyOne: "لم يُنشر شيء بعد. تظهر الإصدارات هنا في كل مرة تنشر.",
  },
};

type Browsed = { key: string; name: string; at: number; detail?: string; title: string; blocks: Block[]; version?: number };

/** Every block in reading order (nested blocks too), as the sheet lists them. */
const flatten = (content: unknown) => [...walk(asBlocks(content))].map(({ block }) => block).filter((b) => b.type !== "toggleListItem" || blockText(b));
const signature = (b: Block) => JSON.stringify([b.type, b.props, b.content]);

/** A lesson's version history in the shared version browser: the draft beside every published version. */
export default function VersionHistory({ lesson, onClose, onRestore, disabled = false, error }: { lesson: Lesson; onClose: () => void; onRestore: (version: number) => void | Promise<unknown>; disabled?: boolean; error?: string }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const caps = useLearnCapabilities();
  const loaded = useLessonVersions(lesson.id);
  const draft: Browsed = useMemo(() => ({ key: "draft", name: lesson.draft.meta.title || t.draft, at: lesson.draft.updatedAt, detail: t.minutes(fmt(readingMinutes(lesson.draft.content))), title: lesson.draft.meta.title, blocks: flatten(lesson.draft.content) }), [lesson.draft, t]); // oxlint-disable-line react-hooks/exhaustive-deps -- fmt follows locale, as t does
  const past: Browsed[] = useMemo(() => (loaded ?? []).map((v) => ({
    key: String(v.version), version: v.version, name: `${t.version(v.version)}${lesson.published?.version === v.version ? ` · ${t.live}` : ""}`, at: v.publishedAt,
    detail: [t.by(v.publishedBy), v.note].filter(Boolean).join(" · "), title: v.meta.title, blocks: flatten(v.content),
  })), [loaded, lesson.published?.version, t]);
  const item = (b: Block): Omit<SheetItem, "change"> => {
    const text = blockText(b);
    if (b.type === "heading") return { id: b.id, title: text || "—", level: "heading" };
    return { id: b.id, title: text ? excerpt(text, 220) : t.blocks[b.type] ?? b.type };
  };
  return (
    <>
      <VersionBrowser label={t.title} status={loaded === undefined ? "loading" : "ready"} current={draft} currentLabel={t.draft} past={past} onlyOne={t.onlyOne} onClose={onClose}
        counts={(a, b) => compareItems(a.blocks, b.blocks, (x) => x.id, signature).counts}
        sheet={(v, { against, side }) => {
          const diff = against ? (side === "base" ? compareItems(v.blocks, against.blocks, (x) => x.id, signature) : compareItems(against.blocks, v.blocks, (x) => x.id, signature)) : null;
          return <ItemSheet meta={<strong>{v.title}</strong>} items={v.blocks.slice(0, 150).map((b) => ({ ...item(b), change: diff ? diff.change(b, side) : undefined }))} />;
        }}
        restore={{
          label: t.restore, warning: caps.versionRestore ? t.restoreWarning : t.restoreUnavailable, disabled: disabled || !caps.versionRestore,
          run: (v) => (v.version === undefined ? undefined : onRestore(v.version)),
        }} />
      {error && <p className="lx-error" role="alert" style={{ position: "fixed", insetInline: 0, bottom: 8, zIndex: 81, textAlign: "center" }}>{error}</p>}
    </>
  );
}
