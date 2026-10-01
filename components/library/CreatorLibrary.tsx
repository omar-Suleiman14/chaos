"use client";

import CoursesHub from "@/components/courses/CoursesHub";
import GamesHub from "@/components/live/GamesHub";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { formIntentHandlers, useQuery } from "@/lib/convexCache";
import { deleteFormLocally, setFormStatusLocally, useOptimisticMutation } from "@/lib/optimistic";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, BarChart3, BookOpen, Check, ChevronDown, Copy, ExternalLink, FileUp, Globe, FileText, GraduationCap, LayoutGrid, LayoutTemplate, List, ListFilter, Lock, Pencil, Plus, Radio, Search, Trash2, Trophy, X, Pin, PinOff } from "lucide-react";
import { useHostLive } from "@/components/live/HostLiveButton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import LoadingState from "@/components/LoadingState";
import type { FormTheme, Presentation } from "@/convex/formLogic";
import type { ImportResult } from "@/lib/formImporters";
import { errorMessage } from "@/lib/errors";
import { formatNumber, pluralForm, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import StatusBadge from "@/components/forms/StatusBadge";
import FormThumb from "./FormThumb";
import dynamic from "next/dynamic";

// Spreadsheet parsing loads only when someone opens that import mode.
const SheetImport = dynamic(() => import("@/components/forms/SheetImport"));
import { WsDialog, WsMenu, WsTabs, WsUndoToast } from "@/components/workspace/primitives";
import { LibrarySkeleton } from "@/components/workspace/Skeletons";
import type { UndoToast } from "@/components/workspace/primitives";
import { usePinned } from "@/components/workspace/usePinned";
import { useCreateForm } from "@/components/workspace/useCreateForm";

const kinds = ["Forms", "Quizzes", "Courses", "Games"] as const;
type Kind = (typeof kinds)[number];
/** The open tab lives in the address (?tab=games) so links, Back and refresh keep it. */
const kindFromParam = (value: string | null): Kind => kinds.find((k) => k.toLowerCase() === value) ?? "Forms";
type Status = "live" | "draft" | "closed" | "archived";
const statusOptions: { id: Status }[] = [{ id: "live" }, { id: "draft" }, { id: "closed" }];
type SortKey = "edited" | "name" | "responses" | "status";
type SortDir = "asc" | "desc";
const sortOptions: { id: SortKey }[] = [{ id: "edited" }, { id: "name" }, { id: "responses" }, { id: "status" }];
/** The direction a column starts in: newest, most and A→Z first. */
const naturalDir: Record<SortKey, SortDir> = { edited: "desc", responses: "desc", name: "asc", status: "asc" };
/** Internal marker for the group of forms other people shared; shown as "Shared with you". */
const SHARED_GROUP = "Shared with you";
const statusOrder: Record<Status, number> = { live: 0, draft: 1, closed: 2, archived: 3 };

const copy = {
  en: {
    kinds: { Forms: "Forms", Quizzes: "Quizzes", Courses: "Courses", Games: "Games" },
    status_: { live: "Live", draft: "Draft", closed: "Closed", archived: "Archived" },
    sort_: { edited: "Last edited", name: "Name", responses: "Most responses", status: "Status" },
    colName: "Name", colStatus: "Status", colResponses: "Responses", colEdited: "Edited", colActions: "Actions",
    untitledQuiz: "Untitled quiz", untitledForm: "Untitled form", untitled: "Untitled",
    responseCount: (n: number) => `${n} response${n === 1 ? "" : "s"}`,
    playCount: (n: number) => `${n} play${n === 1 ? "" : "s"}`,
    sharedMeta: (owner: string, canEdit: boolean) => `${owner} · you can ${canEdit ? "edit" : "view"}`,
    sharedGroup: "Shared with you", ungrouped: "Ungrouped",
    approvalNote: "Waiting for your approval to publish",
    clipboardUnavailable: "Clipboard is unavailable in this browser.", copyFailed: "Could not copy the link. Please try again.", linkCopied: "Link copied",
    archived: (title: string) => `Archived “${title}”`, restored: (title: string) => `Restored “${title}”`, findInArchive: "Find it in Archive in the sidebar", deleted: "Deleted",
    open: "Open", results: "Results", viewLive: "View live", copyLink: "Copy link", unpin: "Unpin from sidebar", pin: "Pin to sidebar",
    duplicate: "Duplicate", unpublish: "Unpublish", publish: "Publish", archive: "Archive", delete: "Delete",
    oldQuiz: "Old quiz", quiz: "Quiz", form: "Form",
    games: "Games", library: "Library", newCourse: "New course", creating: "Creating…", newLabel: "New", moreWays: "More ways to start", blank: "Blank", fromTemplate: "From a template", import: "Import",
    dismissError: "Dismiss error", filterLibrary: "Filter library", searchLibrary: "Search library", search: "Search",
    filterByStatus: "Filter by status", status: "Status", clearFilter: "Clear filter", sort: "Sort", viewOptions: "View options", gallery: "Gallery", list: "List",
    loadingLibrary: "Loading library...", nothingMatches: "Nothing matches", createFirst: "Create your first form",
    tryAnother: "Try another name, or clear the search and filter.", startBlank: "Start with a blank page or a ready-made template.", templates: "Templates",
    actionsFor: (title: string) => `Actions for ${title}`,
    templatesTitle: "Start from a template", templatesDesc: "Templates open as drafts you can change.",
    loadingTemplates: "Loading templates...", fields: (n: number) => `${n} field${n === 1 ? "" : "s"}`, yourTemplate: "Your template", use: "Use",
    deleteTemplate: (name: string) => `Delete template ${name}`,
    importTitle: "Import a form", importDesc: "Imports become drafts for you to review; nothing is published.",
    deleteTitle: (title: string) => `Delete “${title}”?`,
    deleteLegacy: (responses: number, questions: number) => `Its ${questions} question${questions === 1 ? "" : "s"} and ${responses} response${responses === 1 ? "" : "s"} with their scores will be deleted. This cannot be undone.`,
    counting: "Counting responses…",
    deleteForm: (n: number) => `Its ${n} response${n === 1 ? "" : "s"}, uploads and history will be deleted. This cannot be undone. Archive it from its settings instead to keep the data.`,
    cancel: "Cancel", deleteForever: "Delete permanently",
    sourceChaos: "Chaos export", sourceText: "Pasted questions", sourceSheet: "Spreadsheet", modeExport: "Form export or text", modeSheet: "Questions from CSV or Excel",
    importFailed: "This file could not be read.", fileTooBig: "Files can be at most 2 MB.",
    importHelp: "Upload a Chaos, Typeform or Google Forms export, or paste questions: one per paragraph, options starting with “-”, “*” for required.",
    chooseFile: "Choose file", orPaste: "Or paste", sample: "# Event feedback\n\nHow did you hear about us? *\n- Friend\n- Social media\n- Other\n\nAny comments?",
    preview: "Preview", fieldsCount: (n: number) => `${n} fields`, textBlock: "Text block", options: (n: number) => `${n} options`, required: "required", createDraft: "Create draft",
  },
  ar: {
    kinds: { Forms: "النماذج", Quizzes: "الاختبارات", Courses: "الدورات", Games: "الألعاب" },
    status_: { live: "منشور", draft: "مسودة", closed: "مغلق", archived: "مؤرشف" },
    sort_: { edited: "آخر تعديل", name: "الاسم", responses: "الأكثر ردودًا", status: "الحالة" },
    colName: "الاسم", colStatus: "الحالة", colResponses: "الردود", colEdited: "آخر تعديل", colActions: "الإجراءات",
    untitledQuiz: "اختبار بلا عنوان", untitledForm: "نموذج بلا عنوان", untitled: "بلا عنوان",
    responseCount: (n: number) => n === 0 ? "لا ردود" : pluralForm("ar", n, { one: "ردّ واحد", two: "ردّان", few: `${n} ردود`, many: `${n} ردًّا`, other: `${n} ردّ` }),
    playCount: (n: number) => n === 0 ? "لا محاولات" : pluralForm("ar", n, { one: "محاولة واحدة", two: "محاولتان", few: `${n} محاولات`, many: `${n} محاولة`, other: `${n} محاولة` }),
    sharedMeta: (owner: string, canEdit: boolean) => `${owner} · يمكنك ${canEdit ? "التعديل" : "العرض"}`,
    sharedGroup: "تمت مشاركته معك", ungrouped: "بلا مجموعة",
    approvalNote: "بانتظار موافقتك على النشر",
    clipboardUnavailable: "الحافظة غير متاحة في هذا المتصفح.", copyFailed: "تعذّر نسخ الرابط. حاول مرة أخرى.", linkCopied: "تم نسخ الرابط",
    archived: (title: string) => `تمت أرشفة «${title}»`, restored: (title: string) => `تمت استعادة «${title}»`, findInArchive: "تجده في الأرشيف بالشريط الجانبي", deleted: "تم الحذف",
    open: "افتح", results: "النتائج", viewLive: "اعرض المنشور", copyLink: "انسخ الرابط", unpin: "إلغاء التثبيت من الشريط الجانبي", pin: "ثبّت في الشريط الجانبي",
    duplicate: "كرّر", unpublish: "ألغِ النشر", publish: "انشر", archive: "أرشِف", delete: "احذف",
    oldQuiz: "اختبار قديم", quiz: "اختبار", form: "نموذج",
    games: "الألعاب", library: "المكتبة", newCourse: "دورة جديدة", creating: "جارٍ الإنشاء…", newLabel: "جديد", moreWays: "طرق أخرى للبدء", blank: "فارغ", fromTemplate: "من قالب", import: "استيراد",
    dismissError: "أخفِ الخطأ", filterLibrary: "تصفية المكتبة", searchLibrary: "ابحث في المكتبة", search: "بحث",
    filterByStatus: "تصفية حسب الحالة", status: "الحالة", clearFilter: "امسح التصفية", sort: "ترتيب", viewOptions: "خيارات العرض", gallery: "معرض", list: "قائمة",
    loadingLibrary: "جارٍ تحميل المكتبة...", nothingMatches: "لا نتائج", createFirst: "أنشئ أول نموذج لك",
    tryAnother: "جرّب اسمًا آخر، أو امسح البحث والتصفية.", startBlank: "ابدأ بصفحة فارغة أو بقالب جاهز.", templates: "القوالب",
    actionsFor: (title: string) => `إجراءات ${title}`,
    templatesTitle: "ابدأ من قالب", templatesDesc: "تُفتح القوالب كمسودات يمكنك تعديلها.",
    loadingTemplates: "جارٍ تحميل القوالب...", fields: (n: number) => pluralForm("ar", n, { one: "حقل واحد", two: "حقلان", few: `${n} حقول`, many: `${n} حقلًا`, other: `${n} حقل` }), yourTemplate: "قالبك", use: "استخدم",
    deleteTemplate: (name: string) => `احذف القالب ${name}`,
    importTitle: "استيراد نموذج", importDesc: "تصبح المستوردات مسودات لتراجعها؛ لا يُنشر شيء.",
    deleteTitle: (title: string) => `حذف «${title}»؟`,
    deleteLegacy: (responses: number, questions: number) => `سيُحذف ${pluralForm("ar", questions, { zero: "0 سؤال", one: "سؤال واحد", two: "سؤالان", few: `${questions} أسئلة`, many: `${questions} سؤالًا`, other: `${questions} سؤال` })} و${pluralForm("ar", responses, { zero: "0 ردّ", one: "ردّ واحد", two: "ردّان", few: `${responses} ردود`, many: `${responses} ردًّا`, other: `${responses} ردّ` })} مع درجاتها. لا يمكن التراجع عن ذلك.`,
    counting: "جارٍ عدّ الردود…",
    deleteForm: (n: number) => `${n === 0 ? "سيُحذف ما فيه من ملفات مرفوعة وسجل" : `سيُحذف ${pluralForm("ar", n, { one: "ردّ واحد", two: "ردّان", few: `${n} ردود`, many: `${n} ردًّا`, other: `${n} ردّ` })} مع الملفات المرفوعة والسجل`}. لا يمكن التراجع عن ذلك. أرشِفه من إعداداته بدلًا من ذلك للاحتفاظ بالبيانات.`,
    cancel: "إلغاء", deleteForever: "احذف نهائيًا",
    sourceChaos: "تصدير Chaos", sourceText: "أسئلة ملصوقة", sourceSheet: "جدول بيانات", modeExport: "تصدير نموذج أو نص", modeSheet: "أسئلة من CSV أو Excel",
    importFailed: "تعذّرت قراءة هذا الملف.", fileTooBig: "الحد الأقصى لحجم الملف 2 ميغابايت.",
    importHelp: "ارفع ملف تصدير من Chaos أو Typeform أو Google Forms، أو الصق الأسئلة: سؤال في كل فقرة، والخيارات تبدأ بـ «-»، و«*» للإلزامي.",
    chooseFile: "اختر ملفًا", orPaste: "أو الصق", sample: "# ملاحظات عن الفعالية\n\nكيف عرفت عنا؟ *\n- صديق\n- وسائل التواصل\n- أخرى\n\nهل لديك تعليقات؟",
    preview: "معاينة", fieldsCount: (n: number) => pluralForm("ar", n, { one: "حقل واحد", two: "حقلان", few: `${n} حقول`, many: `${n} حقلًا`, other: `${n} حقل` }), textBlock: "كتلة نص",
    options: (n: number) => pluralForm("ar", n, { one: "خيار واحد", two: "خياران", few: `${n} خيارات`, many: `${n} خيارًا`, other: `${n} خيار` }), required: "إلزامي", createDraft: "أنشئ مسودة",
  },
};
interface Row {
  key: string;
  kind: "form" | "quiz" | "legacy";
  title: string;
  href: string;
  resultsHref: string;
  status: "draft" | "live" | "closed" | "archived";
  edited?: boolean;
  meta: string;
  updatedAt?: number;
  responses: number;
  group: string;
  theme?: FormTheme;
  presentation?: Presentation;
  shareUrl?: string;
  note?: string;
  formId?: Id<"forms">;
  quizId?: Id<"quizzes">;
  owned: boolean;
  published?: boolean;
  /** Published quizzes the viewer may run as a live game. */
  canHost?: boolean;
}

export default function CreatorLibrary() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const forms = useQuery(api.forms.listMyForms);
  const quizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const templates = useQuery(api.forms.listTemplates);
  const deleteQuiz = useMutation(api.quizFunctions.deleteQuiz);
  const publishQuiz = useMutation(api.quizFunctions.publishQuiz);
  const unpublishQuiz = useMutation(api.quizFunctions.unpublishQuiz);
  const duplicateForm = useMutation(api.forms.duplicateForm);
  const createCourse = useMutation(api.courses.create);
  const deleteForm = useOptimisticMutation(api.forms.deleteForm, deleteFormLocally);
  const deleteTemplate = useMutation(api.forms.deleteTemplate);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { create, busy } = useCreateForm(setError);
  const hostLive = useHostLive();
  const [dialog, setDialog] = useState<"none" | "templates" | "import">("none");
  const [search, setSearch] = useState("");
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = kindFromParam(params.get("tab"));
  const setKind = (next: Kind) => router.replace(next === "Forms" ? pathname : `${pathname}?tab=${next.toLowerCase()}`, { scroll: false });
  const [view, setView] = useState<"gallery" | "list">("gallery");
  /** No statuses chosen means everything except archived, the everyday view. */
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [sort, setSort] = useState<SortKey>("edited");
  const [dir, setDir] = useState<SortDir>("desc");
  const setStatus = useOptimisticMutation(api.forms.setFormStatus, setFormStatusLocally);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("chaos-library-view");
      if (saved === "list" || saved === "gallery") setView(saved);
      const savedSort = window.localStorage.getItem("chaos-library-sort");
      if (sortOptions.some((o) => o.id === savedSort)) setSort(savedSort as SortKey);
      const savedDir = window.localStorage.getItem("chaos-library-sort-dir");
      setDir(savedDir === "asc" || savedDir === "desc" ? savedDir : naturalDir[(savedSort as SortKey) ?? "edited"] ?? "desc");
      const savedStatuses = JSON.parse(window.localStorage.getItem("chaos-library-status") ?? "[]");
      if (Array.isArray(savedStatuses)) setStatuses(savedStatuses.filter((s): s is Status => statusOptions.some((o) => o.id === s)));
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const chooseSort = (next: SortKey, nextDir: SortDir = naturalDir[next]) => {
    setSort(next);
    setDir(nextDir);
    try { window.localStorage.setItem("chaos-library-sort", next); window.localStorage.setItem("chaos-library-sort-dir", nextDir); } catch { /* storage unavailable */ }
  };
  /** Column headers sort: first click in the column's natural order, again to reverse. */
  const sortBy = (key: SortKey) => chooseSort(key, sort === key ? (dir === "asc" ? "desc" : "asc") : naturalDir[key]);
  const header = (key: SortKey, label: string, numeric?: boolean) => (
    <th className={numeric ? "ws-num" : undefined} aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="ws-th-sort" data-active={sort === key} onClick={() => sortBy(key)}>
        {label}{sort === key ? (dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />) : <ArrowUpDown size={13} aria-hidden="true" className="ws-th-sort__idle" />}
      </button>
    </th>
  );
  const chooseStatuses = (next: Status[]) => {
    setStatuses(next);
    try { window.localStorage.setItem("chaos-library-status", JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const toggleStatus = (status: Status) => chooseStatuses(statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status]);

  const chooseView = (next: "gallery" | "list") => {
    setView(next);
    try { window.localStorage.setItem("chaos-library-view", next); } catch { /* storage unavailable */ }
  };

  const rows = useMemo<Row[]>(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const own: Row[] = (forms?.owned ?? []).map((f) => ({
      key: f._id, kind: f.quizMode ? "quiz" : "form", title: f.title || (f.quizMode ? t.untitledQuiz : t.untitledForm),
      href: `/dashboard/forms/${f._id}`, resultsHref: `/dashboard/forms/${f._id}/responses`, status: f.status, edited: f.hasUnpublishedChanges,
      meta: t.responseCount(f.responseCount),
      updatedAt: f.updatedAt, responses: f.responseCount, group: f.groupName || "", theme: f.theme, presentation: f.presentation,
      shareUrl: f.publishedVersion !== undefined ? `${origin}/f/${f.shareId}` : undefined,
      note: f.approvalPending ? t.approvalNote : undefined,
      formId: f._id, owned: true, published: f.publishedVersion !== undefined,
      canHost: f.quizMode && f.publishedVersion !== undefined && f.status !== "archived",
    }));
    const legacy: Row[] = (quizzes ?? []).map((q) => ({
      key: q._id, kind: "legacy", title: q.title || t.untitledQuiz, href: `/dashboard/editor?id=${q._id}`, resultsHref: `/dashboard/results?id=${q._id}`,
      status: q.isPublished ? "live" : "draft", meta: t.playCount(q.sessionCount), responses: q.sessionCount, group: q.groupName || "",
      shareUrl: q.isPublished ? `${origin}/${q.creatorUsername}/${q.slug}` : undefined, quizId: q._id, owned: true, canHost: q.isPublished,
    }));
    const shared: Row[] = (forms?.shared ?? []).map((f) => ({
      key: `shared-${f._id}`, kind: f.quizMode ? "quiz" : "form", title: f.title || t.untitled, href: `/dashboard/forms/${f._id}`, resultsHref: `/dashboard/forms/${f._id}/responses`,
      status: f.status, edited: f.hasUnpublishedChanges, meta: t.sharedMeta(f.ownerName, f.role === "editor"), updatedAt: f.updatedAt,
      responses: f.responseCount, group: SHARED_GROUP, theme: f.theme, presentation: f.presentation, formId: f._id, owned: false,
      canHost: f.quizMode && f.role === "editor" && f.status === "live",
    }));
    return [...own, ...legacy, ...shared];
  }, [forms, quizzes, t]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Ascending comparators; the direction flips them.
    const compare: Record<SortKey, (a: Row, b: Row) => number> = {
      edited: (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
      name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
      responses: (a, b) => a.responses - b.responses,
      status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
    };
    const ordered = (a: Row, b: Row) => (dir === "asc" ? 1 : -1) * compare[sort](a, b);
    // Archived forms live on the Archive page, never in the library.
    return rows.filter((r) => r.status !== "archived" && (!statuses.length || statuses.includes(r.status)))
      .filter((r) => kind === "Forms" ? r.kind === "form" : r.kind !== "form")
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.group.toLowerCase().includes(q))
      .sort(ordered);
  }, [rows, search, kind, statuses, sort, dir]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of visible) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map.entries()].sort(([a], [b]) => (a === SHARED_GROUP ? 1 : b === SHARED_GROUP ? -1 : a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [visible]);

  const { toggle: togglePin, isPinned } = usePinned();
  const copyLink = async (url: string) => {
    setError("");
    setNotice("");
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error(t.clipboardUnavailable);
      }
      await navigator.clipboard.writeText(url);
      setNotice(t.linkCopied);
    } catch (e) {
      setError(errorMessage(e, t.copyFailed));
    }
  };
  /** Archive hides a form from people answering and from the library; responses are kept. Undo puts it back. */
  const archive = async (row: Row) => {
    if (!row.formId) return;
    const before = row.status;
    const next = row.status === "archived" ? (row.published ? "closed" : "draft") : "archived";
    // The row moves at once (optimistic update); the toast and hint follow the tap, not the round trip.
    const id = Date.now();
    setToast({ id, text: next === "archived" ? t.archived(row.title) : t.restored(row.title),
      undo: () => { setStatus({ formId: row.formId!, status: before }).catch((e) => setError(errorMessage(e))); } });
    if (next === "archived") setNotice(t.findInArchive);
    try {
      await setStatus({ formId: row.formId, status: next });
    } catch (e) {
      setToast((current) => (current?.id === id ? null : current));
      setNotice("");
      setError(errorMessage(e));
    }
  };
  const remove = async (row: Row) => {
    setConfirming(null);
    try {
      if (row.formId) {
        const pending = deleteForm({ formId: row.formId });
        setNotice(t.deleted);
        await pending;
      } else if (row.quizId) {
        await deleteQuiz({ quizId: row.quizId });
        setNotice(t.deleted);
      }
    } catch (e) { setNotice(""); setError(errorMessage(e)); }
  };

  const actions = (row: Row, close: () => void) => (
    <>
      <Link href={row.href} role="menuitem" onClick={close}><Pencil size={14} /> {t.open}</Link>
      <Link href={row.resultsHref} role="menuitem" onClick={close}><BarChart3 size={14} /> {t.results}</Link>
      {row.shareUrl && <a href={row.shareUrl} target="_blank" rel="noreferrer" role="menuitem" onClick={close}><ExternalLink size={14} /> {t.viewLive}</a>}
      {row.shareUrl && <button type="button" role="menuitem" onClick={() => { close(); void copyLink(row.shareUrl!); }}><Copy size={14} /> {t.copyLink}</button>}
      {row.canHost && (
        <button type="button" role="menuitem" disabled={hostLive.busy} onClick={() => {
          close();
          void hostLive.start(row.formId ? { formId: row.formId } : { quizId: row.quizId! }).then((message) => { if (message) setError(message); });
        }}>
          <Radio size={14} /> {hostLive.label}
        </button>
      )}
      {row.formId && (
        <button type="button" role="menuitem" onClick={() => { close(); togglePin(row.formId!); }}>
          {isPinned(row.formId) ? <PinOff size={14} /> : <Pin size={14} />} {isPinned(row.formId) ? t.unpin : t.pin}
        </button>
      )}
      {row.formId && row.owned && (
        <button type="button" role="menuitem" onClick={() => { close(); duplicateForm({ formId: row.formId! }).then((id) => router.push(`/dashboard/forms/${id}`)).catch((e) => setError(errorMessage(e))); }}>
          <Copy size={14} /> {t.duplicate}
        </button>
      )}
      {row.quizId && (
        <button type="button" role="menuitem" onClick={() => { close(); (row.status === "live" ? unpublishQuiz : publishQuiz)({ quizId: row.quizId! }).catch((e) => setError(errorMessage(e))); }}>
          {row.status === "live" ? <Lock size={14} /> : <Globe size={14} />} {row.status === "live" ? t.unpublish : t.publish}
        </button>
      )}
      {row.formId && row.owned && (
        <button type="button" role="menuitem" onClick={() => { close(); void archive(row); }}>
          <Archive size={14} /> {t.archive}
        </button>
      )}
      {/* Forms are deleted only from the Archive; old quizzes can't be archived, so they keep Delete. */}
      {row.owned && row.kind === "legacy" && <><hr /><button type="button" role="menuitem" className="ws-menu__danger" onClick={() => { close(); setConfirming(row); }}><Trash2 size={14} /> {t.delete}</button></>}
    </>
  );

  const groupLabel = (group: string) => (group === SHARED_GROUP ? t.sharedGroup : group || t.ungrouped);
  const kindLabel = (row: Row) => (row.kind === "legacy" ? t.oldQuiz : row.kind === "quiz" ? t.quiz : t.form);

  const loading = forms === undefined || quizzes === undefined;
  const newCourse = async () => {
    try { const id = await createCourse({ language: locale }); router.push(`/dashboard/courses/${id}`); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <div className="font-sans">
      <div className="ws-page-header">
        <h1 className="ws-page-title">{t.library}</h1>
        <div className="flex items-stretch">
          <button type="button" onClick={() => create()} disabled={busy} className="ws-btn ws-btn--primary !rounded-e-none"><Plus size={17} /> {busy ? t.creating : t.newLabel}</button>
          <WsMenu label={t.moreWays} triggerClassName="ws-btn ws-btn--primary !rounded-s-none !px-2.5 border-s border-s-white/25" trigger={<ChevronDown size={17} />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" onClick={() => { close(); void create(); }}><Plus size={16} /> {t.blank}</button>
                <button type="button" role="menuitem" onClick={() => { close(); setDialog("templates"); }}><LayoutTemplate size={16} /> {t.fromTemplate}</button>
                <button type="button" role="menuitem" onClick={() => { close(); setDialog("import"); }}><FileUp size={16} /> {t.import}</button>
                <button type="button" role="menuitem" onClick={() => { close(); void newCourse(); }}><GraduationCap size={16} /> {t.newCourse}</button>
              </>
            )}
          </WsMenu>
        </div>
      </div>

      {error && (
        <div role="alert" className="chaos-card border-destructive p-3 mb-4 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-destructive">{error}</p>
          <button type="button" onClick={() => setError("")} aria-label={t.dismissError} className="ws-icon-button"><X size={15} /></button>
        </div>
      )}

      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div className="flex-1 min-w-[260px] max-sm:basis-full max-sm:min-w-0"><WsTabs tabs={kinds} value={kind} onChange={setKind} label={t.filterLibrary} labels={t.kinds} icons={{ Forms: FileText, Quizzes: GraduationCap, Courses: BookOpen, Games: Trophy }} /></div>
        {kind !== "Courses" && kind !== "Games" && <>
        <label className="ws-search !flex-none w-56 max-sm:!w-full max-sm:!max-w-none max-sm:order-last">
          <span className="sr-only">{t.searchLibrary}</span>
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} />
        </label>
        <WsMenu label={t.filterByStatus} triggerClassName={`ws-btn ws-btn--ghost ws-filter-btn ${statuses.length ? "ws-filter-btn--on" : ""}`}
          trigger={<><ListFilter size={16} aria-hidden="true" /><span>{statuses.length ? `${t.status} · ${statuses.map((s) => t.status_[s]).join(locale === "ar" ? "، " : ", ")}` : t.status}</span></>}>
          {() => (
            <>
              {statusOptions.map((o) => (
                <button key={o.id} type="button" role="menuitemcheckbox" aria-checked={statuses.includes(o.id)} onClick={() => toggleStatus(o.id)}>
                  <span className="ws-status" data-status={o.id}>{t.status_[o.id]}</span>{statuses.includes(o.id) && <Check size={15} className="ms-auto" />}
                </button>
              ))}
              {statuses.length > 0 && <><hr /><button type="button" role="menuitem" onClick={() => chooseStatuses([])}><X size={16} /> {t.clearFilter}</button></>}
            </>
          )}
        </WsMenu>
        {view === "gallery" && <WsMenu label={t.sort} triggerClassName={`ws-btn ws-btn--ghost ws-filter-btn ${sort !== "edited" ? "ws-filter-btn--on" : ""}`}
          trigger={<><ArrowUpDown size={16} aria-hidden="true" /><span>{t.sort_[sort]}</span></>}>
          {(close) => sortOptions.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={sort === o.id} onClick={() => { close(); chooseSort(o.id); }}>
              {t.sort_[o.id]}{sort === o.id && <Check size={15} className="ms-auto" />}
            </button>
          ))}
        </WsMenu>}
        <WsMenu label={t.viewOptions}>
          {(close) => (
            <>
              <button type="button" role="menuitemradio" aria-checked={view === "gallery"} onClick={() => { close(); chooseView("gallery"); }}><LayoutGrid size={16} /> {t.gallery}{view === "gallery" && <Check size={15} className="ms-auto" />}</button>
              <button type="button" role="menuitemradio" aria-checked={view === "list"} onClick={() => { close(); chooseView("list"); }}><List size={16} /> {t.list}{view === "list" && <Check size={15} className="ms-auto" />}</button>
            </>
          )}
        </WsMenu>
        </>}
      </div>

      {kind === "Courses" ? <CoursesHub embedded /> : kind === "Games" ? <GamesHub embedded /> : loading ? <LibrarySkeleton label={t.loadingLibrary} view={view} /> : visible.length === 0 ? (
        <div className="ws-empty ws-page">
          <span className="ws-empty__art"><Plus size={24} /></span>
          <h2 className="text-xl font-semibold">{search || statuses.length ? t.nothingMatches : t.createFirst}</h2>
          <p className="text-muted-foreground max-w-sm">{search || statuses.length ? t.tryAnother : t.startBlank}</p>
          {statuses.length > 0 && <button type="button" className="ws-btn mt-3" onClick={() => chooseStatuses([])}>{t.clearFilter}</button>}
          {!search && !statuses.length && (
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => create()} disabled={busy} className="ws-btn ws-btn--primary"><Plus size={17} /> {t.newLabel}</button>
              <button type="button" onClick={() => setDialog("templates")} className="ws-btn"><LayoutTemplate size={17} /> {t.templates}</button>
            </div>
          )}
        </div>
      ) : view === "gallery" ? (
        <div className="space-y-8">
          {groups.map(([group, list], groupIndex) => (
            <section key={group || "ungrouped"} aria-label={groupLabel(group)}>
              {group && <h2 className="text-sm font-semibold text-muted-foreground mb-3">{groupLabel(group)}</h2>}
              <ul className="ws-gallery ws-stagger">
                {groupIndex === 0 && !search && !statuses.length && (
                  <li style={{ ["--i" as string]: 0 }} className="max-sm:hidden">
                    <button type="button" className="ws-card ws-card--new w-full h-full" onClick={() => create()} disabled={busy}>
                      <span className="ws-plus-lg"><Plus size={22} /></span>
                      {busy ? t.creating : t.newLabel}
                    </button>
                  </li>
                )}
                {list.map((row, i) => (
                  <li key={row.key} className="ws-card" style={{ ["--i" as string]: i + 1 }} {...(row.formId ? formIntentHandlers(row.formId) : undefined)}>
                    <span className="ws-card__thumb"><FormThumb theme={row.theme} presentation={row.presentation} title={row.title} legacy={row.kind === "legacy"} /></span>
                    <div className="ws-card__body">
                      <Link href={row.href} className="ws-card__title">{row.title}</Link>
                      <p className="ws-card__meta">
                        <StatusBadge status={row.status} edited={row.edited} /><span aria-hidden="true">·</span>{kindLabel(row)}<span aria-hidden="true">·</span>{row.meta}
                      </p>
                      {row.note && <p className="text-[13px] font-semibold text-[var(--ws-warning)]">{row.note}</p>}
                    </div>
                    <div className="ws-card__menu"><WsMenu label={t.actionsFor(row.title)}>{(close) => actions(row, close)}</WsMenu></div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="ws-table-wrap ws-page">
          <table className="ws-table">
            <thead>
              <tr>{header("name", t.colName)}{header("status", t.colStatus)}{header("responses", t.colResponses, true)}{header("edited", t.colEdited)}<th><span className="sr-only">{t.colActions}</span></th></tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className="cursor-pointer" data-muted={row.status === "archived" || row.status === "closed"} onClick={() => router.push(row.href)} {...(row.formId ? formIntentHandlers(row.formId) : undefined)}>
                  <td>
                    <Link href={row.href} className="flex items-center gap-2.5 font-medium" onClick={(e) => e.stopPropagation()}>
                      <span className="ws-recent-icon" aria-hidden="true" style={{ background: row.theme?.accent && /^#[0-9a-f]{6}$/i.test(row.theme.accent) ? row.theme.accent : "#2f5333" }}>
                        {row.title.trim().charAt(0).toUpperCase() || "U"}
                      </span>
                      <span className="truncate">{row.title}</span>
                    </Link>
                  </td>
                  <td><StatusBadge status={row.status} edited={row.edited} /></td>
                  <td className="ws-num">{row.responses > 0 ? formatNumber(locale, row.responses) : <span className="text-muted-foreground">0</span>}</td>
                  <td className="text-muted-foreground">{row.updatedAt ? timeAgo(locale, row.updatedAt) : "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}><WsMenu label={t.actionsFor(row.title)}>{(close) => actions(row, close)}</WsMenu></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <WsUndoToast toast={toast} onClose={() => setToast(null)} />

      {notice && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ws-pill !min-h-9 !px-4 !text-[13px] !bg-[var(--on-background)] !text-[var(--background)] shadow-lg" role="status" style={{ animation: "ws-pop 220ms var(--ws-spring) both" }}>{notice}</div>}

      {dialog === "templates" && (
        <WsDialog title={t.templatesTitle} description={t.templatesDesc} onClose={() => setDialog("none")} wide>
          {templates === undefined ? <LoadingState label={t.loadingTemplates} className="py-10" /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.builtIn.map((tpl) => (
                <button key={tpl.id} type="button" onClick={() => { setDialog("none"); void create({ templateId: tpl.id }); }} disabled={busy} className="ws-tile !p-3 !gap-1.5">
                  <span className="text-[11px] font-semibold text-[var(--primary)]">{tpl.category} · {tpl.languages.map((l) => l.toUpperCase()).join(" / ")}</span>
                  <span className="font-semibold text-sm">{tpl.name}</span>
                  <span className="text-xs text-muted-foreground">{tpl.description}</span>
                  <span className="text-[11px] text-muted-foreground mt-1">{t.fields(tpl.fieldCount)}</span>
                </button>
              ))}
              {templates.own.map((tpl) => (
                <div key={tpl._id} className="ws-tile !p-3 !gap-1.5 !cursor-default">
                  <span className="text-[11px] font-semibold text-muted-foreground">{t.yourTemplate} · {tpl.category}</span>
                  <span className="font-semibold text-sm">{tpl.name}</span>
                  <span className="text-[11px] text-muted-foreground">{t.fields(tpl.fieldCount)}</span>
                  <div className="flex gap-2 mt-1">
                    <button type="button" onClick={() => { setDialog("none"); void create({ ownTemplateId: tpl._id }); }} disabled={busy} className="ws-btn ws-btn--primary ws-btn--sm flex-1">{t.use}</button>
                    <button type="button" onClick={() => deleteTemplate({ templateId: tpl._id }).catch((e) => setError(errorMessage(e)))} className="ws-btn ws-btn--ghost ws-btn--sm" aria-label={t.deleteTemplate(tpl.name)}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WsDialog>
      )}

      {dialog === "import" && (
        <WsDialog title={t.importTitle} description={t.importDesc} onClose={() => setDialog("none")} wide>
          <ImportPanel busy={busy} onImport={(r, label) => { setDialog("none"); void create({ definition: r.definition, sourceLabel: label }); }} />
        </WsDialog>
      )}

      {confirming && (
        <WsDialog title={t.deleteTitle(confirming.title)} onClose={() => setConfirming(null)}>
          <p className="text-sm text-muted-foreground">
            {confirming.kind === "legacy" && confirming.quizId
              ? <LegacyDeleteImpact quizId={confirming.quizId} />
              : t.deleteForm(confirming.responses)}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirming(null)}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--danger" onClick={() => void remove(confirming)}><Trash2 size={14} /> {t.deleteForever}</button>
          </div>
        </WsDialog>
      )}
    </div>
  );
}

/** How much an old quiz's deletion destroys, counted on the server. */
function LegacyDeleteImpact({ quizId }: { quizId: Id<"quizzes"> }) {
  const t = useCopy(copy);
  const impact = useQuery(api.quizFunctions.getQuizDeletionImpact, { quizId });
  return <>{impact ? t.deleteLegacy(impact.responseCount, impact.questionCount) : t.counting}</>;
}

function ImportPanel({ busy, onImport }: { busy: boolean; onImport: (result: ImportResult, label: string) => void }) {
  const t = useCopy(copy);
  const labels = useBuilderLabels();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"export" | "sheet">("export");

  const preview = async (input: string) => {
    setError("");
    setResult(null);
    if (!input.trim()) return;
    try {
      // The importers (Typeform, Google Forms, text) load only when someone imports.
      const { importForm } = await import("@/lib/formImporters");
      setResult(importForm(input));
    } catch (err) {
      setError(errorMessage(err, t.importFailed));
    }
  };

  const sourceNames = { chaos: t.sourceChaos, typeform: "Typeform", google: "Google Forms", text: t.sourceText, sheet: t.sourceSheet } as const;
  const modes = (
    <div className="ws-segmented" role="group" aria-label={t.importTitle}>
      <button type="button" aria-pressed={mode === "export"} onClick={() => setMode("export")}><FileUp size={14} aria-hidden="true" /> {t.modeExport}</button>
      <button type="button" aria-pressed={mode === "sheet"} onClick={() => setMode("sheet")}><FileText size={14} aria-hidden="true" /> {t.modeSheet}</button>
    </div>
  );
  if (mode === "sheet") {
    return (
      <section className="space-y-4" aria-label={t.importTitle}>
        {modes}
        <SheetImport busy={busy} onImport={(r, file) => onImport(r, file ? `${t.sourceSheet} (${file})` : t.sourceSheet)} />
      </section>
    );
  }
  return (
    <section className="space-y-4" aria-label={t.importTitle}>
      {modes}
      <p className="text-[13px] text-muted-foreground">
        {t.importHelp}
      </p>
      <div className="flex gap-3 flex-wrap items-center">
        <input type="file" accept=".json,.txt,application/json,text/plain" className="sr-only" id="import-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) { setError(t.fileTooBig); return; }
            setFileName(file.name);
            const content = await file.text();
            setText(content);
            void preview(content);
          }} />
        <label htmlFor="import-file" className="ws-btn cursor-pointer"><FileUp size={14} /> {t.chooseFile}</label>
        {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">{t.orPaste}</span>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setFileName(""); }} onBlur={() => void preview(text)} rows={6} className="kb-input mt-1 font-mono text-xs"
          placeholder={t.sample} />
      </label>
      <button type="button" onClick={() => void preview(text)} className="ws-btn ws-btn--sm">{t.preview}</button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="rounded-lg border p-4 space-y-3 ws-page">
          <p className="text-xs font-semibold text-muted-foreground">{sourceNames[result.source]} · {t.fieldsCount(result.definition.fields.length)}</p>
          <p className="font-semibold">{result.definition.title}</p>
          <ol className="text-sm list-decimal ps-5 space-y-1 max-h-60 overflow-y-auto">
            {result.definition.fields.map((f) => (
              <li key={f.id}>{f.label || <em>{t.textBlock}</em>} <span className="text-xs text-muted-foreground">({labels.fieldType(f.type)}{f.options ? `, ${t.options(f.options.length)}` : ""}{f.required ? `, ${t.required}` : ""})</span></li>
            ))}
          </ol>
          {result.warnings.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc ps-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <button type="button" disabled={busy || !result.definition.fields.length} onClick={() => onImport(result, fileName ? `${sourceNames[result.source]} (${fileName})` : sourceNames[result.source])}
            className="ws-btn ws-btn--primary">
            {t.createDraft}
          </button>
        </div>
      )}
    </section>
  );
}
