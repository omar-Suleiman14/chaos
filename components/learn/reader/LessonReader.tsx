"use client";

import { isCoverUrl } from "@/lib/learn/covers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, ExternalLink, Flag, GitFork, MessageCircleQuestion, Image as ImageIcon, Link2, MessageSquare, MessageSquarePlus,
  MoreHorizontal, NotebookPen, PenLine, RotateCcw, Share2, ThumbsDown, ThumbsUp, Type, X,
} from "lucide-react";
import { WsConfirm, WsMenu, WsTabs, WsUndoToast, type UndoToast } from "@/components/workspace/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsPhone } from "@/components/workspace/useIsPhone";
import { useModal } from "@/components/workspace/useModal";
import {
  isListed, readerView, useHighlights, useLearnActions, useLearnCapabilities, useLearnViewer, useNotes, usePerson, useProgress, useSaved, useThreads, useVote, nextToastId } from "@/lib/learn/data";
import { blockText, excerpt, findBlock, outline, readingMinutes, walk, asBlocks, type Block } from "@/lib/learn/doc";
import { resolveLearnFileUrl as resolveFileUrl } from "@/lib/learn/data";
import { lessonPath } from "@/lib/learn/seo";
import type { HandoffAction, HandoffTarget } from "@/lib/learn/handoff";
import type { AttachedQuiz, Lesson, LessonSource } from "@/lib/learn/types";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import { sourceIcon, sourceLabel, useBlockCopy } from "../editor/blocks";
import { CurriculumBadges, ExternalRefLine, ModerationNotice, ProvenanceLine, QualityBadge, VerificationBadges } from "../ui";
import BlockRenderer from "./BlockRenderer";
import DiscussionPanel from "./DiscussionPanel";
import HandoffDialog, { type HandoffContext } from "./HandoffDialog";
import Lightbox from "./Lightbox";
import { jumpTo, MobileOutline, Outline, useActiveHeading } from "./Outline";
import PracticeTab from "./PracticeTab";
import ReportDialog from "./ReportDialog";
import SelectionToolbar, { useTextSelection, type SelectionAction } from "./SelectionToolbar";

const copy = {
  en: {
    back: "Back", untitled: "Untitled lesson", by: "By", minutes: (n: number) => `${n} min read`, version: (n: number) => `Version ${n}`, updated: (d: string) => `Published ${d}`,
    ask: "Ask", discussion: "Discussion", save: "Save", saved: "Saved", more: "More", fork: "Copy to my library", forkHelp: "Make an editable copy. The original author stays credited.",
    report: "Report", copyLink: "Copy link", linkCopied: "Link copied", askChatgpt: "Ask ChatGPT", askClaude: "Ask Claude", edit: "Edit lesson",
    reading: "Reading settings", size: "Text size", sizes: { small: "Small", normal: "Normal", large: "Large" }, width: "Line width", widths: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
    font: "Typeface", fonts: { sans: "Sans", serif: "Serif" }, appearance: "Appearance",
    tabs: { lesson: "Lesson", practice: "Practice" }, sources: "Sources", openSource: "Open", noSourceLink: "No link or file for this source.",
    helpful: "Was this lesson helpful?", yes: "Helpful", no: "Not helpful", thanks: "Thanks for the feedback.",
    complete: "Mark as completed", completed: "Completed", reset: "Start over", resume: (s: string) => `Continue where you left off: “${s}”`, resumeTop: "Continue where you left off",
    blockMenu: "Actions for this part", saveBlock: "Save this part", note: "Add private note", discuss: "Discuss this part", copyPart: "Copy link to this part",
    explainImage: "Explain image", askImage: "Ask about this", savedToast: "Saved to your Learn library", noteSaved: "Note saved (only you can see it)",
    highlightSaved: "Highlighted (only you can see it)", removeHighlight: "Remove highlight", highlightRemoved: "Highlight removed",
    noteTitle: "Private note", notePh: "Only you can see this note.", noteSave: "Save note", noteCancel: "Cancel", noteDelete: "Delete note",
    signIn: "Sign in to save, highlight and take notes.", signInAction: "Sign in",
    aiOff: "opens outside Chaos", forked: "Copied to your library", devicePublish: "Publishing is on this device only until the Learn service is connected.",
    draftPreview: "Preview of your unpublished draft. Readers see the published version.",
    marks: (n: number, kind: "note" | "thread") => kind === "note" ? `${n} private ${n === 1 ? "note" : "notes"}` : `${n} ${n === 1 ? "discussion" : "discussions"}`,
    forkQuizTitle: "Copy this quiz to your library?", forkQuizBody: (author: string) => `You get an editable draft in your Chaos library that credits ${author} and links back to the original. It opens in the quiz builder.`,
    unavailable: "This lesson is unavailable", unavailableBody: "It may have been removed, made private or never published.",
  },
  ar: {
    back: "رجوع", untitled: "درس بلا عنوان", by: "بقلم", minutes: (n: number) => `${n} د قراءة`, version: (n: number) => `الإصدار ${n}`, updated: (d: string) => `نُشر ${d}`,
    ask: "اسأل", discussion: "النقاش", save: "احفظ", saved: "محفوظ", more: "المزيد", fork: "انسخ إلى مكتبتي", forkHelp: "أنشئ نسخة قابلة للتعديل. يبقى الكاتب الأصلي منسوبًا.",
    report: "إبلاغ", copyLink: "انسخ الرابط", linkCopied: "نُسخ الرابط", askChatgpt: "اسأل ChatGPT", askClaude: "اسأل Claude", edit: "عدّل الدرس",
    reading: "إعدادات القراءة", size: "حجم النص", sizes: { small: "صغير", normal: "عادي", large: "كبير" }, width: "عرض السطر", widths: { narrow: "ضيق", normal: "عادي", wide: "عريض" },
    font: "الخط", fonts: { sans: "بلا زوائد", serif: "بزوائد" }, appearance: "المظهر",
    tabs: { lesson: "الدرس", practice: "التدريب" }, sources: "المصادر", openSource: "افتح", noSourceLink: "لا رابط أو ملف لهذا المصدر.",
    helpful: "هل كان هذا الدرس مفيدًا؟", yes: "مفيد", no: "غير مفيد", thanks: "شكرًا على رأيك.",
    complete: "علّم كمكتمل", completed: "مكتمل", reset: "ابدأ من جديد", resume: (s: string) => `تابع من حيث توقفت: «${s}»`, resumeTop: "تابع من حيث توقفت",
    blockMenu: "إجراءات لهذا الجزء", saveBlock: "احفظ هذا الجزء", note: "أضف ملاحظة خاصة", discuss: "ناقش هذا الجزء", copyPart: "انسخ رابط هذا الجزء",
    explainImage: "اشرح الصورة", askImage: "اسأل عن هذا", savedToast: "حُفظ في مكتبة Learn", noteSaved: "حُفظت الملاحظة (لا يراها غيرك)",
    highlightSaved: "ظُلّل النص (لا يراه غيرك)", removeHighlight: "أزل التظليل", highlightRemoved: "أُزيل التظليل",
    noteTitle: "ملاحظة خاصة", notePh: "لا يرى هذه الملاحظة غيرك.", noteSave: "احفظ الملاحظة", noteCancel: "إلغاء", noteDelete: "احذف الملاحظة",
    signIn: "سجّل الدخول للحفظ والتظليل وكتابة الملاحظات.", signInAction: "تسجيل الدخول",
    aiOff: "يُفتح خارج Chaos", forked: "نُسخ إلى مكتبتك", devicePublish: "النشر على هذا الجهاز فقط إلى أن تُربط خدمة Learn.",
    draftPreview: "معاينة لمسودتك غير المنشورة. يرى القرّاء النسخة المنشورة.",
    marks: (n: number, kind: "note" | "thread") => kind === "note" ? `${n} ملاحظة خاصة` : `${n} نقاش`,
    forkQuizTitle: "نسخ هذا الاختبار إلى مكتبتك؟", forkQuizBody: (author: string) => `ستحصل على مسودة قابلة للتعديل في مكتبة Chaos تنسب الاختبار إلى ${author} وترتبط بالأصل. تُفتح في محرر الاختبارات.`,
    unavailable: "هذا الدرس غير متاح", unavailableBody: "ربما حُذف أو صار خاصًا أو لم يُنشر قط.",
  },
};

type ReaderPrefs = { size: "small" | "normal" | "large"; width: "narrow" | "normal" | "wide"; font: "sans" | "serif" };
const PREFS_KEY = "chaos.learn.reader";
const DEFAULT_PREFS: ReaderPrefs = { size: "normal", width: "normal", font: "sans" };
let prefsCache: { raw: string | null; value: ReaderPrefs } = { raw: null, value: DEFAULT_PREFS };
function readPrefs(): ReaderPrefs {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch { /* unavailable */ }
  if (raw === prefsCache.raw) return prefsCache.value;
  let value = DEFAULT_PREFS;
  try { value = { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) }; } catch { /* ignore */ }
  prefsCache = { raw, value };
  return value;
}
const subscribePrefs = (cb: () => void) => { window.addEventListener("chaos-reader-prefs", cb); return () => window.removeEventListener("chaos-reader-prefs", cb); };
function useReaderPrefs(): [ReaderPrefs, (patch: Partial<ReaderPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_PREFS);
  return [prefs, (patch) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch { /* unavailable */ } window.dispatchEvent(new Event("chaos-reader-prefs")); }];
}

export interface LessonReaderProps {
  lesson: Lesson;
  /** Owner previewing the draft instead of the published version. */
  previewDraft?: boolean;
  backHref?: string;
  /** Shown inside the workspace shell (no own top bar chrome duplication). */
  embedded?: boolean;
}

export default function LessonReader({ lesson, previewDraft, backHref = "/dashboard/learn", embedded }: LessonReaderProps) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const { locale } = useLocale();
  const router = useRouter();
  const caps = useLearnCapabilities();
  const viewer = useLearnViewer();
  const actions = useLearnActions();
  const phone = useIsPhone();
  const isOwner = viewer?.id === lesson.ownerId;
  const signedIn = !!viewer?.signedIn;
  const view = previewDraft ? { version: lesson.published?.version ?? 0, meta: lesson.draft.meta, content: lesson.draft.content, publishedAt: lesson.draft.updatedAt } : readerView(lesson);
  const meta = view.meta;
  const items = useMemo(() => outline(view.content), [view.content]);
  const active = useActiveHeading(items);
  const author = usePerson(lesson.ownerId);
  const highlights = useHighlights(lesson.id) ?? [];
  const notes = useNotes(lesson.id) ?? [];
  const threads = useThreads(lesson.id) ?? [];
  const saved = useSaved() ?? [];
  const vote = useVote(lesson.id);
  const progress = useProgress()?.[lesson.id];
  const [prefs, setPrefs] = useReaderPrefs();
  const [panel, setPanel] = useState<"discussion" | null>(null);
  const [tab, setTab] = useState<"lesson" | "practice">("lesson");
  const [handoff, setHandoff] = useState<HandoffContext | null>(null);
  const [reporting, setReporting] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string; caption?: string } | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [editingNote, setEditingNote] = useState<{ id?: string; blockId: string; body: string } | null>(null);
  const [discussAnchor, setDiscussAnchor] = useState<{ blockId: string; excerpt: string }>();
  const [scrolled, setScrolled] = useState(0);
  const [openSource, setOpenSource] = useState<{ source: LessonSource; locator: string } | null>(null);
  const article = useRef<HTMLElement>(null);
  const [selection, clearSelection] = useTextSelection(article);
  const say = (text: string, undo?: () => void) => setToast({ id: nextToastId(), text, undo });

  // Only visible published-block engagement is eligible for a server view.
  useEffect(() => {
    if (previewDraft || !signedIn) return;
    const blockId = active ?? asBlocks(view.content)[0]?.id;
    if (!blockId) return;
    let seconds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !article.current) return;
      const rect = article.current.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      if (++seconds < 15) return;
      window.clearInterval(timer);
      void actions.recordView(lesson.id, { blockId, engagedSeconds: seconds }).catch(err => say(errorMessage(err)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lesson.id, active, previewDraft, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- timer belongs to the engagement target

  // Reading progress: percent scrolled and the heading being read, saved as the reader goes.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (previewDraft) return;
    const onScroll = () => {
      const el = article.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((window.innerHeight * 0.6 - r.top) / Math.max(1, r.height)) * 100));
      setScrolled(pct);
      if (Date.now() - lastSaved.current > 4000 && pct > 3) {
        lastSaved.current = Date.now();
        if (signedIn) void actions.setProgress(lesson.id, { percent: pct, lastBlockId: active }).catch(err => say(errorMessage(err)));
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lesson.id, active, previewDraft, actions, signedIn]);

  const resumeHeading = progress?.state === "in_progress" && progress.lastBlockId ? items.find((i) => i.id === progress.lastBlockId) : undefined;
  const lessonSaved = saved.find((s) => s.kind === "lesson" && s.lessonId === lesson.id);
  const publicUrl = typeof window !== "undefined" && isListed(lesson) ? `${window.location.origin}${lessonPath(lesson.id)}` : undefined;
  const blockIds = useMemo(() => new Set([...walk(asBlocks(view.content))].map(({ block }) => block.id)), [view.content]);

  const sectionOf = useCallback((blockId: string) => {
    let current: string | undefined;
    for (const { block } of walk(asBlocks(view.content))) {
      if (block.type === "heading") current = blockText(block);
      if (block.id === blockId) return current;
    }
    return current;
  }, [view.content]);
  const contextOf = useCallback((blockId: string) => {
    const flat = [...walk(asBlocks(view.content))].map(({ block }) => block);
    const i = flat.findIndex((b) => b.id === blockId);
    return flat.slice(Math.max(0, i - 1), i + 2).map(blockText).filter(Boolean).join("\n\n");
  }, [view.content]);
  const citationsIn = useCallback((blockId: string) => {
    const block = findBlock(view.content, blockId);
    const refs = Array.isArray(block?.content) ? block.content.filter((c) => c.type === "citation").map((c) => c as { props: { sourceId: string; locator: string } }) : [];
    return refs.map((r) => sourceLabel(lesson.sources.find((s) => s.id === r.props.sourceId), r.props.locator)).filter(Boolean);
  }, [view.content, lesson.sources]);

  const openHandoff = (target: HandoffTarget | undefined, text: string, blockId: string, action: HandoffAction = "explain", imageAlt?: string) => {
    setHandoff({ lessonTitle: meta.title || t.untitled, selection: text, section: sectionOf(blockId), context: contextOf(blockId), sources: citationsIn(blockId), publicUrl, target, action, imageAlt });
  };

  const guard = async (fn: () => unknown | Promise<unknown>) => { if (!signedIn) { say(t.signIn); return; } try { await fn(); } catch (err) { say(errorMessage(err)); } };

  const onSelectionAction = (action: SelectionAction) => {
    if (!selection) return;
    const { text, blockId, offset } = selection;
    if (action.startsWith("highlight:")) {
      guard(async () => { await actions.addHighlight({ lessonId: lesson.id, blockId, quote: text, offset, color: action.slice(10) as "yellow" }); say(t.highlightSaved); });
    } else if (action === "save") guard(async () => { await actions.saveBlock(lesson, blockId, text); say(t.savedToast); });
    else if (action === "note") guard(() => setEditingNote({ blockId, body: `“${excerpt(text, 120)}” ` }));
    else if (action === "discuss") { setDiscussAnchor({ blockId, excerpt: excerpt(text, 140) }); setPanel("discussion"); }
    else if (action === "chatgpt" || action === "claude") openHandoff(action, text, blockId, "ask");
    else openHandoff(undefined, text, blockId, action as HandoffAction);
    clearSelection();
  };

  const copyLink = async (hash?: string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${lessonPath(lesson.id)}${hash ? `#${hash}` : ""}`); say(t.linkCopied); } catch { /* clipboard unavailable */ }
  };

  const openSourceTarget = async (source: LessonSource, locator: string) => {
    const raw = source.fileId ?? source.url;
    if (!raw) return;
    let url = await resolveFileUrl(raw);
    const page = locator.match(/(?:page|p\.?|ص|صفحة)\s*(\d+)/i)?.[1];
    if (page && (source.kind === "pdf" || source.kind === "slides")) url += `#page=${page}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const blockAside = (block: Block) => {
    const noteCount = notes.filter((n) => n.blockId === block.id).length;
    const threadCount = threads.filter((th) => th.blockId === block.id && !th.resolved).length;
    const isImage = block.type === "image";
    return (
      <>
        <WsMenu label={t.blockMenu} trigger={<MoreHorizontal size={16} />}>
          {(close) => (
            <>
              {isImage && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); openHandoff(undefined, "", block.id, "explain", String(block.props.alt || block.props.caption || "")); }}><ImageIcon size={15} />{t.explainImage}</button>}
              {isImage && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); openHandoff(undefined, "", block.id, "ask", String(block.props.alt || block.props.caption || "")); }}><MessageSquare size={15} />{t.askImage}</button>}
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); guard(() => { actions.saveBlock(lesson, block.id, blockText(block), isImage ? String(block.props.url ?? "") : undefined); say(t.savedToast); }); }}><Bookmark size={15} />{t.saveBlock}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); guard(() => setEditingNote({ blockId: block.id, body: "" })); }}><NotebookPen size={15} />{t.note}</button>
              {caps.discussions && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDiscussAnchor({ blockId: block.id, excerpt: excerpt(blockText(block) || String(block.props.alt ?? ""), 140) }); setPanel("discussion"); }}><MessageSquarePlus size={15} />{t.discuss}</button>}
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void copyLink(block.id); }}><Link2 size={15} />{t.copyPart}</button>
            </>
          )}
        </WsMenu>
        {(noteCount > 0 || threadCount > 0) && (
          <span className="lx-block__marks">
            {threadCount > 0 && <button type="button" className="lx-block__mark" data-kind="thread" aria-label={t.marks(threadCount, "thread")} title={t.marks(threadCount, "thread")} onClick={() => setPanel("discussion")}><MessageSquare size={13} /></button>}
          </span>
        )}
      </>
    );
  };

  const blockAfter = (block: Block) => {
    const blockNotes = notes.filter((n) => n.blockId === block.id);
    const editing = editingNote?.blockId === block.id;
    if (!blockNotes.length && !editing) return null;
    return (
      <div contentEditable={false}>
        {blockNotes.map((n) => editingNote?.id === n.id ? null : (
          <div key={n.id} className="lx-note-inline">
            <header><span><NotebookPen size={12} aria-hidden /> {t.noteTitle}</span>
              <span className="lx-actions" style={{ gap: 2 }}>
                <button type="button" className="ws-icon-button" aria-label={t.edit} onClick={() => setEditingNote({ id: n.id, blockId: n.blockId, body: n.body })}><PenLine size={13} /></button>
                <button type="button" className="ws-icon-button" aria-label={t.noteDelete} onClick={() => guard(async () => { const copyOf = n; await actions.deleteNote(n.id); say(t.noteDelete, () => { void guard(() => actions.upsertNote({ lessonId: copyOf.lessonId, blockId: copyOf.blockId, body: copyOf.body })); }); })}><X size={13} /></button>
              </span>
            </header>
            <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
          </div>
        ))}
        {editing && (
          <form className="lx-note-inline" onSubmit={(e) => { e.preventDefault(); if (editingNote.body.trim()) void guard(async () => { await actions.upsertNote({ id: editingNote.id, lessonId: lesson.id, blockId: block.id, body: editingNote.body }); say(t.noteSaved); setEditingNote(null); }); }}>
            <header><span><NotebookPen size={12} aria-hidden /> {t.noteTitle}</span></header>
            { }
            <textarea autoFocus className="lx-textarea" rows={3} value={editingNote.body} placeholder={t.notePh} aria-label={t.noteTitle} maxLength={4000} onChange={(e) => setEditingNote({ ...editingNote, body: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") setEditingNote(null); }} />
            <div className="lx-actions" style={{ justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setEditingNote(null)}>{t.noteCancel}</button>
              <button type="submit" className="ws-btn ws-btn--sm ws-btn--primary">{t.noteSave}</button>
            </div>
          </form>
        )}
      </div>
    );
  };

  const [forkingQuiz, setForkingQuiz] = useState<AttachedQuiz | null>(null);

  const sidePanel = panel === "discussion" ? (
    <DiscussionPanel lesson={lesson} draftAnchor={discussAnchor} onClearAnchor={() => setDiscussAnchor(undefined)} onClose={() => setPanel(null)} blockExists={(id) => blockIds.has(id)} />
  ) : null;

  const readingMenu = (
    <WsMenu label={t.reading} trigger={<Type size={17} />}>
      {() => (
        <div style={{ display: "grid", gap: 10, padding: 8, minWidth: 220 }}>
          {([["size", t.size, t.sizes], ["width", t.width, t.widths], ["font", t.font, t.fonts]] as const).map(([key, label, options]) => (
            <div key={key} role="group" aria-label={label} style={{ display: "grid", gap: 4 }}>
              <span className="lx-muted" style={{ fontSize: 12 }}>{label}</span>
              <div className="lx-chips">
                {(Object.keys(options) as (keyof typeof options)[]).map((value) => (
                  <button key={String(value)} type="button" role="menuitemradio" aria-checked={prefs[key] === value} className="lx-chip" onClick={() => setPrefs({ [key]: value } as Partial<ReaderPrefs>)}>{options[value]}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span className="lx-muted" style={{ fontSize: 12 }}>{t.appearance}</span><ThemeToggle className="ws-icon-button" /></div>
        </div>
      )}
    </WsMenu>
  );

  return (
    <div className={embedded ? "" : "lx-reader-root"} dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="lx-reader-top" data-scrolled={scrolled > 4}>
        <Link href={backHref} className="ws-icon-button" aria-label={t.back}><ArrowLeft size={18} className="lx-flip" /></Link>
        <span className="lx-reader-top__title" aria-hidden={scrolled <= 4}>{meta.title || t.untitled}</span>
        <div className="lx-actions" style={{ gap: 2 }}>
          {isOwner && <Link href={`/dashboard/learn/lessons/${lesson.id}`} className="ws-btn ws-btn--sm ws-btn--ghost"><PenLine size={15} aria-hidden /><span className="lx-phone-label">{t.edit}</span></Link>}
          {!isOwner && (
            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" aria-pressed={!!lessonSaved}
              onClick={() => guard(async () => { if (lessonSaved) await actions.removeSave(lessonSaved.id); else { await actions.saveLesson(lesson); say(t.savedToast); } })}>
              {lessonSaved ? <BookmarkCheck size={15} aria-hidden /> : <Bookmark size={15} aria-hidden />}<span className="lx-phone-label">{lessonSaved ? t.saved : t.save}</span>
            </button>
          )}
          {/* Chaos runs no AI: questions go to the reader's own ChatGPT or Claude with the lesson as context. */}
          <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setHandoff({ lessonTitle: meta.title || t.untitled, selection: "", publicUrl, action: "ask" })}><MessageCircleQuestion size={15} aria-hidden /><span className="lx-phone-label">{t.ask}</span></button>
          {caps.discussions && <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" aria-pressed={panel === "discussion"} onClick={() => setPanel(panel === "discussion" ? null : "discussion")}><MessageSquare size={15} aria-hidden /><span className="lx-phone-label">{t.discussion}{threads.filter((th) => !th.resolved).length ? ` (${threads.filter((th) => !th.resolved).length})` : ""}</span></button>}
          {readingMenu}
          <WsMenu label={t.more}>
            {(close) => (
              <>
                {!isOwner && lesson.published && <button role="menuitem" className="ws-menu__row" title={t.forkHelp} onClick={() => { close(); guard(async () => { const id = await actions.forkLesson(lesson.id); say(t.forked); router.push(`/dashboard/learn/lessons/${id}`); }); }}><GitFork size={15} />{t.fork}</button>}
                <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void copyLink(); }}><Share2 size={15} />{t.copyLink}</button>
                <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setHandoff({ lessonTitle: meta.title, selection: "", publicUrl, target: "chatgpt", action: "ask" }); }}><ExternalLink size={15} />{t.askChatgpt}</button>
                <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setHandoff({ lessonTitle: meta.title, selection: "", publicUrl, target: "claude", action: "ask" }); }}><ExternalLink size={15} />{t.askClaude}</button>
                {!isOwner && caps.reports && <button role="menuitem" className="ws-menu__row ws-menu__danger" onClick={() => { close(); guard(() => setReporting(true)); }}><Flag size={15} />{t.report}</button>}
              </>
            )}
          </WsMenu>
        </div>
        <div className="lx-reader-progress" aria-hidden><span style={{ transform: `scaleX(${scrolled / 100})` }} /></div>
      </header>

      <div className="lx-reader" data-side={panel ? "open" : "closed"} data-width={prefs.width}>
        <aside className="lx-reader__toc"><Outline items={items} active={active} /></aside>
        <main className="lx-reader__main" id="lesson">
          {previewDraft && <p className="lx-notice" data-tone="info" style={{ marginBottom: 16 }}>{t.draftPreview}</p>}
          {isOwner && !caps.sharedPublishing && lesson.published && !previewDraft && <p className="lx-notice" style={{ marginBottom: 16 }}>{t.devicePublish}</p>}
          <ModerationNotice state={lesson.moderation} note={isOwner ? lesson.moderationNote : undefined} owner={isOwner} />
          <article ref={article} className="lx-article" data-size={prefs.size} data-font={prefs.font} lang={meta.language} dir={meta.language === "ar" ? "rtl" : "ltr"} aria-labelledby="lesson-title">
            {isCoverUrl(meta.coverUrl) && <img className="lx-article__cover" src={meta.coverUrl} alt="" style={{ objectPosition: `center ${meta.coverY ?? 50}%` }} />}
            {meta.icon && <span className="lx-article__icon" aria-hidden>{meta.icon}</span>}
            <h1 id="lesson-title" className="lx-article__title">{meta.title || t.untitled}</h1>
            {meta.description && <p className="lx-article__lead">{meta.description}</p>}
            <div className="lx-article__byline">
              <span>{t.by} <Link href={`/learn/people/${encodeURIComponent(lesson.ownerId)}`}>{meta.authorDisplay || lesson.ownerName}</Link></span>
              {author && <VerificationBadges verifications={author.verifications} />}
              <QualityBadge quality={lesson.quality} note={lesson.qualityNote} />
              <span>{t.minutes(readingMinutes(view.content))}</span>
              {view.version > 0 && <span title={t.version(view.version)}>{t.updated(formatDate(locale, view.publishedAt, { dateStyle: "medium" }))} · v{view.version}</span>}
              <CurriculumBadges refs={meta.curricula} max={4} />
              {lesson.forkedFrom && <ProvenanceLine provenance={lesson.forkedFrom} hrefFor={lessonPath} />}
              {lesson.externalRef && <ExternalRefLine externalRef={lesson.externalRef} />}
            </div>
            <MobileOutline items={items} active={active} />
            {resumeHeading && !previewDraft && (
              <p className="lx-notice" data-tone="info" style={{ marginBottom: 18 }}>
                <RotateCcw size={16} aria-hidden />
                <button type="button" className="lx-link" onClick={() => jumpTo(resumeHeading.id)}>{t.resume(resumeHeading.text)}</button>
              </p>
            )}
            <WsTabs tabs={["lesson", "practice"] as const} value={tab} onChange={setTab} label={meta.title} labels={{ lesson: t.tabs.lesson, practice: `${t.tabs.practice}${lesson.quizzes.length ? ` (${lesson.quizzes.length})` : ""}` }} />
            <div style={{ marginTop: 20 }}>
              {tab === "lesson" ? (
                <>
                  <BlockRenderer content={view.content} sources={lesson.sources} highlights={highlights}
                    onCite={(sourceId, locator) => { const source = lesson.sources.find((s) => s.id === sourceId); if (source) setOpenSource({ source, locator }); }}
                    onOpenImage={(block, url) => setLightbox({ url, alt: String(block.props.alt ?? ""), caption: String(block.props.caption ?? "") || undefined })}
                    blockAside={blockAside} blockAfter={blockAfter} />
                  {lesson.sources.length > 0 && (
                    <section className="lx-section" style={{ marginTop: 40 }} aria-labelledby="lesson-sources">
                      <h2 id="lesson-sources" style={{ fontSize: "1.2em" }}>{t.sources}</h2>
                      <ol style={{ display: "grid", gap: 8, paddingInlineStart: 0, listStyle: "none" }}>
                        {lesson.sources.map((s) => {
                          const Icon = sourceIcon[s.kind];
                          return (
                            <li key={s.id} id={`source-${s.id}`} className="lx-source" style={{ fontSize: 14 }}>
                              <span className="lx-source__icon" aria-hidden><Icon size={16} /></span>
                              <div className="lx-source__main">
                                <span className="lx-source__kind">{bt.kinds[s.kind]}{s.shortLabel ? ` · ${s.shortLabel}` : ""}</span>
                                <strong>{s.title}</strong>
                                <span className="lx-muted">{[s.author, s.year, s.owner && s.owner !== s.author ? `© ${s.owner}` : "", s.license].filter(Boolean).join(" · ")}</span>
                                {s.note && <span className="lx-muted">{s.note}</span>}
                              </div>
                              {(s.url || s.fileId) && <button type="button" className="lx-link" onClick={() => void openSourceTarget(s, "")}>{t.openSource}</button>}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  )}
                  {!previewDraft && (
                    <footer className="lx-section" style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--ws-line)" }}>
                      <div className="lx-actions" style={{ justifyContent: "space-between" }}>
                        {progress?.state === "completed" ? (
                          <span className="lx-actions"><span className="lx-badge" data-tone="green"><CheckCircle2 size={13} aria-hidden />{t.completed}</span><button type="button" className="lx-link" onClick={() => guard(() => actions.setProgress(lesson.id, { state: "not_started" }))}>{t.reset}</button></span>
                        ) : (
                          <button type="button" className="ws-btn" onClick={() => guard(() => actions.setProgress(lesson.id, { state: "completed", percent: 100 }))}><CheckCircle2 size={16} aria-hidden />{t.complete}</button>
                        )}
                        {!isOwner && (
                          <span className="lx-actions" role="group" aria-label={t.helpful}>
                            <span className="lx-muted">{vote ? t.thanks : t.helpful}</span>
                            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" aria-pressed={vote === "helpful"} onClick={() => guard(() => actions.vote(lesson.id, vote === "helpful" ? null : "helpful"))}><ThumbsUp size={14} aria-hidden />{t.yes}</button>

                          </span>
                        )}
                      </div>
                    </footer>
                  )}
                </>
              ) : <PracticeTab lesson={lesson} isOwner={isOwner} onForkQuiz={signedIn && caps.quizForks ? setForkingQuiz : undefined} />}
            </div>
          </article>
        </main>
        {panel && !phone && <aside className="lx-reader__side">{sidePanel}</aside>}
      </div>
      {panel && phone && <PhoneSheet onClose={() => setPanel(null)}>{sidePanel}</PhoneSheet>}
      {panel && !phone && <NarrowPanel onClose={() => setPanel(null)}>{sidePanel}</NarrowPanel>}

      {selection && tab === "lesson" && (
        <SelectionToolbar selection={selection} onAction={onSelectionAction} canWrite={signedIn} aiLabel={t.aiOff} />
      )}
      {handoff && <HandoffDialog input={handoff} onClose={() => setHandoff(null)} />}
      {reporting && <ReportDialog target={{ kind: "lesson", id: lesson.id }} title={meta.title} onClose={() => setReporting(false)} />}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {openSource && (
        <SourceSheet source={openSource.source} locator={openSource.locator} onOpen={() => void openSourceTarget(openSource.source, openSource.locator)} onClose={() => setOpenSource(null)} noLink={t.noSourceLink} openLabel={t.openSource} />
      )}
      {forkingQuiz && <WsConfirm title={t.forkQuizTitle} body={t.forkQuizBody(lesson.ownerName)} confirmLabel={t.fork} danger={false} onClose={() => setForkingQuiz(null)}
        onConfirm={() => { void actions.forkQuiz(forkingQuiz.formId, { lessonId: lesson.id }).then((id) => router.push(`/dashboard/forms/${id}`), (err) => say(errorMessage(err))); }} />}
      <WsUndoToast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/** Tablets: the side column is hidden by CSS below 1180px, so the panel floats as a sheet instead. */
function NarrowPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1180px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!narrow) return null;
  return <PhoneSheet onClose={onClose}>{children}</PhoneSheet>;
}

function PhoneSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panel = useModal<HTMLDivElement>({ onClose });
  return (
    <>
      <div className="lx-sheet-scrim" data-modal-backdrop onClick={onClose} aria-hidden />
      <div ref={panel} className="lx-sheet" role="dialog" aria-modal="true" tabIndex={-1}>{children}</div>
    </>
  );
}

function SourceSheet({ source, locator, onOpen, onClose, noLink, openLabel }: { source: LessonSource; locator: string; onOpen: () => void; onClose: () => void; noLink: string; openLabel: string }) {
  const bt = useBlockCopy();
  const panel = useModal<HTMLDivElement>({ onClose });
  const Icon = sourceIcon[source.kind];
  return (
    <div className="ws-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="ws-dialog" role="dialog" aria-modal="true" aria-label={source.title} tabIndex={-1}>
        <div className="ws-dialog__header">
          <h2 className="ws-dialog__title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon size={18} aria-hidden />{sourceLabel(source, locator)}</h2>
          <button type="button" data-close className="ws-icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="ws-dialog__body lx-form">
          <div className="lx-source__main">
            <span className="lx-source__kind">{bt.kinds[source.kind]}</span>
            <strong>{source.title}</strong>
            <span className="lx-muted">{[source.author, source.year].filter(Boolean).join(" · ")}</span>
            {source.owner && <span className="lx-muted">© {source.owner}{source.license ? ` · ${source.license}` : ""}</span>}
            {locator && <span>{locator}</span>}
            {source.note && <p className="lx-help">{source.note}</p>}
          </div>
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            {source.url || source.fileId ? <button type="button" className="ws-btn ws-btn--primary" onClick={onOpen}><ExternalLink size={15} aria-hidden />{openLabel}</button> : <span className="lx-muted">{noLink}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnavailableLesson({ backHref = "/dashboard/learn" }: { backHref?: string }) {
  const t = useCopy(copy);
  return (
    <div className="lx-page lx-page--narrow" style={{ padding: "64px 16px" }}>
      <div className="lx-empty">
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--on-surface)" }}>{t.unavailable}</h1>
        <p>{t.unavailableBody}</p>
        <Link className="ws-btn" href={backHref}>{t.back}</Link>
      </div>
    </div>
  );
}
