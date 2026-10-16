"use client";

import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from "@blocknote/react";
import { BookMarked, Layers, ListChecks, Network, PlayCircle, Quote, Sigma, Lightbulb } from "lucide-react";
import type { LessonEditorType } from "./blocks";

/**
 * The lesson "/" menu: BlockNote's own commands (minus the ones a lesson cannot save), then the
 * Chaos blocks, grouped the way a writer scans them and searchable in English and Arabic.
 *
 * Every command here must produce content the durable save path keeps exactly
 * (tests/unit/lessonSlashMenu.test.tsx inserts each one and saves it). Commands that would only
 * fail later at save time are not offered.
 */

/** BlockNote commands whose blocks the lesson document cannot store (see lib/lessonBlockMappings.ts). */
export const UNSAVED_SLASH_KEYS = new Set(["audio", "file", "video"]);

export type SlashGroup = "basic" | "headings" | "lesson" | "media" | "advanced" | "other";
export const SLASH_GROUP_ORDER: SlashGroup[] = ["basic", "headings", "lesson", "media", "advanced", "other"];

const groupLabels: Record<"en" | "ar", Record<SlashGroup, string>> = {
  en: { basic: "Basic blocks", headings: "Headings", lesson: "Lesson blocks", media: "Media", advanced: "Advanced", other: "Other" },
  ar: { basic: "الكتل الأساسية", headings: "العناوين", lesson: "كتل الدرس", media: "الوسائط", advanced: "متقدم", other: "أخرى" },
};

/** Where BlockNote's own commands belong, by item key. */
const defaultGroups: Record<string, SlashGroup> = {
  paragraph: "basic", bullet_list: "basic", numbered_list: "basic", check_list: "basic", toggle_list: "basic", quote: "basic", divider: "basic",
  heading: "headings", heading_2: "headings", heading_3: "headings",
  image: "media",
  table: "advanced", code_block: "advanced",
  emoji: "other",
};

/** Extra search words for BlockNote's commands, in both languages, so either keyboard finds them. */
const defaultAliases: Record<string, string[]> = {
  paragraph: ["text", "plain", "نص", "فقرة"],
  heading: ["h1", "title", "عنوان"], heading_2: ["h2", "subtitle", "عنوان"], heading_3: ["h3", "عنوان"],
  bullet_list: ["ul", "bullets", "قائمة", "نقاط"], numbered_list: ["ol", "numbers", "قائمة", "مرقمة"],
  check_list: ["todo", "to-do", "task", "checkbox", "مهام", "مهمة"], toggle_list: ["collapse", "details", "طي", "قابل للطي"],
  quote: ["blockquote", "اقتباس"], divider: ["hr", "line", "separator", "فاصل", "خط"],
  code_block: ["code", "snippet", "كود", "شيفرة"], table: ["grid", "جدول"], image: ["picture", "photo", "img", "صورة"],
  emoji: ["emoji", "رمز تعبيري", "إيموجي"],
};

interface LessonCommandCopy { title: string; subtext: string; aliases: string[] }
const lessonCommands: Record<"en" | "ar", Record<"callout" | "equation" | "youtube" | "diagram" | "source" | "citation" | "quiz" | "flashcards", LessonCommandCopy>> = {
  en: {
    callout: { title: "Callout", subtext: "Highlight a note, tip or caution", aliases: ["note", "tip", "warning", "info", "ملاحظة", "تنبيه"] },
    equation: { title: "Equation", subtext: "Math with LaTeX", aliases: ["math", "latex", "formula", "tex", "معادلة", "رياضيات"] },
    youtube: { title: "YouTube", subtext: "Embed a video, or just the useful part", aliases: ["video", "yt", "embed", "فيديو", "يوتيوب"] },
    diagram: { title: "Diagram", subtext: "Draw relationships with Mermaid", aliases: ["mermaid", "flowchart", "chart", "graph", "مخطط", "رسم"] },
    source: { title: "Source", subtext: "Show the material this is based on", aliases: ["reference", "pdf", "slides", "book", "مرجع", "مصدر"] },
    citation: { title: "Citation", subtext: "Point this sentence to a source (Lecture 8 · page 23)", aliases: ["cite", "ref", "page", "footnote", "استشهاد", "اقتباس مرجعي"] },
    quiz: { title: "Quiz / checkpoint", subtext: "Create or attach a quiz", aliases: ["quiz", "checkpoint", "practice", "assessment", "test", "اختبار", "تقييم"] },
    flashcards: { title: "Flashcards", subtext: "Create or attach flashcards", aliases: ["cards", "study", "memorize", "بطاقات", "مراجعة"] },
  },
  ar: {
    callout: { title: "تنبيه", subtext: "أبرز ملاحظة أو نصيحة أو تحذيرًا", aliases: ["callout", "note", "tip", "warning", "ملاحظة", "نصيحة"] },
    equation: { title: "معادلة", subtext: "رياضيات بصيغة LaTeX", aliases: ["equation", "math", "latex", "formula", "رياضيات"] },
    youtube: { title: "YouTube", subtext: "ضمّن فيديو أو الجزء المفيد منه فقط", aliases: ["youtube", "video", "yt", "فيديو", "يوتيوب"] },
    diagram: { title: "مخطط", subtext: "ارسم العلاقات بصيغة Mermaid", aliases: ["diagram", "mermaid", "flowchart", "رسم"] },
    source: { title: "مصدر", subtext: "اعرض المادة التي بُني عليها هذا الجزء", aliases: ["source", "reference", "pdf", "slides", "مرجع"] },
    citation: { title: "استشهاد", subtext: "اربط هذه الجملة بمصدر (المحاضرة 8 · صفحة 23)", aliases: ["citation", "cite", "ref", "page", "مرجع"] },
    quiz: { title: "اختبار", subtext: "أنشئ اختبارًا أو أرفق اختبارًا موجودًا", aliases: ["quiz", "checkpoint", "practice", "assessment", "تقييم", "تمرين"] },
    flashcards: { title: "البطاقات", subtext: "أنشئ بطاقات أو أرفق مجموعة موجودة", aliases: ["flashcards", "cards", "study", "بطاقات", "مراجعة"] },
  },
};

export interface LessonSlashItem extends DefaultReactSuggestionItem { key: string; slashGroup: SlashGroup }

/** All commands for this editor, in display order. `onCitation` opens the citation dialog for a block. */
export function lessonSlashItems(editor: LessonEditorType, locale: "en" | "ar", onCitation: (blockId: string) => void): LessonSlashItem[] {
  const labels = groupLabels[locale];
  const base = (getDefaultReactSlashMenuItems(editor) as (DefaultReactSuggestionItem & { key: string })[])
    .filter((item) => !UNSAVED_SLASH_KEYS.has(item.key))
    .map((item): LessonSlashItem => {
      const slashGroup = defaultGroups[item.key] ?? "other";
      return { ...item, slashGroup, group: labels[slashGroup], aliases: [...(item.aliases ?? []), ...(defaultAliases[item.key] ?? [])] };
    });
  const c = lessonCommands[locale];
  const lesson = (key: keyof typeof c, icon: React.JSX.Element, onItemClick: () => void): LessonSlashItem => ({
    key, slashGroup: "lesson", group: labels.lesson, icon, onItemClick, title: c[key].title, subtext: c[key].subtext,
    // The other language's title too: an Arabic interface writing an English lesson still finds "Quiz".
    aliases: [...c[key].aliases, lessonCommands[locale === "ar" ? "en" : "ar"][key].title],
  });
  const insert = (type: string) => () => { insertOrUpdateBlockForSlashMenu(editor, { type } as never); };
  const educational: LessonSlashItem[] = [
    lesson("callout", <Lightbulb size={18} />, insert("callout")),
    lesson("quiz", <ListChecks size={18} />, insert("lessonQuiz")),
    lesson("flashcards", <Layers size={18} />, insert("lessonFlashcards")),
    lesson("equation", <Sigma size={18} />, insert("equation")),
    lesson("diagram", <Network size={18} />, insert("lessonDiagram")),
    lesson("source", <BookMarked size={18} />, insert("source")),
    lesson("citation", <Quote size={18} />, () => onCitation(editor.getTextCursorPosition().block.id)),
  ];
  const media: LessonSlashItem[] = [lesson("youtube", <PlayCircle size={18} />, insert("youtube"))];
  const all = [...base, ...educational, ...media.map((item) => ({ ...item, slashGroup: "media" as const, group: labels.media }))];
  return SLASH_GROUP_ORDER.flatMap((group) => all.filter((item) => item.slashGroup === group));
}

/**
 * Folds the differences people do not type: case, Latin accents, Arabic diacritics and tatweel,
 * and the alef/yaa/taa-marbuta/hamza spellings that keyboards and habits mix.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .trim();
}

/** Lower is better; undefined means no match. Prefix matches beat word starts beat substrings. */
function score(item: { title: string; aliases?: readonly string[] }, query: string): number | undefined {
  const title = normalizeSearch(item.title);
  if (title.startsWith(query)) return 0;
  if (title.split(/[\s/·-]+/).some((word) => word.startsWith(query))) return 1;
  const aliases = (item.aliases ?? []).map(normalizeSearch);
  if (aliases.some((alias) => alias.startsWith(query))) return 2;
  if (title.includes(query)) return 3;
  if (aliases.some((alias) => alias.includes(query))) return 4;
  return undefined;
}

/**
 * Filters and ranks commands. Groups stay together (each heading appears once), ordered by their best
 * match, so typing "h" puts Headings first without scattering the menu.
 */
export function searchSlashItems<T extends { title: string; aliases?: readonly string[]; group?: string }>(items: T[], rawQuery: string): T[] {
  const query = normalizeSearch(rawQuery);
  if (!query) return items;
  const scored = items.map((item, index) => ({ item, index, score: score(item, query) })).filter((s): s is { item: T; index: number; score: number } => s.score !== undefined);
  const best = new Map<string | undefined, number>();
  for (const s of scored) best.set(s.item.group, Math.min(best.get(s.item.group) ?? Infinity, s.score));
  const groupOrder = [...best.keys()];
  return scored
    .sort((a, b) => (best.get(a.item.group)! - best.get(b.item.group)!) || (groupOrder.indexOf(a.item.group) - groupOrder.indexOf(b.item.group)) || (a.score - b.score) || (a.index - b.index))
    .map((s) => s.item);
}
