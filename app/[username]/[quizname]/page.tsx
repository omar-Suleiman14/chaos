"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/lib/sfx";
import { Zap, ArrowDown } from "lucide-react";

type GameState = "entry" | "playing";

export default function QuizPlayerPage() {
  const params = useParams();
  const username = params.username as string;
  const quizname = params.quizname as string;

  const quizMeta = useQuery(
    api.quizFunctions.getQuizByUsernameSlug,
    username && quizname ? { username, slug: quizname } : "skip"
  );
  const quizData = useQuery(
    api.quizFunctions.getQuizForPlayer,
    quizMeta?._id ? { quizId: quizMeta._id } : "skip"
  );

  const startSession = useMutation(api.quizFunctions.startQuizSession);
  const gradeAnswer = useMutation(api.quizFunctions.gradeAnswer);
  const completeSession = useMutation(api.quizFunctions.completeQuizSession);

  const [gameState, setGameState] = useState<GameState>("entry");
  const [playerName, setPlayerName] = useState("");
  const [startError, setStartError] = useState("");
  const [sessionId, setSessionId] = useState<Id<"quizSessions"> | null>(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [finalResults, setFinalResults] = useState<any>(null);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, any>>({});
  const [timeLeftMap, setTimeLeftMap] = useState<Record<string, number>>({});

  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const qStartTimes = useRef<Record<string, number>>({});

  useEffect(() => { setMounted(true); }, []);

  const questions = quizData?.questions || [];

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollY = containerRef.current.scrollTop;
    const height = window.innerHeight;
    const index = Math.round(scrollY / height);
    if (index !== currentQ && index <= questions.length) {
      setCurrentQ(index);
      haptics.light();
      if (!quizData?.disableAnimations) sfx.play("next");
    }
  };

  useEffect(() => {
    if (gameState !== "playing" || currentQ === questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const q = questions[currentQ];
    if (!q) return;

    if (feedbacks[q._id]) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (timeLeftMap[q._id] === undefined) {
      setTimeLeftMap(prev => ({ ...prev, [q._id]: q.timeLimit || 60 }));
      qStartTimes.current[q._id] = Date.now();
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeftMap(prev => {
        const current = prev[q._id] ?? (q.timeLimit || 60);
        if (current <= 1) {
          clearInterval(timerRef.current!);
          handleSubmitAnswer(q._id, "", true);
          return { ...prev, [q._id]: 0 };
        }
        if (current <= 11) { haptics.warning(); if (!quizData?.disableAnimations) sfx.play("tap"); }
        return { ...prev, [q._id]: current - 1 };
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQ, gameState, questions, feedbacks]);

  const handleSubmitAnswer = async (qId: Id<"questions">, answer: string, isTimeout = false) => {
    if (!sessionId || isSubmitting || feedbacks[qId]) return;
    setIsSubmitting(true);
    haptics.medium();

    const tTaken = (Date.now() - (qStartTimes.current[qId] || Date.now())) / 1000;
    try {
      const result = await gradeAnswer({
        sessionId,
        questionId: qId,
        answer: isTimeout ? "" : answer.trim(),
        timeTaken: tTaken,
      });

      setFeedbacks(prev => ({ ...prev, [qId]: result }));
      setSelectedOptions(prev => ({ ...prev, [qId]: isTimeout ? "" : answer }));

      const isPartiallyCorrect = !result.isCorrect && result.pointsEarned > 0;
      if (result.isCorrect) { haptics.success(); if (!quizData?.disableAnimations) sfx.play("correct"); }
      else if (isPartiallyCorrect) { haptics.light(); if (!quizData?.disableAnimations) sfx.play("correct"); }
      else { haptics.error(); if (!quizData?.disableAnimations) sfx.play("wrong"); }

    } catch (err) { console.error(err); }
    setIsSubmitting(false);
  };

  const handleFinish = async () => {
    if (!sessionId) return;
    haptics.success(); if (!quizData?.disableAnimations) sfx.play("finish");
    try {
      const result = await completeSession({ sessionId });
      setFinalResults(result);
      if (result.score / result.totalPoints >= 0.9 && !quizData?.disableAnimations) {
        try {
          const confetti = (await import("canvas-confetti")).default;
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ["#2F5333", "#F0EFEA", "#111111"] });
        } catch { /* ok */ }
      }
    } catch (err) { console.error(err); }
  };

  const handleStart = async () => {
    if (!playerName.trim() || !quizMeta?._id) return;
    setStartError("");
    haptics.heavy(); if (!quizData?.disableAnimations) sfx.play("start");
    try {
      const sid = await startSession({ quizId: quizMeta._id, playerName: playerName.trim() });
      setSessionId(sid);
      setGameState("playing");
      setCurrentQ(0);
    } catch (err: any) {
      console.error(err);
      setStartError(err?.message || "Failed to start session.");
    }
  };

  const renderErrorWithLinks = (text: string) => {
    // Split by email to make it a clickable link
    const parts = text.split(/(support@chaos\.fail|[a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+?\.[a-zA-Z]{2,})/gi);
    return parts.map((part, i) => {
      if (part.includes("@")) {
        return (
          <a key={i} href={`mailto:${part}`} className="underline text-primary hover:text-white transition-colors">
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!mounted) return null;

  if (quizMeta === undefined) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <p className="chaos-heading text-sm text-muted-foreground chaos-pulse">LOADING...</p>
      </div>
    );
  }

  if (quizMeta === null || (quizData && !quizData.isPublished)) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="chaos-card bg-card p-10 max-w-sm w-full text-center">
          <h1 className="chaos-display text-4xl mb-3">NOT FOUND.</h1>
          <p className="text-muted-foreground mb-8 text-sm">This quiz does not exist or is currently private.</p>
          <button
            onClick={() => window.location.href = "/"}
            className="kb-btn kb-btn-primary w-full"
          >
            GO HOME
          </button>
        </div>
      </div>
    );
  }

  // ── ENTRY SCREEN
  if (gameState === "entry") {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="chaos-card bg-card p-8 sm:p-10">
            <p className="chaos-heading text-xs text-primary mb-3">
              {quizData?.totalPoints} MARKS · {questions.length} QUESTIONS
            </p>
            <h1 className="chaos-display text-4xl sm:text-5xl mb-8 leading-none">
              {quizData?.title || "QUIZ"}
            </h1>

            <div className="space-y-4">
              <input
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleStart()}
                placeholder="ENTER YOUR NAME"
                autoFocus
                className="kb-input text-base"
              />
              <button
                onClick={handleStart}
                disabled={!playerName.trim()}
                className="kb-btn kb-btn-primary w-full disabled:opacity-50"
              >
                START QUIZ →
              </button>
              {startError && (
                <div className="mt-4 p-4 bg-destructive/10 border-2 border-destructive text-destructive text-sm font-semibold chaos-heading leading-relaxed">
                  {renderErrorWithLinks(startError.replace("Uncaught Error: ", ""))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING (SNAP SCROLL)
  return (
    <div className="h-[100dvh] bg-background text-foreground font-sans relative">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 w-full h-1.5 bg-muted z-50">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(Math.min(currentQ, questions.length) / questions.length) * 100}%` }}
        />
      </div>

      <div
        ref={containerRef}
        className="tiktok-container"
        onScroll={handleScroll}
      >
        {questions.map((q, i) => {
          const isFeedback = !!feedbacks[q._id];
          const feed = feedbacks[q._id];
          const selOpt = selectedOptions[q._id];
          const tLeft = timeLeftMap[q._id] ?? (q.timeLimit || 60);

          let slideBg = "bg-background";
          let slideAnim = "";
          if (isFeedback) {
            const noAnim = !!quizData?.disableAnimations;
            if (feed.isCorrect) {
              slideBg = noAnim ? "bg-[#d1ebd2]" : "bg-[#d1ebd2] transition-colors duration-500";
            } else {
              slideBg = noAnim ? "bg-[#ebd2d2]" : "bg-[#ebd2d2] transition-colors duration-500";
              slideAnim = noAnim ? "" : "shake";
            }
          }

          return (
            <div key={q._id} className={`tiktok-slide flex flex-col px-4 py-12 sm:px-8 sm:py-16 ${slideBg} ${slideAnim}`}>
              <div className="flex-1 flex flex-col pt-6 sm:pt-8 pb-4 max-w-2xl mx-auto w-full overflow-y-auto overscroll-contain custom-scrollbar pr-1 sm:pr-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <span className="chaos-heading text-xs text-primary">
                    QUESTION {i + 1} OF {questions.length}
                  </span>
                  <span className={`chaos-heading text-sm flex items-center gap-1.5 tabular-nums border-2 px-3 py-1 ${
                    tLeft <= 10
                      ? "border-destructive text-destructive bg-destructive/10"
                      : "border-foreground/20 text-muted-foreground"
                  }`}>
                    <Zap size={13} /> {String(tLeft).padStart(2, "0")}S
                  </span>
                </div>

                <h2 className="text-xl sm:text-3xl font-bold mb-6 sm:mb-8 leading-snug text-balance">
                  {q.questionText}
                </h2>

                {/* Options */}
                <div className="space-y-3">
                  {q.type === "mcq" && q.options?.map((opt, optIdx) => {
                    const isSelected = selOpt === opt;
                    const isCorrectAns = isFeedback && feed?.correctAnswer === opt;
                    const isWrongSel = isFeedback && isSelected && !feed?.isCorrect;

                    let cls = "border-[3px] border-foreground/30 bg-card hover:border-foreground hover:shadow-[4px_4px_0px_var(--on-surface)] transition-all";
                    if (isCorrectAns) cls = "border-[3px] border-primary bg-chaos text-chaos-foreground shadow-[6px_6px_0px_var(--primary)]";
                    else if (isWrongSel) cls = "border-[3px] border-destructive bg-destructive text-on-error shadow-[6px_6px_0px_var(--error-dim)]";
                    else if (isFeedback) cls = "border-[3px] border-foreground/10 bg-muted text-muted-foreground opacity-60";

                    return (
                      <button
                        key={optIdx}
                        onClick={() => !isFeedback && handleSubmitAnswer(q._id, opt)}
                        disabled={isFeedback || isSubmitting}
                        className={`w-full text-left p-3 sm:p-4 text-sm sm:text-base font-medium transition-all ${cls}`}
                      >
                        <span className="chaos-heading text-xs mr-3 opacity-60">{String.fromCharCode(65 + optIdx)}.</span>
                        {opt}
                      </button>
                    );
                  })}

                  {q.type === "true_false" && ["True", "False"].map((val) => {
                    const isSelected = selOpt === val;
                    const isCorrectAns = isFeedback && feed?.correctAnswer === val;
                    const isWrongSel = isFeedback && isSelected && !feed?.isCorrect;

                    let cls = "border-[3px] border-foreground/30 bg-card hover:border-foreground hover:shadow-[4px_4px_0px_var(--on-surface)] transition-all";
                    if (isCorrectAns) cls = "border-[3px] border-primary bg-chaos text-chaos-foreground shadow-[6px_6px_0px_var(--primary)]";
                    else if (isWrongSel) cls = "border-[3px] border-destructive bg-destructive text-on-error shadow-[6px_6px_0px_var(--error-dim)]";
                    else if (isFeedback) cls = "border-[3px] border-foreground/10 bg-muted text-muted-foreground opacity-60";

                    return (
                      <button
                        key={val}
                        onClick={() => !isFeedback && handleSubmitAnswer(q._id, val)}
                        disabled={isFeedback || isSubmitting}
                        className={`w-full text-left p-3 sm:p-4 text-sm sm:text-base font-bold chaos-heading transition-all ${cls}`}
                      >
                        {val.toUpperCase()}
                      </button>
                    );
                  })}

                  {q.type === "multi_select" && (() => {
                    const currentSel = multiSelections[q._id] || [];
                    const correctList: string[] = feed?.correctAnswer
                      ? feed.correctAnswer.split(",").map((s: string) => s.trim())
                      : [];
                    return (
                      <div className="space-y-3">
                        <p className="chaos-heading text-[10px] text-muted-foreground mb-1">SELECT ALL THAT APPLY</p>
                        {q.options?.map((opt, optIdx) => {
                          const isChecked = currentSel.includes(opt);
                          const isCorrectAns = isFeedback && correctList.includes(opt);
                          const isWrongSel = isFeedback && isChecked && !correctList.includes(opt);
                          const isDimmed = isFeedback && !isChecked && !correctList.includes(opt);

                          let cls = "border-[3px] border-foreground/30 bg-card hover:border-foreground transition-all";
                          if (isCorrectAns) cls = "border-[3px] border-primary bg-chaos text-chaos-foreground shadow-[6px_6px_0px_var(--primary)]";
                          else if (isWrongSel) cls = "border-[3px] border-destructive bg-destructive/20 text-destructive";
                          else if (isDimmed) cls = "border-[3px] border-foreground/10 bg-muted text-muted-foreground opacity-50";
                          else if (isChecked) cls = "border-[3px] border-primary bg-primary/10 text-foreground shadow-[4px_4px_0px_var(--primary)]";

                          return (
                            <button
                              key={optIdx}
                              onClick={() => {
                                if (isFeedback) return;
                                const prev = multiSelections[q._id] || [];
                                const next = prev.includes(opt)
                                  ? prev.filter(x => x !== opt)
                                  : [...prev, opt];
                                setMultiSelections(s => ({ ...s, [q._id]: next }));
                                haptics.light();
                              }}
                              disabled={isFeedback || isSubmitting}
                              className={`w-full text-left p-3 sm:p-4 text-sm sm:text-base font-medium transition-all flex items-center gap-3 ${cls}`}
                            >
                              <span className={`w-5 h-5 border-[2px] shrink-0 flex items-center justify-center chaos-heading text-xs ${
                                isCorrectAns ? "border-chaos-foreground bg-chaos-foreground/20" :
                                isChecked ? "border-primary bg-primary/20" :
                                "border-foreground/40"
                              }`}>
                                {(isChecked || isCorrectAns) ? "✓" : ""}
                              </span>
                              <span>
                                <span className="chaos-heading text-xs mr-2 opacity-50">{String.fromCharCode(65 + optIdx)}.</span>
                                {opt}
                              </span>
                            </button>
                          );
                        })}
                        {!isFeedback && (
                          <button
                            onClick={() => {
                              const sel = multiSelections[q._id] || [];
                              if (sel.length === 0) return;
                              handleSubmitAnswer(q._id, sel.join(","));
                            }}
                            disabled={isSubmitting || (multiSelections[q._id] || []).length === 0}
                            className="kb-btn kb-btn-primary w-full mt-2 disabled:opacity-50"
                          >
                            SUBMIT SELECTION ({(multiSelections[q._id] || []).length} selected)
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {q.type === "written" && (
                    <div className="flex flex-col gap-3 w-full">
                      <textarea
                        value={writtenAnswers[q._id] || ""}
                        onChange={(e) => setWrittenAnswers({ ...writtenAnswers, [q._id]: e.target.value })}
                        disabled={isFeedback || isSubmitting}
                        placeholder="TYPE YOUR ANSWER HERE..."
                        className={`kb-input min-h-[120px] resize-y ${
                          isFeedback && feed?.isCorrect ? "border-primary bg-chaos/10" :
                          isFeedback && !feed?.isCorrect && feed?.pointsEarned > 0 ? "border-yellow-500 bg-yellow-500/10" :
                          isFeedback ? "border-destructive bg-destructive/10" : ""
                        }`}
                      />
                      {!isFeedback && (
                        <button
                          onClick={() => handleSubmitAnswer(q._id, writtenAnswers[q._id] || "")}
                          disabled={isSubmitting || !(writtenAnswers[q._id]?.trim())}
                          className="kb-btn kb-btn-primary w-full disabled:opacity-50"
                        >
                          SUBMIT ANSWER
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Feedback */}
                {isFeedback && (
                  <div className={`mt-6 chaos-card bg-card p-5 ${quizData?.disableAnimations ? '' : 'animate-in slide-in-from-bottom-4 duration-300'}`}>
                    <p className={`chaos-heading text-sm mb-2 ${
                      feed.isCorrect ? "text-primary"
                      : (!feed.isCorrect && feed.pointsEarned > 0) ? "text-yellow-500"
                      : "text-destructive"
                    }`}>
                      {feed.isCorrect ? "✓ CORRECT" : (!feed.isCorrect && feed.pointsEarned > 0) ? "~ PARTIAL" : "✗ INCORRECT"}
                      <span className="text-muted-foreground ml-3 font-normal text-xs">+{feed.pointsEarned} marks</span>
                    </p>
                    {feed.explanation && (
                      <p className="text-sm text-muted-foreground mt-2">{feed.explanation}</p>
                    )}
                    <div
                      className="mt-4 flex items-center gap-2 text-primary chaos-heading text-xs animate-bounce cursor-pointer"
                      onClick={() => {
                        if (containerRef.current) {
                          containerRef.current.scrollBy({ top: window.innerHeight, behavior: "smooth" });
                        }
                      }}
                    >
                      {i < questions.length - 1 ? "SWIPE UP FOR NEXT" : "SWIPE UP TO FINISH"}
                      <ArrowDown size={13} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* FINAL SLIDE */}
        <div className="tiktok-slide flex flex-col items-center justify-center p-6 text-center">
          {!finalResults ? (
            <div className="chaos-card bg-card p-10 max-w-sm w-full text-center">
              <h2 className="chaos-display text-4xl mb-3">QUIZ COMPLETE.</h2>
              <p className="text-muted-foreground mb-8 text-sm">
                You&apos;ve answered all questions. Submit to view your final results.
              </p>
              <button
                onClick={handleFinish}
                className="kb-btn kb-btn-primary w-full"
              >
                SUBMIT QUIZ →
              </button>
            </div>
          ) : (() => {
            const pct = Math.round((finalResults.score / finalResults.totalPoints) * 100);
            const displayMode = quizData?.displayMode ?? "score";
            const passingThreshold = quizData?.passingThreshold ?? 50;
            const passed = pct >= passingThreshold;
            return (
              <div className={`chaos-card bg-card p-10 max-w-md w-full ${quizData?.disableAnimations ? '' : 'animate-in zoom-in-95 duration-500'}`}>
                {displayMode === "pass_fail" ? (
                  <>
                    <p className={`chaos-display text-7xl mb-2 ${passed ? "text-primary" : "text-destructive"}`}>
                      {passed ? "✓" : "✗"}
                    </p>
                    <p className={`chaos-heading text-3xl mb-3 ${passed ? "text-primary" : "text-destructive"}`}>
                      {passed ? "PASSED" : "FAILED"}
                    </p>
                    <p className="text-muted-foreground chaos-heading text-sm mb-8">
                      {finalResults.score} OF {finalResults.totalPoints} MARKS &nbsp;·&nbsp; {pct}%
                      <br />
                      <span className="text-xs opacity-70">Passing: {passingThreshold}%</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="chaos-heading text-sm text-muted-foreground mb-2">YOUR SCORE</p>
                    <p className="chaos-display text-7xl text-primary mb-2">{pct}%</p>
                    <p className="text-muted-foreground mb-8 chaos-heading text-sm">
                      {finalResults.score} OF {finalResults.totalPoints} MARKS
                    </p>
                  </>
                )}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 kb-btn kb-btn-primary"
                  >
                    PLAY AGAIN
                  </button>
                  <button
                    onClick={() => window.location.href = "/"}
                    className="flex-1 kb-btn kb-btn-ghost"
                  >
                    EXIT
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
