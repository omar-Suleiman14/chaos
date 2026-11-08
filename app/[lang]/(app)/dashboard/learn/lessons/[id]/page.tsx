"use client";

import { contentDirection } from "@/lib/learn/direction";

import { useStableQueries } from "@/lib/stableQueries";
import dynamic from "next/dynamic";
import styles from "@/components/learn/editor/EditorLayout.module.css";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { LessonDocument } from "@/convex/learnModel";
import { detachSource, parseCitationLocator, replaceBlockCitation, sourceIds, sourceView, useLearnMediaClient, type NativeSource, type NativeCitation } from "@/lib/learn/mediaClient";
import { formatLocator } from "@/lib/learn/chaosDocument";
import { ChevronLeft, Archive, Check, Copy, Download, Eye, FileUp, FolderInput, History, Info, Layers, MoreHorizontal, PanelRight, Printer, RotateCcw, Send, Trash2, Undo2, X } from "lucide-react";
import { WsConfirm, WsMenu, WsTabs } from "@/components/workspace/primitives";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { Select } from "@/components/workspace/Select";
import { CitationDialog, ImageDetailsDialog, type ImageDetails } from "@/components/learn/editor/EditorDialogs";
import type { AssistRequest } from "@/components/learn/editor/LessonEditor";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { focusLessonEnd, focusLessonStart } from "@/components/learn/editor/focusEnd";
import { MetadataPanel } from "@/components/learn/editor/MetadataPanel";
import { LessonCover } from "@/components/learn/editor/PageHeader";
import PracticePanel from "@/components/learn/editor/PracticePanel";
import GlossaryPanel from "@/components/learn/editor/GlossaryPanel";
import PublishDialog from "@/components/learn/editor/PublishDialog";
import SourcesPanel from "@/components/learn/editor/SourcesPanel";
import VersionHistory from "@/components/learn/editor/VersionHistory";
import HandoffDialog, { type HandoffContext } from "@/components/learn/reader/HandoffDialog";
import { UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { ExternalRefLine, LessonStatus, ModerationNotice, ProvenanceLine } from "@/components/learn/ui";
import { hasUnpublishedChanges, useFolders, useLearnActions, useLearnCapabilities, useLearnViewer, useLesson, useCanEditLesson, useLessonRecovery } from "@/lib/learn/data";
import { asBlocks, blockText, walk } from "@/lib/learn/doc";
import { newId } from "@/lib/learn/data";
import { lessonPath } from "@/lib/learn/seo";
import type { HandoffAction } from "@/lib/learn/handoff";
import type { LessonMeta } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { useCopy, useLocale } from "@/lib/i18n";
import { deriveSaveState, hasUnsavedWork, isTransientSaveError, MAX_SAVE_RETRIES, retryDelay, saveStateCopy } from "@/lib/learn/saveState";
import { LessonEditorBoundary } from "@/components/learn/editor/EditorErrorBoundary";
import { announce } from "@/components/learn/editor/announce";
import { describeLosses, downloadText, exportLesson, IMPORT_ACCEPT, IMPORT_MAX_BYTES, importFormatFor, insertImported, parseImport, printHtml, type ExportFormat } from "@/components/learn/editor/transfer";

const LessonEditor = dynamic(() => import("@/components/learn/editor/LessonEditor"), { ssr: false, loading: () => <div className="ws-skeleton ws-skeleton--panel" style={{ height: 360 }} aria-busy="true" /> });

const copy = {
  en: {
    loading: "Opening lesson…", back: "Learn library", titlePh: "Lesson title", descPh: "A one-line summary readers see first (optional)",
    saving: "Saving…", saved: "Saved on this device", savedCloud: "Saved", preview: "Preview", history: "History", publish: "Publish lesson", publishChanges: "Publish changes", published: "Published",
    more: "Lesson actions", discard: "Discard unpublished changes", unpublish: "Unpublish", duplicate: "Duplicate", archive: "Archive", delete: "Delete permanently", move: "Move to folder", noFolder: "No folder",
    panel: "Lesson settings", panelToggle: "Show or hide lesson settings", settingsLabel: "Settings", backCourse: "Course", courses: "Courses", tabs: { details: "Details", sources: "Sources", practice: "Practice", glossary: "Words" },
    discardTitle: "Discard unpublished changes?", discardBody: "Your draft goes back to the published version. This can’t be undone.",
    deleteTitle: "Delete this lesson?", deleteBody: "The lesson, its versions and its discussion are deleted. Saved copies in other people’s libraries stop working. This can’t be undone.",
    unpublishTitle: "Unpublish this lesson?", unpublishBody: "Readers lose access, including through published courses that contain this lesson. It leaves Explore. Your draft and version history stay.",
    publishedToast: (v: number) => `Published version ${v}`, restoredToast: (v: number) => `Version ${v} copied into your draft`, archivedToast: "Lesson archived", unarchivedToast: "Lesson restored", unpublishedToast: "Lesson unpublished", discardedToast: "Draft changes discarded", deletedToast: "Lesson deleted", conflictToast: "Another device changed this lesson", duplicated: "Duplicate created", moved: "Moved",
    tip: "Type / for blocks: headings, lists, tables, images, YouTube, equations, callouts, sources and citations. Select text to format it or ask ChatGPT or Claude about it.",
    cardsCreated: "Flashcards made from your headings", makeCards: "Make flashcards from headings", cardsTitle: (title: string) => `${title} — flashcards`,
    notOwner: "Only the author can edit this lesson.",
    folderMove: "Folder",
    uploading: (n: number) => n === 1 ? "Uploading 1 image to this lesson’s private sources…" : `Uploading ${n} images to this lesson’s private sources…`,
    uploaded: "Image uploaded",
    exportMd: "Export as Markdown", exportHtml: "Export as web page (HTML)", exportText: "Export as plain text", exportJson: "Export Chaos lesson file (JSON)", print: "Print or save as PDF", importFile: "Import from file…",
    exported: "Export downloaded", exportedLossy: (what: string) => `Export downloaded. Not included: ${what}.`,
    imported: (n: number) => n === 1 ? "Imported 1 block" : `Imported ${n} blocks`, importedLossy: (n: number, what: string) => `Imported ${n} blocks. Left out or changed: ${what}.`,
    importNothing: "Nothing in that file could be imported.", importType: "Choose a Markdown (.md), HTML, plain text (.txt) or Chaos lesson (.json) file.",
    importLarge: "That file is larger than 2 MB. Lessons hold at most 300 kB of content; split it into several lessons.",
    popupBlocked: "Your browser blocked the print window. Allow pop-ups for Chaos, then try again.",
    editorWait: "The editor is still opening. Try again in a moment.",
  },
  ar: {
    loading: "جارٍ فتح الدرس…", back: "مكتبة Learn", titlePh: "عنوان الدرس", descPh: "ملخص من سطر يراه القرّاء أولًا (اختياري)",
    saving: "جارٍ الحفظ…", saved: "محفوظ على هذا الجهاز", savedCloud: "محفوظ", preview: "معاينة", history: "السجل", publish: "انشر الدرس", publishChanges: "انشر التعديلات", published: "منشور",
    more: "إجراءات الدرس", discard: "تجاهل التعديلات غير المنشورة", unpublish: "إلغاء النشر", duplicate: "تكرار", archive: "أرشفة", delete: "حذف نهائي", move: "انقل إلى مجلد", noFolder: "بلا مجلد",
    panel: "إعدادات الدرس", panelToggle: "أظهر إعدادات الدرس أو أخفها", settingsLabel: "الإعدادات", backCourse: "الدورة", courses: "الدورات", tabs: { details: "التفاصيل", sources: "المصادر", practice: "التدريب", glossary: "الكلمات" },
    discardTitle: "تجاهل التعديلات غير المنشورة؟", discardBody: "تعود مسودتك إلى النسخة المنشورة. لا يمكن التراجع.",
    deleteTitle: "حذف هذا الدرس؟", deleteBody: "يُحذف الدرس وإصداراته ونقاشه. تتوقف النسخ المحفوظة في مكتبات الآخرين. لا يمكن التراجع.",
    unpublishTitle: "إلغاء نشر هذا الدرس؟", unpublishBody: "يفقد القرّاء الوصول، بما في ذلك من الدورات المنشورة التي تتضمن الدرس. يخرج من الاستكشاف وتبقى المسودة وسجل الإصدارات.",
    publishedToast: (v: number) => `نُشر الإصدار ${v}`, restoredToast: (v: number) => `نُسخ الإصدار ${v} إلى مسودتك`, archivedToast: "أُرشف الدرس", unarchivedToast: "استُعيد الدرس", unpublishedToast: "أُلغي نشر الدرس", discardedToast: "تم تجاهل تغييرات المسودة", deletedToast: "حُذف الدرس", conflictToast: "غيّر جهاز آخر هذا الدرس", duplicated: "أُنشئت نسخة", moved: "نُقل",
    tip: "اكتب / لإضافة كتل: عناوين وقوائم وجداول وصور وYouTube ومعادلات وتنبيهات ومصادر واستشهادات. حدّد نصًا للتنسيق والمساعدة.",
    cardsCreated: "أُنشئت بطاقات من عناوينك", makeCards: "أنشئ بطاقات من العناوين", cardsTitle: (title: string) => `${title} — بطاقات`,
    notOwner: "لا يعدّل هذا الدرس إلا كاتبه.",
    folderMove: "المجلد",
    uploading: (n: number) => n === 1 ? "جارٍ رفع صورة واحدة إلى مصادر الدرس الخاصة…" : `جارٍ رفع ${n} صور إلى مصادر الدرس الخاصة…`,
    uploaded: "رُفعت الصورة",
    exportMd: "تصدير بصيغة Markdown", exportHtml: "تصدير كصفحة ويب (HTML)", exportText: "تصدير كنص عادي", exportJson: "تصدير ملف درس Chaos ‏(JSON)", print: "طباعة أو حفظ PDF", importFile: "استيراد من ملف…",
    exported: "نُزّل الملف المصدَّر", exportedLossy: (what: string) => `نُزّل الملف المصدَّر. لم يُضمَّن: ${what}.`,
    imported: (n: number) => `استُورد ${n} كتلة`, importedLossy: (n: number, what: string) => `استُورد ${n} كتلة. حُذف أو تغيّر: ${what}.`,
    importNothing: "لا يوجد في هذا الملف ما يمكن استيراده.", importType: "اختر ملف Markdown ‏(.md) أو HTML أو نص عادي (.txt) أو ملف درس Chaos ‏(.json).",
    importLarge: "حجم الملف أكبر من 2 ميغابايت. يتسع الدرس لـ 300 كيلوبايت من المحتوى كحد أقصى؛ قسّمه إلى عدة دروس.",
    popupBlocked: "منع المتصفح نافذة الطباعة. اسمح بالنوافذ المنبثقة لـ Chaos ثم حاول مرة أخرى.",
    editorWait: "ما زال المحرر يفتح. حاول بعد لحظة.",
  },
};

type Tab = "details" | "sources" | "practice" | "glossary";
/** When a recovery copy was kept; only called from save paths, never while rendering. */
const timestamp = () => Date.now();
const assistToHandoff: Record<string, HandoffAction> = { explain: "explain", simplify: "simplify", expand: "ask", rewrite: "ask", organize: "ask", example: "example", quiz: "quiz" };

export default function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const viewer = useLearnViewer();
  return <LessonEditorSession key={`${id}:${viewer?.id ?? "loading"}`} id={id} />;
}

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- The settings region delegates Escape from its focusable child controls to close the drawer. */
function LessonEditorSession({ id }: { id: string }) {
  const t = useCopy(copy);
  const router = useRouter();
  const lesson = useLesson(id);
  const canEdit = useCanEditLesson(id);
  const client = useConvex();
  const media = useLearnMediaClient();
  const native = useQuery(api.learnFrontend.editableLesson, canEdit ? { id } : "skip");
  const [editorContent, setEditorContent] = useState<unknown[]>();
  const ids = sourceIds(native?.draft, editorContent);
  const sourceRows = useStableQueries(Object.fromEntries(ids.map(sourceId => [sourceId, { query: api.learnSources.getMetadata, args: { sourceId: sourceId as Id<"learnSources"> } }])));
  const sources = ids.flatMap(sourceId => { const row = sourceRows[sourceId]; return row && !(row instanceof Error) ? [sourceView(row)] : []; });
  const sourceError = ids.find(sourceId => sourceRows[sourceId] === null || sourceRows[sourceId] instanceof Error);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const uploadCountRef = useRef(0);
  const mediaLock = useRef(false);
  const editorRef = useRef<LessonEditorType | null>(null);
  const recovery = useLessonRecovery(id);
  const [retained, setRetained] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [recoveredContent, setRecoveredContent] = useState<unknown[] | null>(null);
  const viewer = useLearnViewer();
  const caps = useLearnCapabilities();
  const actions = useLearnActions();
  const folders = useFolders() ?? [];
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  // Settings live in a drawer so the writing area keeps the full width.
  const [panelOpen, setPanelOpen] = useState(false);
  const courseId = useSearchParams().get("course");
  const [tab, setTab] = useState<Tab>("details");
  const [dialog, setDialog] = useState<null | "publish" | "history" | "discard" | "delete" | "unpublish">(null);
  const [error, setError] = useState("");
  const [image, setImage] = useState<{ blockId: string; editor: LessonEditorType; initial: ImageDetails } | null>(null);
  const [cite, setCite] = useState<{ blockId: string; previous?: NativeCitation; initial?: { sourceId: string; locator: string } } | null>(null);
  const [handoff, setHandoff] = useState<HandoffContext | null>(null);
  const [title, setTitle] = useState<string>();
  /** Cover edits, shown at once and saved with the rest of the metadata. */
  const [look, setLook] = useState<Partial<LessonMeta>>({});
  const [description, setDescription] = useState<string>();
  const pending = useRef<{ content?: unknown[]; meta?: Partial<LessonMeta>; timer?: ReturnType<typeof setTimeout> }>({});
  const [pendingView, setPendingView] = useState<{ content?: unknown[]; meta?: Partial<LessonMeta> }>({});
  const actionRef = useRef(actions);
  useEffect(() => { actionRef.current = actions; }, [actions]);
  const flushTail = useRef<Promise<void>>(Promise.resolve());
  const say = (text: string) => toast.success(text);
  const sc = useCopy(saveStateCopy);
  const { locale } = useLocale();
  // Offline writes are not attempted; the pending copy (and browser recovery) waits for the connection.
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [retrying, setRetrying] = useState(false);
  const retry = useRef<{ attempt: number; timer?: ReturnType<typeof setTimeout> }>({ attempt: 0 });
  const waitingOnline = useRef(false);
  /** The last content the server accepted, to skip writes that would store the same thing again. */
  const lastSavedContent = useRef<string | undefined>(undefined);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => () => { if (retry.current.timer) clearTimeout(retry.current.timer); }, []);
  // A remounted editor (reload, restore, recovery) starts from server state again.
  useEffect(() => { lastSavedContent.current = undefined; }, [editorKey]);
  const saveState = deriveSaveState({ pending: !!(pendingView.content || pendingView.meta), saving, online, conflict, error: !!error, retrying });
  const unsavedWork = hasUnsavedWork(saveState);
  // Closing the tab or reloading with unsaved work asks first. In-app navigation flushes on unmount.
  useEffect(() => {
    if (!unsavedWork) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsavedWork]);

  useEffect(() => {
    if (lesson && title === undefined) { setTitle(lesson.draft.meta.title); setDescription(lesson.draft.meta.description); }
  }, [lesson, title]);
  useEffect(() => {
    if (!viewer?.signedIn) return;
    try { setRetained(localStorage.getItem("chaos-learn-unsaved:" + viewer.id + ":" + id)); } catch { /* Browser recovery can be unavailable. */ }
  }, [viewer?.id, viewer?.signedIn, id]);
  // Flush a pending save when leaving the page.
  useEffect(() => () => {
    const p = pending.current;
    if (p.timer) clearTimeout(p.timer);
    // Retained browser content is the fallback if navigation interrupts these writes.
    const content = p.content, meta = p.meta;
    const leavingActions = actionRef.current;
    void flushTail.current.catch(() => undefined).then(async () => {
      if (content) await leavingActions.saveDraftContent(id, content);
      if (meta) await leavingActions.saveDraftMeta(id, meta);
    }).catch(() => undefined);
  }, [id]);

  if (lesson === undefined || viewer === undefined || canEdit === undefined) return <PageSkeleton label={t.loading} />;
  if (lesson === null) return <UnavailableLesson backHref="/dashboard/learn/library" />;
  if (!canEdit) {
    return <div className="lx-page lx-page--narrow"><p className="lx-notice">{t.notOwner}</p><Link className="ws-btn" href={lessonPath(lesson.id)}>{t.preview}</Link></div>;
  }

  const isOwner = lesson.ownerId === viewer.id;
  const recoveryKey = "chaos-learn-unsaved:" + viewer.id + ":" + id;
  const run = async (fn: () => unknown | Promise<unknown>) => {
    setError("");
    try { await fn(); return true; } catch (err) {
      const data = err && typeof err === "object" && "data" in err ? err.data as { code?: string; currentRevision?: number } : undefined;
      const stale = data?.code === "REVISION_CONFLICT";
      setConflict(stale);
      const message = stale ? "Another device saved a newer revision (" + data?.currentRevision + "). This editor has stopped writes. Compare your retained draft with server recovery before reloading." : errorMessage(err);
      // The recovery panel stays under the header; the toast makes sure the failure is noticed.
      setError(message);
      toast.error(stale ? t.conflictToast : err, { id: "lesson-editor" });
      try { setRetained(localStorage.getItem(recoveryKey) ?? JSON.stringify({ content: pending.current.content, meta: pending.current.meta })); } catch { setRetained(JSON.stringify(pending.current)); }
      return false;
    }
  };
  const retain = () => { if (!pending.current.content && !pending.current.meta) return; try { localStorage.setItem(recoveryKey, JSON.stringify({ content: pending.current.content, meta: pending.current.meta, savedAt: timestamp() })); } catch { /* Keep the pending in-memory copy when browser storage is unavailable. */ } };
  const flush = () => {
    const next = flushTail.current.catch(() => undefined).then(async () => {
    const p = pending.current;
    if (p.timer) { clearTimeout(p.timer); p.timer = undefined; }
    const content = p.content, meta = p.meta;
    if (uploadCountRef.current) throw new Error("Wait for the image upload before saving or publishing.");
    if (!content && !meta) return;
    setSaving(true); retain();
    try {
      const json = content && JSON.stringify(content);
      if (content && json !== lastSavedContent.current) { await actions.saveDraftContent(lesson.id, content); lastSavedContent.current = json; }
      if (meta) await actions.saveDraftMeta(lesson.id, meta);
      if (p.content === content) p.content = undefined;
      if (p.meta === meta) p.meta = undefined;
      if (!p.content && !p.meta) { try { localStorage.removeItem(recoveryKey); } catch { /* Successful server writes do not depend on browser storage. */ } setRetained(null); }
    } finally { setPendingView({ content: p.content, meta: p.meta }); setSaving(false); }
    });
    flushTail.current = next;
    return next;
  };
  const schedule = () => {
    const p = pending.current;
    if (p.timer) clearTimeout(p.timer);
    setPendingView({ content: p.content, meta: p.meta });
    setSaving(true); retain();
    if (!conflict) p.timer = setTimeout(() => { p.timer = undefined; void autosave(); }, 600);
  };
  /** Debounced save with retries for transient failures (1 s, 2 s, 4 s, 8 s); offline waits for "online". */
  const autosave = async () => {
    if (retry.current.timer) { clearTimeout(retry.current.timer); retry.current.timer = undefined; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      retain(); setSaving(false);
      // Back online: save what waited, at once.
      if (!waitingOnline.current) { waitingOnline.current = true; window.addEventListener("online", () => { waitingOnline.current = false; void autosave(); }, { once: true }); }
      return;
    }
    try {
      await flush();
      retry.current.attempt = 0;
      setRetrying(false);
      setError("");
    } catch (err) {
      if (isTransientSaveError(err) && retry.current.attempt < MAX_SAVE_RETRIES) {
        retry.current.attempt++;
        setRetrying(true); retain();
        retry.current.timer = setTimeout(() => { void autosave(); }, retryDelay(retry.current.attempt));
        return;
      }
      retry.current.attempt = 0;
      setRetrying(false);
      await run(() => { throw err; });
    }
  };

  const saveMeta = (patch: Partial<LessonMeta>) => { pending.current.meta = { ...pending.current.meta, ...patch }; schedule(); };
  const saveLook = (patch: Partial<LessonMeta>) => { setLook((current) => ({ ...current, ...patch })); saveMeta(patch); };
  const onContent = (content: unknown[]) => { setEditorContent(content); pending.current.content = structuredClone(content); schedule(); };
  const nativeEdit = async (change: (row: Doc<"lessons">) => Promise<LessonDocument>) => {
    if (mediaLock.current || conflict) throw new Error("Reload the conflicted draft before editing its sources or citations.");
    mediaLock.current = true; setMediaBusy(true);
    try {
      await flush();
      while (pending.current.content || pending.current.meta) await flush();
      // Check the durable client's existing revision before native block mutations;
      // querying a fresh row alone would silently adopt another device's writes.
      const checkpoint = await actions.saveDraftMeta(lesson.id, {});
      const row = await client.query(api.learnFrontend.editableLesson, { id: lesson.id });
      if (!row) throw new Error("Lesson is no longer editable.");
      if (row.revision !== checkpoint) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: row.revision, message: "Another device changed the draft during the media edit." });
      await media.saveDocument(row, await change(row));
      const updated = await actions.reloadDraft(lesson.id);
      setRecoveredContent(updated.draft.content); setEditorContent(updated.draft.content);
      setEditorKey(k => k + 1);
    } catch (err) { await run(() => { throw err; }); throw err; }
    finally { mediaLock.current = false; setMediaBusy(false); }
  };
  const saveSource = (source: NativeSource, file?: File) => nativeEdit(async row => {
    const saved = await media.saveSource(source, file);
    if (sourceIds(row.draft).includes(saved.id)) return row.draft;
    return { ...row.draft, blocks: [...row.draft.blocks, { id: crypto.randomUUID(), type: "source", sourceId: saved.id as Id<"learnSources">, label: saved.title, citations: [], conceptIds: [] }] };
  });
  const uploadImage = async (file: File) => {
    if (conflict || mediaLock.current) throw new Error("Reload the draft before uploading an image.");
    uploadCountRef.current++; setUploadCount(uploadCountRef.current);
    try { const reference = await media.upload(file); announce(t.uploaded); return reference; }
    finally { uploadCountRef.current--; setUploadCount(uploadCountRef.current); }
  };
  const editorLesson = { ...lesson, sources, draft: { ...lesson.draft, content: editorContent ?? recoveredContent ?? lesson.draft.content, meta: { ...lesson.draft.meta, ...pendingView.meta, title: title ?? lesson.draft.meta.title, description: description ?? lesson.draft.meta.description } } };
  const changes = hasUnpublishedChanges(lesson);
  const sourceTitle = (sourceId: string) => sources.find((s) => s.id === sourceId)?.title;
  const runExport = (format: ExportFormat | "print") => run(() => {
    const editor = editorRef.current;
    if (!editor) throw new Error(t.editorWait);
    const meta = { title: title ?? lesson.draft.meta.title, description: description ?? lesson.draft.meta.description, language: lesson.draft.meta.language, dir: contentDirection(lesson.draft.meta.language) };
    const result = exportLesson(editor, format === "print" ? "html" : format, meta, { sourceTitle });
    if (format === "print") { if (!printHtml(result.content)) throw new Error(t.popupBlocked); }
    else downloadText(result.content, meta.title || "lesson", result.extension, result.mime);
    const lost = describeLosses(result.lost, locale === "ar" ? "ar" : "en");
    if (lost) toast(t.exportedLossy(lost), { id: "lesson-export" }); else if (format !== "print") say(t.exported);
  });
  const runImport = (file: File) => run(async () => {
    const editor = editorRef.current;
    if (!editor) throw new Error(t.editorWait);
    const format = importFormatFor(file.name, file.type);
    if (!format) throw new Error(t.importType);
    if (file.size > IMPORT_MAX_BYTES) throw new Error(t.importLarge);
    const result = await parseImport(editor, await file.text(), format);
    if (!result.blocks.length) throw new Error(t.importNothing);
    insertImported(editor, result.blocks);
    editor.focus();
    const lost = describeLosses(result.lost, locale === "ar" ? "ar" : "en");
    if (lost) toast(t.importedLossy(result.blocks.length, lost), { id: "lesson-import" }); else say(t.imported(result.blocks.length));
  });

  // Chaos runs no AI: a selection goes to the writer's own ChatGPT or Claude with the lesson as context.
  const runAssist = (request: AssistRequest) => {
    setHandoff({ lessonTitle: lesson.draft.meta.title, selection: request.text, action: assistToHandoff[request.action] ?? "ask", section: sectionOf(request.blockIds[0]) });
  };
  const sectionOf = (blockId?: string) => {
    let heading: string | undefined;
    for (const { block } of walk(asBlocks(editorRef.current?.document ?? lesson.draft.content))) { if (block.type === "heading") heading = blockText(block); if (block.id === blockId) break; }
    return heading;
  };
  const makeFlashcards = () => run(async () => {
    await flush();
    // Plain, predictable: each heading becomes a card whose back is the text under it.
    const cards: { id: string; front: string; back: string; blockId?: string }[] = [];
    let current: { id: string; front: string; back: string; blockId?: string } | null = null;
    for (const { block } of walk(asBlocks(editorRef.current?.document ?? lesson.draft.content))) {
      if (block.type === "heading") { current = { id: newId("card"), front: blockText(block).slice(0, 2000), back: "", blockId: block.id }; cards.push(current); }
      else if (current && current.back.length < 600) { const text = blockText(block); if (text) current.back = `${current.back}\n${text}`.trim().slice(0, 600); }
    }
    const id = await actions.createFlashcardSet({ title: t.cardsTitle(lesson.draft.meta.title || "Lesson"), cards: cards.filter((c) => c.front && c.back) });
    const editor = editorRef.current;
    if (editor) {
      editor.insertBlocks([{ type: "lessonFlashcards", props: { setId: id } }], editor.getTextCursorPosition().block, "after");
      await flush();
      editor.focus();
    }
    say(t.cardsCreated);
  });

  return (
    <div className={`lx-edit ${styles.layout}`}>
      <div className="lx-edit__bar">
        <Link href={courseId && /^[a-z0-9]+$/i.test(courseId) ? `/dashboard/courses/${courseId}` : "/dashboard?tab=courses"} className="ws-btn ws-btn--sm ws-btn--ghost" aria-label={t.back}><ChevronLeft size={18} strokeWidth={2} className="lx-flip lx-back-chevron" aria-hidden /><span className="lx-phone-label">{courseId ? t.backCourse : t.courses}</span></Link>
        <LessonStatus lesson={lesson} />
        <output className="lx-save" data-state={saveState} aria-live="polite">{saveState === "saved" ? <><Check size={13} aria-hidden />{caps.sharedPublishing ? t.savedCloud : t.saved}</> : sc[saveState]}</output>
        <span style={{ flex: 1 }} />
        <Link href={`${lessonPath(lesson.id)}?preview=draft`} className="ws-btn ws-btn--sm ws-btn--ghost" onClick={(e) => { e.preventDefault(); void run(async () => { await flush(); router.push(`${lessonPath(lesson.id)}?preview=draft`); }); }}><Eye size={15} aria-hidden /><span className="lx-phone-label">{t.preview}</span></Link>
        <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => void run(async () => { await flush(); setDialog("history"); })}><History size={15} aria-hidden /><span className="lx-phone-label">{t.history}</span></button>
        <button type="button" className="ws-btn ws-btn--sm ws-btn--primary" disabled={!isOwner || conflict || mediaBusy || uploadCount > 0} onClick={() => void run(async () => { await flush(); setDialog("publish"); })}>
          <Send size={15} aria-hidden />{!lesson.published ? t.publish : changes ? t.publishChanges : t.published}
        </button>
        <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" aria-pressed={panelOpen} aria-expanded={panelOpen} aria-controls="lesson-settings" aria-label={t.panelToggle} onClick={() => setPanelOpen((o) => !o)}><PanelRight size={15} className="lx-flip" aria-hidden /><span className="lx-phone-label">{t.settingsLabel}</span></button>
        <WsMenu label={t.more} trigger={<MoreHorizontal size={18} />}>
          {(close) => (
            <>
              {lesson.published && changes && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog("discard"); }}><Undo2 size={15} />{t.discard}</button>}
              {lesson.published && <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog("unpublish"); }}><RotateCcw size={15} />{t.unpublish}</button>}
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); run(async () => { await flush(); const copyId = await actions.duplicateLesson(lesson.id); say(t.duplicated); router.push(`/dashboard/learn/lessons/${copyId}`); }); }}><Copy size={15} />{t.duplicate}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); makeFlashcards(); }}><Layers size={15} />{t.makeCards}</button>
              <button role="menuitem" className="ws-menu__row" disabled={conflict || mediaBusy} onClick={() => { close(); importInput.current?.click(); }}><FileUp size={15} />{t.importFile}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void runExport("markdown"); }}><Download size={15} />{t.exportMd}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void runExport("html"); }}><Download size={15} />{t.exportHtml}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void runExport("text"); }}><Download size={15} />{t.exportText}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void runExport("json"); }}><Download size={15} />{t.exportJson}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); void runExport("print"); }}><Printer size={15} />{t.print}</button>
              <button role="menuitem" className="ws-menu__row" onClick={() => { close(); run(async () => { await flush(); await actions.archiveLesson(lesson.id); toast(t.archivedToast, { undo: () => { void run(async () => { await actions.archiveLesson(lesson.id, false); toast.success(t.unarchivedToast); }); } }); router.push("/dashboard/learn/library"); }); }}><Archive size={15} />{t.archive}</button>
              <button role="menuitem" className="ws-menu__row ws-menu__danger" onClick={() => { close(); setDialog("delete"); }}><Trash2 size={15} />{t.delete}</button>
            </>
          )}
        </WsMenu>
        <input ref={importInput} type="file" accept={IMPORT_ACCEPT} hidden aria-hidden tabIndex={-1}
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void runImport(file); }} />
      </div>
      {(error || conflict || retained) && <section className={styles.recovery} aria-label="Draft recovery">
        {error && <p className="lx-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        {error && <button type="button" className="ws-btn ws-btn--sm" onClick={() => void run(async () => {
          if (pending.current.timer) clearTimeout(pending.current.timer);
          await flushTail.current.catch(() => undefined);
          retain();
          const latest = await actions.reloadDraft(lesson.id);
          pending.current = {};
          setRecoveredContent(latest.draft.content); setEditorContent(latest.draft.content);
          setTitle(latest.draft.meta.title); setLook({});
          setDescription(latest.draft.meta.description);
          setConflict(false);
          setSaving(false);
          try { setRetained(localStorage.getItem(recoveryKey)); } catch { /* In-memory recovery remains available. */ }
          setEditorKey(k => k + 1);
        })}>Reload server draft; keep retained copy</button>}
        {retained && <details className="lx-notice"><summary>Retained unsaved draft</summary><button type="button" className="ws-btn ws-btn--sm" disabled={conflict} onClick={() => { try { const saved = JSON.parse(retained); if (Array.isArray(saved.content)) { setRecoveredContent(saved.content); setEditorContent(saved.content); pending.current.content = saved.content; setEditorKey(k => k + 1); } if (saved.meta) { pending.current.meta = saved.meta; if (saved.meta.title !== undefined) setTitle(saved.meta.title); if (saved.meta.description !== undefined) setDescription(saved.meta.description); } } catch (err) { setError(errorMessage(err)); } }}>Open retained draft for review</button><button type="button" className="ws-btn ws-btn--sm" disabled={conflict} onClick={() => void run(flush)}>Save reviewed draft</button><pre style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{retained}</pre></details>}
        {(conflict || !!error) && recovery && recovery.length > 0 && <details className="lx-notice"><summary>Server recovery revisions</summary>{recovery?.map(row => <details key={row._id}><summary>Revision {row.revision} ? {row.metadata.title}</summary><button type="button" className="ws-btn ws-btn--sm" disabled={conflict} onClick={() => void run(async () => { await flush(); const restored = await actions.recoverDraft(lesson.id, row._id); setRecoveredContent(restored.draft.content); setEditorContent(restored.draft.content); setTitle(restored.draft.meta.title); setLook({}); setDescription(restored.draft.meta.description); setEditorKey(k => k + 1); })}>Restore this revision to draft</button><pre style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify({ metadata: row.metadata, document: row.document }, null, 2)}</pre></details>)}</details>}

      </section>}
      {sourceError && <p className="lx-error" role="alert">Source {sourceError} is unavailable or its metadata access was revoked. Its stable reference remains in the draft.</p>}
      {uploadCount > 0 && <output className="lx-help" aria-live="polite">{t.uploading(uploadCount)}</output>}

      <LessonCover id={lesson.id} meta={{ ...lesson.draft.meta, ...look }} editable={!conflict} onChange={saveLook} />
      <div className="lx-edit__body" data-panel={panelOpen ? "open" : "closed"}
        onPointerDown={event => { if (event.button === 0 && event.target === event.currentTarget && editorRef.current) { event.preventDefault(); focusLessonEnd(editorRef.current); } }}>
        <div className="lx-edit__doc" dir={contentDirection(lesson.draft.meta.language)} lang={lesson.draft.meta.language}
          onPointerDown={event => { if (event.button === 0 && event.target === event.currentTarget && editorRef.current) { event.preventDefault(); focusLessonEnd(editorRef.current); } }}>
          <ModerationNotice state={lesson.moderation} note={lesson.moderationNote} owner />
          {(lesson.forkedFrom || lesson.externalRef) && (
            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {lesson.forkedFrom && <ProvenanceLine provenance={lesson.forkedFrom} hrefFor={lessonPath} />}
              {lesson.externalRef && <ExternalRefLine externalRef={lesson.externalRef} />}
            </div>
          )}
          <textarea className="lx-title-input" rows={1} value={title ?? ""} placeholder={t.titlePh} aria-label={t.titlePh} maxLength={200}
            onChange={(e) => { setTitle(e.target.value.replace(/\n/g, " ")); saveMeta({ title: e.target.value.replace(/\n/g, " ") }); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); focusLessonStart(editorRef.current); } }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }} />
          <textarea className="lx-desc-input" rows={1} value={description ?? ""} placeholder={t.descPh} aria-label={t.descPh} maxLength={400}
            onChange={(e) => { setDescription(e.target.value); saveMeta({ description: e.target.value }); }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }} />
          <LessonEditorBoundary onReopen={() => { const latest = pending.current.content ?? editorContent; if (latest) setRecoveredContent(latest); setEditorKey(k => k + 1); }}>
          <LessonEditor key={`${lesson.id}-${editorKey}`} initialContent={asBlocks(recoveredContent ?? lesson.draft.content)} language={lesson.draft.meta.language} sources={sources}
            editable={!mediaBusy && !conflict} uploadFile={uploadImage} resolveFileUrl={async reference => { try { return await media.resolve(reference); } catch (err) { setError(errorMessage(err)); throw err; } }} onReady={editor => { editorRef.current = editor; }}
            onChange={onContent}
            onManageSources={() => { setPanelOpen(true); setTab("sources"); }}
            onEditImage={(blockId, editor) => {
              const block = editor.getBlock(blockId);
              if (!block || block.type !== "image") return;
              const p = block.props;
              setImage({ blockId, editor, initial: { alt: p.alt, caption: p.caption, credit: p.credit, creditUrl: p.creditUrl, figureKind: p.figureKind } });
            }}
            onEditCitation={(blockId, initial, done) => {
              if (done || (initial && !blockId)) { setError("Exact inline citation positions are not supported by the Chaos schema. This inline content was not changed."); return; }
              const target = blockId ?? editorRef.current?.getTextCursorPosition().block.id;
              if (!target) { setError("Choose a stable block to cite."); return; }
              setCite({ blockId: target, initial });
            }}
            onAssist={(request) => runAssist(request)}
            onUploadError={setError} />
          </LessonEditorBoundary>
          <p className="lx-muted" style={{ marginTop: 24, paddingInline: 8 }}><Info size={13} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.tip}</p>
        </div>

        {panelOpen && (
          <aside id="lesson-settings" className="lx-edit__side" aria-label={t.panel} onKeyDown={(e) => { if (e.key === "Escape") setPanelOpen(false); }}>
            <div className="lx-edit__side-head"><strong>{t.panel}</strong><button type="button" className="ws-icon-button" aria-label={t.panelToggle} onClick={() => setPanelOpen(false)}><X size={16} aria-hidden /></button></div>
            <WsTabs tabs={["details", "sources", "practice", "glossary"] as const} value={tab} onChange={setTab} label={t.panel} labels={{ details: t.tabs.details, sources: `${t.tabs.sources}${lesson.sources.length ? ` (${lesson.sources.length})` : ""}`, practice: `${t.tabs.practice}${lesson.quizzes.length ? ` (${lesson.quizzes.length})` : ""}`, glossary: t.tabs.glossary }} />
            {tab === "details" && (
              <>
                <MetadataPanel meta={editorLesson.draft.meta} onChange={saveMeta} lessonId={lesson.id} content={editorLesson.draft.content} isOwner={isOwner} disabled={mediaBusy || conflict || uploadCount > 0} beforeMapping={async () => { if (conflict) throw new Error("Reload the draft first."); await flush(); }} />
                <label className="lx-field"><span><FolderInput size={13} aria-hidden /> {t.folderMove}</span>
                  <Select label={t.move} value={lesson.folderId ?? ""} onChange={(v) => run(() => { actions.moveLesson(lesson.id, v || undefined); say(t.moved); })}
                    options={[{ value: "", label: t.noFolder }, ...folders.filter((f) => !f.archived).map((f) => ({ value: f.id, label: f.name }))]} />
                </label>
              </>
            )}
            {tab === "sources" && <SourcesPanel sources={sources} content={editorLesson.draft.content} disabled={mediaBusy || conflict || uploadCount > 0} onSave={saveSource}
              onRemove={sourceId => nativeEdit(async row => detachSource(row.draft, sourceId))}
              onOpen={async source => { const tab = window.open("about:blank", "_blank"); if (tab) tab.opener = null; try { const url = await media.resolve(source.fileId!); if (tab) tab.location.href = url; } catch (err) { tab?.close(); throw err; } }}
              blockCitations={(native?.draft.blocks ?? []).flatMap(block => block.citations.map(citation => ({ blockId: block.id, citation })))}
              onEditCitation={(blockId, previous) => setCite({ blockId, previous, initial: { sourceId: previous.sourceId, locator: formatLocator(previous.locator) } })} />}
            {tab === "glossary" && <GlossaryPanel lessonId={lesson.id} />}
            {tab === "practice" && <PracticePanel lessonId={lesson.id} quizzes={lesson.quizzes} onChange={(quizzes) => run(() => actions.setQuizzes(lesson.id, quizzes))} onCreateCards={makeFlashcards} onInsertFlashcards={setId => { const editor = editorRef.current; if (!editor) return; editor.insertBlocks([{ type: "lessonFlashcards", props: { setId } }], editor.getTextCursorPosition().block, "after"); editor.focus(); }} onInsertQuiz={assetId => { const editor = editorRef.current; if (!editor) return; editor.insertBlocks([{ type: "lessonQuiz", props: { assetKind: "form", assetId } }], editor.getTextCursorPosition().block, "after"); editor.focus(); }} />}
          </aside>
        )}
      </div>

      {dialog === "publish" && <PublishDialog lesson={editorLesson} inCourse={!!courseId} sources={sources} error={error} disabled={conflict || mediaBusy || uploadCount > 0 || ids.some(sourceId => sourceRows[sourceId] === undefined)} onClose={() => setDialog(null)} onPublish={({ visibility, teamId, indexing, note }) => run(async () => {
        await flush();
        actions.setVisibility(lesson.id, visibility, teamId);
        await actions.saveDraftMeta(lesson.id, { indexing });
        actions.setVisibility(lesson.id, visibility, teamId);
        const v = await actions.publish(lesson.id, note);
        setDialog(null);
        say(t.publishedToast(v));
      })} />}
      {dialog === "history" && <VersionHistory lesson={editorLesson} error={error} disabled={conflict || mediaBusy || uploadCount > 0} onClose={() => setDialog(null)} onRestore={(v) => run(async () => { await flush(); await actions.restoreVersion(lesson.id, v); const restored = await actions.reloadDraft(lesson.id); setRecoveredContent(restored.draft.content); setEditorContent(restored.draft.content); setTitle(restored.draft.meta.title); setLook({}); setDescription(restored.draft.meta.description); setDialog(null); setEditorKey((k) => k + 1); say(t.restoredToast(v)); })} />}
      {dialog === "discard" && <WsConfirm title={t.discardTitle} body={t.discardBody} confirmLabel={t.discard} onClose={() => setDialog(null)} onConfirm={() => run(async () => { await flush(); await actions.discardDraft(lesson.id); const restored = await actions.reloadDraft(lesson.id); setRecoveredContent(restored.draft.content); setTitle(restored.draft.meta.title); setLook({}); setDescription(restored.draft.meta.description); setEditorKey((k) => k + 1); toast.success(t.discardedToast); })} />}
      {dialog === "unpublish" && <WsConfirm title={t.unpublishTitle} body={t.unpublishBody} confirmLabel={t.unpublish} onClose={() => setDialog(null)} onConfirm={() => run(async () => { await actions.unpublish(lesson.id); toast.success(t.unpublishedToast); })} />}
      {dialog === "delete" && <WsConfirm title={t.deleteTitle} body={t.deleteBody} confirmLabel={t.delete} onClose={() => setDialog(null)} onConfirm={() => run(async () => { await actions.deleteLesson(lesson.id); toast.success(t.deletedToast); router.push("/dashboard/learn/library"); })} />}
      {image && <ImageDetailsDialog initial={image.initial} onClose={() => setImage(null)} onSave={(value) => { image.editor.updateBlock(image.blockId, { props: value }); setImage(null); }} />}
      {cite && <CitationDialog sources={sources} initial={cite.initial} onClose={() => setCite(null)} onManageSources={() => { setPanelOpen(true); setTab("sources"); }} onDone={async value => {
        await nativeEdit(async row => replaceBlockCitation(row.draft, cite.blockId, { sourceId: value.sourceId as Id<"learnSources">, locator: parseCitationLocator(value.locator) }, cite.previous));
        setCite(null);
      }} />}
      {handoff && <HandoffDialog input={handoff} onClose={() => setHandoff(null)} />}
    </div>
  );
}
/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions */
