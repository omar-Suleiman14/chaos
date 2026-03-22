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
  Globe, Lock, Loader2, RefreshCw, Check, X, ArrowLeft
} from "lucide-react";

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
  const myQuizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const existingGroups = Array.from(new Set((myQuizzes || []).map(q => q.groupName).filter(Boolean)));

  const updateQuiz = useMutation(api.quizFunctions.updateQuiz);
  const addQuestion = useMutation(api.quizFunctions.addQuestion);
  const updateQuestion = useMutation(api.quizFunctions.updateQuestion);
  const deleteQuestion = useMutation(api.quizFunctions.deleteQuestion);
  const validateSlug = useMutation(api.quizFunctions.validateSlug);

  // Quiz state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [expandedQ, setExpandedQ] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Init empty quiz guard
  useEffect(() => {
    if (quizIdParam) {
      setIsInitializing(false);
    } else {
      router.replace("/dashboard");
    }
  }, [quizIdParam, router]);

  useEffect(() => { setMounted(true); }, []);

  // Load quiz from DB
  useEffect(() => {
    if (quiz && !isInitializing) {
      setTitle(quiz.title);
      setSlug(quiz.slug);
      setGroupName(quiz.groupName || "");
      setIsPublished(quiz.isPublished);
    }
  }, [quiz, isInitializing]);

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

  // Save
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
  }, [quizId, title, slug, groupName, isPublished, questions, updateQuiz, addQuestion, updateQuestion]);

  // Auto-save every 30s
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => handleSave(), 30000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [handleSave]);

  // Slug validation
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

  const typeLabels: Record<QuestionType, string> = {
    mcq: "MCQ", true_false: "True / False", multi_select: "Multi Select", written: "Written",
  };

  if (!mounted || isInitializing) {
    return (
      <div className="py-20 flex flex-col items-center justify-center h-full text-[#111111]/40">
        <Loader2 size={32} className="animate-spin mb-4 text-[#2F5333]" />
        <p className="font-medium">Initializing editor...</p>
      </div>
    );
  }

  const isDirty = questions.some(q => q.isDirty)
    || quiz?.title !== title || quiz?.slug !== slug || (quiz?.groupName || "") !== groupName;

  return (
    <div className="max-w-4xl mx-auto pb-32 space-y-8 font-sans">

      {/* ── HEADER ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#111111]/10 shadow-sm sticky top-20 z-30">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[#111111]">Editor</h1>
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isPublished ? "bg-[#2F5333]/10 text-[#2F5333]" : "bg-[#111111]/5 text-[#111111]/60"}`}>
              {isPublished ? <Globe size={12} /> : <Lock size={12} />}
              {isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <div className="text-sm font-medium text-[#111111]/50 flex items-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin text-[#2F5333]" /> : <Save size={14} />}
            {saving ? "Saving changes..." : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : "Not saved yet"}
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              const willPublish = !isPublished;
              setIsPublished(willPublish);
              handleSave(willPublish);
            }}
            className="flex-1 sm:flex-none text-sm font-medium px-5 py-2.5 rounded-full border border-[#111111]/20 text-[#111111] hover:bg-[#111111]/5 transition-colors"
          >
            {isPublished ? "Unpublish" : "Publish"}
          </button>
          <button
            onClick={handleSaveAndExit}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm font-medium px-6 py-2.5 rounded-full bg-[#2F5333] text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Check size={16} /> Save & Exit
          </button>
        </div>
      </div>

      {/* ── QUIZ SETTINGS ─────────────────────────────────── */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#111111]/10 shadow-sm space-y-6">
        <h2 className="text-sm font-semibold text-[#111111]/50 uppercase tracking-wider mb-2">Quiz Settings</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-[#111111]/70 mb-2">Title</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#F0EFEA]/50 border border-[#111111]/10 rounded-xl p-3.5 text-lg font-medium text-[#111111] focus:outline-none focus:border-[#2F5333] focus:ring-1 focus:ring-[#2F5333] transition-all"
              placeholder="Give your quiz a name..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#111111]/70 mb-2">URL Slug</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#111111]/40 font-medium">/</span>
              <input
                type="text" value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className={`w-full bg-[#F0EFEA]/50 border border-[#111111]/10 rounded-xl p-3.5 pl-7 pr-10 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333] transition-all ${slugStatus === "invalid" ? "border-red-500" : ""}`}
                placeholder="my-quiz"
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                {slugStatus === "checking" && <RefreshCw size={14} className="animate-spin text-[#111111]/40" />}
                {slugStatus === "valid" && <Check size={14} className="text-[#2F5333]" />}
                {slugStatus === "invalid" && <X size={14} className="text-red-500" />}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#111111]/70 mb-2">Quiz Group</label>
            <input
              type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
              list="quiz-groups"
              className="w-full bg-[#F0EFEA]/50 border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333] transition-all"
              placeholder="e.g. Biology 101..."
            />
            <datalist id="quiz-groups">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* ── QUESTIONS ─────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[#111111]/50 uppercase tracking-wider mb-2 px-2">Questions ({questions.length})</h2>

        {questions.map((q, index) => {
          const isExpanded = expandedQ === index;
          return (
            <div key={index} className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${isExpanded ? "border-[#2F5333] shadow-md" : "border-[#111111]/10 shadow-sm hover:border-[#111111]/30"}`}>
              <button
                onClick={() => setExpandedQ(isExpanded ? null : index)}
                className="w-full flex items-center justify-between p-4 sm:p-5 text-left"
              >
                <div className="flex items-center gap-4 min-w-0 pr-4">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${isExpanded ? "bg-[#2F5333] text-white" : "bg-[#F0EFEA] text-[#2F5333]"}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-semibold truncate ${q.questionText ? "text-[#111111]" : "text-[#111111]/40"}`}>
                      {q.questionText || "Untitled question..."}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium text-[#111111]/50 bg-[#111111]/5 px-2 py-0.5 rounded-md">
                        {typeLabels[q.type]}
                      </span>
                      <span className="text-xs font-medium text-[#2F5333]">
                        {q.points} pts
                      </span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-[#111111]/40">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {isExpanded && (
                <div className="p-5 sm:p-6 border-t border-[#111111]/10 bg-[#F0EFEA]/30 space-y-6">
                  
                  {/* Type Selector */}
                  <div>
                    <label className="block text-sm font-medium text-[#111111]/70 mb-2">Question Type</label>
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
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                            q.type === type 
                              ? "bg-[#2F5333] text-white border-[#2F5333]" 
                              : "bg-white text-[#111111]/70 border-[#111111]/10 hover:border-[#111111]/30"
                          }`}
                        >
                          {typeLabels[type]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div>
                    <label className="block text-sm font-medium text-[#111111]/70 mb-2">Prompt</label>
                    <textarea
                      value={q.questionText}
                      onChange={e => updateQ(index, { questionText: e.target.value })}
                      rows={2}
                      className="w-full bg-white border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333] resize-none"
                      placeholder="Type your question here..."
                    />
                  </div>

                  {/* Options */}
                  {(q.type === "mcq" || q.type === "multi_select") && (
                    <div>
                      <label className="block text-sm font-medium text-[#111111]/70 mb-2">Options (select correct)</label>
                      <div className="space-y-2">
                        {q.options.map((opt, oi) => {
                          const isCorrect = q.type === "mcq" ? q.correctAnswer === opt && !!opt : q.correctAnswers?.includes(opt) && !!opt;
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
                                className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-medium transition-colors border ${
                                  isCorrect ? "bg-[#2F5333] text-white border-[#2F5333]" : "bg-white text-[#111111]/50 border-[#111111]/20 hover:border-[#2F5333]/50"
                                }`}
                              >
                                {isCorrect ? <Check size={18} /> : String.fromCharCode(65 + oi)}
                              </button>
                              <input
                                type="text" value={opt}
                                onChange={e => { const o = [...q.options]; o[oi] = e.target.value; updateQ(index, { options: o }); }}
                                className="flex-1 bg-white border border-[#111111]/10 rounded-xl p-2.5 text-sm font-medium focus:outline-none focus:border-[#2F5333]"
                                placeholder={`Option ${String.fromCharCode(65 + oi)}...`}
                              />
                              {q.options.length > 2 && (
                                <button onClick={() => updateQ(index, { options: q.options.filter((_, i) => i !== oi) })} className="p-2.5 text-[#111111]/40 hover:text-red-500 transition-colors">
                                  <X size={18} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {q.options.length < 6 && (
                          <button onClick={() => updateQ(index, { options: [...q.options, ""] })} className="text-sm font-medium text-[#2F5333] hover:opacity-80 mt-2 px-1">
                            + Add Option
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {q.type === "true_false" && (
                    <div>
                      <label className="block text-sm font-medium text-[#111111]/70 mb-2">Options</label>
                      <div className="flex gap-4">
                        {["True", "False"].map(val => (
                          <button
                            key={val}
                            onClick={() => { haptics.select(); updateQ(index, { correctAnswer: val }); }}
                            className={`flex-1 py-4 rounded-xl text-sm font-medium transition-colors border ${
                              q.correctAnswer === val ? "bg-[#2F5333] text-white border-[#2F5333]" : "bg-white text-[#111111]/70 border-[#111111]/10 hover:border-[#111111]/30"
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.type === "written" && (
                    <div>
                      <label className="block text-sm font-medium text-[#111111]/70 mb-2">Keywords for Auto-Grading</label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {q.keywords.map((kw, ki) => (
                          <span key={ki} className="bg-[#2F5333] text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
                            {kw}
                            <button onClick={() => updateQ(index, { keywords: q.keywords.filter((_, i) => i !== ki) })} className="hover:text-red-300 transition-colors">
                              <X size={14} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val && !q.keywords.includes(val)) {
                              updateQ(index, { keywords: [...q.keywords, val] });
                            }
                            e.currentTarget.value = '';
                          }
                        }}
                        className="w-full bg-white border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333]"
                        placeholder="Type keyword and press Enter..."
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-[#111111]/70 mb-2">Explanation (Optional)</label>
                    <textarea
                      value={q.explanation || ""}
                      onChange={e => updateQ(index, { explanation: e.target.value })}
                      rows={2}
                      className="w-full bg-white border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333] resize-none"
                      placeholder="Explain why this is correct..."
                    />
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-[#111111]/70 mb-2">Points</label>
                      <input
                        type="number" value={q.points} min={1}
                        onChange={e => updateQ(index, { points: parseInt(e.target.value) || 1 })}
                        className="w-full bg-white border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#111111]/70 mb-2">Timer (s)</label>
                      <input
                        type="number" value={q.timeLimit} min={5} max={3600}
                        onChange={e => updateQ(index, { timeLimit: parseInt(e.target.value) || 30 })}
                        className="w-full bg-white border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium text-[#111111] focus:outline-none focus:border-[#2F5333]"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-[#111111]/10 flex justify-end">
                    <button
                      onClick={() => removeQuestion(index)}
                      className="text-sm font-medium text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Remove Question
                    </button>
                  </div>

                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={addNewQuestion}
          className="w-full py-6 rounded-2xl border-2 border-dashed border-[#111111]/10 text-[#111111]/50 hover:border-[#2F5333]/30 hover:text-[#2F5333] hover:bg-[#2F5333]/5 font-medium flex items-center justify-center gap-2 transition-all mt-4"
        >
          <Plus size={20} /> Add New Question
        </button>
      </div>

    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center text-[#2F5333]"><Loader2 className="animate-spin" size={32} /></div>}>
      <EditorContent />
    </Suspense>
  );
}
