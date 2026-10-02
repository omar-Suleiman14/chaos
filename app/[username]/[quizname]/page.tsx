"use client";

import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useEffectEvent, useRef, useMemo } from "react";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/lib/sfx";
import { Zap, ArrowDown, Volume2, VolumeX } from "lucide-react";
import LoadingState from "@/components/LoadingState";
import { RespondLoading, RespondToForm } from "@/components/forms/respond/RespondPage";
import FallbackBoundary from "@/components/FallbackBoundary";
import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";

// Fisher-Yates shuffle (creates a new array)
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type GameState = "entry" | "playing";
type AnswerFeedback = Partial<FunctionReturnType<typeof api.quizFunctions.gradeAnswer>>;
type FinalResults = Partial<FunctionReturnType<typeof api.quizFunctions.completeQuizSession>>;

const notFoundCopy = {
  en: { title: "Quiz not found", body: "This quiz doesn't exist, or its owner made it private.", home: "Go home" },
  ar: { title: "الاختبار غير موجود", body: "هذا الاختبار غير موجود، أو جعله صاحبه خاصًا.", home: "الرئيسية" },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function UsernameLinkRoute() {
  const params = useParams();
  // If custom links aren't on the server yet, this address is an old quiz link.
  return <FallbackBoundary key={`${params.username}:${params.quizname}`} fallback={<QuizPlayerPage />}><CustomLinkOrQuiz /></FallbackBoundary>;
}

function CustomLinkOrQuiz() {
  const params = useParams();
  const username = params.username as string;
  const slug = params.quizname as string;
  const link = useQuery(api.links.resolveLink, username && slug ? { username, slug } : "skip");
  if (link === undefined) return <RespondLoading />;
  if (link) return <RespondToForm shareId={link.shareId} />;
  return <QuizPlayerPage />;
}

function QuizPlayerPage() {
  const params = useParams();
  const username = params.username as string;
  const quizname = params.quizname as string;
  const notFound = useCopy(notFoundCopy);

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
  const convex = useConvex();

  const [gameState, setGameState] = useState<GameState>("entry");
  const [playerName, setPlayerName] = useState("");
  const [startError, setStartError] = useState("");
  const [answerError, setAnswerError] = useState<{
    qId: Id<"questions">;
    answer: string;
    isTimeout: boolean;
    message: string;
  } | null>(null);
  const [finishError, setFinishError] = useState("");
  const [sessionId, setSessionId] = useState<Id<"quizSessions"> | null>(null);
  // Last completed attempt on this device, so held results can be checked later.
  const [savedAttempt, setSavedAttempt] = useState<Id<"quizSessions"> | null>(null);
  const releasedResult = useQuery(
    api.quizFunctions.getAttemptResult,
    sessionId || savedAttempt ? { sessionId: (sessionId ?? savedAttempt)! } : "skip"
  );
  const percentile = useQuery(
    api.quizFunctions.getPlayerPercentile,
    sessionId ? { sessionId } : "skip"
  );

  const [currentQ, setCurrentQ] = useState(0);
  const [finalResults, setFinalResults] = useState<FinalResults | null>(null);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, AnswerFeedback>>({});
  const [timeLeftMap, setTimeLeftMap] = useState<Record<string, number>>({});

  const [mounted, setMounted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef(false);
  const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const qStartTimes = useRef<Record<string, number>>({});
  const isFinishing = useRef(false);
  const starting = useRef(false);
  const allocatedSession = useRef<Id<"quizSessions"> | null>(null);
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    setMounted(true);
    setSoundEnabled(sfx.isEnabled());
  }, []);

  useEffect(() => {
    if (!quizMeta?._id) return;
    try {
      const stored = window.localStorage.getItem(`chaos-attempt:${quizMeta._id}`);
      if (stored) setSavedAttempt(stored as Id<"quizSessions">);
    } catch { /* storage unavailable */ }
  }, [quizMeta?._id]);

  const toggleSound = () => {
    const next = !soundEnabled;
    sfx.setEnabled(next);
    setSoundEnabled(next);
    if (next) sfx.play("select");
  };

  const rawQuestions = useMemo(() => quizData?.questions || [], [quizData]);
  const [shuffledQuestions, setShuffledQuestions] = useState<typeof rawQuestions>([]);

  // When quizData loads (and we haven't started playing yet), prepare questions
  useEffect(() => {
    if (rawQuestions.length > 0 && gameState === "entry" && shuffledQuestions.length === 0) {
      setShuffledQuestions(rawQuestions);
    }
  }, [rawQuestions, gameState, shuffledQuestions.length]);

  const questions = shuffledQuestions;

  // After Next, move focus to the new question so keyboard and screen reader users land on it.
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const heading = document.getElementById(currentQ >= questions.length ? "quiz-final-heading" : `q-heading-${currentQ}`);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [currentQ, questions.length]);

  const goNext = (from: number) => {
    pendingFocus.current = true;
    setCurrentQ(from + 1);
    haptics.light();
    sfx.play("next");
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollY = containerRef.current.scrollTop;
    const height = window.innerHeight;
    const index = Math.round(scrollY / height);
    if (index !== currentQ && index <= questions.length) {
      setCurrentQ(index);
      haptics.light();
      sfx.play("next");
    }
  };

  const submitTimeout = useEffectEvent((qId: Id<"questions">) => { void handleSubmitAnswer(qId, "", true); });

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

    if (qStartTimes.current[q._id] === undefined) {
      qStartTimes.current[q._id] = Date.now();
    }
    const endsAt = qStartTimes.current[q._id] + (q.timeLimit || 60) * 1000;
    setTimeLeftMap(prev => ({ ...prev, [q._id]: Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) }));

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setTimeLeftMap(prev => ({ ...prev, [q._id]: left }));
      if (left === 0) {
        clearInterval(timerRef.current!);
        submitTimeout(q._id);
      } else if (left <= 10) { haptics.warning(); sfx.play("tap"); }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQ, gameState, questions, feedbacks]);

  const tLeftNow = questions[currentQ] ? timeLeftMap[questions[currentQ]._id] : undefined;
  useEffect(() => {
    if (gameState !== "playing" || tLeftNow === undefined || feedbacks[questions[currentQ]?._id]) return;
    if (tLeftNow === 30 || tLeftNow === 10 || tLeftNow === 5) setAnnouncement(`${tLeftNow} seconds left`);
    if (tLeftNow === 0) setAnnouncement("Time is up");
  }, [tLeftNow, gameState, feedbacks, questions, currentQ]);

  const handleSubmitAnswer = async (qId: Id<"questions">, answer: string, isTimeout = false) => {
    if (!sessionId || submitting.current || feedbacks[qId]) return;
    submitting.current = true;
    setIsSubmitting(true);
    setAnswerError(null);
    if (!isTimeout) {
      setSelectedOptions(prev => ({ ...prev, [qId]: answer }));
    }
    haptics.medium();

    const tTaken = (Date.now() - (qStartTimes.current[qId] || Date.now())) / 1000;
    try {
      const result = await gradeAnswer({
        sessionId,
        questionId: qId,
        answer: isTimeout ? "" : answer.trim(),
        timeTaken: tTaken,
      });

      if (!active.current) return;
      setFeedbacks(prev => ({ ...prev, [qId]: result.withheld ? { withheld: true } : result }));
      setAnnouncement(
        result.withheld ? "Answer recorded. Results are released by the organiser."
        : `${result.isCorrect ? "Correct" : result.pointsEarned > 0 ? "Partly correct" : "Incorrect"}. ${result.pointsEarned} marks.${result.explanation ? " " + result.explanation : ""}`
      );
      setSelectedOptions(prev => ({ ...prev, [qId]: isTimeout ? "" : answer }));

      const isPartiallyCorrect = !result.isCorrect && result.pointsEarned > 0;
      if (result.withheld) { sfx.play("select"); }
      else if (result.isCorrect) { haptics.success(); sfx.play("correct"); }
      else if (isPartiallyCorrect) { haptics.light(); sfx.play("correct"); }
      else { haptics.error(); sfx.play("wrong"); }

    } catch (err: unknown) {
      if (!active.current) return;
      setAnswerError({
        qId,
        answer,
        isTimeout,
        message: errorMessage(err, "Your answer could not be submitted. Please try again."),
      });
      haptics.error();
    } finally {
      submitting.current = false;
      if (active.current) setIsSubmitting(false);
    }
  };

  const handleFinish = async () => {
    if (!sessionId || isFinishing.current) return;
    isFinishing.current = true;
    setFinishError("");
    haptics.success(); sfx.play("finish");
    try {
      const result = await completeSession({ sessionId });
      if (!active.current) return;
      setFinalResults(result.withheld ? { withheld: true } : result);
      try { if (quizMeta?._id) window.localStorage.setItem(`chaos-attempt:${quizMeta._id}`, sessionId); } catch { /* storage unavailable */ }
      if (!result.withheld && result.score / result.totalPoints >= 0.9 && !quizData?.disableAnimations && !prefersReducedMotion()) {
        try {
          const confetti = (await import("canvas-confetti")).default;
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ["#fca535", "#e9482b", "#ffffff"], disableForReducedMotion: true });
        } catch { /* ok */ }
      }
    } catch (err: unknown) {
      if (!active.current) return;
      setFinishError(errorMessage(err, "Your quiz could not be submitted. Please try again."));
      isFinishing.current = false;
      haptics.error();
    }
  };

  const handleStart = async () => {
    if (starting.current || !playerName.trim() || !quizMeta?._id || !quizData?.isPublished) return;
    starting.current = true;
    setIsStarting(true);
    setStartError("");
    haptics.heavy(); sfx.play("start");
    try {
      const sid = allocatedSession.current ?? await startSession({ quizId: quizMeta._id, playerName: playerName.trim() });
      if (!active.current) return;
      allocatedSession.current = sid;

      // Pool quizzes answer only the questions drawn for this attempt.
      let qs = [...rawQuestions];
      if (quizData?.usesPool) {
        const drawn = await convex.query(api.quizFunctions.getAttemptQuestionIds, { sessionId: sid });
        if (!active.current) return;
        if (!drawn) throw new Error("Your questions could not be loaded. Please try again.");
        qs = qs.filter((q) => drawn.includes(q._id));
      }
      // Shuffle questions and/or options on each play
      if (quizData?.randomizeQuestions) qs = shuffleArray(qs);
      if (quizData?.randomizeOptions) {
        qs = qs.map(q => ({
          ...q,
          options: q.options ? shuffleArray(q.options) : q.options,
        }));
      }
      setShuffledQuestions(qs);
      setSessionId(sid);

      setGameState("playing");
      setCurrentQ(0);
    } catch (err: unknown) {
      if (!active.current) return;
      console.error(err);
      setStartError(errorMessage(err, "Failed to start session."));
    } finally {
      starting.current = false;
      if (active.current) setIsStarting(false);
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

  if (quizMeta === undefined || (quizMeta && quizData === undefined)) {
    return (
      <div className="workspace-ui h-[100dvh] bg-background flex items-center justify-center">
        <LoadingState label="Loading quiz..." className="py-8" />
      </div>
    );
  }

  if (quizMeta === null || quizData === null || (quizData && !quizData.isPublished)) {
    return (
      <ErrorScreen title={notFound.title} body={notFound.body} primary={{ label: notFound.home, href: "/" }} />
    );
  }

  // ── ENTRY SCREEN
  if (gameState === "entry") {
    return (
      <div className="workspace-ui h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6 relative">
        <ThemeToggle className="absolute top-5 right-5" />
        <div className="max-w-md w-full">
          <div className="chaos-card bg-card p-8 sm:p-10">
            <p className="chaos-heading text-xs text-primary mb-3">
              {quizData?.usesPool ? `${quizData.questionCount} questions` : `${quizData?.totalPoints} marks · ${rawQuestions.length} questions`}
            </p>
            <h1 className="chaos-display text-4xl sm:text-5xl mb-8 leading-none">
              {quizData?.title || "Quiz"}
            </h1>

            <div className="space-y-4">
              <input
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleStart()}
                placeholder="Your name"
                aria-label="Your name"
                maxLength={100}
                autoFocus
                className="kb-input text-base"
              />
              <button
                onClick={handleStart}
                disabled={isStarting || !playerName.trim()}
                className="kb-btn kb-btn-primary w-full disabled:opacity-50"
              >
                {isStarting ? "Starting…" : "Start quiz"}
              </button>
              <button
                type="button"
                onClick={toggleSound}
                className="kb-btn kb-btn-ghost w-full flex items-center justify-center gap-2"
                aria-pressed={soundEnabled}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                Sound {soundEnabled ? "on" : "off"}
              </button>
              {savedAttempt && releasedResult && (
                <p className="text-xs text-muted-foreground chaos-heading">
                  {releasedResult.released
                    ? `Your last result: ${releasedResult.score} of ${releasedResult.totalPoints} marks`
                    : "Your last attempt is waiting for results"}
                </p>
              )}
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
    <div className="workspace-ui h-[100dvh] bg-background text-foreground font-sans relative">
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSound}
          className="kb-btn kb-btn-ghost p-2"
          aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <ThemeToggle />
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
      {/* Progress bar */}
      <div role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={Math.min(currentQ, questions.length)} className="fixed top-0 left-0 w-full h-1.5 bg-muted z-50">
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
          // Held results record the answer without revealing correctness.
          const graded = isFeedback && !feed?.withheld;
          const selOpt = selectedOptions[q._id];
          const tLeft = timeLeftMap[q._id] ?? (q.timeLimit || 60);

          let slideBg = "bg-background";
          let slideAnim = "";
          if (graded) {
            const noAnim = !!quizData?.disableAnimations;
            if (feed.isCorrect) {
              slideBg = noAnim ? "bg-primary/10" : "bg-primary/10 transition-colors duration-500";
            } else {
              slideBg = noAnim ? "bg-destructive/10" : "bg-destructive/10 transition-colors duration-500";
              slideAnim = noAnim ? "" : "shake";
            }
          }

          return (
            <section key={q._id} aria-label={`Question ${i + 1} of ${questions.length}`} inert={i > currentQ && !isFeedback} className={`tiktok-slide flex flex-col px-4 py-12 sm:px-8 sm:py-16 ${slideBg} ${slideAnim}`}>
              <div className="flex-1 flex flex-col pt-6 sm:pt-8 pb-4 max-w-2xl mx-auto w-full pr-1 sm:pr-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <span className="chaos-heading text-xs text-primary">
                    Question {i + 1} of {questions.length}
                  </span>
                  <span aria-hidden="true" className={`chaos-heading text-sm flex items-center gap-1.5 tabular-nums border-2 px-3 py-1 ${
                    tLeft <= 10
                      ? "border-destructive text-destructive bg-destructive/10"
                      : "border-foreground/20 text-muted-foreground"
                  }`}>
                    <Zap size={13} /> {String(tLeft).padStart(2, "0")}S
                  </span>
                </div>

                <h2 id={`q-heading-${i}`} tabIndex={-1} className="text-xl sm:text-3xl font-bold mb-6 sm:mb-8 leading-snug text-balance outline-none">
                  {q.questionText}
                </h2>

                {/* Options */}
                <div className="space-y-3" role={q.type === "mcq" || q.type === "true_false" ? "radiogroup" : undefined} aria-labelledby={`q-heading-${i}`}>
                  {q.type === "mcq" && q.options?.map((opt, optIdx) => {
                    const isSelected = selOpt === opt;
                    const isCorrectAns = isFeedback && feed?.correctAnswer === opt;
                    const isWrongSel = graded && isSelected && !feed?.isCorrect;

                    let cls = "rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition-colors";
                    if (isCorrectAns) cls = "rounded-xl border-2 border-primary bg-primary/10 text-foreground";
                    else if (isWrongSel) cls = "rounded-xl border-2 border-destructive bg-destructive/10 text-foreground";
                    else if (isFeedback) cls = "rounded-xl border-2 border-foreground/10 bg-muted text-muted-foreground opacity-60";

                    return (
                      <button
                        key={optIdx}
                        onClick={() => !isFeedback && handleSubmitAnswer(q._id, opt)}
                        role="radio" aria-checked={isSelected}
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
                    const isWrongSel = graded && isSelected && !feed?.isCorrect;

                    let cls = "rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition-colors";
                    if (isCorrectAns) cls = "rounded-xl border-2 border-primary bg-primary/10 text-foreground";
                    else if (isWrongSel) cls = "rounded-xl border-2 border-destructive bg-destructive/10 text-foreground";
                    else if (isFeedback) cls = "rounded-xl border-2 border-foreground/10 bg-muted text-muted-foreground opacity-60";

                    return (
                      <button
                        key={val}
                        onClick={() => !isFeedback && handleSubmitAnswer(q._id, val)}
                        role="radio" aria-checked={isSelected}
                        disabled={isFeedback || isSubmitting}
                        className={`w-full text-left p-3 sm:p-4 text-sm sm:text-base font-bold chaos-heading transition-all ${cls}`}
                      >
                        {val.toUpperCase()}
                      </button>
                    );
                  })}

                  {q.type === "multi_select" && (() => {
                    const currentSel = multiSelections[q._id] || [];
                    const correctList: string[] = feed?.correctAnswers ?? (feed?.correctAnswer
                      ? feed.correctAnswer.split(",").map((s: string) => s.trim())
                      : []);
                    return (
                      <div className="space-y-3" role="group" aria-labelledby={`q-heading-${i}`} aria-describedby={`q-hint-${i}`}>
                        <p id={`q-hint-${i}`} className="chaos-heading text-[10px] text-muted-foreground mb-1">Select all that apply</p>
                        {q.options?.map((opt, optIdx) => {
                          const isChecked = currentSel.includes(opt);
                          const isCorrectAns = isFeedback && correctList.includes(opt);
                          const isWrongSel = graded && isChecked && !correctList.includes(opt);
                          const isDimmed = isFeedback && !isChecked && !correctList.includes(opt);

                          let cls = "rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition-colors";
                          if (isCorrectAns) cls = "rounded-xl border-2 border-primary bg-primary/10 text-foreground";
                          else if (isWrongSel) cls = "rounded-xl border-2 border-destructive bg-destructive/10 text-foreground";
                          else if (isDimmed) cls = "rounded-xl border-2 border-foreground/10 bg-muted text-muted-foreground opacity-50";
                          else if (isChecked) cls = "rounded-xl border-2 border-primary bg-primary/10 text-foreground";

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
                              role="checkbox" aria-checked={isChecked}
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
                              handleSubmitAnswer(q._id, JSON.stringify(sel));
                            }}
                            disabled={isSubmitting || (multiSelections[q._id] || []).length === 0}
                            className="kb-btn kb-btn-primary w-full mt-2 disabled:opacity-50"
                          >
                            Submit ({(multiSelections[q._id] || []).length} selected)
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {q.type === "written" && (
                    <div className="flex flex-col gap-3 w-full">
                      <textarea
                        aria-labelledby={`q-heading-${i}`}
                        value={writtenAnswers[q._id] || ""}
                        onChange={(e) => setWrittenAnswers({ ...writtenAnswers, [q._id]: e.target.value })}
                        disabled={isFeedback || isSubmitting}
                        placeholder="Type your answer"
                        className={`kb-input min-h-[120px] resize-y ${
                          isFeedback && feed?.isCorrect ? "border-primary bg-chaos/10" :
                          isFeedback && !feed?.isCorrect && (feed?.pointsEarned ?? 0) > 0 ? "border-yellow-500 bg-yellow-500/10" :
                          graded ? "border-destructive bg-destructive/10" : ""
                        }`}
                      />
                      {!isFeedback && (
                        <button
                          onClick={() => handleSubmitAnswer(q._id, writtenAnswers[q._id] || "")}
                          disabled={isSubmitting || !(writtenAnswers[q._id]?.trim())}
                          className="kb-btn kb-btn-primary w-full disabled:opacity-50"
                        >
                          Submit answer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {answerError?.qId === q._id && !isFeedback && (
                  <div role="alert" className="mt-4 border-2 border-destructive bg-destructive/10 p-4 text-left">
                    <p className="text-sm font-semibold text-destructive mb-3">
                      {answerError.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSubmitAnswer(q._id, answerError.answer, answerError.isTimeout)}
                      disabled={isSubmitting}
                      className="kb-btn kb-btn-ghost text-xs disabled:opacity-50"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Feedback */}
                {isFeedback && (
                  <div className={`mt-6 chaos-card bg-card p-5 ${quizData?.disableAnimations ? '' : 'animate-in slide-in-from-bottom-4 duration-300'}`}>
                    {feed.withheld ? (
                      <p className="chaos-heading text-sm mb-2 text-foreground">Answer saved<span className="text-muted-foreground ml-3 font-normal text-xs">Results are released by the organiser</span></p>
                    ) : (
                    <p className={`chaos-heading text-sm mb-2 ${
                      feed.isCorrect ? "text-primary"
                      : (!feed.isCorrect && (feed.pointsEarned ?? 0) > 0) ? "text-yellow-500"
                      : "text-destructive"
                    }`}>
                      {feed.isCorrect ? "Correct" : (!feed.isCorrect && (feed.pointsEarned ?? 0) > 0) ? "Partly correct" : "Not quite"}
                      <span className="text-muted-foreground ml-3 font-normal text-xs">+{feed.pointsEarned} marks</span>
                    </p>
                    )}
                    {feed.explanation && (
                      <p className="text-sm text-muted-foreground mt-2">{feed.explanation}</p>
                    )}
                    <button
                      type="button"
                      className={`mt-4 flex items-center gap-2 text-primary chaos-heading text-xs underline-offset-4 hover:underline ${quizData?.disableAnimations ? "" : "animate-bounce"}`}
                      onClick={() => goNext(i)}
                    >
                      {i < questions.length - 1 ? "Next question" : "Finish"}
                      <ArrowDown size={13} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {/* FINAL SLIDE */}
        <section aria-labelledby="quiz-final-heading" inert={currentQ < questions.length && questions.length > 0 && !feedbacks[questions[questions.length - 1]?._id]} className="tiktok-slide flex flex-col items-center justify-center p-6 text-center">
          {!finalResults ? (
            <div className="chaos-card bg-card p-10 max-w-sm w-full text-center">
              <h2 id="quiz-final-heading" tabIndex={-1} className="chaos-display text-4xl mb-3 outline-none">All done.</h2>
              <p className="text-muted-foreground mb-8 text-sm">
                You&apos;ve answered all questions. Submit to view your final results.
              </p>
              <button
                onClick={handleFinish}
                className="kb-btn kb-btn-primary w-full"
              >
                Submit quiz
              </button>
              {finishError && (
                <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
                  {finishError}
                </p>
              )}
            </div>
          ) : finalResults.withheld && !releasedResult?.released ? (
            <div className="chaos-card bg-card p-10 max-w-md w-full text-center">
              <h2 id="quiz-final-heading" tabIndex={-1} className="chaos-display text-4xl mb-3 outline-none">Submitted.</h2>
              <p className="text-muted-foreground mb-8 text-sm">
                Your answers are saved. The organiser will release results; this page updates when they do, and you can come back to this link on this device.
              </p>
              <Link href="/" className="kb-btn kb-btn-ghost w-full">Exit</Link>
            </div>
          ) : (() => {
            const shown = finalResults.withheld && releasedResult?.released ? { ...finalResults, score: releasedResult.score, totalPoints: releasedResult.totalPoints } : finalResults;
            const score = shown.score ?? 0;
            const totalPoints = shown.totalPoints ?? 0;
            const pct = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
            const displayMode = quizData?.displayMode ?? "score";
            const passingThreshold = quizData?.passingThreshold ?? 50;
            const passed = pct >= passingThreshold;
            return (
              <div role="status" className={`chaos-card bg-card p-10 max-w-md w-full ${quizData?.disableAnimations ? '' : 'animate-in zoom-in-95 duration-500'}`}>
                <h2 id="quiz-final-heading" tabIndex={-1} className="sr-only">Your results</h2>
                {displayMode === "pass_fail" ? (
                  <>
                    <p className={`chaos-display text-7xl mb-2 ${passed ? "text-primary" : "text-destructive"}`}>
                      {passed ? "✓" : "✗"}
                    </p>
                    <p className={`chaos-heading text-3xl mb-3 ${passed ? "text-primary" : "text-destructive"}`}>
                      {passed ? "Passed" : "Not passed"}
                    </p>
                    <p className="text-muted-foreground chaos-heading text-sm mb-8">
                      {score} of {totalPoints} marks &nbsp;·&nbsp; {pct}%
                      <br />
                      <span className="text-xs opacity-70">Passing: {passingThreshold}%</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="chaos-heading text-sm text-muted-foreground mb-2">Your score</p>
                    <p className="chaos-display text-7xl text-primary mb-2">{pct}%</p>
                    <p className="text-muted-foreground mb-4 chaos-heading text-sm">
                      {score} of {totalPoints} marks
                    </p>
                    {typeof percentile === "number" && (
                      <p className="text-sm text-muted-foreground mb-6 italic border border-foreground/10 rounded px-3 py-2 bg-muted/30">
                        You did better than <span className="font-bold text-foreground not-italic">{percentile}%</span> of people who took this quiz
                      </p>
                    )}
                  </>
                )}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => {
                      // Full state reset for replay
                      setGameState("entry");
                      setPlayerName("");
                      setSessionId(null);
                      allocatedSession.current = null;
                      setCurrentQ(0);
                      setFinalResults(null);
                      setSelectedOptions({});
                      setMultiSelections({});
                      setWrittenAnswers({});
                      setFeedbacks({});
                      setTimeLeftMap({});
                      qStartTimes.current = {};
                      isFinishing.current = false;
                      setShuffledQuestions(rawQuestions);
                      if (containerRef.current) containerRef.current.scrollTop = 0;
                    }}
                    className="flex-1 kb-btn kb-btn-primary"
                  >
                    Play again
                  </button>
                  <Link
                    href="/"
                    className="flex-1 kb-btn kb-btn-ghost"
                  >
                    Exit
                  </Link>
                </div>
              </div>
            );
          })()}
        </section>
      </div>
    </div>
  );
}
