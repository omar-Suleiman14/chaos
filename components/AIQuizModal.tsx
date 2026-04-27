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

type Mode = "quiz" | "lecture" | "prompt";
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
  const step1Valid = mode === "prompt"
    ? promptText.trim().length >= 10
    : file !== null;
  const paramsValid = mode === "quiz"
    ? quizTitle.trim().length >= 2
    : (total >= 1 && total <= 50 && quizTitle.trim().length >= 2);

  // ── Start Generation ──────────────────────────────────────

  const handleGenerate = async () => {
    if (mode !== "prompt" && !file) return;
    if (mode === "prompt" && promptText.trim().length < 10) return;
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

      if (mode === "prompt") {
        // Prompt mode — use the typed text directly
        extractedText = promptText.trim();
      } else if (file) {
        // File modes — extract text from file
        if (file.type === "application/pdf") {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          const arrayBuffer = await file.arrayBuffer();
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

      if (!extractedText || extractedText.trim().length < 10) {
        throw new Error("Not enough text to generate a quiz. Please provide more detail.");
      }

      // Fire-and-forget: send to Convex action
      runAIQuizGeneration({
        jobId: newJobId,
        extractedText,
        mode: mode === "prompt" ? "lecture" : mode,
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

  const stepLabels = mode === "prompt" ? ["Prompt", "Settings"] : ["Upload", "Settings"];

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
              {/* Mode selection */}
              <div>
                <p className="chaos-heading text-xs text-muted-foreground mb-3">CREATE FROM</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setMode("lecture"); haptics.select(); }}
                    className={`p-3 border-[3px] text-left transition-all ${mode === "lecture" ? "border-primary bg-primary/5" : "border-foreground/20"}`}
                  >
                    <BookOpen size={18} className={`mb-1.5 ${mode === "lecture" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-xs">Lecture</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Upload notes</p>
                  </button>
                  <button
                    onClick={() => { setMode("quiz"); haptics.select(); }}
                    className={`p-3 border-[3px] text-left transition-all ${mode === "quiz" ? "border-primary bg-primary/5" : "border-foreground/20"}`}
                  >
                    <FileText size={18} className={`mb-1.5 ${mode === "quiz" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-xs">Existing Quiz</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Extract from file</p>
                  </button>
                  <button
                    onClick={() => { setMode("prompt"); haptics.select(); }}
                    className={`p-3 border-[3px] text-left transition-all ${mode === "prompt" ? "border-primary bg-primary/5" : "border-foreground/20"}`}
                  >
                    <MessageSquare size={18} className={`mb-1.5 ${mode === "prompt" ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="font-bold text-xs">Prompt</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Describe a topic</p>
                  </button>
                </div>
              </div>

              {/* Prompt input OR file upload */}
              {mode === "prompt" ? (
                <div>
                  <label className="chaos-heading text-xs text-muted-foreground mb-2 block">DESCRIBE YOUR QUIZ TOPIC</label>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={4}
                    className="kb-input resize-none text-sm"
                    placeholder="e.g. Create a quiz about the French Revolution, covering causes, key events, and major figures..."
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">At least 10 characters. Be as specific as you want.</p>
                </div>
              ) : (
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
                      : "border-foreground/20"
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
              )}

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
