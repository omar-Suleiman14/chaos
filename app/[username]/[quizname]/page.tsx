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
  const [sessionId, setSessionId] = useState<Id<"quizSessions"> | null>(null);
  
  const [currentQ, setCurrentQ] = useState(0);
  const [finalResults, setFinalResults] = useState<any>(null);
  
  // Per-question state
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
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

  // Update currentQ based on scroll position natively over snap points
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

  // Timer logic for the currently active question
  useEffect(() => {
    if (gameState !== "playing" || currentQ === questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const q = questions[currentQ];
    if (!q) return;

    // If already answered, do not tick
    if (feedbacks[q._id]) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initialize timer for this question if it doesn't exist
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
        if (current <= 11) { haptics.warning(); sfx.play("tap"); }
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
      if (result.isCorrect) { haptics.success(); sfx.play("correct"); }
      else if (isPartiallyCorrect) { haptics.light(); sfx.play("correct"); }
      else { haptics.error(); sfx.play("wrong"); }

    } catch (err) { console.error(err); }
    setIsSubmitting(false);
  };

  const handleFinish = async () => {
    if (!sessionId) return;
    haptics.success(); sfx.play("finish");
    try {
      const result = await completeSession({ sessionId });
      setFinalResults(result);
      if (result.score / result.totalPoints >= 0.9) {
        try {
          const confetti = (await import("canvas-confetti")).default;
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ["#2F5333", "#F0EFEA", "#111111"] });
        } catch { /* ok */ }
      }
    } catch (err) { console.error(err); }
  };

  const handleStart = async () => {
    if (!playerName.trim() || !quizMeta?._id) return;
    haptics.heavy(); sfx.play("start");
    try {
      const sid = await startSession({ quizId: quizMeta._id, playerName: playerName.trim() });
      setSessionId(sid);
      setGameState("playing");
      setCurrentQ(0);
    } catch (err) { console.error(err); }
  };

  if (!mounted) return null;

  if (quizMeta === undefined) {
    return (
      <div className="h-[100dvh] bg-[#F0EFEA] flex items-center justify-center">
        <p className="text-[#111111]/60 font-medium">Loading...</p>
      </div>
    );
  }

  if (quizMeta === null || (quizData && !quizData.isPublished)) {
    return (
      <div className="h-[100dvh] bg-[#F0EFEA] flex flex-col items-center justify-center p-6 text-center text-[#111111]">
        <h1 className="text-2xl font-semibold mb-2">Quiz Not Found</h1>
        <p className="text-[#111111]/60 mb-8 max-w-sm">This quiz does not exist or is currently private.</p>
        <button onClick={() => window.location.href = "/"} className="px-8 py-3 bg-[#2F5333] text-white rounded-full font-medium">Home</button>
      </div>
    );
  }

  // ── ENTRY SCREEN
  if (gameState === "entry") {
    return (
      <div className="h-[100dvh] bg-[#F0EFEA] flex flex-col items-center justify-center p-6 text-[#111111]">
        <div className="max-w-md w-full text-center">
          <p className="text-[#2F5333] font-medium mb-3">{quizData?.totalPoints} Points • {questions.length} Questions</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-8">
            {quizData?.title || "Quiz"}
          </h1>
          
          <div className="space-y-4 max-w-sm mx-auto">
            <input
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleStart()}
              placeholder="Enter your name"
              autoFocus
              className="w-full bg-white border border-[#111111]/20 rounded-xl px-5 py-4 font-medium text-lg placeholder:text-[#111111]/30 focus:outline-none focus:border-[#2F5333] transition-colors"
            />
            <button
              onClick={handleStart}
              disabled={!playerName.trim()}
              className="w-full px-8 py-4 bg-[#2F5333] text-white rounded-xl font-medium text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Start Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING (SNAP SCROLL)
  return (
    <div className="h-[100dvh] bg-[#F0EFEA] text-[#111111] font-sans relative">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#111111]/10 z-50">
        <div 
          className="h-full bg-[#2F5333] transition-all duration-300"
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

          return (
            <div key={q._id} className="tiktok-slide flex flex-col px-6 py-12 sm:px-12 sm:py-16">
              <div className="flex-1 flex flex-col pt-8 max-w-2xl mx-auto w-full">
                <div className="flex justify-between items-center mb-6">
                   <span className="text-sm font-medium text-[#2F5333]">Question {i+1} of {questions.length}</span>
                   <span className={`text-sm font-medium flex items-center gap-1 tabular-nums ${tLeft <= 10 ? 'text-red-600' : 'text-[#111111]/60'}`}>
                     <Zap size={14} /> {String(tLeft).padStart(2, "0")}s
                   </span>
                </div>
                
                <h2 className="text-2xl sm:text-3xl font-semibold mb-10 leading-snug">
                  {q.questionText}
                </h2>

                <div className="space-y-4">
                  {q.type === "mcq" && q.options?.map((opt, optIdx) => {
                     const isSelected = selOpt === opt;
                     const isCorrectAns = isFeedback && feed?.correctAnswer === opt;
                     const isWrongSel = isFeedback && isSelected && !feed?.isCorrect;
                     
                     let optStyle = "border border-[#111111]/20 bg-white hover:border-[#2F5333]";
                     if (isCorrectAns) optStyle = "border-[#2F5333] bg-[#2F5333] text-white";
                     else if (isWrongSel) optStyle = "border-red-600 bg-red-600 text-white";
                     else if (isFeedback) optStyle = "border-[#111111]/10 bg-[#111111]/5 text-[#111111]/40";
                     
                     return (
                       <button
                         key={optIdx}
                         onClick={() => !isFeedback && handleSubmitAnswer(q._id, opt)}
                         disabled={isFeedback || isSubmitting}
                         className={`w-full text-left p-4 sm:p-5 rounded-xl font-medium transition-colors ${optStyle}`}
                       >
                         {opt}
                       </button>
                     )
                  })}
                  {q.type === "true_false" && ["True", "False"].map((val) => {
                     const isSelected = selOpt === val;
                     const isCorrectAns = isFeedback && feed?.correctAnswer === val;
                     const isWrongSel = isFeedback && isSelected && !feed?.isCorrect;
                     
                     let optStyle = "border border-[#111111]/20 bg-white hover:border-[#2F5333]";
                     if (isCorrectAns) optStyle = "border-[#2F5333] bg-[#2F5333] text-white";
                     else if (isWrongSel) optStyle = "border-red-600 bg-red-600 text-white";
                     else if (isFeedback) optStyle = "border-[#111111]/10 bg-[#111111]/5 text-[#111111]/40";
                     
                     return (
                       <button
                         key={val}
                         onClick={() => !isFeedback && handleSubmitAnswer(q._id, val)}
                         disabled={isFeedback || isSubmitting}
                         className={`w-full text-left p-4 sm:p-5 rounded-xl font-medium transition-colors ${optStyle}`}
                       >
                         {val}
                       </button>
                     )
                  })}
                  
                  {q.type === "written" && (
                    <div className="mt-4 flex flex-col gap-3 w-full animate-in fade-in duration-300">
                      <textarea
                        value={writtenAnswers[q._id] || ""}
                        onChange={(e) => setWrittenAnswers({ ...writtenAnswers, [q._id]: e.target.value })}
                        disabled={isFeedback || isSubmitting}
                        placeholder="Type your answer here..."
                        className={`w-full bg-white border rounded-xl p-4 min-h-[120px] resize-y focus:outline-none transition-all ${
                          isFeedback && feed?.isCorrect ? "border-[#2F5333] ring-1 ring-[#2F5333] bg-[#2F5333]/5" : 
                          isFeedback && !feed?.isCorrect && feed?.pointsEarned > 0 ? "border-[#EAA015] ring-1 ring-[#EAA015] bg-[#EAA015]/5" : 
                          isFeedback && !feed?.isCorrect ? "border-red-600 ring-1 ring-red-600 bg-red-50" : 
                          "border-[#111111]/20 focus:border-[#2F5333] focus:ring-1 focus:ring-[#2F5333]"
                        }`}
                      />
                      {!isFeedback && (
                        <button
                          onClick={() => handleSubmitAnswer(q._id, writtenAnswers[q._id] || "")}
                          disabled={isSubmitting || !(writtenAnswers[q._id]?.trim())}
                          className="bg-[#2F5333] text-white py-4 rounded-xl font-medium w-full disabled:opacity-50 hover:bg-[#2F5333]/90 transition-colors"
                        >
                          Submit Answer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isFeedback && (
                  <div className="mt-8 p-5 rounded-xl bg-white border border-[#111111]/10 animate-in slide-in-from-bottom-4 shadow-sm">
                    <p className={`font-semibold mb-2 ${
                      feed.isCorrect ? 'text-[#2F5333]' : (!feed.isCorrect && feed.pointsEarned > 0) ? 'text-[#EAA015]' : 'text-red-600'
                    }`}>
                       {feed.isCorrect ? "Correct" : (!feed.isCorrect && feed.pointsEarned > 0) ? "Partially Correct" : "Incorrect"} 
                       <span className="text-[#111111]/40 ml-2">+{feed.pointsEarned} pts</span>
                    </p>
                    {feed.explanation && <p className="text-sm text-[#111111]/70 mt-3">{feed.explanation}</p>}
                    
                    {i < questions.length - 1 ? (
                      <div className="mt-6 flex flex-col items-center gap-2 text-[#2F5333] font-medium text-sm animate-bounce cursor-pointer"
                           onClick={() => {
                             if (containerRef.current) {
                               containerRef.current.scrollBy({ top: window.innerHeight, behavior: "smooth" });
                             }
                           }}>
                        Swipe up for next <ArrowDown size={14} />
                      </div>
                    ) : (
                      <div className="mt-6 flex flex-col items-center gap-2 text-[#2F5333] font-medium text-sm animate-bounce cursor-pointer"
                           onClick={() => {
                             if (containerRef.current) {
                               containerRef.current.scrollBy({ top: window.innerHeight, behavior: "smooth" });
                             }
                           }}>
                        Swipe up to finish <ArrowDown size={14} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* FINAL SLIDE */}
        <div className="tiktok-slide flex flex-col items-center justify-center p-6 text-center">
          {!finalResults ? (
            <div className="max-w-sm w-full">
              <h2 className="text-3xl font-semibold mb-2">Quiz Complete</h2>
              <p className="text-[#111111]/60 mb-8">You've answered all questions. Submit to view your final results.</p>
              <button 
                onClick={handleFinish}
                className="w-full py-4 bg-[#2F5333] text-white rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                Submit Quiz →
              </button>
            </div>
          ) : (
            <div className="max-w-md w-full animate-in zoom-in-95 duration-500">
               <h2 className="text-6xl font-semibold tracking-tight mb-2 text-[#2F5333]">
                 {Math.round((finalResults.score / finalResults.totalPoints) * 100)}%
               </h2>
               <p className="text-[#111111]/60 mb-10 text-lg">{finalResults.score} of {finalResults.totalPoints} points earned</p>
               
               <div className="flex flex-col sm:flex-row gap-4">
                 <button onClick={() => window.location.reload()} className="flex-1 py-4 bg-[#2F5333] text-white rounded-full font-medium hover:opacity-90 transition-opacity">
                   Play Again
                 </button>
                 <button onClick={() => window.location.href = '/'} className="flex-1 py-4 bg-white border border-[#111111]/20 text-[#111111] rounded-full font-medium hover:bg-[#111111]/5 transition-colors">
                   Exit
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
