"use client";

import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useMemo } from "react";
import { haptics } from "@/lib/haptics";
import { Select } from "@/components/workspace/Select";
import { useUser } from "@/lib/auth/client";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Globe, Lock, RefreshCw, Check, X, GripVertical,
  Shuffle, Eye, EyeOff, ListOrdered, ChevronsUpDown, ChevronsDownUp, Undo2, Redo2,
  Copy, AlertTriangle, CloudOff, ExternalLink,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { DropResult } from "@hello-pangea/dnd";
import LoadingState from "@/components/LoadingState";
import {
  type EditorDraft, type QuestionDraft, type QuestionType, blankQuestion, changeQuestionType,
  duplicateQuestion, publicationProblems, questionTypes,
  moveItem,
} from "./editor-draft";
import { useEditorDraft, type SaveState } from "./use-editor-draft";
import { useCopy, useLocale, dateLocale, formatDateTime } from "@/lib/i18n";
import { localizeMessage } from "@/lib/messages";

const copy = {
  en: {
    saved: "All changes saved", saving: "Saving…", offline: "Offline — changes kept in this browser", conflict: "Not saved — edited elsewhere", notSaved: "Not saved",
    unsavedLocal: "Unsaved changes (kept locally)", savedAt: (time: string) => `Saved ${time}`,
    initializing: "Initializing editor...", notFoundTitle: "Quiz not found", notFoundBody: "It may have been deleted, or you may not have access.", backDashboard: "Back to dashboard", loadingQuiz: "Loading quiz...",
    statusDraft: "Draft", statusLiveChanges: "Live · unpublished changes", statusLive: "Live",
    editor: "Editor", undo: "Undo", undoTitle: "Undo (Ctrl+Z)", redo: "Redo", redoTitle: "Redo (Ctrl+Shift+Z)", livePage: "Live page", unpublish: "Unpublish", publishChanges: "Publish changes", publish: "Publish", done: "Done",
    recovery: (when: string) => `Unsaved changes from ${when} were found in this browser. They have not been saved to the server.`, restore: "Restore", discard: "Discard",
    changedElsewhere: "This quiz was changed in another tab or device. Your version is kept in this browser.", loadTheirs: "Load their version", keepMine: "Keep mine", retry: "Retry",
    offlineNote: "You are offline. Changes are stored in this browser and will be saved when you retry online.", fixBefore: "Fix before publishing",
    quizSettings: "Quiz settings", title: "Title", titlePlaceholder: "Give your quiz a name...", description: "Description (optional)", slug: "URL slug",
    slugChanging: "Changing the slug changes the public link; old links stop working.", slugRules: "Lowercase letters, numbers and single hyphens.",
    group: "Folder / group", groupPlaceholder: "E.g. Biology 101...", threshold: "Passing threshold (%)", pool: "Question pool",
    poolOn: (n: number, total: number) => `Each attempt answers ${n} random questions from ${total}.`, poolOff: "0 = every attempt answers every question.",
    results: "Results", showImmediately: "Show scores immediately", holdScores: "Hold scores until I release them", heldNote: "Held results let you grade written answers first. Release them from Results.",
    quizOptions: "Quiz options", randQuestions: "Randomize question order", randOptions: "Randomize answer options", showCorrect: "Show correct answers", showExpl: "Show explanations", disableAnim: "Disable animations",
    questionsHeading: (n: number) => `Questions (${n})`, toFix: (n: number) => `· ${n} to fix before publishing`, expandAll: "Expand all", collapseAll: "Collapse all", selectNone: "Select none", selectAll: "Select all",
    selectedCount: (n: number) => `${n} selected`, marksForSelected: "Marks for selected", marks: "Marks", timerForSelected: "Timer for selected", timerPlaceholder: "Timer (s)", apply: "Apply", duplicate: "Duplicate", remove: "Remove", clearSelection: "Clear selection",
    reorder: (n: number) => `Reorder question ${n}`, moveUp: (n: number) => `Move question ${n} up`, moveDown: (n: number) => `Move question ${n} down`, moved: (n: number, total: number) => `Question moved to position ${n} of ${total}`, selectQuestion: (n: number) => `Select question ${n}`, untitled: "Untitled question...", pointsBadge: (n: number) => `${n} Marks`, incomplete: "Incomplete",
    typeMcq: "Multiple choice", typeTf: "True / False", typeMulti: "Multi-select", typeWritten: "Written",
    questionType: "Question type", question: "Question", questionPlaceholder: "Type your question here...",
    options: "Options", pickCorrect: "Select the correct answer", pickAllCorrect: "Select all correct answers",
    markCorrect: (l: string) => `Mark option ${l} correct`, option: (l: string) => `Option ${l}`, optionPlaceholder: (l: string) => `Option ${l}...`, removeOption: (l: string) => `Remove option ${l}`, addOption: "+ Add option",
    correctAnswer: "Correct answer", trueLabel: "TRUE", falseLabel: "FALSE",
    keywords: "Grading keywords (optional)", keywordsNote: "Keywords are matched as whole words. Meaning is not checked. A blank answer gets 0. An answer with all the keywords gets full marks. If the share of keywords found is at least the \"Half marks from\" percentage in Settings, it gets half marks. Otherwise it gets 0. With no keywords, any non-blank answer gets full marks. You can change any grade in Results.",
    multiNote: "All or nothing: a respondent gets full marks only by choosing exactly the correct answers. A missing or extra choice scores 0. There is no partial credit.",
    removeKeyword: (k: string) => `Remove keyword ${k}`, keywordPlaceholder: "Add a keyword and press Enter", add: "Add",
    hint: "Hint (optional)", explanation: "Explanation (optional)", explanationPlaceholder: "Explain why this is correct...", timer: "Timer (s)", removeQuestion: (n: number) => `Remove question ${n}`,
    loadingEditor: "Loading editor...",
  },
  ar: {
    saved: "حُفظت كل التغييرات", saving: "جارٍ الحفظ…", offline: "غير متصل — التغييرات محفوظة في هذا المتصفح", conflict: "لم يُحفظ — عُدّل في مكان آخر", notSaved: "لم يُحفظ",
    unsavedLocal: "تغييرات غير محفوظة (محفوظة محليًا)", savedAt: (time: string) => `حُفظ ${time}`,
    initializing: "جارٍ تهيئة المحرر...", notFoundTitle: "الاختبار غير موجود", notFoundBody: "ربما حُذف، أو ليس لديك صلاحية الوصول إليه.", backDashboard: "العودة إلى لوحة التحكم", loadingQuiz: "جارٍ تحميل الاختبار...",
    statusDraft: "مسودة", statusLiveChanges: "منشور · تغييرات غير منشورة", statusLive: "منشور",
    editor: "المحرر", undo: "تراجع", undoTitle: "تراجع (Ctrl+Z)", redo: "إعادة", redoTitle: "إعادة (Ctrl+Shift+Z)", livePage: "الصفحة المنشورة", unpublish: "أوقف النشر", publishChanges: "انشر التغييرات", publish: "انشر", done: "تم",
    recovery: (when: string) => `وُجدت في هذا المتصفح تغييرات غير محفوظة من ${when}. لم تُحفظ على الخادم.`, restore: "استعد", discard: "تجاهل",
    changedElsewhere: "تغيّر هذا الاختبار في تبويب أو جهاز آخر. نسختك محفوظة في هذا المتصفح.", loadTheirs: "حمّل نسختهم", keepMine: "أبقِ نسختي", retry: "أعد المحاولة",
    offlineNote: "أنت غير متصل. التغييرات مخزنة في هذا المتصفح وستُحفظ عند إعادة المحاولة بعد الاتصال.", fixBefore: "أصلح هذه الأمور قبل النشر",
    quizSettings: "إعدادات الاختبار", title: "العنوان", titlePlaceholder: "اكتب اسمًا للاختبار...", description: "الوصف (اختياري)", slug: "معرّف الرابط",
    slugChanging: "تغيير المعرّف يغيّر الرابط العام، وتتوقف الروابط القديمة عن العمل.", slugRules: "أحرف إنجليزية صغيرة وأرقام وشرطات مفردة.",
    group: "المجلد / المجموعة", groupPlaceholder: "مثال: أحياء 101...", threshold: "حد النجاح (%)", pool: "مجموعة الأسئلة",
    poolOn: (n: number, total: number) => `تجيب كل محاولة عن ${n} أسئلة عشوائية من ${total}.`, poolOff: "0 = تجيب كل محاولة عن كل الأسئلة.",
    results: "النتائج", showImmediately: "اعرض الدرجات فورًا", holdScores: "احجب الدرجات حتى أعلنها", heldNote: "حجب النتائج يتيح لك تصحيح الإجابات المكتوبة أولًا. أعلنها من صفحة النتائج.",
    quizOptions: "خيارات الاختبار", randQuestions: "ترتيب الأسئلة عشوائيًا", randOptions: "ترتيب الخيارات عشوائيًا", showCorrect: "إظهار الإجابات الصحيحة", showExpl: "إظهار الشروح", disableAnim: "تعطيل الحركة",
    questionsHeading: (n: number) => `الأسئلة (${n})`, toFix: (n: number) => `· ${n} للإصلاح قبل النشر`, expandAll: "وسّع الكل", collapseAll: "اطوِ الكل", selectNone: "إلغاء التحديد", selectAll: "تحديد الكل",
    selectedCount: (n: number) => `${n} محدد`, marksForSelected: "نقاط المحدد", marks: "النقاط", timerForSelected: "مؤقت المحدد", timerPlaceholder: "المؤقت (ث)", apply: "طبّق", duplicate: "تكرار", remove: "إزالة", clearSelection: "إلغاء التحديد",
    reorder: (n: number) => `أعد ترتيب السؤال ${n}`, moveUp: (n: number) => `انقل السؤال ${n} لأعلى`, moveDown: (n: number) => `انقل السؤال ${n} لأسفل`, moved: (n: number, total: number) => `نُقل السؤال إلى الموضع ${n} من ${total}`, selectQuestion: (n: number) => `حدّد السؤال ${n}`, untitled: "سؤال بلا عنوان...", pointsBadge: (n: number) => `${n} نقاط`, incomplete: "غير مكتمل",
    typeMcq: "اختيار من متعدد", typeTf: "صح / خطأ", typeMulti: "تحديد متعدد", typeWritten: "مكتوب",
    questionType: "نوع السؤال", question: "السؤال", questionPlaceholder: "اكتب سؤالك هنا...",
    options: "الخيارات", pickCorrect: "حدّد الإجابة الصحيحة", pickAllCorrect: "حدّد كل الإجابات الصحيحة",
    markCorrect: (l: string) => `اجعل الخيار ${l} صحيحًا`, option: (l: string) => `الخيار ${l}`, optionPlaceholder: (l: string) => `الخيار ${l}...`, removeOption: (l: string) => `أزل الخيار ${l}`, addOption: "+ أضف خيارًا",
    correctAnswer: "الإجابة الصحيحة", trueLabel: "صح", falseLabel: "خطأ",
    keywords: "كلمات التصحيح (اختياري)", keywordsNote: "تُطابَق الكلمات المفتاحية ككلمات كاملة، ولا يُفحص المعنى. الإجابة الفارغة تنال 0. الإجابة التي تضم كل الكلمات تنال النقاط كاملة. إذا بلغت نسبة الكلمات الموجودة نسبة «نصف الدرجة من» في الإعدادات أو زادت عليها نالت نصف النقاط، وإلا نالت 0. بدون كلمات مفتاحية تنال أي إجابة غير فارغة النقاط كاملة. يمكنك تعديل أي درجة من النتائج.",
    multiNote: "الكل أو لا شيء: تُمنح النقاط كاملة فقط عند اختيار الإجابات الصحيحة تمامًا. أي اختيار ناقص أو زائد ينال 0. لا توجد درجة جزئية.",
    removeKeyword: (k: string) => `أزل الكلمة ${k}`, keywordPlaceholder: "أضف كلمة واضغط Enter", add: "أضف",
    hint: "تلميح (اختياري)", explanation: "شرح (اختياري)", explanationPlaceholder: "اشرح لماذا هذه الإجابة صحيحة...", timer: "المؤقت (ث)", removeQuestion: (n: number) => `أزل السؤال ${n}`,
    loadingEditor: "جارٍ تحميل المحرر...",
  },
};

const DragDropContext = dynamic(() => import("@hello-pangea/dnd").then(m => m.DragDropContext), { ssr: false });
const Droppable = dynamic(() => import("@hello-pangea/dnd").then(m => m.Droppable), { ssr: false });
const Draggable = dynamic(() => import("@hello-pangea/dnd").then(m => m.Draggable), { ssr: false });

type Defaults = {
  randomizeQuestions?: boolean; randomizeOptions?: boolean; showCorrectAnswers?: boolean;
  showExplanations?: boolean; passingThreshold?: number; disableAnimations?: boolean;
};
type Settings = Defaults | null | undefined;
type Config = Defaults | null | undefined;

function toDraft(quiz: Doc<"quizzes">, questions: Doc<"questions">[], teacher: Settings, config: Config): EditorDraft {
  return {
    title: quiz.title,
    description: quiz.description ?? "",
    slug: quiz.slug,
    groupName: quiz.groupName ?? "",
    quizSettings: {
      randomizeQuestions: quiz.randomizeQuestions ?? teacher?.randomizeQuestions ?? config?.randomizeQuestions ?? false,
      randomizeOptions: quiz.randomizeOptions ?? teacher?.randomizeOptions ?? config?.randomizeOptions ?? true,
      showCorrectAnswers: quiz.showCorrectAnswers ?? teacher?.showCorrectAnswers ?? config?.showCorrectAnswers ?? true,
      showExplanations: quiz.showExplanations ?? teacher?.showExplanations ?? config?.showExplanations ?? true,
      passingThreshold: quiz.passingThreshold ?? teacher?.passingThreshold ?? config?.passingThreshold ?? 50,
      disableAnimations: quiz.disableAnimations ?? teacher?.disableAnimations ?? config?.disableAnimations ?? false,
      poolSize: quiz.poolSize ?? 0,
      resultRelease: quiz.resultRelease ?? "immediate",
    },
    // Every stored type and field is loaded as-is; nothing is coerced to MCQ.
    questions: questions.map((q) => ({
      clientKey: q._id,
      id: q._id,
      type: q.type,
      questionText: q.questionText,
      options: q.options ?? (q.type === "true_false" ? ["True", "False"] : []),
      correctAnswer: q.correctAnswer ?? "",
      correctAnswers: q.correctAnswers ?? [],
      keywords: q.keywords ?? [],
      points: q.points,
      timeLimit: q.timeLimit ?? quiz.timePerQuestion ?? 60,
      hint: q.hint ?? "",
      explanation: q.explanation ?? "",
    })),
  };
}

function SaveStatus({ state, dirty, storageError }: { state: SaveState; dirty: boolean; storageError: string | null }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  let text = t.saved;
  let icon = <Check size={12} />;
  if (state.kind === "saving") { text = t.saving; icon = <RefreshCw size={12} className="animate-spin text-primary" />; }
  else if (state.kind === "offline") { text = t.offline; icon = <CloudOff size={12} className="text-destructive" />; }
  else if (state.kind === "conflict") { text = t.conflict; icon = <AlertTriangle size={12} className="text-destructive" />; }
  else if (state.kind === "error") { text = t.notSaved; icon = <AlertTriangle size={12} className="text-destructive" />; }
  else if (dirty) { text = t.unsavedLocal; icon = <RefreshCw size={12} />; }
  else if (state.kind === "saved") { text = t.savedAt(state.at.toLocaleTimeString(dateLocale(locale))); }
  return (
    <div className="text-xs text-muted-foreground chaos-heading flex flex-col gap-1" aria-live="polite">
      <span className="flex items-center gap-2">{icon}{text}</span>
      {storageError && <span className="text-destructive normal-case font-semibold">{localizeMessage(locale, storageError)}</span>}
    </div>
  );
}

function EditorContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  // Next preserves the page when only the query string changes. A draft and
  // its recovery/undo state must belong to exactly one quiz and account.
  return <EditorSession key={`${user?.id ?? ""}:${searchParams.get("id") ?? ""}`} />;
}

function EditorSession() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const quizId = searchParams.get("id") as Id<"quizzes"> | null;

  const quiz = useQuery(api.quizFunctions.getQuizForOwner, quizId ? { quizId } : "skip");
  const existingQuestions = useQuery(api.quizFunctions.getQuestionsForOwner, quizId ? { quizId } : "skip");
  const teacherSettings = useQuery(api.quizFunctions.getTeacherSettings);
  const globalConfig = useQuery(api.quizFunctions.getGlobalConfig);
  const myQuizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const existingGroups = Array.from(new Set((myQuizzes || []).map(q => q.groupName).filter(Boolean)));

  const editor = useEditorDraft(quizId, user?.id);
  const { draft, change } = editor;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkTimer, setBulkTimer] = useState("");

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!quizId) router.replace("/dashboard"); }, [quizId, router]);

  const ready = quiz && existingQuestions !== undefined && teacherSettings !== undefined && globalConfig !== undefined;
  useEffect(() => {
    if (ready && quiz) {
      editor.initialize(toDraft(quiz, existingQuestions, teacherSettings, globalConfig), quiz.updatedAt);
    }
    // initialize is idempotent; later reactive updates must not overwrite local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keyboard undo/redo outside text fields' native history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo(); else editor.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  const [moveNote, setMoveNote] = useState("");
  const problems = useMemo(() => (draft ? publicationProblems(draft) : []), [draft]);
  const changedElsewhere = !!quiz && editor.revision !== undefined && quiz.updatedAt > editor.revision && editor.saveState.kind !== "saving";
  const isPublished = quiz?.isPublished ?? false;
  const hasUnpublishedChanges = isPublished && (editor.dirty || (quiz?.publishedAt !== undefined && quiz.updatedAt > quiz.publishedAt));
  const defaultTimer = teacherSettings?.defaultMcqTimer || globalConfig?.defaultMcqTimer || 60;
  const defaultPoints = teacherSettings?.defaultPointsPerQuestion || 1;

  if (!mounted || !quizId) return <LoadingState label={t.initializing} className="py-20 h-full" />;
  if (quiz === null) {
    return (
      <div className="chaos-card bg-card p-10 text-center max-w-lg mx-auto">
        <h1 className="chaos-heading text-xl mb-2">{t.notFoundTitle}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t.notFoundBody}</p>
        <button className="kb-btn kb-btn-primary" onClick={() => router.push("/dashboard")}>{t.backDashboard}</button>
      </div>
    );
  }
  if (!draft) return <LoadingState label={t.loadingQuiz} className="py-20 h-full" />;

  const setQuestions = (update: (qs: QuestionDraft[]) => QuestionDraft[]) =>
    change((d) => ({ ...d, questions: update(d.questions) }));
  const updateQ = (key: string, updates: Partial<QuestionDraft> | ((q: QuestionDraft) => QuestionDraft)) =>
    setQuestions((qs) => qs.map((q) => (q.clientKey === key ? (typeof updates === "function" ? updates(q) : { ...q, ...updates }) : q)));
  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => change((d) => ({ ...d, [field]: value }));

  const addQuestion = (type: QuestionType = "mcq") => {
    haptics.light();
    const q = blankQuestion(type, type === "written" ? (teacherSettings?.defaultWrittenTimer || 300) : defaultTimer, defaultPoints);
    setQuestions((qs) => [...qs, q]);
    setExpanded(new Set([q.clientKey]));
  };

  const removeQuestions = (keys: Set<string>) => {
    if (!keys.size) return;
    haptics.heavy();
    // Removal is local until the draft is saved; undo restores it. Saved
    // questions are soft-deleted server-side so past answers keep their prompt.
    setQuestions((qs) => qs.filter((q) => !keys.has(q.clientKey)));
    setSelected((s) => new Set([...s].filter((k) => !keys.has(k))));
  };

  const duplicate = (keys: Set<string>) => {
    setQuestions((qs) => qs.flatMap((q) => (keys.has(q.clientKey) ? [q, duplicateQuestion(q)] : [q])));
  };

  const applyBulk = () => {
    const points = bulkPoints === "" ? undefined : Number(bulkPoints);
    const timer = bulkTimer === "" ? undefined : Number(bulkTimer);
    setQuestions((qs) => qs.map((q) => selected.has(q.clientKey)
      ? { ...q, ...(points !== undefined && Number.isFinite(points) ? { points } : {}), ...(timer !== undefined && Number.isFinite(timer) ? { timeLimit: timer } : {}) }
      : q));
    setBulkPoints("");
    setBulkTimer("");
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    haptics.light();
    setQuestions((qs) => {
      const next = [...qs];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      return next;
    });
  };

  const moveQuestion = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= draft.questions.length) return;
    haptics.light();
    setQuestions((qs) => moveItem(qs, index, delta));
    setMoveNote(t.moved(to + 1, draft.questions.length));
  };

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  const handleDone = async () => {
    haptics.heavy();
    if (await editor.save()) router.push("/dashboard");
  };

  const typeLabels: Record<QuestionType, string> = { mcq: t.typeMcq, true_false: t.typeTf, multi_select: t.typeMulti, written: t.typeWritten };
  const statusLabel = !isPublished ? t.statusDraft : hasUnpublishedChanges ? t.statusLiveChanges : t.statusLive;

  return (
    <div className="max-w-4xl mx-auto pb-36 space-y-8 font-sans">
      {/* ── HEADER */}
      <div className="chaos-card bg-background p-5 sticky top-14 z-10 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="chaos-heading text-2xl">{t.editor}</h1>
              <span className={`chaos-heading text-xs px-2 py-1 border-2 flex items-center gap-1.5 ${isPublished ? "border-primary bg-chaos text-chaos-foreground" : "border-foreground/30 text-muted-foreground"}`}>
                {isPublished ? <Globe size={11} /> : <Lock size={11} />}
                {statusLabel}
              </span>
            </div>
            <SaveStatus state={editor.saveState} dirty={editor.dirty} storageError={editor.storageError} />
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button onClick={editor.undo} disabled={!editor.canUndo} className="kb-btn kb-btn-ghost text-xs px-3 disabled:opacity-40" title={t.undoTitle} aria-label={t.undo}><Undo2 size={14} /></button>
            <button onClick={editor.redo} disabled={!editor.canRedo} className="kb-btn kb-btn-ghost text-xs px-3 disabled:opacity-40" title={t.redoTitle} aria-label={t.redo}><Redo2 size={14} /></button>
            {isPublished && quiz && (
              <a href={`/${quiz.creatorUsername}/${quiz.slug}`} target="_blank" rel="noopener noreferrer" className="kb-btn kb-btn-ghost text-xs flex items-center gap-1.5">
                <ExternalLink size={14} /> {t.livePage}
              </a>
            )}
            {isPublished && (
              <button onClick={() => void editor.unpublish()} className="kb-btn kb-btn-ghost text-xs flex items-center gap-1.5">
                <Lock size={14} /> {t.unpublish}
              </button>
            )}
            {(!isPublished || hasUnpublishedChanges) && (
              <button onClick={async () => { if (await editor.publish()) haptics.success(); else haptics.error(); }} className="kb-btn kb-btn-primary text-xs flex items-center gap-1.5">
                <Globe size={14} /> {isPublished ? t.publishChanges : t.publish}
              </button>
            )}
            <button onClick={handleDone} className="kb-btn kb-btn-ghost text-xs flex items-center gap-1.5">
              <Check size={15} /> {t.done}
            </button>
          </div>
        </div>

        {editor.recovery && (
          <div role="alert" className="border-2 border-primary bg-primary/5 p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <span>
              {t.recovery(formatDateTime(locale, editor.recovery.savedAt))}
            </span>
            <span className="flex gap-2 shrink-0">
              <button className="kb-btn kb-btn-primary text-xs" onClick={editor.restore}>{t.restore}</button>
              <button className="kb-btn kb-btn-ghost text-xs" onClick={editor.discardRecovery}>{t.discard}</button>
            </span>
          </div>
        )}
        {(editor.saveState.kind === "conflict" || changedElsewhere) && quiz && existingQuestions && (
          <div role="alert" className="border-2 border-destructive bg-destructive/5 p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <span>{t.changedElsewhere}</span>
            <span className="flex gap-2 shrink-0">
              <button className="kb-btn kb-btn-ghost text-xs" onClick={() => editor.reloadFromServer(toDraft(quiz, existingQuestions, teacherSettings, globalConfig), quiz.updatedAt)}>{t.loadTheirs}</button>
              <button className="kb-btn kb-btn-danger text-xs" onClick={editor.overwrite}>{t.keepMine}</button>
            </span>
          </div>
        )}
        {editor.saveState.kind === "error" && (
          <div role="alert" className="border-2 border-destructive bg-destructive/5 p-3 text-sm flex items-center justify-between gap-3">
            <span className="text-destructive font-semibold whitespace-pre-line">{localizeMessage(locale, editor.saveState.message)}</span>
            <button className="kb-btn kb-btn-ghost text-xs shrink-0" onClick={editor.retry}>{t.retry}</button>
          </div>
        )}
        {editor.saveState.kind === "offline" && (
          <div role="status" className="border-2 border-foreground/30 p-3 text-sm flex items-center justify-between gap-3">
            <span>{t.offlineNote}</span>
            <button className="kb-btn kb-btn-ghost text-xs shrink-0" onClick={editor.retry}>{t.retry}</button>
          </div>
        )}
        {editor.publishProblems.length > 0 && (
          <div role="alert" className="border-2 border-destructive bg-destructive/5 p-3 text-sm">
            <p className="chaos-heading text-xs text-destructive mb-2">{t.fixBefore}</p>
            <ul className="list-disc ps-5 space-y-1">
              {editor.publishProblems.map((p) => <li key={p}>{localizeMessage(locale, p)}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* ── QUIZ SETTINGS */}
      <div className="chaos-card bg-card p-6 sm:p-8 space-y-6">
        <h2 className="chaos-heading text-sm text-muted-foreground">{t.quizSettings}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="sm:col-span-2">
            <label htmlFor="quiz-title" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.title}</label>
            <input id="quiz-title" type="text" value={draft.title} onChange={e => setField("title", e.target.value)} className="kb-input text-lg" placeholder={t.titlePlaceholder} maxLength={500} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="quiz-description" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.description}</label>
            <textarea id="quiz-description" value={draft.description} onChange={e => setField("description", e.target.value)} className="kb-input min-h-[60px] text-sm" rows={2} maxLength={10000} />
          </div>
          <div>
            <label htmlFor="quiz-slug" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.slug}</label>
            <div className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold">/</span>
              <input
                id="quiz-slug" type="text" value={draft.slug}
                onChange={e => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className={`kb-input ps-7 ${/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) ? "" : "border-destructive"}`}
                placeholder="my-quiz" maxLength={120}
                aria-describedby="slug-help"
              />
            </div>
            <p id="slug-help" className="text-[11px] text-muted-foreground mt-1">
              {isPublished ? t.slugChanging : t.slugRules}
            </p>
          </div>
          <div>
            <label htmlFor="quiz-group" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.group}</label>
            <input id="quiz-group" type="text" value={draft.groupName} onChange={e => setField("groupName", e.target.value)} list="quiz-groups" className="kb-input" placeholder={t.groupPlaceholder} maxLength={200} />
            <datalist id="quiz-groups">{existingGroups.map(g => <option key={g} value={g} />)}</datalist>
          </div>
          <div>
            <label htmlFor="quiz-threshold" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.threshold}</label>
            <input id="quiz-threshold" type="number" min={0} max={100} value={draft.quizSettings.passingThreshold}
              onChange={e => setField("quizSettings", { ...draft.quizSettings, passingThreshold: e.target.value === "" ? NaN : Number(e.target.value) })}
              className="kb-input" />
          </div>
          <div>
            <label htmlFor="quiz-pool" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.pool}</label>
            <input id="quiz-pool" type="number" min={0} max={draft.questions.length} value={Number.isNaN(draft.quizSettings.poolSize) ? "" : draft.quizSettings.poolSize}
              onChange={e => setField("quizSettings", { ...draft.quizSettings, poolSize: e.target.value === "" ? NaN : Number(e.target.value) })}
              className="kb-input" aria-describedby="quiz-pool-hint" />
            <p id="quiz-pool-hint" className="text-[11px] text-muted-foreground mt-1">
              {draft.quizSettings.poolSize > 0 ? t.poolOn(draft.quizSettings.poolSize, draft.questions.length) : t.poolOff}
            </p>
          </div>
          <div>
            <label htmlFor="quiz-release" className="block chaos-heading text-xs text-muted-foreground mb-2">{t.results}</label>
            <Select id="quiz-release" value={draft.quizSettings.resultRelease} className="w-full"
              onChange={(value) => setField("quizSettings", { ...draft.quizSettings, resultRelease: value })}
              options={[{ value: "immediate", label: t.showImmediately }, { value: "manual", label: t.holdScores }]} />
            <p className="text-[11px] text-muted-foreground mt-1">{t.heldNote}</p>
          </div>
        </div>
        <div className="border-t border-foreground/10 pt-4">
          <p className="chaos-heading text-[10px] text-muted-foreground mb-3">{t.quizOptions}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { key: "randomizeQuestions" as const, label: t.randQuestions, icon: <Shuffle size={13} /> },
              { key: "randomizeOptions" as const, label: t.randOptions, icon: <ListOrdered size={13} /> },
              { key: "showCorrectAnswers" as const, label: t.showCorrect, icon: <Eye size={13} /> },
              { key: "showExplanations" as const, label: t.showExpl, icon: <Eye size={13} /> },
              { key: "disableAnimations" as const, label: t.disableAnim, icon: <EyeOff size={13} /> },
            ]).map(({ key, label, icon }) => (
              <button
                key={key} role="switch" aria-checked={draft.quizSettings[key]}
                onClick={() => setField("quizSettings", { ...draft.quizSettings, [key]: !draft.quizSettings[key] })}
                className="flex items-center justify-between gap-3 px-3 py-2 border-2 border-foreground/10 hover:border-foreground/30 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs chaos-heading text-start"><span className="text-muted-foreground">{icon}</span>{label}</span>
                <div className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${draft.quizSettings[key] ? "bg-chaos" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-background transition-transform ${draft.quizSettings[key] ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── QUESTIONS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2">
          <h2 className="chaos-heading text-sm text-muted-foreground">
            {t.questionsHeading(draft.questions.length)}{problems.length > 0 && <span className="ms-2 text-destructive">{t.toFix(problems.length)}</span>}
          </h2>
          {draft.questions.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(new Set(draft.questions.map(q => q.clientKey)))} className="flex items-center gap-1 text-xs chaos-heading text-muted-foreground hover:text-primary"><ChevronsUpDown size={14} /> {t.expandAll}</button>
              <span className="text-muted-foreground/30">|</span>
              <button onClick={() => setExpanded(new Set())} className="flex items-center gap-1 text-xs chaos-heading text-muted-foreground hover:text-primary"><ChevronsDownUp size={14} /> {t.collapseAll}</button>
              <span className="text-muted-foreground/30">|</span>
              <button onClick={() => setSelected(selected.size === draft.questions.length ? new Set() : new Set(draft.questions.map(q => q.clientKey)))} className="text-xs chaos-heading text-muted-foreground hover:text-primary">
                {selected.size === draft.questions.length ? t.selectNone : t.selectAll}
              </button>
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="chaos-card bg-card p-3 flex flex-wrap items-center gap-2 text-xs sticky top-56 z-20">
            <span className="chaos-heading">{t.selectedCount(selected.size)}</span>
            <input aria-label={t.marksForSelected} type="number" min={1} placeholder={t.marks} value={bulkPoints} onChange={e => setBulkPoints(e.target.value)} className="kb-input w-24 py-1 text-xs" />
            <input aria-label={t.timerForSelected} type="number" min={5} max={3600} placeholder={t.timerPlaceholder} value={bulkTimer} onChange={e => setBulkTimer(e.target.value)} className="kb-input w-28 py-1 text-xs" />
            <button onClick={applyBulk} disabled={!bulkPoints && !bulkTimer} className="kb-btn kb-btn-ghost text-xs disabled:opacity-40">{t.apply}</button>
            <button onClick={() => duplicate(selected)} className="kb-btn kb-btn-ghost text-xs flex items-center gap-1"><Copy size={12} /> {t.duplicate}</button>
            <button onClick={() => removeQuestions(selected)} className="kb-btn kb-btn-danger text-xs flex items-center gap-1"><Trash2 size={12} /> {t.remove}</button>
            <button onClick={() => setSelected(new Set())} className="p-1 text-muted-foreground" aria-label={t.clearSelection}><X size={14} /></button>
          </div>
        )}

        <p role="status" aria-live="polite" className="sr-only">{moveNote}</p>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="questions">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                {draft.questions.map((q, index) => {
                  const isExpanded = expanded.has(q.clientKey);
                  const questionProblems = problems.filter(p => p.startsWith(`Question ${index + 1}:`));
                  return (
                    <Draggable key={q.clientKey} draggableId={q.clientKey} index={index}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.draggableProps}
                          className={`chaos-card bg-card overflow-hidden transition-all duration-200 ${isExpanded ? "border-primary" : ""} ${snapshot.isDragging ? "opacity-90 shadow-[10px_10px_0px_var(--on-surface)]" : ""}`}>
                          <div className="flex items-stretch">
                            <div {...provided.dragHandleProps} aria-label={t.reorder(index + 1)} className="flex items-center px-3 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none border-e-[3px] border-foreground/10 shrink-0">
                              <GripVertical size={18} />
                            </div>
                            <div className="flex flex-col justify-center border-e-[3px] border-foreground/10 shrink-0">
                              <button type="button" onClick={() => moveQuestion(index, -1)} disabled={index === 0} aria-label={t.moveUp(index + 1)} className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp size={14} /></button>
                              <button type="button" onClick={() => moveQuestion(index, 1)} disabled={index === draft.questions.length - 1} aria-label={t.moveDown(index + 1)} className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={14} /></button>
                            </div>
                            <label className="flex items-center px-3 border-e-[3px] border-foreground/10 shrink-0 cursor-pointer">
                              <input type="checkbox" checked={selected.has(q.clientKey)} onChange={() => setSelected(s => toggle(s, q.clientKey))} aria-label={t.selectQuestion(index + 1)} />
                            </label>
                            <button onClick={() => setExpanded(s => toggle(s, q.clientKey))} aria-expanded={isExpanded}
                              className="flex-1 flex items-center justify-between p-4 sm:p-5 text-start cursor-pointer">
                              <div className="flex items-center gap-4 min-w-0 pe-4">
                                <span className={`w-8 h-8 border-[3px] flex items-center justify-center shrink-0 text-sm chaos-heading ${isExpanded ? "bg-primary text-on-primary border-primary" : "border-foreground/30 text-foreground"}`}>{index + 1}</span>
                                <div className="min-w-0 pe-2">
                                  <p className={`font-bold text-sm ${q.questionText ? "text-foreground" : "text-muted-foreground"}`}>{q.questionText || t.untitled}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="chaos-heading text-[10px] border border-foreground/20 px-1.5 py-0.5">{typeLabels[q.type]}</span>
                                    <span className="chaos-heading text-[10px] text-primary">{t.pointsBadge(q.points)}</span>
                                    {questionProblems.length > 0 && <span className="chaos-heading text-[10px] text-destructive flex items-center gap-1"><AlertTriangle size={10} /> {t.incomplete}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 text-muted-foreground">{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                            </button>
                          </div>

                          {isExpanded && (
                            <QuestionEditor
                              q={q} index={index} problems={questionProblems}
                              onChange={(u) => updateQ(q.clientKey, u)}
                              onDuplicate={() => duplicate(new Set([q.clientKey]))}
                              onRemove={() => removeQuestions(new Set([q.clientKey]))}
                            />
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {questionTypes.map((type) => (
            <button key={type} onClick={() => addQuestion(type)}
              className="kb-card-hint py-5 chaos-heading text-xs text-muted-foreground hover:text-primary hover:border-primary flex items-center justify-center gap-2 transition-colors">
              <Plus size={16} /> {typeLabels[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ q, index, problems, onChange, onDuplicate, onRemove }: {
  q: QuestionDraft;
  index: number;
  problems: string[];
  onChange: (u: Partial<QuestionDraft> | ((q: QuestionDraft) => QuestionDraft)) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const typeLabels: Record<QuestionType, string> = { mcq: t.typeMcq, true_false: t.typeTf, multi_select: t.typeMulti, written: t.typeWritten };
  const [keywordInput, setKeywordInput] = useState("");
  const id = (name: string) => `q-${q.clientKey}-${name}`;
  const setOption = (oi: number, value: string) => onChange((cur) => {
    const options = [...cur.options];
    const old = options[oi];
    options[oi] = value;
    return {
      ...cur, options,
      correctAnswer: cur.correctAnswer === old ? value : cur.correctAnswer,
      correctAnswers: cur.correctAnswers.map((a) => (a === old ? value : a)),
    };
  });
  const removeOption = (oi: number) => onChange((cur) => {
    const removed = cur.options[oi];
    return {
      ...cur,
      options: cur.options.filter((_, i) => i !== oi),
      correctAnswer: cur.correctAnswer === removed ? "" : cur.correctAnswer,
      correctAnswers: cur.correctAnswers.filter((a) => a !== removed),
    };
  });
  const addKeyword = () => {
    const k = keywordInput.trim();
    if (k && !q.keywords.includes(k)) onChange({ keywords: [...q.keywords, k] });
    setKeywordInput("");
  };

  return (
    <div className="p-5 sm:p-6 border-t-[3px] border-foreground/10 bg-muted/20 space-y-6">
      {problems.length > 0 && (
        <ul className="text-xs text-destructive font-semibold list-disc ps-5">
          {problems.map((p) => <li key={p}>{localizeMessage(locale, p).replace(/^(?:Question|السؤال) \d+: /, "")}</li>)}
        </ul>
      )}
      <fieldset>
        <legend className="block chaos-heading text-xs text-muted-foreground mb-2">{t.questionType}</legend>
        <div className="flex flex-wrap gap-2">
          {questionTypes.map((type) => (
            <button key={type} aria-pressed={q.type === type} onClick={() => { haptics.select(); onChange((cur) => changeQuestionType(cur, type)); }}
              className={`kb-btn text-xs px-4 py-2 ${q.type === type ? "kb-btn-primary" : "kb-btn-ghost"}`}>
              {typeLabels[type]}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={id("text")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.question}</label>
        <textarea id={id("text")} value={q.questionText} onChange={e => onChange({ questionText: e.target.value })} rows={2}
          className="kb-input resize-y min-h-[60px]" placeholder={t.questionPlaceholder} maxLength={10000} />
      </div>

      {(q.type === "mcq" || q.type === "multi_select") && (
        <fieldset>
          <legend className="block chaos-heading text-xs text-muted-foreground mb-2">
            {t.options} ({q.type === "mcq" ? t.pickCorrect : t.pickAllCorrect})
          </legend>
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const isCorrect = !!opt && (q.type === "mcq" ? q.correctAnswer === opt : q.correctAnswers.includes(opt));
              return (
                <div key={oi} className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (!opt) return;
                      haptics.select();
                      if (q.type === "mcq") onChange({ correctAnswer: opt });
                      else onChange((cur) => ({ ...cur, correctAnswers: cur.correctAnswers.includes(opt) ? cur.correctAnswers.filter(a => a !== opt) : [...cur.correctAnswers, opt] }));
                    }}
                    aria-pressed={isCorrect} aria-label={t.markCorrect(String.fromCharCode(65 + oi))}
                    className={`w-9 h-9 shrink-0 border-[3px] flex items-center justify-center chaos-heading text-sm transition-colors ${isCorrect ? "bg-primary text-on-primary border-primary" : "bg-background text-muted-foreground border-foreground/30 hover:border-primary"}`}>
                    {isCorrect ? <Check size={16} /> : String.fromCharCode(65 + oi)}
                  </button>
                  <input type="text" value={opt} onChange={e => setOption(oi, e.target.value)} aria-label={t.option(String.fromCharCode(65 + oi))}
                    className="kb-input flex-1 py-2 text-sm" placeholder={t.optionPlaceholder(String.fromCharCode(65 + oi))} maxLength={1000} />
                  {q.options.length > 2 && (
                    <button onClick={() => removeOption(oi)} className="p-2 text-muted-foreground hover:text-destructive" aria-label={t.removeOption(String.fromCharCode(65 + oi))}><X size={16} /></button>
                  )}
                </div>
              );
            })}
            {q.options.length < 10 && (
              <button onClick={() => onChange({ options: [...q.options, ""] })} className="chaos-heading text-xs text-primary hover:opacity-80 mt-2 px-1">{t.addOption}</button>
            )}
          </div>
          {q.type === "multi_select" && <p className="text-[11px] text-muted-foreground mt-2">{t.multiNote}</p>}
        </fieldset>
      )}

      {q.type === "true_false" && (
        <fieldset>
          <legend className="block chaos-heading text-xs text-muted-foreground mb-2">{t.correctAnswer}</legend>
          <div className="flex gap-4">
            {["True", "False"].map(val => (
              <button key={val} aria-pressed={q.correctAnswer === val} onClick={() => { haptics.select(); onChange({ correctAnswer: val }); }}
                className={`flex-1 py-3 kb-btn text-sm ${q.correctAnswer === val ? "kb-btn-primary" : "kb-btn-ghost"}`}>
                {val === "True" ? t.trueLabel : t.falseLabel}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {q.type === "written" && (
        <div>
          <label htmlFor={id("keyword")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.keywords}</label>
          <p className="text-[11px] text-muted-foreground mb-2">
            {t.keywordsNote}
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {q.keywords.map((k) => (
              <span key={k} className="chaos-heading text-[11px] border-2 border-foreground/20 px-2 py-1 flex items-center gap-1">
                {k}
                <button onClick={() => onChange({ keywords: q.keywords.filter(x => x !== k) })} aria-label={t.removeKeyword(k)}><X size={11} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input id={id("keyword")} value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              className="kb-input flex-1 py-2 text-sm" placeholder={t.keywordPlaceholder} maxLength={200} />
            <button onClick={addKeyword} className="kb-btn kb-btn-ghost text-xs">{t.add}</button>
          </div>
        </div>
      )}

      <div>
        <label htmlFor={id("hint")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.hint}</label>
        <input id={id("hint")} value={q.hint} onChange={e => onChange({ hint: e.target.value })} className="kb-input text-sm" maxLength={2000} />
      </div>
      <div>
        <label htmlFor={id("explanation")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.explanation}</label>
        <textarea id={id("explanation")} value={q.explanation} onChange={e => onChange({ explanation: e.target.value })} rows={2}
          className="kb-input resize-y min-h-[60px] text-sm" placeholder={t.explanationPlaceholder} maxLength={10000} />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <label htmlFor={id("points")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.marks}</label>
          <input id={id("points")} type="number" value={Number.isFinite(q.points) ? q.points : ""} min={1}
            onChange={e => onChange({ points: e.target.value === "" ? NaN : Number(e.target.value) })} className="kb-input" />
        </div>
        <div>
          <label htmlFor={id("timer")} className="block chaos-heading text-xs text-muted-foreground mb-2">{t.timer}</label>
          <input id={id("timer")} type="number" value={Number.isFinite(q.timeLimit) ? q.timeLimit : ""} min={5} max={3600}
            onChange={e => onChange({ timeLimit: e.target.value === "" ? NaN : Number(e.target.value) })} className="kb-input" />
        </div>
      </div>

      <div className="pt-4 border-t-[3px] border-foreground/10 flex justify-end gap-2">
        <button onClick={onDuplicate} className="kb-btn kb-btn-ghost text-xs flex items-center gap-2"><Copy size={14} /> {t.duplicate}</button>
        <button onClick={onRemove} className="kb-btn kb-btn-danger text-xs flex items-center gap-2" aria-label={t.removeQuestion(index + 1)}><Trash2 size={14} /> {t.remove}</button>
      </div>
    </div>
  );
}

export default function EditorPage() {
  const t = useCopy(copy);
  return (
    <Suspense fallback={<LoadingState label={t.loadingEditor} />}>
      <EditorContent />
    </Suspense>
  );
}
