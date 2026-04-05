"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { haptics } from "@/lib/haptics";
import {
  Sun,
  Moon,
  Zap,
  Trophy,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Clock,
  Lightbulb,
  Award,
  Target,
} from "lucide-react";

type GameState = "entry" | "playing" | "feedback" | "results";

interface AnswerRecord {
  questionId: Id<"questions">;
  answer: string;
  timeTaken: number;
}

function QuizPlayerContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const quizIdParam = searchParams.get("id") as Id<"quizzes"> | null;
  const { theme, toggleTheme } = useTheme();

  // Try to get quiz by slug first, then by ID
  const quizBySlug = useQuery(
    api.quizFunctions.getQuizBySlug,
    slug ? { slug } : "skip"
  );

  const quizId = quizBySlug?._id || quizIdParam;

  const quizData = useQuery(
    api.quizFunctions.getQuizForPlayer,
    quizId ? { quizId } : "skip"
  );

  const leaderboard = useQuery(
    api.quizFunctions.getQuizLeaderboard,
    quizId ? { quizId } : "skip"
  );

  const submitSession = useMutation(api.quizFunctions.submitQuizSession);

  const [gameState, setGameState] = useState<GameState>("entry");
  const [playerName, setPlayerName] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [startTime, setStartTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [gradedAnswers, setGradedAnswers] = useState<
    Array<{
      questionId: Id<"questions">;
      answer: string;
      isCorrect: boolean;
      pointsEarned: number;
    }>
  >([]);
  const [mounted, setMounted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const questions = quizData?.questions || [];
  const currentQuestion = questions[currentQ];

  // Timer
  useEffect(() => {
    if (gameState !== "playing" || !currentQuestion) return;

    const limit = currentQuestion.timeLimit || 30;
    setTimeLeft(limit);
    setQuestionStartTime(Date.now());

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up — auto submit empty
          handleSubmitAnswer("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, currentQ, currentQuestion]);

  const handleStartQuiz = () => {
    if (!playerName.trim()) return;
    haptics.heavy();
    setGameState("playing");
    setStartTime(Date.now());
    setCurrentQ(0);
  };

  const handleSubmitAnswer = useCallback(
    (answer: string) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (!currentQuestion) return;

      haptics.medium();
      const timeTaken = (Date.now() - questionStartTime) / 1000;

      const newAnswer: AnswerRecord = {
        questionId: currentQuestion._id,
        answer,
        timeTaken,
      };

      setAnswers((prev) => [...prev, newAnswer]);
      setGameState("feedback");

      // We don't know the correct answer on the client; we'll wait for results
      // But we can provide visual feedback based on patterns
      setSelectedAnswer(answer);
    },
    [currentQuestion, questionStartTime]
  );

  const handleSelectOption = (option: string) => {
    if (gameState !== "playing") return;
    haptics.select();
    handleSubmitAnswer(option);
  };

  const handleSelectMulti = (option: string) => {
    if (gameState !== "playing") return;
    haptics.select();
    setSelectedMulti((prev) =>
      prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev, option]
    );
  };

  const handleSubmitMulti = () => {
    handleSubmitAnswer(selectedMulti.join(","));
  };

  const handleSubmitWritten = () => {
    handleSubmitAnswer(writtenAnswer);
  };

  const handleNextQuestion = () => {
    haptics.light();
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setSelectedAnswer(null);
      setSelectedMulti([]);
      setWrittenAnswer("");
      setIsCorrect(null);
      setGameState("playing");
    } else {
      // Submit quiz
      handleFinishQuiz();
    }
  };

  const handleFinishQuiz = async () => {
    if (!quizId) return;
    haptics.success();

    try {
      const result = await submitSession({
        quizId,
        playerName: playerName.trim(),
        answers: answers.map((a) => ({
          questionId: a.questionId,
          answer: a.answer,
          timeTaken: a.timeTaken,
        })),
        startedAt: startTime,
      });

      setTotalScore(result.score);
      setTotalPoints(result.totalPoints);
      setGradedAnswers(result.answers);
      setGameState("results");
    } catch (err) {
      console.error("Submit error:", err);
    }
  };

  const handleRestart = () => {
    haptics.heavy();
    setGameState("entry");
    setCurrentQ(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setSelectedMulti([]);
    setWrittenAnswer("");
    setIsCorrect(null);
    setTotalScore(0);
    setTotalPoints(0);
    setGradedAnswers([]);
    setPlayerName("");
  };

  if (!mounted) return null;

  // ===== LOADING =====
  if (!quizData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="chaos-heading text-2xl chaos-pulse mb-4">⚡</div>
          <p className="chaos-heading text-sm">Loading quiz...</p>
        </div>
      </div>
    );
  }

  // ===== NOT FOUND =====
  if (!quizData.isPublished) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="chaos-card bg-card p-8 max-w-md text-center">
          <XCircle size={48} className="mx-auto mb-4 text-destructive" />
          <h1 className="chaos-heading text-xl mb-2">Quiz not available</h1>
          <p className="text-sm text-muted-foreground">
            This quiz hasn&apos;t been published yet.
          </p>
        </div>
      </div>
    );
  }

  // ===== ENTRY SCREEN =====
  if (gameState === "entry") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Theme toggle */}
          <div className="flex justify-end mb-4">
            <button
              onClick={toggleTheme}
              className="p-2 border-2 border-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="chaos-card bg-card p-8">
            {/* Color strip */}
            <div
              className="h-3 -mx-8 -mt-8 mb-6"
              style={{ background: quizData.coverColor || "#22c55e" }}
            />

            <div className="text-center mb-8">
              <h1
                className="chaos-display text-3xl sm:text-4xl mb-2"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {quizData.title}
              </h1>
              {quizData.description && (
                <p className="text-sm text-muted-foreground">
                  {quizData.description}
                </p>
              )}
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="chaos-badge">{questions.length} Q</span>
                <span className="chaos-badge flex items-center gap-1">
                  <Zap size={12} />
                  {questions.reduce((a, q) => a + q.points, 0)} MARKS
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartQuiz()}
                placeholder="ENTER YOUR NAME..."
                autoFocus
                className="w-full bg-transparent border-2 border-foreground p-4 chaos-heading text-center text-lg placeholder:text-muted-foreground focus:outline-none focus:border-chaos"
              />
              <button
                onClick={handleStartQuiz}
                disabled={!playerName.trim()}
                className="w-full chaos-heading text-lg bg-foreground text-background py-4 border-2 border-foreground hover:bg-chaos hover:text-chaos-foreground hover:border-chaos transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Zap size={20} />
                Start Quiz
              </button>
            </div>

            {/* Leaderboard preview */}
            {leaderboard && leaderboard.length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-foreground">
                <h3 className="chaos-heading text-xs text-muted-foreground mb-3 flex items-center gap-2">
                  <Trophy size={14} /> Top Scores
                </h3>
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="chaos-heading text-xs bg-foreground text-background w-6 h-6 flex items-center justify-center">
                          {i + 1}
                        </span>
                        {entry.playerName}
                      </span>
                      <span className="chaos-heading text-xs text-chaos">
                        {entry.score}/{entry.totalPoints}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAYING / FEEDBACK =====
  if (
    (gameState === "playing" || gameState === "feedback") &&
    currentQuestion
  ) {
    const timeLimit = currentQuestion.timeLimit || 30;
    const timePercent = (timeLeft / timeLimit) * 100;
    const isUrgent = timeLeft <= 5;

    return (
      <div className="min-h-screen flex flex-col">
        {/* Timer bar */}
        <div className="h-2 bg-muted relative overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 linear ${isUrgent ? "bg-destructive" : "bg-chaos"}`}
            style={{ width: `${timePercent}%` }}
          />
        </div>

        {/* Progress */}
        <div className="p-4 flex items-center justify-between border-b-2 border-foreground">
          <div className="flex items-center gap-3">
            <span className="chaos-heading text-sm bg-foreground text-background px-3 py-1">
              {currentQ + 1}
            </span>
            <span className="text-xs text-muted-foreground">
              of {questions.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="chaos-heading text-xs text-chaos">
              {currentQuestion.points} marks
            </span>
            <span
              className={`chaos-heading text-lg flex items-center gap-1 ${isUrgent ? "text-destructive shake" : ""}`}
            >
              <Clock size={16} />
              {timeLeft}s
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-2xl mx-auto w-full">
          {/* Question */}
          <div className="mb-8 slide-up">
            <h2
              className="chaos-display text-xl sm:text-2xl md:text-3xl"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {currentQuestion.questionText}
            </h2>
          </div>

          {/* Options */}
          <div className="flex-1 space-y-3 stagger-children">
            {/* MCQ */}
            {currentQuestion.type === "mcq" &&
              currentQuestion.options?.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectOption(opt)}
                  disabled={gameState === "feedback"}
                  className={`w-full text-left p-4 border-3 chaos-heading text-sm sm:text-base transition-all quiz-option ${
                    gameState === "feedback" && selectedAnswer === opt
                      ? "border-chaos bg-chaos/10"
                      : "border-foreground hover:bg-foreground/5"
                  } ${gameState === "feedback" ? "cursor-default" : ""}`}
                  style={{ borderWidth: "3px" }}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-8 h-8 border-2 border-current flex items-center justify-center text-xs flex-shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="uppercase">{opt}</span>
                    {gameState === "feedback" && selectedAnswer === opt && (
                      <CheckCircle2
                        size={20}
                        className="ml-auto text-chaos"
                      />
                    )}
                  </span>
                </button>
              ))}

            {/* True / False */}
            {currentQuestion.type === "true_false" && (
              <div className="grid grid-cols-2 gap-4">
                {["True", "False"].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleSelectOption(val)}
                    disabled={gameState === "feedback"}
                    className={`p-6 border-3 chaos-heading text-lg text-center transition-all quiz-option ${
                      gameState === "feedback" && selectedAnswer === val
                        ? "border-chaos bg-chaos/10"
                        : "border-foreground hover:bg-foreground/5"
                    }`}
                    style={{ borderWidth: "3px" }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            )}

            {/* Multi Select */}
            {currentQuestion.type === "multi_select" && (
              <>
                {currentQuestion.options?.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectMulti(opt)}
                    disabled={gameState === "feedback"}
                    className={`w-full text-left p-4 border-3 chaos-heading text-sm sm:text-base transition-all quiz-option ${
                      selectedMulti.includes(opt)
                        ? "border-chaos bg-chaos/10"
                        : "border-foreground hover:bg-foreground/5"
                    }`}
                    style={{ borderWidth: "3px" }}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 border-2 flex items-center justify-center text-xs flex-shrink-0 ${selectedMulti.includes(opt) ? "bg-chaos text-chaos-foreground border-chaos" : "border-current"}`}
                      >
                        {selectedMulti.includes(opt) ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          String.fromCharCode(65 + i)
                        )}
                      </span>
                      <span className="uppercase">{opt}</span>
                    </span>
                  </button>
                ))}
                {gameState === "playing" && (
                  <button
                    onClick={handleSubmitMulti}
                    disabled={selectedMulti.length === 0}
                    className="w-full mt-2 chaos-heading text-sm bg-chaos text-chaos-foreground py-4 border-2 border-chaos hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Submit Selection
                    <ArrowRight size={16} />
                  </button>
                )}
              </>
            )}

            {/* Written */}
            {currentQuestion.type === "written" && (
              <>
                <textarea
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  disabled={gameState === "feedback"}
                  rows={4}
                  className="w-full bg-transparent border-3 border-foreground p-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-chaos resize-none"
                  placeholder="Type your answer..."
                  style={{ borderWidth: "3px" }}
                  autoFocus
                />
                {gameState === "playing" && (
                  <button
                    onClick={handleSubmitWritten}
                    disabled={!writtenAnswer.trim()}
                    className="w-full chaos-heading text-sm bg-chaos text-chaos-foreground py-4 border-2 border-chaos hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Submit Answer
                    <ArrowRight size={16} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Feedback / Next */}
          {gameState === "feedback" && (
            <div className="mt-6 slide-up">
              <hr className="chaos-divider mb-4" />
              <div className="flex items-center justify-between">
                <div className="chaos-badge flex items-center gap-2">
                  <Zap size={14} /> Answer recorded
                </div>
                <button
                  onClick={handleNextQuestion}
                  className="chaos-heading text-sm bg-foreground text-background px-6 py-3 border-2 border-foreground hover:bg-chaos hover:text-chaos-foreground hover:border-chaos transition-colors flex items-center gap-2"
                >
                  {currentQ < questions.length - 1 ? "Next" : "Finish"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="p-4 border-t-2 border-foreground">
          <div className="flex gap-1 justify-center max-w-2xl mx-auto">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 max-w-4 transition-colors ${
                  i < currentQ
                    ? "bg-chaos"
                    : i === currentQ
                      ? "bg-foreground"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===== RESULTS =====
  if (gameState === "results") {
    const percentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
    const isGreat = percentage >= 80;
    const isGood = percentage >= 50;

    return (
      <div className="min-h-screen p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          {/* Theme toggle */}
          <div className="flex justify-end mb-4">
            <button
              onClick={toggleTheme}
              className="p-2 border-2 border-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          {/* Score card */}
          <div className="chaos-card bg-card p-8 text-center mb-8 slide-up">
            <div className="mb-4">
              {isGreat ? (
                <Trophy size={64} className="mx-auto text-chaos" />
              ) : isGood ? (
                <Award size={64} className="mx-auto text-chaos" />
              ) : (
                <Target size={64} className="mx-auto text-muted-foreground" />
              )}
            </div>

            <h1
              className="chaos-display text-4xl sm:text-5xl mb-2"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {isGreat
                ? "PHENOMENAL!"
                : isGood
                  ? "SOLID WORK!"
                  : "KEEP GOING."}
            </h1>

            <p className="text-muted-foreground text-sm mb-6">
              {playerName}, you scored:
            </p>

            <div className="flex items-center justify-center gap-4">
              {(() => {
                const displayMode = quizData?.displayMode ?? "score";
                const passingThreshold = quizData?.passingThreshold ?? 50;
                const passed = percentage >= passingThreshold;
                if (displayMode === "pass_fail") {
                  return (
                    <div className="chaos-card-accent p-6 text-center">
                      <span className={`text-5xl font-black ${passed ? "text-chaos" : "text-destructive"}`}
                        style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {passed ? "✓" : "✗"}
                      </span>
                      <p className={`chaos-heading text-xl mt-1 ${passed ? "text-chaos" : "text-destructive"}`}>
                        {passed ? "PASSED" : "FAILED"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {totalScore}/{totalPoints} marks · {Math.round(percentage)}%
                      </p>
                      <p className="text-xs text-muted-foreground opacity-60">Passing: {passingThreshold}%</p>
                    </div>
                  );
                }
                return (
                  <>
                    <div className="chaos-card-accent p-4 text-center">
                      <span className="text-4xl font-black text-chaos"
                        style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {totalScore}
                      </span>
                      <span className="text-lg text-muted-foreground">/{totalPoints}</span>
                      <p className="text-xs text-muted-foreground mt-1 uppercase">Marks</p>
                    </div>
                    <div className="chaos-card p-4 text-center">
                      <span className="text-4xl font-black"
                        style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {Math.round(percentage)}%
                      </span>
                      <p className="text-xs text-muted-foreground mt-1 uppercase">Score</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Answer breakdown */}
          <div className="space-y-3 stagger-children mb-8">
            <h3 className="chaos-heading text-sm text-muted-foreground mb-3">
              Answer breakdown
            </h3>
            {gradedAnswers.map((ga, i) => (
              <div
                key={i}
                className={`p-4 border-2 flex items-center justify-between ${
                  ga.isCorrect
                    ? "border-chaos bg-chaos/5"
                    : ga.pointsEarned > 0
                      ? "border-yellow-500 bg-yellow-500/5"
                      : "border-destructive bg-destructive/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  {ga.isCorrect ? (
                    <CheckCircle2 size={20} className="text-chaos flex-shrink-0" />
                  ) : (
                    <XCircle
                      size={20}
                      className={`flex-shrink-0 ${ga.pointsEarned > 0 ? "text-yellow-500" : "text-destructive"}`}
                    />
                  )}
                  <div>
                    <span className="text-sm">
                      Q{i + 1}:{" "}
                      {questions[i]?.questionText?.substring(0, 50)}
                      {(questions[i]?.questionText?.length || 0) > 50
                        ? "..."
                        : ""}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your answer: {ga.answer || "(no answer)"}
                    </p>
                  </div>
                </div>
                <span className="chaos-heading text-sm text-chaos flex-shrink-0">
                  +{ga.pointsEarned}
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleRestart}
              className="flex-1 chaos-heading text-sm bg-foreground text-background py-4 border-2 border-foreground hover:bg-chaos hover:text-chaos-foreground hover:border-chaos transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Play Again
            </button>
          </div>

          {/* Leaderboard */}
          {leaderboard && leaderboard.length > 0 && (
            <div className="mt-8 chaos-card bg-card p-6">
              <h3 className="chaos-heading text-sm mb-4 flex items-center gap-2">
                <Trophy size={16} className="text-chaos" /> Leaderboard
              </h3>
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-sm p-2 ${entry.playerName === playerName ? "bg-chaos/10 border border-chaos" : ""}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="chaos-heading text-xs bg-foreground text-background w-7 h-7 flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className={entry.playerName === playerName ? "font-bold" : ""}>
                        {entry.playerName}
                        {entry.playerName === playerName && " (you)"}
                      </span>
                    </span>
                    <span className="chaos-heading text-xs text-chaos">
                      {entry.score}/{entry.totalPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function QuizPlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <span className="chaos-heading text-sm chaos-pulse">Loading...</span>
        </div>
      }
    >
      <QuizPlayerContent />
    </Suspense>
  );
}
