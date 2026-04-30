"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { haptics } from "@/lib/haptics";
import {
  Upload, X, FileText, Image as ImageIcon, Loader2,
  ChevronRight, Brain, BookOpen, FlaskConical, MessageSquare,
} from "lucide-react";

type Mode = "quiz" | "lecture";
type Step = 1 | 2;

interface Props {
  onClose: () => void;
  onJobStarted: (jobId: Id<"aiJobs">) => void;
}

export default function AIQuizModal({ onClose, onJobStarted }: Props) {
  const createAIJob = useMutation(api.aiQuizMutations.createAIJob);
  const runAIQuizGeneration = useAction(api.aiQuiz.runAIQuizGeneration);

  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("lecture");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promptText, setPromptText] = useState("");

  // Step 2 state (lecture params)
  const [quizTitle, setQuizTitle] = useState("");
  const [mcq, setMcq] = useState(8);
  const [trueFalse, setTrueFalse] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

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

  const total = mcq + trueFalse;
  const step1Valid = mode === "quiz"
    ? file !== null
    : (file !== null || promptText.trim().length >= 10);
  const paramsValid = mode === "quiz"
    ? quizTitle.trim().length >= 2
    : (total >= 1 && total <= 50 && quizTitle.trim().length >= 2);

  // ── Start Generation ──────────────────────────────────────

  const handleGenerate = async () => {
    if (mode === "quiz" && !file) return;
    if (mode === "lecture" && !file && promptText.trim().length < 10) return;
    setIsStarting(true);
    setStartError("");
    haptics.heavy();

    try {
      // 1. Create AI job record
      const newJobId = await createAIJob();

      // 2. Close the modal and notify parent immediately
      onJobStarted(newJobId);
      onClose();

      let extractedText = "";

      const typeofWindow = typeof window !== "undefined" ? window : globalThis;
      if (typeof (typeofWindow as any).Promise.withResolvers === "undefined") {
        (typeofWindow as any).Promise.withResolvers = function () {
          let resolve, reject;
          const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
          return { promise, resolve, reject };
        };
      }

      if (file) {
        // File modes — extract text from file
        if (file.type === "application/pdf") {
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
          
          let arrayBuffer: ArrayBuffer;
          if (typeof file.arrayBuffer === "function") {
            arrayBuffer = await file.arrayBuffer();
          } else {
            arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = reject;
              reader.readAsArrayBuffer(file);
            });
          }
          
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const maxPages = Math.min(pdf.numPages, 40);

          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            extractedText += pageText + "\n\n";
          }
        } else {
          const Tesseract = await import("tesseract.js");
          const { data: { text } } = await Tesseract.default.recognize(file, "eng", {
            logger: (m: any) => console.log(m),
          });
          extractedText = text;
        }
      }

      // Append custom prompt if provided
      if (promptText.trim()) {
        extractedText += (extractedText ? "\n\nAdditional User Instructions:\n" : "") + promptText.trim();
      }

      if (!extractedText || extractedText.trim().length < 10) {
        throw new Error("Not enough text to generate a quiz. Please provide more detail.");
      }

      // Fire-and-forget: send to Convex action
      runAIQuizGeneration({
        jobId: newJobId,
        extractedText,
        mode: mode,
        quizTitle: quizTitle.trim() || (file ? file.name : "AI Quiz"),
        totalQuestions: total,
        mcq,
        multiSelect: 0,
        trueFalse,
        written: 0,
        difficulty,
      }).catch(console.error);

    } catch (err: any) {
      setStartError(err?.message || "Failed to start generation");
      setIsStarting(false);
    }
  };

  const stepLabels = ["Input", "Settings"];

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
              <div className="flex items-center gap-2">
                <h2 className="chaos-heading text-lg">AI QUIZ GENERATOR</h2>
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold border border-yellow-500/60 text-yellow-600 bg-yellow-500/10 chaos-heading">
                  <FlaskConical size={9} /> EXPERIMENTAL
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {stepLabels.map((label, i) => (
                  <span key={i}>
                    <span className={i + 1 === step ? "text-primary font-bold" : i + 1 < step ? "text-foreground/60 line-through" : "text-muted-foreground"}>
                      {label}
                    </span>
                    {i < 1 && <span className="mx-1 opacity-30">›</span>}
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

          {/* ── STEP 1: Upload / Prompt + Mode ── */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Mode selection wrapper to keep existing extraction vs generation flow */}
              <div>
                <p className="chaos-heading text-xs text-muted-foreground mb-3">CREATE FROM</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setMode("lecture"); haptics.select(); }}
                    className={`p-3 border-[3px] text-left transition-all flex flex-col items-start ${mode !== "quiz" ? "border-primary bg-primary/5" : "border-foreground/20"}`}
                  >
                    <BookOpen size={18} className={`mb-1.5 ${mode !== "quiz" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-xs">Generate New Quiz</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">From file or topic description</p>
                  </button>
                  <button
                    onClick={() => { setMode("quiz"); haptics.select(); }}
                    className={`p-3 border-[3px] text-left transition-all flex flex-col items-start ${mode === "quiz" ? "border-primary bg-primary/5" : "border-foreground/20"}`}
                  >
                    <FileText size={18} className={`mb-1.5 ${mode === "quiz" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-xs">Digitize Existing Quiz</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Extract identical questions from file</p>
                  </button>
                </div>
              </div>

              {/* Unified Prompt & File Input box */}
              <div>
                <label className="chaos-heading text-xs text-muted-foreground mb-2 flex justify-between items-end">
                  <span>INPUT MATERIAL</span>
                  {mode === "quiz" && <span className="text-[9px] text-primary">FILE REQUIRED</span>}
                </label>
                
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`relative border-[3px] transition-all flex flex-col ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-foreground/20 bg-background"
                  }`}
                >
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={4}
                    className="w-full bg-transparent px-4 py-3 outline-none resize-none text-sm placeholder:text-muted-foreground/60"
                    placeholder={mode === "quiz" ? "Add any specific instructions for the extraction (optional)... or DRAG & DROP your quiz file here." : "Describe a topic... or DRAG & DROP a PDF or Image here..."}
                    autoFocus
                  />
                  
                  <div className="flex items-center justify-between px-3 py-2 border-t-2 border-foreground/10 bg-muted/20">
                    <div className="flex items-center gap-3 w-full">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-8 h-8 shrink-0 flex items-center justify-center bg-foreground text-background hover:bg-primary hover:text-on-primary transition-colors cursor-pointer"
                        title="Attach File"
                      >
                        <Upload size={14} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      />
                      
                      {file ? (
                        <div className="flex items-center justify-between bg-background border-2 border-foreground/20 px-2 py-1 flex-1 min-w-0">
                           <div className="flex items-center gap-2 min-w-0">
                             {file.type === "application/pdf" ? <FileText size={14} className="text-primary shrink-0" /> : <ImageIcon size={14} className="text-primary shrink-0" />}
                             <span className="text-xs font-semibold truncate">{file.name}</span>
                           </div>
                           <button onClick={() => setFile(null)} className="p-1 hover:text-destructive shrink-0">
                             <X size={14} />
                           </button>
                        </div>
                      ) : (
                        <span className="text-[10px] chaos-heading text-muted-foreground truncate">
                          ATTACH PDF / IMAGE (MAX 20MB)
                        </span>
                      )}
                    </div>
                  </div>
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

              {mode !== "quiz" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "MCQ", val: mcq, set: setMcq },
                      { label: "True / False", val: trueFalse, set: setTrueFalse },
                    ].map(({ label, val, set }) => (
                      <div key={label}>
                        <label className="chaos-heading text-xs text-muted-foreground mb-1 block">{label}</label>
                        <input
                          type="number" min={0} max={50} value={val}
                          onChange={(e) => set(Math.max(0, parseInt(e.target.value) || 0))}
                          className="kb-input py-2"
                        />
                      </div>
                    ))}
                  </div>

                  {total < 1 && (
                    <p className="text-destructive text-xs font-semibold">
                      ⚠ Add at least 1 question
                    </p>
                  )}
                  {total > 50 && (
                    <p className="text-destructive text-xs font-semibold">
                      ⚠ Maximum 50 questions
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
                <button onClick={() => setStep(1)} className="kb-btn kb-btn-ghost flex-1">BACK</button>
                <button
                  onClick={handleGenerate}
                  disabled={!paramsValid || isStarting}
                  className="kb-btn kb-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isStarting
                    ? <><Loader2 size={15} className="animate-spin" /> GENERATING...</>
                    : <><Brain size={15} /> GENERATE</>
                  }
                </button>
              </div>
              {startError && <p className="text-destructive text-xs font-semibold">{startError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
