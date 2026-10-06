"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Activity, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import posthog from "@/lib/analytics";
import { ArrowLeft, BarChart3, Check, Copy, ExternalLink, GitBranch, History, Languages, ListChecks, Palette, Pin, PinOff, Play, Redo2, Settings, Share2, Undo2, Users, X } from "lucide-react";
import { usePinned } from "@/components/workspace/usePinned";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import StatusBadge from "@/components/forms/StatusBadge";
import SourceDetails from "@/components/forms/SourceDetails";
import BuildTab from "@/components/forms/builder/BuildTab";
import EmbedPanel from "@/components/forms/builder/EmbedPanel";
import SharePopup from "@/components/forms/builder/SharePopup";
import { FullPreview } from "@/components/forms/builder/FormPreview";
import QuizLearningLinks from "@/components/learn/editor/QuizLearningLinks";
import HostLiveButton from "@/components/live/HostLiveButton";
import { WsMenu, WsSwitch, WsTabs } from "@/components/workspace/primitives";
import { toast } from "@/lib/toast";
import { formatScheduleTime } from "@/convex/formSchedule";
import { checkDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";
import { parseError } from "@/lib/errors";
import { localizeMessage } from "@/lib/messages";
import { useCopy, useLocale } from "@/lib/i18n";
import { pluralForm } from "@/lib/locale";
import { timeAgo } from "@/lib/timeAgo";
import { useFormDraft } from "./use-form-draft";
import type { SaveState } from "./use-form-draft";
import { journeyPending, markStep, useUsableMark, type Journey } from "@/lib/journeys";
import { linkOrigin } from "@/lib/hosts";

/**
 * Questions is the tab people land on; the others (QR code, embed, theme editor, rules…) load as
 * separate chunks, fetched while the browser is idle after the builder opens, so switching tabs
 * stays instant without making the first open wait for them.
 */
const tabLoaders = {
  Logic: () => import("@/components/forms/builder/LogicTab"),
  Translate: () => import("@/components/forms/builder/TranslateTab"),
  Design: () => import("@/components/forms/builder/DesignTab"),
  Settings: () => import("@/components/forms/builder/SettingsTab"),
  Share: () => import("@/components/forms/builder/ShareTab"),
  Team: () => import("@/components/forms/builder/TeamTab"),
  History: () => import("@/components/forms/builder/HistoryTab"),
};
const TabSkeleton = () => <div className="ws-skeleton ws-skeleton--panel" aria-hidden="true" />;
const LogicTab = dynamic(tabLoaders.Logic, { loading: TabSkeleton });
const TranslateTab = dynamic(tabLoaders.Translate, { loading: TabSkeleton });
const DesignTab = dynamic(tabLoaders.Design, { loading: TabSkeleton });
const SettingsTab = dynamic(tabLoaders.Settings, { loading: TabSkeleton });
const ShareTab = dynamic(tabLoaders.Share, { loading: TabSkeleton });
const TeamTab = dynamic(tabLoaders.Team, { loading: TabSkeleton });
const HistoryTab = dynamic(tabLoaders.History, { loading: TabSkeleton });
function preloadTabs() {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const run = () => { for (const load of Object.values(tabLoaders)) void load(); };
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** Every tool is discoverable; the row scrolls on narrow screens. */
const primaryTabs = ["Questions", "Design", "Settings", "Share"] as const;
const advancedTabs = ["Logic", "Translate", "Team", "History"] as const;
const allTabs = ["Questions", "Design", "Logic", "Translate", "Team", "History", "Settings", "Share"] as const;
type Tab = (typeof allTabs)[number];
const tabIconByKey = { Questions: ListChecks, Design: Palette, Settings, Share: Share2, Logic: GitBranch, Translate: Languages, Team: Users, History } as const;

const copy = {
  en: {
    tabs: { Questions: "Questions", Design: "Theme", Settings: "Settings", Share: "Publish", Logic: "Logic", Translate: "Translate", Team: "Team", History: "History" } as Record<Tab, string>,
    logicAndEndings: " and endings",
    saving: "Saving…", unsaved: "Unsaved changes", saved: "Saved", offline: "Offline — kept on this device", conflict: "Changed elsewhere", notSaved: "Not saved",
    loading: "Loading form...", notFound: "Not found", notFoundHelp: "It was deleted, or you no longer have access.", backToLibrary: "Back to library",
    fixBefore: "Fix these before publishing:", saveFirst: "Save your changes before publishing.", requested: "Publication requested. The owner will be notified.",
    published: (v: number) => `Published version ${v}. Respondents now see this version; earlier responses stay linked to the version they answered.`,
    noClipboard: "Clipboard is unavailable in this browser.", linkCopied: "Link copied.", copyFailed: "Could not copy the link. Please try again.",
    opens: (d: string) => `Opens ${d}`, closes: (d: string) => `Closes ${d}`, closed: (d: string) => `Closed ${d}`, ofLimit: (n: number, limit: number) => `${n} of ${limit} responses`,
    library: "Library", undo: "Undo", redo: "Redo", undoTitle: "Undo (Ctrl+Z)", redoTitle: "Redo (Ctrl+Y)", archivedReadOnly: "Archived · read-only", readOnly: "Read-only",
    results: (n: number) => `Results${n > 0 ? ` (${n})` : ""}`, preview: "Preview",
    publishing: "Publishing…", awaiting: "Awaiting approval", requestPublication: "Request publication", publishChanges: "Publish changes", publishedLabel: "Published", publish: "Publish",
    share: "Share", moreActions: "More actions", unpin: "Unpin from sidebar", pin: "Pin to sidebar", openLive: "Open live page", copyLink: "Copy link",
    quizTitle: "Quiz title", formTitle: "Form title", untitledQuiz: "Untitled quiz", untitledForm: "Untitled form", quizMode: "Quiz mode", changeLimits: "Change limits in Settings",
    kindQuiz: "quiz", kindForm: "form",
    role: (role: string, kind: string) => `You are ${role === "editor" ? "an editor" : "a viewer"} of this ${kind}. `,
    createdFrom: (kind: string, label: string) => `Created from ${kind === "integration" ? "a connected app" : kind}: ${label}`,
    guideLabel: "Getting started", step1: "Type your first question", step1Action: "Show me", step2: "Choose how it looks", step2Action: "Open Theme", step3: "Publish to get a link you can share", step3Action: "Publish",
    stepOf: (i: number, n: number) => `Step ${i} of ${n}`, hideGuide: "Hide getting started", addQuestionLabel: "Add a question",
    recovery: (ago: string) => `Unsaved edits from ${ago} were found on this device.`, restore: "Restore them", discard: "Discard",
    conflictMsg: (kind: string) => `Someone else changed this ${kind}. Your edits are kept here until you choose.`, loadTheirs: "Load their version", keepMine: "Keep mine (overwrite)", retry: "Retry",
    approvalMsg: (name: string, ago: string) => `${name} asked to publish this draft ${ago}. Review it, then publish or decline.`, approve: "Approve & publish", decline: "Decline",
    gameGuide: "For a live game: add choice questions with 2–4 options and a correct answer, choose your theme in Design, publish, then press Host live.", gameGuideLink: "Games & hosting", dismiss: "Dismiss", builder: "Builder", moreSections: "More sections", more: "More",
    fixCount: (n: number) => `${n} thing${n === 1 ? "" : "s"} to fix before publishing`, suggestions: "Suggestions", checks: "Publication checks",
  },
  ar: {
    tabs: { Questions: "الأسئلة", Design: "المظهر", Settings: "الإعدادات", Share: "النشر", Logic: "المنطق", Translate: "الترجمة", Team: "الفريق", History: "السجل" } as Record<Tab, string>,
    logicAndEndings: " وشاشات النهاية",
    saving: "جارٍ الحفظ…", unsaved: "تغييرات غير محفوظة", saved: "محفوظ", offline: "غير متصل — محفوظ على هذا الجهاز", conflict: "تغيّر من مكان آخر", notSaved: "لم يُحفظ",
    loading: "جارٍ تحميل النموذج...", notFound: "غير موجود", notFoundHelp: "حُذف، أو لم يعد لديك وصول إليه.", backToLibrary: "العودة إلى المكتبة",
    fixBefore: "أصلح هذه الأمور قبل النشر:", saveFirst: "احفظ تغييراتك قبل النشر.", requested: "طُلب النشر. سيصل إشعار إلى المالك.",
    published: (v: number) => `نُشرت النسخة ${v}. يرى المجيبون هذه النسخة الآن، وتبقى الردود السابقة مرتبطة بالنسخة التي أجاب عنها أصحابها.`,
    noClipboard: "الحافظة غير متاحة في هذا المتصفح.", linkCopied: "نُسخ الرابط.", copyFailed: "تعذّر نسخ الرابط. حاول مرة أخرى.",
    opens: (d: string) => `يفتح ${d}`, closes: (d: string) => `يُغلق ${d}`, closed: (d: string) => `أُغلق ${d}`,
    ofLimit: (n: number, limit: number) => `${n} من ${limit} ردًّا`,
    library: "المكتبة", undo: "تراجع", redo: "إعادة", undoTitle: "تراجع (Ctrl+Z)", redoTitle: "إعادة (Ctrl+Y)", archivedReadOnly: "مؤرشف · للقراءة فقط", readOnly: "للقراءة فقط",
    results: (n: number) => `النتائج${n > 0 ? ` (${n})` : ""}`, preview: "معاينة",
    publishing: "جارٍ النشر…", awaiting: "بانتظار الموافقة", requestPublication: "اطلب النشر", publishChanges: "انشر التغييرات", publishedLabel: "منشور", publish: "انشر",
    share: "مشاركة", moreActions: "إجراءات أخرى", unpin: "إلغاء التثبيت من الشريط الجانبي", pin: "ثبّت في الشريط الجانبي", openLive: "افتح الصفحة المنشورة", copyLink: "انسخ الرابط",
    quizTitle: "عنوان الاختبار", formTitle: "عنوان النموذج", untitledQuiz: "اختبار بلا عنوان", untitledForm: "نموذج بلا عنوان", quizMode: "وضع الاختبار", changeLimits: "غيّر الحدود من الإعدادات",
    kindQuiz: "الاختبار", kindForm: "النموذج",
    role: (role: string, kind: string) => `أنت ${role === "editor" ? "محرر" : "مشاهد"} في هذا ${kind === "الاختبار" ? "الاختبار" : "النموذج"}. `,
    createdFrom: (kind: string, label: string) => `أُنشئ من ${{ integration: "تطبيق متصل", template: "قالب", import: "استيراد", copy: "نسخة" }[kind] ?? kind}: ${label}`,
    guideLabel: "البدء", step1: "اكتب سؤالك الأول", step1Action: "أرني", step2: "اختر شكل النموذج", step2Action: "افتح المظهر", step3: "انشر لتحصل على رابط تشاركه", step3Action: "انشر",
    stepOf: (i: number, n: number) => `الخطوة ${i} من ${n}`, hideGuide: "أخفِ دليل البدء", addQuestionLabel: "أضف سؤالًا",
    recovery: (ago: string) => `وُجدت تعديلات غير محفوظة على هذا الجهاز من ${ago}.`, restore: "استعدها", discard: "تجاهلها",
    conflictMsg: (kind: string) => `غيّر شخص آخر هذا ${kind === "quiz" ? "الاختبار" : "النموذج"}. تبقى تعديلاتك هنا حتى تقرر.`, loadTheirs: "حمّل نسخته", keepMine: "أبقِ نسختي (استبدال)", retry: "أعد المحاولة",
    approvalMsg: (name: string, ago: string) => `طلب ${name} نشر هذه المسودة ${ago}. راجعها ثم انشر أو ارفض.`, approve: "وافق وانشر", decline: "ارفض",
    gameGuide: "للعب مباشرة: أضف أسئلة اختيار من 2 إلى 4 خيارات وإجابة صحيحة واختر المظهر من التصميم وانشر ثم اضغط استضف مباشرة.", gameGuideLink: "الألعاب والاستضافة", dismiss: "أغلق", builder: "المحرر", moreSections: "أقسام أخرى", more: "المزيد",
    fixCount: (n: number) => pluralForm("ar", n, { one: "أمر واحد يحتاج إصلاحًا قبل النشر", two: "أمران يحتاجان إصلاحًا قبل النشر", few: `${n} أمور تحتاج إصلاحًا قبل النشر`, other: `${n} أمرًا يحتاج إصلاحًا قبل النشر` }),
    suggestions: "اقتراحات", checks: "فحوصات النشر",
  },
};

type Copy = (typeof copy)["en"];

function saveLabel(s: SaveState, dirty: boolean, t: Copy): { text: string; tone: "ok" | "busy" | "warn" } {
  switch (s.kind) {
    case "saving": return { text: t.saving, tone: "busy" };
    case "saved": return dirty ? { text: t.unsaved, tone: "busy" } : { text: t.saved, tone: "ok" };
    case "offline": return { text: t.offline, tone: "warn" };
    case "conflict": return { text: t.conflict, tone: "warn" };
    case "error": return { text: t.notSaved, tone: "warn" };
    default: return dirty ? { text: t.unsaved, tone: "busy" } : { text: t.saved, tone: "ok" };
  }
}

export default function FormBuilderPage() {
  const { formId } = useParams<{ formId: Id<"forms"> }>();
  return <FormBuilder key={formId} formId={formId} />;
}

function FormBuilder({ formId }: { formId: Id<"forms"> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const data = useQuery(api.forms.getFormForEditor, { formId });
  const canEdit = !!data && data.role !== "viewer" && data.status !== "archived";
  const server = useMemo(() => (data ? { draft: data.draft as FormDefinition, draftRevision: data.draftRevision } : data), [data]);
  const d = useFormDraft(formId, server, canEdit);
  const publish = useMutation(api.forms.publishForm);
  const reject = useMutation(api.forms.rejectPublication);
  const [tab, setTab] = useState<Tab>("Questions");
  /** What blocks publishing, listed until fixed; every other outcome is a toast. */
  const [problems, setProblems] = useState<string[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { toggle: togglePin, isPinned } = usePinned();
  useEffect(preloadTabs, []);
  // A draft created a moment ago finishes the create journey; anything else is an open.
  const [journey] = useState<Journey>(() => (journeyPending("form.create") ? "form.create" : "form.open"));
  useUsableMark(journey, !!data && !!d.draft);
  // Creation funnel: the first edit of a new draft (publishing is the last step, below).
  const editedNew = journey === "form.create" && !!d.draft && d.isDirty();
  useEffect(() => { if (editedNew) markStep("form.create", "first_edit"); }, [editedNew]);

  const report = useMemo(() => (d.draft ? checkDefinition(d.draft) : { errors: [], warnings: [] }), [d.draft]);
  // Getting started, one step at a time: a question, a look, then publish.
  const [guide, setGuide] = useState({ seenDesign: false, dismissed: true });
  useEffect(() => {
    try { setGuide({ seenDesign: localStorage.getItem("chaos.ui.seen-design") === "1", dismissed: localStorage.getItem("chaos.ui.guide-dismissed") === "1" }); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (tab !== "Design") return;
    setGuide((g) => ({ ...g, seenDesign: true }));
    try { localStorage.setItem("chaos.ui.seen-design", "1"); } catch { /* storage unavailable */ }
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) d.redo(); else d.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); d.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d]);

  if (data === undefined || (data && !d.draft)) return <PageSkeleton label={t.loading} />;
  if (data === null) {
    return (
      <div className="ws-empty">
        <h1 className="text-lg font-semibold">{t.notFound}</h1>
        <p className="text-sm text-muted-foreground">{t.notFoundHelp}</p>
        <Link href="/dashboard" className="ws-btn ws-btn--primary">{t.backToLibrary}</Link>
      </div>
    );
  }
  const def = d.draft!;
  const dirty = d.isDirty();
  const published = data.publishedVersion !== undefined;
  const needsApproval = data.role !== "owner" && data.settings.requireApproval;
  const quiz = def.quiz?.enabled ?? false;
  const save = saveLabel(d.saveState, dirty, t);

  const handlePublish = async () => {
    setProblems(null);
    if (report.errors.length) {
      setProblems(report.errors.map((e) => localizeMessage(locale, e)));
      toast.error(t.fixBefore, { id: "publish" });
      return;
    }
    setPublishing(true);
    try {
      if (!(await d.save())) {
        toast.error(t.saveFirst, { id: "publish" });
        return;
      }
      const result = await publish({ formId, expectedRevision: d.revision() });
      posthog.capture("form_published", { outcome: result.outcome, form_type: quiz ? "quiz" : "form" });
      // First time it goes live: offer the link, QR code and embed right away.
      if (result.outcome !== "approval_requested" && !published) setSharing(true);
      if (result.outcome !== "approval_requested" && journey === "form.create") markStep("form.create", "published");
      if (result.outcome === "approval_requested") toast.info(t.requested, { id: "publish" });
      else toast.success(t.published(result.version), { id: "publish" });
    } catch (err) {
      const { code, message: rawMessage } = parseError(err);
      if (code === "PUBLICATION_BLOCKED") { setProblems(localizeMessage(locale, rawMessage).split("\n").filter(Boolean)); toast.error(t.fixBefore, { id: "publish" }); }
      else toast.error(err, { id: "publish" });
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error(t.noClipboard);
      }
      await navigator.clipboard.writeText(`${linkOrigin("main")}/f/${data.shareId}`);
      toast.success(t.linkCopied, { id: "copy-link" });
    } catch (err) {
      toast.error(err, { fallback: t.copyFailed, id: "copy-link" });
    }
  };

  /** Tell people what just happened; draft changes undo through the draft history by default. */
  const announce = (text: string, undo: (() => void) | null = d.undo) => toast(text, { undo: undo ?? undefined });
  const { hasAccessCode, accessCodeHash: _hash, ...editableSettings } = data.settings;
  const kindLabel = quiz ? "quiz" : "form";
  const tabIcons = Object.fromEntries(allTabs.map((k) => [t.tabs[k], tabIconByKey[k]]));
  // Schedules always show their zone: the one the creator chose, or this browser's for older schedules.
  const fmtZoned = (ms: number) => formatScheduleTime(ms, data.settings.timezone, locale);
  // Limits are easy to forget once set, so they stay visible under the title.
  const limits = [
    data.settings.opensAt !== undefined && data.settings.opensAt > Date.now() ? t.opens(fmtZoned(data.settings.opensAt)) : "",
    data.settings.closesAt !== undefined ? (data.settings.closesAt > Date.now() ? t.closes : t.closed)(fmtZoned(data.settings.closesAt)) : "",
    data.settings.responseLimit !== undefined ? t.ofLimit(data.responseCount, data.settings.responseLimit) : "",
  ].filter(Boolean);

  return (
    <div className="space-y-5 font-sans">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/dashboard" className="ws-btn ws-btn--ghost -ms-3"><ArrowLeft size={17} className="rtl:rotate-180" /> {t.library}</Link>
          <div className="flex items-center gap-1.5 flex-wrap">
            {canEdit && (
              <span className="flex items-center">
                <button type="button" className="ws-icon-button" onClick={d.undo} disabled={!d.canUndo} aria-label={t.undo} title={t.undoTitle}><Undo2 size={17} /></button>
                <button type="button" className="ws-icon-button" onClick={d.redo} disabled={!d.canRedo} aria-label={t.redo} title={t.redoTitle}><Redo2 size={17} /></button>
              </span>
            )}
            <span className="ws-save-state me-2" aria-live="polite" style={save.tone === "warn" ? { color: "var(--error)" } : undefined}>
              {canEdit ? save.text : data.status === "archived" ? t.archivedReadOnly : t.readOnly}
            </span>
            <Link href={`/dashboard/forms/${formId}/responses`} aria-label={t.results(data.responseCount)} className="ws-btn ws-btn--ghost"><BarChart3 size={17} /><span className="ws-phone-hide">{t.results(data.responseCount)}</span></Link>
            <button type="button" onClick={() => setPreviewing(true)} aria-label={t.preview} className="ws-btn"><Play size={16} /><span className="ws-phone-hide">{t.preview}</span></button>
            {published && data.status === "live" && <button type="button" onClick={() => setSharing(true)} aria-label={t.share} className="ws-btn"><Share2 size={16} /><span className="ws-phone-hide">{t.share}</span></button>}
            {canEdit && quiz && published && data.status !== "archived" && <HostLiveButton formId={formId} />}
            {canEdit && (
              <button type="button" onClick={handlePublish} disabled={publishing || (data.approvalPending && needsApproval)} className="ws-btn ws-btn--primary">
                {publishing ? t.publishing : needsApproval ? (data.approvalPending ? t.awaiting : t.requestPublication) : published ? (data.hasUnpublishedChanges || dirty ? t.publishChanges : <><Check size={16} /> {t.publishedLabel}</>) : t.publish}
              </button>
            )}
            <WsMenu label={t.moreActions}>
              {(close) => (
                <>
                  <button type="button" role="menuitem" onClick={() => { close(); togglePin(formId); }}>
                    {isPinned(formId) ? <PinOff size={16} /> : <Pin size={16} />} {isPinned(formId) ? t.unpin : t.pin}
                  </button>
                  {published && (
                    <>
                      <hr />
                      <a role="menuitem" href={`/f/${data.shareId}`} target="_blank" rel="noreferrer" onClick={close}><ExternalLink size={16} /> {t.openLive}</a>
                      <button type="button" role="menuitem" onClick={() => { close(); void copyLink(); }}><Copy size={16} /> {t.copyLink}</button>
                    </>
                  )}
                </>
              )}
            </WsMenu>
          </div>
        </div>
        <div className="min-w-0">
          <label className="sr-only" htmlFor="form-title">{quiz ? t.quizTitle : t.formTitle}</label>
          <input id="form-title" value={def.title} disabled={!canEdit} maxLength={200} placeholder={quiz ? t.untitledQuiz : t.untitledForm}
            onChange={(e) => d.change((x) => ({ ...x, title: e.target.value }))} className="ws-title-input" />
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <StatusBadge status={data.status} edited={data.hasUnpublishedChanges || (published && dirty)} />
            <span className="text-[var(--ws-line-strong)]" aria-hidden="true">|</span>
            <WsSwitch checked={quiz} disabled={!canEdit} label={t.quizMode} onChange={(on) => d.change((x) => ({ ...x, quiz: { enabled: on } }))} />
            {limits.length > 0 && (
              <>
                <span className="text-[var(--ws-line-strong)]" aria-hidden="true">|</span>
                <button type="button" className="ws-link-quiet" onClick={() => setTab("Settings")} title={t.changeLimits}>{limits.join(" · ")}</button>
              </>
            )}
          </div>
          {(data.role !== "owner" || data.source) && (
            <p className="text-xs text-muted-foreground mt-2">
              {data.role !== "owner" && t.role(data.role, quiz ? t.kindQuiz : t.kindForm)}
              {data.source && t.createdFrom(data.source.kind, data.source.label)}
              {data.source?.external && <SourceDetails source={data.source.external} />}
            </p>
          )}
        </div>
      </header>

      {data.role === "owner" && canEdit && quiz && <QuizLearningLinks asset={{ kind: "form", id: formId }} title={def.title} published={published} />}
      {canEdit && quiz && <div className="ws-next-step"><span className="flex-1 text-sm">{t.gameGuide}</span><Link href="/dashboard?tab=games" className="ws-btn ws-btn--sm">{t.gameGuideLink}</Link></div>}
      {canEdit && !published && !guide.dismissed && (() => {
        const steps = [
          { done: def.fields.some((f) => f.type !== "section" && f.type !== "statement" && f.label.trim() !== ""), text: t.step1, action: t.step1Action, run: () => { setTab("Questions"); requestAnimationFrame(() => { const first = document.querySelector<HTMLInputElement>("[role=tabpanel] ol input.kb-input"); if (first) first.focus(); else document.querySelector(`[aria-label='${t.addQuestionLabel}']`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }); } },
          { done: guide.seenDesign, text: t.step2, action: t.step2Action, run: () => setTab("Design") },
          { done: false, text: t.step3, action: t.step3Action, run: () => void handlePublish() },
        ];
        const index = steps.findIndex((s) => !s.done);
        const step = steps[index];
        return (
          <div className="ws-next-step ws-page" role="status" aria-label={t.guideLabel}>
            <span className="ws-next-step__count" aria-hidden="true">{index + 1}</span>
            <span className="min-w-0 flex-1">{step.text}</span>
            <span className="ws-next-step__dots" aria-label={t.stepOf(index + 1, steps.length)}>{steps.map((s, i) => <span key={i} data-done={i < index} />)}</span>
            <button type="button" className="ws-btn ws-btn--sm ws-btn--primary" onClick={step.run}>{step.action}</button>
            <button type="button" className="ws-icon-button" aria-label={t.hideGuide} onClick={() => { setGuide((g) => ({ ...g, dismissed: true })); try { localStorage.setItem("chaos.ui.guide-dismissed", "1"); } catch { /* storage unavailable */ } }}><X size={15} /></button>
          </div>
        );
      })()}
      {d.recovery && canEdit && (
        <div role="alert" className="chaos-card border-primary p-4 flex flex-wrap items-center gap-3 text-sm ws-page">
          <span className="flex-1">{t.recovery(timeAgo(locale, d.recovery.savedAt))}</span>
          <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" onClick={d.restoreRecovery}>{t.restore}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={d.discardRecovery}>{t.discard}</button>
        </div>
      )}
      {d.saveState.kind === "conflict" && (
        <div role="alert" className="chaos-card border-destructive p-4 flex flex-wrap items-center gap-3 text-sm ws-page">
          <span className="flex-1">{t.conflictMsg(kindLabel)}</span>
          <button type="button" className="ws-btn ws-btn--sm" onClick={d.loadTheirs}>{t.loadTheirs}</button>
          <button type="button" className="ws-btn ws-btn--danger ws-btn--sm" onClick={() => void d.keepMine()}>{t.keepMine}</button>
        </div>
      )}
      {d.saveState.kind === "error" && (
        <div role="alert" className="chaos-card border-destructive p-4 flex items-center gap-3 text-sm ws-page">
          <span className="flex-1">{localizeMessage(locale, d.saveState.message)}</span>
          <button type="button" className="ws-btn ws-btn--sm" onClick={() => void d.save()}>{t.retry}</button>
        </div>
      )}
      {data.approval && data.role === "owner" && (
        <div className="chaos-card border-primary p-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="flex-1">{t.approvalMsg(data.approval.requestedByName, timeAgo(locale, data.approval.requestedAt))}</span>
          <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" onClick={handlePublish}>{t.approve}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => reject({ formId }).catch((e) => toast.error(e))}>{t.decline}</button>
        </div>
      )}
      {problems && (
        <div role="alert" className="chaos-card p-4 text-sm flex gap-3 ws-page border-destructive">
          <div className="flex-1">
            <p>{t.fixBefore}</p>
            <ul className="list-disc ps-5 mt-2 space-y-1">{problems.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
          <button type="button" onClick={() => setProblems(null)} aria-label={t.dismiss} className="ws-icon-button"><X size={15} /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4"><div className="flex-1 min-w-0"><WsTabs tabs={primaryTabs.map(k => t.tabs[k])} value={t.tabs[tab]} onChange={name => setTab(primaryTabs.find(k => t.tabs[k] === name) ?? "Questions")} label={t.builder} icons={tabIcons} /></div><WsMenu label={locale === "ar" ? "المزيد" : "More"} trigger={<span>{advancedTabs.some(k => k === tab) ? t.tabs[tab] : locale === "ar" ? "المزيد" : "More"}</span>}>{close => <>{advancedTabs.map(k => <button type="button" role="menuitemradio" aria-checked={tab === k} key={k} onClick={() => { close(); setTab(k); }}>{t.tabs[k]}</button>)}</>}</WsMenu></div>

      {/* The question editor is the expensive part of the builder: it stays mounted (hidden) while
          another tab is open, so coming back keeps its DOM, focus targets and scroll instead of rebuilding.
          Other tabs mount on demand, so a keystroke never re-renders a hidden Design or Logic tab. */}
      <Activity mode={tab === "Questions" ? "visible" : "hidden"}>
        <div className="grid grid-cols-1 gap-6 ws-page" role="tabpanel" aria-label={t.tabs.Questions}>
          <div className="max-w-3xl mx-auto w-full space-y-4">
            {(report.errors.length > 0 || report.warnings.length > 0) && (
              <details className="chaos-card px-4 py-3" aria-label={t.checks}>
                <summary className="cursor-pointer text-[14.5px] font-semibold flex items-center gap-2">
                  <span className="ws-dot" style={{ background: report.errors.length ? "var(--error)" : "var(--ws-warning)" }} />
                  {report.errors.length ? t.fixCount(report.errors.length) : t.suggestions}
                </summary>
                {report.errors.length > 0 && <ul className="mt-2 text-sm text-destructive list-disc ps-5 space-y-1">{report.errors.map((e) => <li key={e}>{localizeMessage(locale, e)}</li>)}</ul>}
                {report.warnings.length > 0 && <ul className="mt-2 text-sm text-muted-foreground list-disc ps-5 space-y-1">{report.warnings.map((e) => <li key={e}>{localizeMessage(locale, e)}</li>)}</ul>}
              </details>
            )}
            <BuildTab def={def} change={d.change} readOnly={!canEdit} notice={(text) => toast.success(text)} announce={announce} />
          </div>
        </div>
      </Activity>
      {tab !== "Questions" && <div key={tab} className="grid grid-cols-1 gap-6 ws-page" role="tabpanel" aria-label={t.tabs[tab]}>
        {tab === "Logic" && <LogicTab def={def} change={d.change} readOnly={!canEdit} errors={report.errors} />}
        {tab === "Translate" && <TranslateTab def={def} change={d.change} readOnly={!canEdit} />}
        {tab === "Design" && <DesignTab def={def} change={d.change} readOnly={!canEdit} onFullPreview={() => setPreviewing(true)} announce={announce} />}
        {tab === "Settings" && (<>
          <SettingsTab formId={formId} settings={editableSettings} hasAccessCode={hasAccessCode} groupName={data.groupName} status={data.status}
            published={published} def={def} isOwner={data.role === "owner"} announce={announce} slug={data.slug} shareId={data.shareId} canHideBranding={data.canHideBranding} />
          {published && <EmbedPanel formId={formId} link={`${linkOrigin("main")}/f/${data.shareId}`} title={def.title} />}
        </>)}
        {tab === "Share" && <ShareTab formId={formId} shareId={data.shareId} title={def.title} published={published} status={data.status} slug={data.slug} />}
        {tab === "Team" && <TeamTab formId={formId} role={data.role} def={def} />}
        {tab === "History" && <HistoryTab formId={formId} versions={data.versions} canEdit={canEdit} revision={d.revision} beforeRestore={d.save} />}
      </div>}
      {previewing && <FullPreview def={def} onClose={() => setPreviewing(false)} />}
      {sharing && <SharePopup formId={formId} shareId={data.shareId} slug={data.slug} title={def.title} quiz={quiz} onClose={() => setSharing(false)} />}
    </div>
  );
}
