"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { haptics } from "@/lib/haptics";
import { useUser } from "@clerk/nextjs";
import {
  Plus, Trash2, Save, ChevronDown, ChevronUp,
  Globe, Lock, Loader2, RefreshCw, Check, X, ArrowLeft, GripVertical,
  MoreHorizontal, Shuffle, Eye, EyeOff, ListOrdered
} from "lucide-react";
import dynamic from "next/dynamic";
import type { DropResult } from "@hello-pangea/dnd";

const DragDropContext = dynamic(() => import("@hello-pangea/dnd").then(m => m.DragDropContext as any), { ssr: false }) as any;
const Droppable = dynamic(() => import("@hello-pangea/dnd").then(m => m.Droppable as any), { ssr: false }) as any;
const Draggable = dynamic(() => import("@hello-pangea/dnd").then(m => m.Draggable as any), { ssr: false }) as any;

type QuestionType = "mcq" | "true_false" | "multi_select" | "written";

interface QuestionDraft {
  id?: Id<"questions">;
  type: QuestionType;
  questionText: string;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  keywords: string[];
  points: number;
  timeLimit: number;
  hint: string;
  explanation: string;
  order: number;
  isNew?: boolean;
  isDirty?: boolean;
}

function EditorContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const quizIdParam = searchParams.get("id") as Id<"quizzes"> | null;

  const [quizId, setQuizId] = useState<Id<"quizzes"> | null>(quizIdParam);
  const [isInitializing, setIsInitializing] = useState(!quizIdParam);

  const quiz = useQuery(api.quizFunctions.getQuiz, quizId ? { quizId } : "skip");
  const existingQuestions = useQuery(api.quizFunctions.getQuestions, quizId ? { quizId } : "skip");
  const teacherSettings = useQuery(api.quizFunctions.getTeacherSettings);
  const globalConfig = useQuery(api.quizFunctions.getGlobalConfig);
  const myQuizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const existingGroups = Array.from(new Set((myQuizzes || []).map(q => q.groupName).filter(Boolean)));

  const updateQuiz = useMutation(api.quizFunctions.updateQuiz);
  const addQuestion = useMutation(api.quizFunctions.addQuestion);
  const updateQuestion = useMutation(api.quizFunctions.updateQuestion);
  const deleteQuestion = useMutation(api.quizFunctions.deleteQuestion);
  const validateSlug = useMutation(api.quizFunctions.validateSlug);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [quizSettings, setQuizSettings] = useState({
    randomizeQuestions: false,
    randomizeOptions: false,
    showCorrectAnswers: true,
    showExplanations: true,
    displayMode: "score" as "score" | "pass_fail",
    passingThreshold: 50,
  });
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false);
  const quizSettingsRef = useRef<HTMLDivElement>(null);

  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [expandedQ, setExpandedQ] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (quizIdParam) {
      setIsInitializing(false);
    } else {
      router.replace("/dashboard");
    }
  }, [quizIdParam, router]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (quiz && !isInitializing) {
      setTitle(quiz.title);
      setSlug(quiz.slug);
      setGroupName(quiz.groupName || "");
      setIsPublished(quiz.isPublished);
      setQuizSettings({
        randomizeQuestions: quiz.randomizeQuestions ?? teacherSettings?.randomizeQuestions ?? globalConfig?.randomizeQuestions ?? false,
        randomizeOptions: quiz.randomizeOptions ?? teacherSettings?.randomizeOptions ?? globalConfig?.randomizeOptions ?? true,
        showCorrectAnswers: quiz.showCorrectAnswers ?? teacherSettings?.showCorrectAnswers ?? globalConfig?.showCorrectAnswers ?? true,
        showExplanations: quiz.showExplanations ?? teacherSettings?.showExplanations ?? globalConfig?.showExplanations ?? true,
        displayMode: (quiz.displayMode as "score" | "pass_fail") ?? teacherSettings?.displayMode ?? globalConfig?.displayMode ?? "score",
        passingThreshold: quiz.passingThreshold ?? teacherSettings?.passingThreshold ?? globalConfig?.passingThreshold ?? 50,
      });
    }
  }, [quiz, isInitializing, teacherSettings, globalConfig]);

  // Close quiz settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quizSettingsRef.current && !quizSettingsRef.current.contains(e.target as Node)) {
        setQuizSettingsOpen(false);
      }
    };
    if (quizSettingsOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [quizSettingsOpen]);

  useEffect(() => {
    if (existingQuestions && existingQuestions.length > 0) {
      setQuestions(existingQuestions.map((q) => ({
        id: q._id, type: q.type, questionText: q.questionText,
        options: q.options || [], correctAnswer: q.correctAnswer || "",
        correctAnswers: q.correctAnswers || [], keywords: q.keywords || [],
        points: q.points, timeLimit: q.timeLimit || 30,
        hint: q.hint || "", explanation: q.explanation || "",
        order: q.order, isNew: false, isDirty: false,
      })));
    }
  }, [existingQuestions]);

  const handleSave = useCallback(async (publishChange?: boolean) => {
    if (!quizId) return;
    setSaving(true);
    try {
      const willPublish = publishChange !== undefined ? publishChange : isPublished;
      await updateQuiz({
        quizId, title: title || "Untitled Quiz",
        slug: slug || undefined,
        groupName: groupName || undefined,
        isPublished: willPublish,
        randomizeQuestions: quizSettings.randomizeQuestions,
        randomizeOptions: quizSettings.randomizeOptions,
        showCorrectAnswers: quizSettings.showCorrectAnswers,
        showExplanations: quizSettings.showExplanations,
        displayMode: quizSettings.displayMode,
        passingThreshold: quizSettings.passingThreshold,
      });

      const updatedQs = [...questions];
      for (let i = 0; i < updatedQs.length; i++) {
        const q = updatedQs[i];
        if (!q.isDirty) continue;
        const qData = {
          quizId, type: q.type, questionText: q.questionText,
          options: (q.type === "mcq" || q.type === "multi_select") ? q.options.filter(Boolean) : undefined,
          correctAnswer: (q.type === "mcq" || q.type === "true_false") ? q.correctAnswer : undefined,
          correctAnswers: q.type === "multi_select" ? q.correctAnswers : undefined,
          keywords: q.type === "written" ? q.keywords.filter(Boolean) : undefined,
          points: q.points, timeLimit: q.timeLimit,
          hint: q.hint || undefined, explanation: q.explanation || undefined, order: q.order,
        };
        if (q.isNew) {
          updatedQs[i].id = await addQuestion(qData);
          updatedQs[i].isNew = false;
        } else if (q.id) {
          const { quizId: _qid, ...upd } = qData;
          await updateQuestion({ questionId: q.id, ...upd });
        }
        updatedQs[i].isDirty = false;
      }
      setQuestions(updatedQs);
      setLastSaved(new Date());
    } catch (err) { console.error("Save error:", err); }
    finally { setSaving(false); }
  }, [quizId, title, slug, groupName, isPublished, quizSettings, questions, updateQuiz, addQuestion, updateQuestion]);

  useEffect(() => {
    autoSaveTimer.current = setInterval(() => handleSave(), 30000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [handleSave]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!slug || slug === quiz?.slug) { setSlugStatus("idle"); return; }
      setSlugStatus("checking");
      try {
        const ok = await validateSlug({ slug, quizId: quizId || undefined });
        setSlugStatus(ok ? "valid" : "invalid");
      } catch { setSlugStatus("invalid"); }
    }, 500);
    return () => clearTimeout(t);
  }, [slug, quiz?.slug, validateSlug, quizId]);

  const handleSaveAndExit = async () => {
    haptics.heavy();
    await handleSave();
    router.push("/dashboard");
  };

  const addNewQuestion = () => {
    haptics.light();
    const newQ: QuestionDraft = {
      type: "mcq", questionText: "", options: ["", "", "", ""],
      correctAnswer: "", correctAnswers: [], keywords: [],
      points: teacherSettings?.defaultPointsPerQuestion || 10,
      timeLimit: teacherSettings?.defaultMcqTimer || 60,
      hint: "", explanation: "", order: questions.length, isNew: true, isDirty: true,
    };
    setQuestions([...questions, newQ]);
    setExpandedQ(questions.length);
  };

  const updateQ = (i: number, updates: Partial<QuestionDraft>) => {
    const upd = [...questions];
    upd[i] = { ...upd[i], ...updates, isDirty: true };
    setQuestions(upd);
  };

  const removeQuestion = async (i: number) => {
    haptics.heavy();
    const q = questions[i];
    if (q.id) await deleteQuestion({ questionId: q.id });
    const upd = questions.filter((_, j) => j !== i);
    upd.forEach((q, j) => { q.order = j; q.isDirty = true; });
    setQuestions(upd);
    if (expandedQ === i) setExpandedQ(null);
    else if (expandedQ !== null && expandedQ > i) setExpandedQ(expandedQ - 1);
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    haptics.light();
    const reordered = [...questions];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    reordered.forEach((q, i) => { q.order = i; q.isDirty = true; });
    setQuestions(reordered);

    // Adjust expanded index
    if (expandedQ === source.index) {
      setExpandedQ(destination.index);
    } else if (expandedQ !== null) {
      if (source.index < expandedQ && destination.index >= expandedQ) setExpandedQ(expandedQ - 1);
      else if (source.index > expandedQ && destination.index <= expandedQ) setExpandedQ(expandedQ + 1);
    }
  };

  const typeLabels: Record<QuestionType, string> = {
    mcq: "MCQ", true_false: "True / False", multi_select: "Multi Select", written: "Written",
  };

  if (!mounted || isInitializing) {
    return (
      <div className="py-20 flex flex-col items-center justify-center h-full text-muted-foreground">
        <Loader2 size={32} className="animate-spin mb-4 text-primary" />
        <p className="chaos-heading text-sm">INITIALIZING EDITOR...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-32 space-y-8 font-sans">

      {/* ── HEADER */}
      <div className="chaos-card bg-background p-5 sticky top-20 z-30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="chaos-heading text-2xl">EDITOR</h1>
            <span className={`chaos-heading text-xs px-2 py-1 border-2 flex items-center gap-1.5 ${isPublished
                ? "border-primary bg-chaos text-chaos-foreground"
                : "border-foreground/30 text-muted-foreground"
              }`}>
              {isPublished ? <Globe size={11} /> : <Lock size={11} />}
              {isPublished ? "PUBLISHED" : "DRAFT"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground chaos-heading flex items-center gap-2">
            {saving ? <RefreshCw size={12} className="animate-spin text-primary" /> : <Save size={12} />}
            {saving ? "SAVING..." : lastSaved ? `SAVED ${lastSaved.toLocaleTimeString()}` : "NOT SAVED YET"}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Quiz-level settings 3-dots menu */}
          <div className="relative" ref={quizSettingsRef}>
            <button
              onClick={() => setQuizSettingsOpen(o => !o)}
              title="Quiz options"
              className="kb-btn kb-btn-ghost p-2"
            >
              <MoreHorizontal size={18} />
            </button>

            {quizSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-card border-[3px] border-foreground shadow-[6px_6px_0px_var(--foreground)] min-w-[260px] p-4 space-y-3">
                <p className="chaos-heading text-[10px] text-muted-foreground mb-3">THIS QUIZ ONLY</p>

                {([
                  { key: "randomizeQuestions" as const, label: "Randomize Question Order", icon: <Shuffle size={13} /> },
                  { key: "randomizeOptions" as const, label: "Randomize MCQ Options", icon: <ListOrdered size={13} /> },
                  { key: "showCorrectAnswers" as const, label: "Show Correct Answers", icon: <Eye size={13} /> },
                  { key: "showExplanations" as const, label: "Show Explanations", icon: <Eye size={13} /> },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => setQuizSettings(s => ({ ...s, [key]: !s[key] }))}
                    className="w-full flex items-center justify-between gap-3 px-2 py-1.5 hover:bg-muted/50 transition-colors rounded-sm"
                  >
                    <span className="flex items-center gap-2 text-xs chaos-heading text-left">
                      <span className="text-muted-foreground">{icon}</span>
                      {label}
                    </span>
                    <div className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
                      quizSettings[key] ? 'bg-chaos' : 'bg-muted'
                    }`}>
                      <div className={`w-4 h-4 rounded-full bg-background transition-transform ${
                        quizSettings[key] ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </div>
                  </button>
                ))}

                {/* Score display mode */}
                <div className="border-t border-foreground/10 pt-3 space-y-2">
                  <p className="chaos-heading text-[10px] text-muted-foreground">RESULT DISPLAY</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setQuizSettings(s => ({ ...s, displayMode: "score" }))}
                      className={`flex-1 py-1.5 chaos-heading text-xs border-2 transition-colors ${
                        quizSettings.displayMode === "score"
                          ? "bg-foreground text-background border-foreground"
                          : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                      }`}
                    >
                      Show Score
                    </button>
                    <button
                      onClick={() => setQuizSettings(s => ({ ...s, displayMode: "pass_fail" }))}
                      className={`flex-1 py-1.5 chaos-heading text-xs border-2 transition-colors ${
                        quizSettings.displayMode === "pass_fail"
                          ? "bg-foreground text-background border-foreground"
                          : "bg-transparent border-foreground/30 text-muted-foreground hover:border-foreground"
                      }`}
                    >
                      Pass / Fail
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="chaos-heading text-[10px] text-muted-foreground">PASSING THRESHOLD</span>
                      <span className="chaos-heading text-xs font-bold">{quizSettings.passingThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={quizSettings.passingThreshold}
                      onChange={e => setQuizSettings(s => ({ ...s, passingThreshold: parseInt(e.target.value) }))}
                      className="w-full accent-foreground"
                    />
                    <div className="flex justify-between chaos-heading text-[9px] text-muted-foreground mt-0.5">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const willPublish = !isPublished;
              setIsPublished(willPublish);
              handleSave(willPublish);
            }}
            className="flex-1 sm:flex-none kb-btn kb-btn-ghost text-xs"
          >
            {isPublished ? "UNPUBLISH" : "PUBLISH"}
          </button>
          <button
            onClick={handleSaveAndExit}
            className="flex-1 sm:flex-none kb-btn kb-btn-primary text-xs flex items-center justify-center gap-2"
          >
            <Check size={15} />Save
          </button>
        </div>
      </div>

      {/* ── QUIZ SETTINGS */}
      <div className="chaos-card bg-card p-6 sm:p-8 space-y-6">
        <h2 className="chaos-heading text-sm text-muted-foreground">QUIZ SETTINGS</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="sm:col-span-2">
            <label className="block chaos-heading text-xs text-muted-foreground mb-2">TITLE</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="kb-input text-lg"
              placeholder="GIVE YOUR QUIZ A NAME..."
            />
          </div>

          <div>
            <label className="block chaos-heading text-xs text-muted-foreground mb-2">URL SLUG</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold">/</span>
              <input
                type="text" value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className={`kb-input pl-7 pr-10 ${slugStatus === "invalid" ? "border-destructive" : ""}`}
                placeholder="MY-QUIZ"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugStatus === "checking" && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                {slugStatus === "valid" && <Check size={14} className="text-primary" />}
                {slugStatus === "invalid" && <X size={14} className="text-destructive" />}
              </div>
            </div>
          </div>

          <div>
            <label className="block chaos-heading text-xs text-muted-foreground mb-2">FOLDER / GROUP</label>
            <input
              type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
              list="quiz-groups"
              className="kb-input"
              placeholder="E.G. BIOLOGY 101..."
            />
            <datalist id="quiz-groups">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* ── QUESTIONS */}
      <div className="space-y-4">
        <h2 className="chaos-heading text-sm text-muted-foreground mb-2 px-1">
          QUESTIONS ({questions.length})
        </h2>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="questions">
            {(provided: any) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-4"
              >
                {questions.map((q, index) => {
                  const isExpanded = expandedQ === index;
                  return (
                    <Draggable key={index} draggableId={`q-${index}`} index={index}>
                      {(provided: any, snapshot: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`chaos-card bg-card overflow-hidden transition-all duration-200 ${isExpanded ? "border-primary" : ""
                            } ${snapshot.isDragging ? "opacity-90 shadow-[10px_10px_0px_var(--on-surface)]" : ""}`}
                        >
                          <div className="flex items-stretch">
                            {/* Drag Handle */}
                            <div
                              {...provided.dragHandleProps}
                              className="flex items-center px-3 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none border-r-[3px] border-foreground/10 shrink-0"
                            >
                              <GripVertical size={18} />
                            </div>

                            {/* Expand Button */}
                            <button
                              onClick={() => setExpandedQ(isExpanded ? null : index)}
                              className="flex-1 flex items-center justify-between p-4 sm:p-5 text-left"
                            >
                              <div className="flex items-center gap-4 min-w-0 pr-4">
                                <span className={`w-8 h-8 border-[3px] flex items-center justify-center shrink-0 text-sm chaos-heading ${isExpanded
                                    ? "bg-primary text-on-primary border-primary"
                                    : "border-foreground/30 text-foreground"
                                  }`}>
                                  {index + 1}
                                </span>
                                <div className="min-w-0 pr-2">
                                  <p className={`font-bold text-sm ${q.questionText ? "text-foreground" : "text-muted-foreground"}`}>
                                    {q.questionText || "Untitled question..."}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="chaos-heading text-[10px] border border-foreground/20 px-1.5 py-0.5">
                                      {typeLabels[q.type]}
                                    </span>
                                    <span className="chaos-heading text-[10px] text-primary">
                                      {q.points} Marks
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 text-muted-foreground">
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </div>
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="p-5 sm:p-6 border-t-[3px] border-foreground/10 bg-muted/20 space-y-6">

                              {/* Type Selector */}
                              <div>
                                <label className="block chaos-heading text-xs text-muted-foreground mb-2">QUESTION TYPE</label>
                                <div className="flex flex-wrap gap-2">
                                  {(["mcq", "true_false", "multi_select", "written"] as QuestionType[]).map((type) => (
                                    <button
                                      key={type}
                                      onClick={() => {
                                        haptics.select();
                                        const upd: Partial<QuestionDraft> = { type };
                                        if (type === "true_false") { upd.options = ["True", "False"]; upd.correctAnswer = ""; }
                                        else if (type === "mcq" || type === "multi_select") upd.options = q.options.length >= 2 ? q.options : ["", "", "", ""];
                                        updateQ(index, upd);
                                      }}
                                      className={`kb-btn text-xs px-4 py-2 ${q.type === type ? "kb-btn-primary" : "kb-btn-ghost"
                                        }`}
                                    >
                                      {typeLabels[type]}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Question Text */}
                              <div>
                                <label className="block chaos-heading text-xs text-muted-foreground mb-2">QUESTION</label>
                                <textarea
                                  value={q.questionText}
                                  onChange={e => updateQ(index, { questionText: e.target.value })}
                                  onInput={e => {
                                    e.currentTarget.style.height = "auto";
                                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                                  }}
                                  rows={2}
                                  className="kb-input resize-none overflow-hidden min-h-[60px]"
                                  placeholder="TYPE YOUR QUESTION HERE..."
                                />
                              </div>

                              {/* Options */}
                              {(q.type === "mcq" || q.type === "multi_select") && (
                                <div>
                                  <label className="block chaos-heading text-xs text-muted-foreground mb-2">OPTIONS (SELECT CORRECT)</label>
                                  <div className="space-y-2">
                                    {q.options.map((opt, oi) => {
                                      const isCorrect = q.type === "mcq"
                                        ? q.correctAnswer === opt && !!opt
                                        : q.correctAnswers?.includes(opt) && !!opt;
                                      return (
                                        <div key={oi} className="flex items-center gap-3">
                                          <button
                                            onClick={() => {
                                              haptics.select();
                                              if (q.type === "mcq") { updateQ(index, { correctAnswer: opt }); }
                                              else {
                                                const cur = q.correctAnswers || [];
                                                updateQ(index, { correctAnswers: cur.includes(opt) ? cur.filter(a => a !== opt) : [...cur, opt] });
                                              }
                                            }}
                                            className={`w-9 h-9 shrink-0 border-[3px] flex items-center justify-center chaos-heading text-sm transition-colors ${isCorrect
                                                ? "bg-primary text-on-primary border-primary"
                                                : "bg-background text-muted-foreground border-foreground/30 hover:border-primary"
                                              }`}
                                          >
                                            {isCorrect ? <Check size={16} /> : String.fromCharCode(65 + oi)}
                                          </button>
                                          <input
                                            type="text" value={opt}
                                            onChange={e => { const o = [...q.options]; o[oi] = e.target.value; updateQ(index, { options: o }); }}
                                            className="kb-input flex-1 py-2 text-sm"
                                            placeholder={`Option ${String.fromCharCode(65 + oi)}...`}
                                          />
                                          {q.options.length > 2 && (
                                            <button
                                              onClick={() => updateQ(index, { options: q.options.filter((_, i) => i !== oi) })}
                                              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                              <X size={16} />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                    {q.options.length < 6 && (
                                      <button
                                        onClick={() => updateQ(index, { options: [...q.options, ""] })}
                                        className="chaos-heading text-xs text-primary hover:opacity-80 mt-2 px-1"
                                      >
                                        + ADD OPTION
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {q.type === "true_false" && (
                                <div>
                                  <label className="block chaos-heading text-xs text-muted-foreground mb-2">CORRECT ANSWER</label>
                                  <div className="flex gap-4">
                                    {["True", "False"].map(val => (
                                      <button
                                        key={val}
                                        onClick={() => { haptics.select(); updateQ(index, { correctAnswer: val }); }}
                                        className={`flex-1 py-3 kb-btn text-sm ${q.correctAnswer === val ? "kb-btn-primary" : "kb-btn-ghost"
                                          }`}
                                      >
                                        {val.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {q.type === "written" && (
                                <div>
                                  <label className="block chaos-heading text-xs text-muted-foreground mb-2">KEYWORDS FOR AUTO-GRADING</label>
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {q.keywords.map((kw, ki) => (
                                      <span key={ki} className="kb-chip kb-chip-success flex items-center gap-2">
                                        {kw}
                                        <button onClick={() => updateQ(index, { keywords: q.keywords.filter((_, i) => i !== ki) })} className="hover:text-destructive">
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <input
                                    type="text"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === ",") {
                                        e.preventDefault();
                                        const val = e.currentTarget.value.trim();
                                        if (val && !q.keywords.includes(val)) {
                                          updateQ(index, { keywords: [...q.keywords, val] });
                                        }
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                    className="kb-input text-sm"
                                    placeholder="TYPE KEYWORD AND PRESS ENTER..."
                                  />
                                </div>
                              )}

                              <div>
                                <label className="block chaos-heading text-xs text-muted-foreground mb-2">EXPLANATION (OPTIONAL)</label>
                                <textarea
                                  value={q.explanation || ""}
                                  onChange={e => updateQ(index, { explanation: e.target.value })}
                                  onInput={e => {
                                    e.currentTarget.style.height = "auto";
                                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                                  }}
                                  rows={2}
                                  className="kb-input resize-none overflow-hidden min-h-[60px] text-sm"
                                  placeholder="EXPLAIN WHY THIS IS CORRECT..."
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                  <label className="block chaos-heading text-xs text-muted-foreground mb-2">Marks</label>
                                  <input
                                    type="number" value={q.points} min={0}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      updateQ(index, { points: isNaN(val) ? 0 : val });
                                    }}
                                    className="kb-input"
                                  />
                                </div>
                                <div>
                                  <label className="block chaos-heading text-xs text-muted-foreground mb-2">TIMER (S)</label>
                                  <input
                                    type="number" value={q.timeLimit} min={5} max={3600}
                                    onChange={e => updateQ(index, { timeLimit: parseInt(e.target.value) || 30 })}
                                    className="kb-input"
                                  />
                                </div>
                              </div>

                              <div className="pt-4 border-t-[3px] border-foreground/10 flex justify-end">
                                <button
                                  onClick={() => removeQuestion(index)}
                                  className="kb-btn kb-btn-danger text-xs flex items-center gap-2"
                                >
                                  <Trash2 size={14} /> REMOVE QUESTION
                                </button>
                              </div>
                            </div>
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

        <button
          onClick={addNewQuestion}
          className="kb-card-hint w-full py-6 chaos-heading text-sm text-muted-foreground hover:text-primary hover:border-primary flex items-center justify-center gap-2 transition-colors mt-4"
        >
          <Plus size={20} /> ADD NEW QUESTION
        </button>
      </div>

    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center text-primary"><Loader2 className="animate-spin" size={32} /></div>}>
      <EditorContent />
    </Suspense>
  );
}
