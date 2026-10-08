"use client";

import { useKeptQuery } from "@/lib/queryCache";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { contentDirection } from "@/lib/learn/direction";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LessonActivity, type Activity } from "./ActivityContext";
import ActivitySummary, { useReadingSeconds } from "./ActivitySummary";
import CompletionAction from "./CompletionAction";
import CourseBreadcrumb from "./CourseBreadcrumb";
import CourseNavigation from "./CourseNavigation";
import { legacyFlashcardBlocks } from "@/lib/learn/inlineStudy";
import { defaultCover, isCoverUrl } from "@/lib/learn/covers";
import Link from "@/components/site/SiteLink";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { useStableCallback } from "@/lib/stableCallback";
import {
  ArrowRight, BookOpen, ChevronLeft, Bookmark, BookmarkCheck, ExternalLink, Flag, GitFork, Headphones, MessageCircleQuestion, Image as ImageIcon, Link2, MessageSquare, MessageSquarePlus,
  Lock, MoreHorizontal, NotebookPen, PenLine, Share2, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import { WsConfirm, WsMenu } from "@/components/workspace/primitives";
import { toast } from "@/lib/toast";
import { useIsPhone } from "@/components/workspace/useIsPhone";
import { useModal } from "@/components/workspace/useModal";
import {
  isListed, readerView, useHighlights, useLearnActions, useLearnCapabilities, useLearnViewer, useNotes, usePerson, useProgress, useSaved, useThreads, useVote } from "@/lib/learn/data";
import { blockText, excerpt, findBlock, outline, readingMinutes, walk, asBlocks, type Block } from "@/lib/learn/doc";
import { resolveLearnFileUrl as resolveFileUrl } from "@/lib/learn/data";
import { lessonPath } from "@/lib/learn/seo";
import type { HandoffAction, HandoffTarget } from "@/lib/learn/handoff";
import type { AttachedQuiz, Lesson, LessonSource } from "@/lib/learn/types";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";
import { sourceIcon, sourceLabel, useBlockCopy } from "../blockShared";
import { CurriculumBadges, ExternalRefLine, ModerationNotice, ProvenanceLine, QualityBadge, VerificationBadges } from "../ui";
import { AiMark } from "@/components/site/aiMarks";
import BlockRenderer from "./BlockRenderer";
import { GlossaryContext, TermCard, type OpenTerm } from "./Glossary";
import { BlockCallout } from "./BlockCallout";
import { findEntry, glossaryMatcher } from "@/lib/learn/glossary";
import DiscussionPanel from "./DiscussionPanel";
import HandoffDialog, { type HandoffContext } from "./HandoffDialog";
import Lightbox from "./Lightbox";
import { DesktopOutline, jumpTo, MobileOutline, useActiveHeading } from "./Outline";
import PracticeTab from "./PracticeTab";
import ReportDialog from "./ReportDialog";
import SelectionToolbar, { useTextSelection, type SelectionAction } from "./SelectionToolbar";
import ReadingMenu from "./ReadingMenu";
import ListenMenu from "./ListenMenu";
import type { NarrationRequest } from "./Narration";
import { useReaderPrefs } from "@/lib/learn/readerPrefs";
import { activityOf } from "@/lib/learn/narration/activity";
import { primeSpeech, speechSupported } from "@/lib/learn/narration/support";
import { prefersReducedMotion } from "@/lib/learn/motion";
import { useUsableMark } from "@/lib/journeys";
import { linkOrigin } from "@/lib/hosts";

// Read aloud loads only when a reader asks for it: no speech code on a normal lesson load.
const Narration = dynamic(() => import("./Narration"), { ssr: false });

const copy = {
  en: {
    back: "Back", untitled: "Untitled lesson", by: "By", createdWith: (name: string) => `Created with ${name}`, minutes: (n: number) => `${n} min read`, version: (n: number) => `Version ${n}`, updated: (d: string) => `Published ${d}`,
    ask: "Ask", discussion: "Discussion", save: "Save", saved: "Saved", more: "More", fork: "Copy to my library", forkHelp: "Make an editable copy. The original author stays credited.",
    report: "Report", copyLink: "Copy link", linkCopied: "Link copied", askChatgpt: "Ask ChatGPT", askClaude: "Ask Claude", edit: "Edit lesson",
    listen: "Listen", listenHelp: "Read this lesson aloud", speechUnavailable: "Read aloud isn't available in this browser.",
    tabs: { lesson: "Lesson", practice: "Practice" }, sources: "Sources", openSource: "Open", noSourceLink: "No link or file for this source.",
    helpful: "Was this lesson helpful?", yes: "Helpful", no: "Not helpful", thanks: "Thanks for the feedback.",
    complete: "Mark as completed", completed: "Completed", reset: "Start over", resumeLabel: "Continue where you left off", resumeTop: "Your last reading position", resumeGo: "Resume", resumeDismiss: "Dismiss",
    blockMenu: "Actions for this part", actSave: "Save", actNote: "Note", actDiscuss: "Discuss", actThreads: "Threads", actLink: "Copy link", actExplain: "Explain", actAsk: "Ask", saveBlock: "Save this part", note: "Add private note", discuss: "Discuss this part", copyPart: "Copy link to this part",
    explainImage: "Explain image", askImage: "Ask about this", savedToast: "Saved to your Learn library", noteSaved: "Note saved (only you can see it)",
    highlightSaved: "Highlighted (only you can see it)", removeHighlight: "Remove highlight", highlightRemoved: "Highlight removed",
    noteTitle: "Private note", notePh: "Only you can see this note.", noteSave: "Save note", noteCancel: "Cancel", noteDelete: "Delete note", noteDeleted: "Note deleted", copyFailed: "Could not copy the link",
    signIn: "Sign in to save, highlight and take notes.", signInAction: "Sign in",
    aiOff: "opens outside Chaos", forked: "Copied to your library", devicePublish: "Publishing is on this device only until the Learn service is connected.",
    draftPreview: "Preview of your unpublished draft. Readers see the published version.",
    marks: (n: number, kind: "note" | "thread") => kind === "note" ? `${n} private ${n === 1 ? "note" : "notes"}` : `${n} ${n === 1 ? "discussion" : "discussions"}`,
    forkQuizTitle: "Copy this quiz to your library?", forkQuizBody: (author: string) => `You get an editable draft in your Chaos library that credits ${author} and links back to the original. It opens in the quiz builder.`,
    unavailable: "This lesson is unavailable", unavailableBody: "It may have been removed, made private or never published.",
  },
  ar: {
    back: "رجوع", untitled: "درس بلا عنوان", by: "بقلم", createdWith: (name: string) => `أُنشئ باستخدام ${name}`, minutes: (n: number) => `${n} د قراءة`, version: (n: number) => `الإصدار ${n}`, updated: (d: string) => `نُشر ${d}`,
    ask: "اسأل", discussion: "النقاش", save: "احفظ", saved: "محفوظ", more: "المزيد", fork: "انسخ إلى مكتبتي", forkHelp: "أنشئ نسخة قابلة للتعديل. يبقى الكاتب الأصلي منسوبًا.",
    report: "إبلاغ", copyLink: "انسخ الرابط", linkCopied: "نُسخ الرابط", askChatgpt: "اسأل ChatGPT", askClaude: "اسأل Claude", edit: "عدّل الدرس",
    listen: "استمع", listenHelp: "اقرأ هذا الدرس بصوت عالٍ", speechUnavailable: "القراءة بصوت عالٍ غير متاحة في هذا المتصفح.",
    tabs: { lesson: "الدرس", practice: "التدريب" }, sources: "المصادر", openSource: "افتح", noSourceLink: "لا رابط أو ملف لهذا المصدر.",
    helpful: "هل كان هذا الدرس مفيدًا؟", yes: "مفيد", no: "غير مفيد", thanks: "شكرًا على رأيك.",
    complete: "علّم كمكتمل", completed: "مكتمل", reset: "ابدأ من جديد", resumeLabel: "تابع من حيث توقفت", resumeTop: "آخر موضع قرأته", resumeGo: "تابع", resumeDismiss: "إخفاء",
    blockMenu: "إجراءات لهذا الجزء", actSave: "احفظ", actNote: "ملاحظة", actDiscuss: "ناقش", actThreads: "النقاشات", actLink: "انسخ الرابط", actExplain: "اشرح", actAsk: "اسأل", saveBlock: "احفظ هذا الجزء", note: "أضف ملاحظة خاصة", discuss: "ناقش هذا الجزء", copyPart: "انسخ رابط هذا الجزء",
    explainImage: "اشرح الصورة", askImage: "اسأل عن هذا", savedToast: "حُفظ في مكتبة Learn", noteSaved: "حُفظت الملاحظة (لا يراها غيرك)",
    highlightSaved: "ظُلّل النص (لا يراه غيرك)", removeHighlight: "أزل التظليل", highlightRemoved: "أُزيل التظليل",
    noteTitle: "ملاحظة خاصة", notePh: "لا يرى هذه الملاحظة غيرك.", noteSave: "احفظ الملاحظة", noteCancel: "إلغاء", noteDelete: "احذف الملاحظة", noteDeleted: "حُذفت الملاحظة", copyFailed: "تعذّر نسخ الرابط",
    signIn: "سجّل الدخول للحفظ والتظليل وكتابة الملاحظات.", signInAction: "تسجيل الدخول",
    aiOff: "يُفتح خارج Chaos", forked: "نُسخ إلى مكتبتك", devicePublish: "النشر على هذا الجهاز فقط إلى أن تُربط خدمة Learn.",
    draftPreview: "معاينة لمسودتك غير المنشورة. يرى القرّاء النسخة المنشورة.",
    marks: (n: number, kind: "note" | "thread") => kind === "note" ? `${n} ملاحظة خاصة` : `${n} نقاش`,
    forkQuizTitle: "نسخ هذا الاختبار إلى مكتبتك؟", forkQuizBody: (author: string) => `ستحصل على مسودة قابلة للتعديل في مكتبة Chaos تنسب الاختبار إلى ${author} وترتبط بالأصل. تُفتح في محرر الاختبارات.`,
    unavailable: "هذا الدرس غير متاح", unavailableBody: "ربما حُذف أو صار خاصًا أو لم يُنشر قط.",
  },
};
type Copy = (typeof copy)["en"];

export interface LessonReaderProps {
  lesson: Lesson;
  /** Owner previewing the draft instead of the published version. */
  previewDraft?: boolean;
  backHref?: string;
  /** Shown inside the workspace shell (no own top bar chrome duplication). */
  embedded?: boolean;
  courseId?: string | null;
}

export default function LessonReader({ lesson, previewDraft, backHref = "/dashboard/learn", embedded, courseId }: LessonReaderProps) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const { locale } = useLocale();
  const router = useRouter();
  const caps = useLearnCapabilities();
  const viewer = useLearnViewer();
  const actions = useLearnActions();
  const course = useKeptQuery(api.courses.getPublic, courseId ? { courseId } : "skip");
  const courseProgress = useCourseProgress(courseId ?? "");
  const enrollment = useCourseEnrollment(courseId);
  const recordCourseLesson = enrollment.recordLesson;
  useUsableMark("lesson.read", !embedded);
  useEffect(() => { if (courseId && !previewDraft) recordCourseLesson(lesson.id); }, [courseId, lesson.id, previewDraft, recordCourseLesson]);
  const completesCourse = !!course?.lessons.length && course.lessons.some(l => l.id === lesson.id) && course.lessons.every(l => l.id === lesson.id || courseProgress[l.id]?.completed);
  const phone = useIsPhone();
  const isOwner = viewer?.id === lesson.ownerId;
  const signedIn = !!viewer?.signedIn;
  const view = previewDraft ? { version: lesson.published?.version ?? 0, meta: lesson.draft.meta, content: lesson.draft.content, publishedAt: lesson.draft.updatedAt } : readerView(lesson);
  const attachedDecks = useQuery(api.flashcardStudy.listAttached, { lessonId: lesson.id as Id<"lessons"> });
  const legacyDeckBlocks = legacyFlashcardBlocks(view.content, attachedDecks ?? []);
  const activityKey = `chaos.lesson.activities:${viewer?.id ?? "guest"}:${lesson.id}:${view.version}`;
  const [activities, setActivities] = useState<Record<string, Activity>>({});
  useEffect(() => { try { setActivities(JSON.parse(localStorage.getItem(activityKey) ?? "{}")); } catch { setActivities({}); } }, [activityKey]);
  const reportActivity = (activity: Activity) => setActivities(current => {
    const next = { ...current, [`${activity.kind}:${activity.id}`]: activity };
    try { localStorage.setItem(activityKey, JSON.stringify(next)); } catch { /* device storage unavailable */ }
    return next;
  });
  const requiredKeys = [...walk(asBlocks(view.content))].flatMap(({ block }) => { const activity = activityOf(block); return activity?.required ? [activity.key] : []; });
  const remainingActivities = requiredKeys.filter(key => !activities[key]).length;
  const meta = view.meta;
  const items = useMemo(() => outline(view.content), [view.content]);
  const active = useActiveHeading(items);
  const author = usePerson(lesson.ownerId);
  const highlights = useHighlights(lesson.id) ?? [];
  const glossaryEntries = useQuery(api.lessonGlossary.get, { lessonId: lesson.id });
  const [openTerm, setOpenTerm] = useState<OpenTerm | null>(null);
  const closeTerm = useCallback(() => setOpenTerm(null), []);
  const glossary = useMemo(() => ({ matcher: glossaryMatcher(glossaryEntries ?? []), open: setOpenTerm }), [glossaryEntries]);
  const notes = useNotes(lesson.id) ?? [];
  const threads = useThreads(lesson.id) ?? [];
  const saved = useSaved() ?? [];
  const vote = useVote(lesson.id);
  const progress = useProgress()?.[lesson.id];
  const [justCompleted, setJustCompleted] = useState(false);
  const completed = progress?.state === "completed" || justCompleted;
  const readingSeconds = useReadingSeconds(`${activityKey}:seconds`, !previewDraft && !completed);
  const [prefs, setPrefs] = useReaderPrefs();
  const [panel, setPanel] = useState<"discussion" | null>(null);
  const [tab, setTab] = useState<"lesson" | "practice">("lesson");
  const [handoff, setHandoff] = useState<HandoffContext | null>(null);
  const [reporting, setReporting] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string; caption?: string } | null>(null);
  const [editingNote, setEditingNote] = useState<{ id?: string; blockId: string; body: string } | null>(null);
  const [discussAnchor, setDiscussAnchor] = useState<{ blockId: string; excerpt: string }>();
  const [scrolled, setScrolled] = useState(0);
  const [openSource, setOpenSource] = useState<{ source: LessonSource; locator: string } | null>(null);
  const article = useRef<HTMLElement>(null);
  // Phones and tablets have no hover and no gutter beside the text, so tapping a block opens its
  // actions in a callout pointing at it (BlockCallout): one tap, no ⋯ menu in between.
  const [tappedBlock, setTappedBlock] = useState<string>();
  const closeCallout = useCallback(() => setTappedBlock(undefined), []);
  const tapBlock = (event: ReactMouseEvent<HTMLElement>) => {
    if (!window.matchMedia("(max-width: 1180px), (hover: none)").matches) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, summary, [role='menu'], [role='button'], .lx-block__handle")) return;
    if (window.getSelection()?.toString()) return; // selecting text shows the selection toolbar instead
    const id = target.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
    setTappedBlock((current) => (current === id ? undefined : id));
  };
  const [narration, setNarration] = useState<NarrationRequest | null>(null);
  const narrationIds = useRef(0);
  const startNarration = (request: { mode: "lesson"; from?: string } | { mode: "selection"; text: string; title?: string }) => {
    if (!speechSupported()) { toast.error(t.speechUnavailable); return; }
    primeSpeech(); // inside the click: iOS only starts speech from a user gesture
    setNarration({ ...request, id: ++narrationIds.current } as NarrationRequest);
  };
  const main = useRef<HTMLElement>(null);
  const [selection, clearSelection] = useTextSelection(article);
  const say = (text: string) => toast.success(text);

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
      void actions.recordView(lesson.id, { blockId, engagedSeconds: seconds }).catch(err => toast.error(err, { id: "lesson-sync" }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lesson.id, active, previewDraft, signedIn]); // oxlint-disable-line react-hooks/exhaustive-deps -- timer belongs to the engagement target

  const positionKey = `${activityKey}:position`;
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [resumeHidden, setResumeHidden] = useState(false);
  useEffect(() => { try { const raw = localStorage.getItem(positionKey); const n = raw === null ? NaN : Number(raw); setResumePosition(Number.isFinite(n) && n > .02 && n < .98 ? n : null); } catch { setResumePosition(null); } }, [positionKey]);
  const restorePosition = () => { const el = article.current; if (!el || resumePosition === null) return; const box = el.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + box.top + box.height * resumePosition - window.innerHeight * .2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
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
        try { localStorage.setItem(positionKey, String(Math.min(1, Math.max(0, (window.innerHeight * .2 - r.top) / Math.max(1, r.height))))); } catch { /* unavailable */ }
        void actions.setProgress(lesson.id, { percent: pct, lastBlockId: active }).catch(err => toast.error(err, { id: "lesson-sync" }));
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lesson.id, active, previewDraft, actions, signedIn, positionKey]);

  const resumeHeading = progress?.state === "in_progress" && progress.lastBlockId ? items.find((i) => i.id === progress.lastBlockId) : undefined;
  const lessonSaved = saved.find((s) => s.kind === "lesson" && s.lessonId === lesson.id);
  const publicUrl = typeof window !== "undefined" && isListed(lesson) ? `${linkOrigin("learn")}${lessonPath(lesson.id)}` : undefined;
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

  const guard = async (fn: () => unknown | Promise<unknown>) => { if (!signedIn) { toast.info(t.signIn); return; } try { await fn(); } catch (err) { toast.error(err); } };

  const onSelectionAction = (action: SelectionAction) => {
    if (!selection) return;
    const { text, blockId, offset } = selection;
    if (action === "read") startNarration({ mode: "selection", text });
    else if (action === "lookup") { const entry = findEntry(glossary.matcher, text); if (entry) setOpenTerm({ entry, rect: selection.rect }); }
    else if (action.startsWith("highlight:")) {
      guard(async () => { await actions.addHighlight({ lessonId: lesson.id, blockId, quote: text, offset, color: action.slice(10) as "yellow" }); say(t.highlightSaved); });
    } else if (action === "save") guard(async () => { await actions.saveBlock(lesson, blockId, text); say(t.savedToast); });
    else if (action === "note") guard(() => setEditingNote({ blockId, body: `“${excerpt(text, 120)}” ` }));
    else if (action === "discuss") { setDiscussAnchor({ blockId, excerpt: excerpt(text, 140) }); setPanel("discussion"); }
    else if (action === "chatgpt" || action === "claude") openHandoff(action, text, blockId, "ask");
    else openHandoff(undefined, text, blockId, action as HandoffAction);
    clearSelection();
  };

  const copyLink = async (hash?: string) => {
    try { await navigator.clipboard.writeText(`${linkOrigin("learn")}${lessonPath(lesson.id)}${hash ? `#${hash}` : ""}`); say(t.linkCopied); } catch { toast.error(t.copyFailed); }
  };

  const openSourceTarget = async (source: LessonSource, locator: string) => {
    const raw = source.fileId ?? source.url;
    if (!raw) return;
    let url = await resolveFileUrl(raw);
    const page = locator.match(/(?:page|p\.?|ص|صفحة)\s*(\d+)/i)?.[1];
    if (page && (source.kind === "pdf" || source.kind === "slides")) url += `#page=${page}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const asideAction = useStableCallback((action: AsideAction, block: Block) => {
    const alt = String(block.props.alt || block.props.caption || "");
    if (action === "explain" || action === "ask") openHandoff(undefined, "", block.id, action, alt);
    else if (action === "save") guard(() => { actions.saveBlock(lesson, block.id, blockText(block), block.type === "image" ? String(block.props.url ?? "") : undefined); say(t.savedToast); });
    else if (action === "note") guard(() => setEditingNote({ blockId: block.id, body: "" }));
    else if (action === "discuss") { setDiscussAnchor({ blockId: block.id, excerpt: excerpt(blockText(block) || String(block.props.alt ?? ""), 140) }); setPanel("discussion"); }
    else if (action === "copy") void copyLink(block.id);
    else setPanel("discussion");
  });
  const blockAside = (block: Block) => (
    <BlockAside block={block} t={t} discussions={!!caps.discussions} onAction={asideAction}
      noteCount={notes.filter((n) => n.blockId === block.id).length}
      threadCount={threads.filter((th) => th.blockId === block.id && !th.resolved).length} />
  );

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
                <button type="button" className="ws-icon-button" aria-label={t.noteDelete} onClick={() => guard(async () => { const copyOf = n; await actions.deleteNote(n.id); toast(t.noteDeleted, { undo: () => { void guard(() => actions.upsertNote({ lessonId: copyOf.lessonId, blockId: copyOf.blockId, body: copyOf.body })); } }); })}><X size={13} /></button>
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

  // The outline folds with the lesson sliding into its place (FLIP: transforms only, no animated layout).
  const toggleOutline = useStableCallback(() => {
    const before = main.current?.getBoundingClientRect().left;
    flushSync(() => setPrefs({ outline: prefs.outline === "closed" ? "open" : "closed" }));
    const after = main.current?.getBoundingClientRect().left;
    if (before === undefined || after === undefined || before === after || prefersReducedMotion()) return;
    main.current?.animate?.([{ transform: `translateX(${before - after}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  });
  const listenFrom = () => {
    // Start where the reader is: the section on screen once they have scrolled into the lesson.
    const index = items.findIndex((i) => i.id === active);
    return index > 0 && scrolled > 3 ? items[index].id : undefined;
  };
  // Listen closes the lesson player; while a selection is being read it starts the lesson instead.
  const listening = narration?.mode === "lesson";
  const toggleListen = useStableCallback(() => (listening ? setNarration(null) : startNarration({ mode: "lesson", from: listenFrom() })));
  const tapped = tappedBlock ? findBlock(view.content, tappedBlock) : undefined;

  return (
    <div className={embedded ? "" : "lx-reader-root"} dir={locale === "ar" ? "rtl" : "ltr"} data-narrating={narration ? true : undefined}>
      <header className="lx-reader-top" data-scrolled={scrolled > 4}>
        <Link href={backHref} className="ws-icon-button lx-reader-back" aria-label={t.back}><ChevronLeft size={18} strokeWidth={2} className="lx-flip lx-back-chevron" aria-hidden /></Link>
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
          <ListenMenu prefs={prefs} setPrefs={setPrefs} listening={listening} onToggle={toggleListen} />
          <ReadingMenu prefs={prefs} setPrefs={setPrefs} />
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

      <div className="lx-reader" data-side={panel ? "open" : "closed"} data-width={prefs.width} data-outline={items.length ? prefs.outline : undefined}>
        <aside className="lx-reader__toc"><DesktopOutline items={items} active={active} collapsed={prefs.outline === "closed"} onToggle={toggleOutline} /></aside>
        <main ref={main} className="lx-reader__main" id="lesson">
          {previewDraft && <p className="lx-notice" data-tone="info" style={{ marginBottom: 16 }}>{t.draftPreview}</p>}
          {isOwner && !caps.sharedPublishing && lesson.published && !previewDraft && <p className="lx-notice" style={{ marginBottom: 16 }}>{t.devicePublish}</p>}
          <ModerationNotice state={lesson.moderation} note={isOwner ? lesson.moderationNote : undefined} owner={isOwner} />
          <LessonActivity.Provider value={reportActivity}><article ref={article} onClick={tapBlock} className="lx-article" data-size={prefs.size} data-font={prefs.font} lang={meta.language} dir={contentDirection(meta.language)} aria-labelledby="lesson-title">
            <img className="lx-article__cover" src={isCoverUrl(meta.coverUrl) ? meta.coverUrl : defaultCover(lesson.id)} alt="" style={{ objectPosition: `center ${meta.coverY ?? 50}%` }} />
            <h1 id="lesson-title" className="lx-article__title">{meta.title || t.untitled}</h1>
            {meta.description && <p id="lesson-lead" className="lx-article__lead">{meta.description}</p>}
            <div className="lx-article__byline">
              <span>{t.by} <Link href={`/learn/people/${encodeURIComponent(lesson.ownerId)}`}>{meta.authorDisplay || lesson.ownerName}</Link></span>
              {lesson.createdWith && <span className="lx-created-with"><AiMark client={lesson.createdWith.client} size={14} /><bdi>{t.createdWith(lesson.createdWith.name)}</bdi></span>}
              {author && <VerificationBadges verifications={author.verifications} />}
              <QualityBadge quality={lesson.quality} note={lesson.qualityNote} />
              <span>{t.minutes(readingMinutes(view.content))}</span>
              <ListenButton className="lx-listen-chip" size={13} pressed={listening} label={t.listen} title={t.listenHelp} onClick={toggleListen} />
              {view.version > 0 && <span title={t.version(view.version)}>{t.updated(formatDate(locale, view.publishedAt, { dateStyle: "medium" }))} · v{view.version}</span>}
              <CurriculumBadges refs={meta.curricula} max={4} />
              {lesson.forkedFrom && <ProvenanceLine provenance={lesson.forkedFrom} hrefFor={lessonPath} />}
              {lesson.externalRef && <ExternalRefLine externalRef={lesson.externalRef} />}
            </div>
            <CourseBreadcrumb courseId={courseId} lessonId={lesson.id} />
            <MobileOutline items={items} active={active} />
            {(resumeHeading || resumePosition !== null) && !previewDraft && !completed && !resumeHidden && (
              <div className="lx-resume">
                <button type="button" className="lx-resume__main" onClick={() => { if (resumePosition !== null) restorePosition(); else if (resumeHeading) jumpTo(resumeHeading.id); setResumeHidden(true); }}>
                  <span className="lx-resume__icon" aria-hidden><BookOpen size={17} /></span>
                  <span className="lx-resume__text">
                    <small>{t.resumeLabel}</small>
                    <strong dir="auto">{resumeHeading?.text ?? t.resumeTop}</strong>
                  </span>
                  <span className="lx-resume__go"><span>{t.resumeGo}</span><ArrowRight size={15} className="lx-flip" aria-hidden /></span>
                </button>
                <button type="button" className="lx-resume__close" aria-label={t.resumeDismiss} onClick={() => setResumeHidden(true)}><X size={15} aria-hidden /></button>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              {(
                <>
                  <GlossaryContext.Provider value={glossary}>
                  <BlockRenderer content={view.content} sources={lesson.sources} highlights={highlights}
                    onCite={(sourceId, locator) => { const source = lesson.sources.find((s) => s.id === sourceId); if (source) setOpenSource({ source, locator }); }}
                    onOpenImage={(block, url) => setLightbox({ url, alt: String(block.props.alt ?? ""), caption: String(block.props.caption ?? "") || undefined })}
                    blockAside={blockAside} blockAfter={blockAfter} activeBlockId={tappedBlock} />
                  </GlossaryContext.Provider>
                  <BlockRenderer content={legacyDeckBlocks} sources={lesson.sources} />
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
                  {!previewDraft && <PracticeTab lesson={lesson} isOwner={isOwner} onForkQuiz={signedIn && caps.quizForks ? setForkingQuiz : undefined} />}
                  {!previewDraft && (
                    <footer className="lx-section" style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--ws-line)" }}>
                      <div className="lx-actions" style={{ justifyContent: "space-between" }}>
                        <CompletionAction completionSound={completesCourse ? "course_complete" : "lesson_complete"} completed={completed} disabled={remainingActivities > 0}
                          onComplete={async () => { await actions.setProgress(lesson.id, { state: "completed", percent: 100 }); setJustCompleted(true); recordCourseLesson(lesson.id, true); }}
                          onReset={async () => { await actions.setProgress(lesson.id, { state: "not_started", percent: 0 }); setJustCompleted(false); recordCourseLesson(lesson.id, false); setActivities({}); try { localStorage.removeItem(activityKey); localStorage.removeItem(positionKey); setResumePosition(null); } catch { /* unavailable */ } window.scrollTo({ top: 0, behavior: "auto" }); }} />
                        {!isOwner && (
                          <span className="lx-actions" role="group" aria-label={t.helpful}>
                            <span className="lx-muted">{vote ? t.thanks : t.helpful}</span>
                            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" aria-pressed={vote === "helpful"} onClick={() => guard(() => actions.vote(lesson.id, vote === "helpful" ? null : "helpful"))}><ThumbsUp size={14} aria-hidden />{t.yes}</button>

                          </span>
                        )}
                      </div>
                      {remainingActivities > 0 && progress?.state !== "completed" && <p role="status" className="lx-muted">{locale === "ar" ? `أكمل الأنشطة المطلوبة المتبقية: ${remainingActivities}` : `Complete ${remainingActivities} remaining required activities first.`}</p>}
                      {completed && <ActivitySummary seconds={readingSeconds} activities={Object.values(activities)} />}
                      <CourseNavigation courseId={courseId} lessonId={lesson.id} completed={completed} />
                    </footer>
                  )}
                </>
              ) }

            </div>
          </article></LessonActivity.Provider>
        </main>
        {panel && !phone && <aside className="lx-reader__side">{sidePanel}</aside>}
      </div>
      {panel && phone && <PhoneSheet onClose={() => setPanel(null)}>{sidePanel}</PhoneSheet>}
      {panel && !phone && <NarrowPanel onClose={() => setPanel(null)}>{sidePanel}</NarrowPanel>}

      {selection && tab === "lesson" && (
        <SelectionToolbar selection={selection} onAction={onSelectionAction} canWrite={signedIn} aiLabel={t.aiOff} canLookUp={!!findEntry(glossary.matcher, selection.text)} canRead={speechSupported()} within={main.current} />
      )}
      {tapped && (
        <BlockCallout key={tapped.id} blockId={tapped.id} label={t.blockMenu} onClose={closeCallout}>
          <BlockActions block={tapped} t={t} discussions={!!caps.discussions} onAction={(action, block) => { closeCallout(); asideAction(action, block); }}
            threadCount={threads.filter((th) => th.blockId === tapped.id && !th.resolved).length} />
        </BlockCallout>
      )}
      {narration && (
        <Narration key={lesson.id} request={narration} lessonId={lesson.id} content={view.content} title={meta.title || t.untitled} description={meta.description}
          language={meta.language} article={article} activities={activities} onClose={() => setNarration(null)} />
      )}
      {openTerm && <TermCard term={openTerm} onClose={closeTerm} canSpeak={speechSupported()} />}
      {handoff && <HandoffDialog input={handoff} onClose={() => setHandoff(null)} />}
      {reporting && <ReportDialog target={{ kind: "lesson", id: lesson.id }} title={meta.title} onClose={() => setReporting(false)} />}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {openSource && (
        <SourceSheet source={openSource.source} locator={openSource.locator} onOpen={() => void openSourceTarget(openSource.source, openSource.locator)} onClose={() => setOpenSource(null)} noLink={t.noSourceLink} openLabel={t.openSource} />
      )}
      {forkingQuiz && <WsConfirm title={t.forkQuizTitle} body={t.forkQuizBody(lesson.ownerName)} confirmLabel={t.fork} danger={false} onClose={() => setForkingQuiz(null)}
        onConfirm={() => { void actions.forkQuiz(forkingQuiz.formId, { lessonId: lesson.id }).then((id) => router.push(`/dashboard/forms/${id}`), (err) => toast.error(err)); }} />}
    </div>
  );
}

/** Tablets: the side column is hidden by CSS below 1180px, so the panel floats as a sheet instead. */
type AsideAction = "explain" | "ask" | "save" | "note" | "discuss" | "copy" | "threads";

/** A block's menu and marks. Memoized: blocks keep their identity across lesson updates (BlockRenderer), so an agent adding a block re-renders one menu, not all of them. */
const BlockAside = memo(function BlockAside({ block, t, discussions, noteCount, threadCount, onAction }: { block: Block; t: Copy; discussions: boolean; noteCount: number; threadCount: number; onAction: (action: AsideAction, block: Block) => void }) {
  const isImage = block.type === "image";
  return (
    <>
      <WsMenu label={t.blockMenu} align="end" triggerClassName="lx-block-action" trigger={<MoreHorizontal size={15} />}>
        {(close) => (
          <>
            {isImage && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("explain", block); }}><ImageIcon size={15} />{t.explainImage}</button>}
            {isImage && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("ask", block); }}><MessageSquare size={15} />{t.askImage}</button>}
            <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("save", block); }}><Bookmark size={15} />{t.saveBlock}</button>
            <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("note", block); }}><NotebookPen size={15} />{t.note}</button>
            {discussions && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("discuss", block); }}><MessageSquarePlus size={15} />{t.discuss}</button>}
            <button role="menuitem" className="ws-menu__row" onClick={() => { close(); onAction("copy", block); }}><Link2 size={15} />{t.copyPart}</button>
          </>
        )}
      </WsMenu>
      {(noteCount > 0 || threadCount > 0) && (
        <span className="lx-block__marks">
          {threadCount > 0 && <button type="button" className="lx-block__mark" data-kind="thread" aria-label={t.marks(threadCount, "thread")} title={t.marks(threadCount, "thread")} onClick={() => onAction("threads", block)}><MessageSquare size={13} /></button>}
        </span>
      )}
    </>
  );
});

/** The touch callout's actions, laid out like iOS's edit menu: each one a single tap. */
function BlockActions({ block, t, discussions, threadCount, onAction }: { block: Block; t: Copy; discussions: boolean; threadCount: number; onAction: (action: AsideAction, block: Block) => void }) {
  const isImage = block.type === "image";
  const actions: { action: AsideAction; icon: typeof Bookmark; label: string; title: string; badge?: number }[] = [
    ...(isImage ? [{ action: "explain" as const, icon: ImageIcon, label: t.actExplain, title: t.explainImage }, { action: "ask" as const, icon: MessageCircleQuestion, label: t.actAsk, title: t.askImage }] : []),
    { action: "save", icon: Bookmark, label: t.actSave, title: t.saveBlock },
    { action: "note", icon: NotebookPen, label: t.actNote, title: t.note },
    ...(discussions ? [{ action: "discuss" as const, icon: MessageSquarePlus, label: t.actDiscuss, title: t.discuss }] : []),
    ...(discussions && threadCount > 0 ? [{ action: "threads" as const, icon: MessageSquare, label: t.actThreads, title: t.marks(threadCount, "thread"), badge: threadCount }] : []),
    { action: "copy", icon: Link2, label: t.actLink, title: t.copyPart },
  ];
  return actions.map(({ action, icon: Icon, label, title, badge }) => (
    <button key={action} type="button" className="lx-actbar__action" title={title} onClick={() => onAction(action, block)}>
      <span className="lx-actbar__icon" aria-hidden><Icon size={18} strokeWidth={1.9} />{badge ? <span className="lx-actbar__badge">{badge}</span> : null}</span>
      <span>{label}</span>
    </button>
  ));
}

/** Memoized so lesson updates do not re-render it; `onClick` is a stable callback. */
const ListenButton = memo(function ListenButton({ className, size, pressed, label, title, onClick }: { className: string; size: number; pressed: boolean; label: string; title: string; onClick: () => void }) {
  return (
    <button type="button" className={className} aria-pressed={pressed} title={title} onClick={onClick}>
      <Headphones size={size} aria-hidden /><span>{label}</span>
    </button>
  );
});

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
      <div ref={panel} className="lx-sheet ws-glass" role="dialog" aria-modal="true" tabIndex={-1}>{children}</div>
    </>
  );
}

function SourceSheet({ source, locator, onOpen, onClose, noLink, openLabel }: { source: LessonSource; locator: string; onOpen: () => void; onClose: () => void; noLink: string; openLabel: string }) {
  const bt = useBlockCopy();
  const panel = useModal<HTMLDivElement>({ onClose });
  const Icon = sourceIcon[source.kind];
  return (
    <div className="ws-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="ws-dialog ws-glass" role="dialog" aria-modal="true" aria-label={source.title} tabIndex={-1}>
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

/** Shown instead of a course lesson until the learner starts the course. */
export function LockedCourseLesson({ courseId, title }: { courseId: string; title: string }) {
  const { locale } = useLocale(), ar = locale === "ar";
  return (
    <div className="lx-page lx-page--narrow" style={{ padding: "64px 16px" }}>
      <div className="lx-empty">
        <Lock size={28} aria-hidden />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--on-surface)" }} dir="auto">{title}</h1>
        <p>{ar ? "هذا الدرس جزء من دورة. ابدأ الدورة لفتحه." : "This lesson is part of a course. Start the course to unlock it."}</p>
        <Link className="ws-btn ws-btn--primary" href={`/learn/courses/${encodeURIComponent(courseId)}`}>{ar ? "اذهب إلى الدورة" : "Go to the course"}</Link>
      </div>
    </div>
  );
}
