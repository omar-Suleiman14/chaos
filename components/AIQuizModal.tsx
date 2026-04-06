"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";
import {
  Upload, X, FileText, Image as ImageIcon, Loader2,
  CheckCircle2, AlertCircle, ChevronRight, Brain, BookOpen,
} from "lucide-react";

type Mode = "quiz" | "lecture";
type Step = 1 | 2 | 3;

interface Props {
  onClose: () => void;
}

export default function AIQuizModal({ onClose }: Props) {
  const router = useRouter();

  // Convex hooks
  const createAIJob = useMutation(api.aiQuizMutations.createAIJob);
  const runAIQuizGeneration = useAction(api.aiQuiz.runAIQuizGeneration);

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("lecture");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state (lecture params)
  const [quizTitle, setQuizTitle] = useState("");
  const [total, setTotal] = useState(10);
  const [mcq, setMcq] = useState(5);
  const [multiSelect, setMultiSelect] = useState(2);
  const [trueFalse, setTrueFalse] = useState(2);
  const [written, setWritten] = useState(1);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Step 3 state
  const [jobId, setJobId] = useState<Id<"aiJobs"> | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

  // Poll job
  const job = useQuery(api.aiQuizMutations.getAIJob, jobId ? { jobId } : "skip");

  // Redirect on done
  useEffect(() => {
    if (job?.status === "done" && job.quizId) {
      router.push(`/dashboard/editor?id=${job.quizId}`);
      onClose();
    }
  }, [job?.status, job?.quizId, router, onClose]);

  // ── File Handling ──────────────────────────────────────────

  const handleFileSelect = useCallback((selectedFile: File) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/jpg"];
    if (!allowed.includes(selectedFile.type)) {
      alert("Please upload a PDF, PNG, JPG, or WEBP file.");
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      alert("File must be under 20MB.");
      return;
    }
    setFile(selectedFile);
    // Auto-fill title from filename
    if (!quizTitle) {
      setQuizTitle(selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    }
    haptics.light();
  }, [quizTitle]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  // ── Param validation ──────────────────────────────────────

  const typeSum = mcq + multiSelect + trueFalse + written;
  const paramsValid = typeSum === total && total >= 1 && total <= 50 && quizTitle.trim().length >= 2;
  const step1Valid = file !== null;
  const step2Valid = mode === "quiz"
    ? quizTitle.trim().length >= 2
    : paramsValid;

  // ── Start Generation ──────────────────────────────────────

  const handleGenerate = async () => {
    if (!file) return;
    setIsStarting(true);
    setStartError("");
    haptics.heavy();

    try {
      // 1. Create AI job for UI polling
      const newJobId = await createAIJob();
      setJobId(newJobId);
      setStep(3);

      // 2. Extract Text Locally in Browser
      let extractedText = "";

      if (file.type === "application/pdf") {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const maxPages = Math.min(pdf.numPages, 40); // safety limit
        
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          extractedText += pageText + "\n\n";
        }
      } else {
        // Image Processing via Tesseract (lazy loaded)
        const Tesseract = await import("tesseract.js");
        const { data: { text } } = await Tesseract.default.recognize(file, "eng", {
          logger: (m: any) => console.log(m),
        });
        extractedText = text;
      }

      if (!extractedText || extractedText.trim().length < 20) {
        throw new Error("Could not extract readable text. Try a clearer image or a text-based PDF.");
      }

      // 3. Fire off the Convex action with plain text
      await runAIQuizGeneration({
        jobId: newJobId,
        extractedText,
        mode,
        quizTitle: quizTitle.trim() || file.name,
        totalQuestions: total,
        mcq,
        multiSelect,
        trueFalse,
        written,
        difficulty,
      });
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (errMsg.includes("AI_LIMIT_REACHED")) {
        const split = errMsg.split("AI_LIMIT_REACHED|");
        const displayMsg = split.length > 1 ? split[1].replace(/\\n/g, "\n") : "Monthly AI Quota Reached.";
        window.alert(displayMsg);
        setIsStarting(false);
        return;
      }
      setStartError(errMsg || "Failed to start generation");
      setIsStarting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  const stepLabels = ["Upload", "Settings", "Generating"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="chaos-card bg-card w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-[3px] border-foreground/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 border-2 border-primary flex items-center justify-center">
              <Brain size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="chaos-heading text-lg">AI QUIZ GENERATOR</h2>
              <p className="text-[11px] text-muted-foreground">
                {stepLabels.map((label, i) => (
                  <span key={i}>
                    <span className={i + 1 === step ? "text-primary font-bold" : i + 1 < step ? "text-foreground/60 line-through" : "text-muted-foreground"}>
                      {label}
                    </span>
                    {i < 2 && <span className="mx-1 opacity-30">›</span>}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {/* ── STEP 1: Upload + Mode ── */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-[3px] border-dashed p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-primary/50 bg-primary/5"
                    : "border-foreground/20 hover:border-foreground/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    {file.type === "application/pdf"
                      ? <FileText size={28} className="text-primary shrink-0" />
                      : <ImageIcon size={28} className="text-primary shrink-0" />
                    }
                    <div className="text-left">
                      <p className="font-bold text-sm truncate max-w-[260px]">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="chaos-heading text-sm">DRAG & DROP OR CLICK TO UPLOAD</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG, WEBP · Max 20MB</p>
                  </>
                )}
              </div>

              {/* Mode selection */}
              <div>
                <p className="chaos-heading text-xs text-muted-foreground mb-3">WHAT IS THIS FILE?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setMode("lecture"); haptics.select(); }}
                    className={`p-4 border-[3px] text-left transition-all ${mode === "lecture" ? "border-primary bg-primary/5" : "border-foreground/20 hover:border-foreground/40"}`}
                  >
                    <BookOpen size={20} className={`mb-2 ${mode === "lecture" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-sm">Lecture / Lesson</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI will generate reasoning questions</p>
                  </button>
                  <button
                    onClick={() => { setMode("quiz"); haptics.select(); }}
                    className={`p-4 border-[3px] text-left transition-all ${mode === "quiz" ? "border-primary bg-primary/5" : "border-foreground/20 hover:border-foreground/40"}`}
                  >
                    <FileText size={20} className={`mb-2 ${mode === "quiz" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-sm">Already-made Quiz</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI will extract existing questions</p>
                  </button>
                </div>
              </div>

              <button
                onClick={() => { if (step1Valid) setStep(2); }}
                disabled={!step1Valid}
                className="kb-btn kb-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
              >
                NEXT <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Settings ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="chaos-heading text-xs text-muted-foreground mb-2 block">QUIZ TITLE</label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  className="kb-input"
                  placeholder="e.g. Cardiovascular System"
                  autoFocus
                />
              </div>

              {mode === "lecture" && (
                <>
                  <div>
                    <label className="chaos-heading text-xs text-muted-foreground mb-2 block">
                      TOTAL QUESTIONS <span className="text-primary">({total}/50 max)</span>
                    </label>
                    <input
                      type="number" min={1} max={50} value={total}
                      onChange={(e) => setTotal(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="kb-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "MCQ", val: mcq, set: setMcq },
                      { label: "Multi-Select", val: multiSelect, set: setMultiSelect },
                      { label: "True / False", val: trueFalse, set: setTrueFalse },
                      { label: "Written", val: written, set: setWritten },
                    ].map(({ label, val, set }) => (
                      <div key={label}>
                        <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{label}</label>
                        <input
                          type="number" min={0} max={total} value={val}
                          onChange={(e) => set(Math.max(0, parseInt(e.target.value) || 0))}
                          className="kb-input py-2"
                        />
                      </div>
                    ))}
                  </div>

                  {typeSum !== total && (
                    <p className="text-destructive text-xs font-semibold">
                      ⚠ Types sum to {typeSum}, must equal {total}
                    </p>
                  )}

                  <div>
                    <label className="chaos-heading text-xs text-muted-foreground mb-2 block">DIFFICULTY</label>
                    <div className="flex gap-2">
                      {(["easy", "medium", "hard"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => { setDifficulty(d); haptics.select(); }}
                          className={`flex-1 py-2 kb-btn text-xs ${difficulty === d ? "kb-btn-primary" : "kb-btn-ghost"}`}
                        >
                          {d.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="kb-btn kb-btn-ghost flex-1"
                >
                  BACK
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!step2Valid || isStarting}
                  className="kb-btn kb-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isStarting
                    ? <><Loader2 size={15} className="animate-spin" /> UPLOADING...</>
                    : <><Brain size={15} /> GENERATE</>
                  }
                </button>
              </div>
              {startError && <p className="text-destructive text-xs font-semibold">{startError}</p>}
            </div>
          )}

          {/* ── STEP 3: Processing ── */}
          {step === 3 && (
            <div className="py-6 text-center space-y-6">
              {job?.status === "error" ? (
                <div className="space-y-4">
                  <AlertCircle size={48} className="mx-auto text-destructive" />
                  <p className="chaos-heading text-lg text-destructive">GENERATION FAILED</p>
                  <p className="text-sm text-muted-foreground">{job.error}</p>
                  <button onClick={() => { setStep(1); setJobId(null); }} className="kb-btn kb-btn-primary">
                    TRY AGAIN
                  </button>
                </div>
              ) : job?.status === "done" ? (
                <div className="space-y-4">
                  <CheckCircle2 size={48} className="mx-auto text-primary" />
                  <p className="chaos-heading text-lg">QUIZ READY!</p>
                  <p className="text-sm text-muted-foreground">Opening editor...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Animated progress */}
                  <div className="relative">
                    <div className="w-20 h-20 mx-auto">
                      <svg className="animate-spin" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="4" className="text-foreground/10" />
                        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="4"
                          strokeDasharray="213.6" strokeDashoffset="160"
                          className="text-primary" strokeLinecap="round"
                          style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
                        />
                      </svg>
                      <Brain size={24} className="absolute inset-0 m-auto text-primary" />
                    </div>
                  </div>

                  <div>
                    <p className="chaos-heading text-base">{job?.step || "Initializing..."}</p>
                    <div className="flex items-center justify-center gap-1.5 mt-3">
                      {(["pending", "extracting", "categorizing", "generating", "saving", "done"]).map((s, idx) => {
                        const statuses = ["pending", "extracting", "categorizing", "generating", "saving", "done"];
                        if (s === "pending") return null;
                        const currentIdx = statuses.indexOf(job?.status || "pending");
                        const thisIdx = statuses.indexOf(s);
                        const done = currentIdx >= thisIdx;
                        const active = currentIdx === thisIdx;
                        return (
                          <div key={s} className={`h-1.5 w-8 transition-all ${
                            done ? "bg-primary" : active ? "bg-primary/60 animate-pulse" : "bg-foreground/10"
                          }`} />
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Processing file locally and analyzing via AI...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
