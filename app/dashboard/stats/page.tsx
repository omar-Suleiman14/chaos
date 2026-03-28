"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { haptics } from "@/lib/haptics";
import {
  FileText,
  BarChart3,
  Users,
  Trophy,
  ArrowLeft,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Minus,
  Check
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

function StatsContent() {
  const searchParams = useSearchParams();
  const quizId = searchParams.get("id") as Id<"quizzes"> | null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {quizId ? <QuizDetailView quizId={quizId} /> : <QuizzesListView />}
    </div>
  );
}

function QuizzesListView() {
  const quizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const [search, setSearch] = useState("");

  if (quizzes === undefined) {
    return (
      <div className="py-20 text-center chaos-pulse">
        <BarChart3 size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="chaos-heading text-sm text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const filteredQuizzes = quizzes.filter(
    (q) => q.title.toLowerCase().includes(search.toLowerCase()) || q.slug.includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            ANALYTICS.
          </h1>
          <p className="text-sm text-muted-foreground">
            View performance data and player stats across all your quizzes.
          </p>
        </div>

        <div className="w-full md:w-auto relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="search quizzes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border-2 border-foreground p-3 pl-10 focus:outline-none focus:border-chaos transition-colors chaos-heading text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto chaos-card bg-card p-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-[3px] border-foreground">
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Quiz Name</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-32">Status</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-32">Submissions</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-24">Avg Score</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase w-40 hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-foreground/20">
            {filteredQuizzes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No quizzes found.
                </td>
              </tr>
            ) : (
              filteredQuizzes.map((quiz) => (
                <tr key={quiz._id} className="hover:bg-muted/50 transition-colors group">
                  <td className="p-4">
                    <Link href={`/dashboard/stats?id=${quiz._id}`} className="font-bold text-base hover:text-chaos transition-colors block">
                      {quiz.title}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1">/{quiz.creatorUsername}/{quiz.slug}</div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`chaos-heading text-[10px] px-2 py-1 ${quiz.isPublished ? "bg-chaos text-chaos-foreground" : "bg-muted text-muted-foreground"}`}>
                      {quiz.isPublished ? "LIVE" : "DRAFT"}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="chaos-heading text-sm tabular-nums">
                      {quiz.sessionCount}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`chaos-heading text-sm tabular-nums ${quiz.avgScore >= 80 ? 'text-chaos' : quiz.avgScore >= 50 ? 'text-yellow-500' : 'text-destructive'}`}>
                      {quiz.sessionCount > 0 ? `${quiz.avgScore}%` : "-"}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground hidden md:table-cell">
                    {format(quiz.createdAt, "MMM d, yyyy")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QuizDetailView({ quizId }: { quizId: Id<"quizzes"> }) {
  const quiz = useQuery(api.quizFunctions.getQuiz, { quizId });
  const sessions = useQuery(api.quizFunctions.getQuizSessions, { quizId });
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"quizSessions"> | null>(null);

  if (quiz === undefined || sessions === undefined) {
    return (
      <div className="py-20 text-center chaos-pulse">
        <p className="chaos-heading text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  if (selectedSessionId) {
    return (
      <SubmissionDetailView 
        sessionId={selectedSessionId} 
        onBack={() => setSelectedSessionId(null)} 
      />
    );
  }

  const completed = sessions.filter((s) => s.status === "completed");
  const avgScore = completed.length > 0 
    ? completed.reduce((sum, s) => sum + (s.totalPoints > 0 ? (s.score / s.totalPoints) * 100 : 0), 0) / completed.length 
    : 0;

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <Link href="/dashboard/stats" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 chaos-heading">
            <ArrowLeft size={12} /> BACK TO ALL
          </Link>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            {quiz?.title || "Quiz Analytics"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Displaying all complete submissions.
          </p>
        </div>

        <Link
          href={`/dashboard/editor?id=${quizId}`}
          className="chaos-heading text-xs border-2 border-foreground px-4 py-2 hover:bg-foreground hover:text-background transition-colors"
        >
          EDIT SETTINGS
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="chaos-card bg-foreground text-background p-6 flex flex-col items-center justify-center text-center">
          <Users size={24} className="text-muted-foreground mb-2" />
          <p className="text-3xl font-black font-mono leading-none mb-1">{completed.length}</p>
          <p className="chaos-heading text-xs text-muted-foreground">TOTAL SUBMISSIONS</p>
        </div>
        
        <div className="chaos-card bg-card p-6 flex flex-col items-center justify-center text-center border-chaos text-chaos">
          <Trophy size={24} className="mb-2" />
          <p className="text-3xl font-black font-mono leading-none mb-1">{Math.round(avgScore)}%</p>
          <p className="chaos-heading text-xs">AVERAGE SCORE</p>
        </div>

        <div className="chaos-card bg-card p-6 flex flex-col items-center justify-center text-center">
          <Clock size={24} className="text-muted-foreground mb-2" />
          <p className="text-xl font-bold font-mono leading-none mb-2">
            {completed.length > 0 && completed[0].startedAt 
              ? formatDistanceToNow(completed[completed.length-1].startedAt, { addSuffix: true })
              : 'N/A'
            }
          </p>
          <p className="chaos-heading text-xs text-muted-foreground">FIRST SUBMISSION</p>
        </div>
      </div>

      <div className="chaos-card bg-card p-0 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-[3px] border-foreground bg-muted/30">
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Player Name</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Score</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">Time Started</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-foreground/20">
            {completed.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                  No submissions yet. Share the link!
                </td>
              </tr>
            ) : (
              completed.map((session) => {
                const percent = Math.round(session.totalPoints > 0 ? (session.score / session.totalPoints) * 100 : 0);
                return (
                  <tr key={session._id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-4 font-bold">{session.playerName}</td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`chaos-heading text-sm tabular-nums ${percent >= 80 ? 'text-chaos' : percent >= 50 ? 'text-yellow-500' : 'text-destructive'}`}>
                          {percent}%
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {session.score}/{session.totalPoints} pts
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center hidden sm:table-cell text-xs text-muted-foreground">
                      {format(session.startedAt, "MMM d, h:mm a")}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setSelectedSessionId(session._id)}
                        className="chaos-heading text-xs border-2 border-foreground px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SubmissionDetailView({ 
  sessionId, 
  onBack 
}: { 
  sessionId: Id<"quizSessions">, 
  onBack: () => void 
}) {
  const detail = useQuery(api.quizFunctions.getSessionDetail, { sessionId });
  const overrideScore = useMutation(api.quizFunctions.overrideScore);
  
  const [editingId, setEditingId] = useState<Id<"questions"> | null>(null);
  const [editVal, setEditVal] = useState("");

  if (detail === undefined) {
    return (
      <div className="py-20 text-center chaos-pulse">
        <p className="chaos-heading text-sm text-muted-foreground">Loading details...</p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="py-20 text-center">
        <p className="chaos-heading text-sm text-destructive">Submission not found</p>
        <button onClick={onBack} className="mt-4 chaos-heading text-xs underline">Go back</button>
      </div>
    );
  }

  const percent = Math.round(detail.totalPoints > 0 ? (detail.score / detail.totalPoints) * 100 : 0);

  const handleSaveOverride = async (questionId: Id<"questions">) => {
    const val = parseInt(editVal);
    if (!isNaN(val) && val >= 0) {
      haptics.select();
      await overrideScore({ sessionId, questionId, newPoints: val });
    }
    setEditingId(null);
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 chaos-heading">
            <ArrowLeft size={12} /> BACK TO SUBMISSIONS
          </button>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            {detail.playerName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Completed {detail.completedAt ? formatDistanceToNow(detail.completedAt, { addSuffix: true }) : ""}
          </p>
        </div>

        <div className="chaos-card bg-foreground text-background p-4 flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-black font-mono leading-none">{percent}%</p>
            <p className="chaos-heading text-[10px] text-muted-foreground">SCORE</p>
          </div>
          <div className="w-0.5 h-8 bg-background/20" />
          <div className="text-center">
            <p className="text-xl font-bold font-mono leading-none">{detail.score}/{detail.totalPoints}</p>
            <p className="chaos-heading text-[10px] text-muted-foreground">POINTS</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {detail.answerDetails?.map((ans, i) => {
          const isCorrect = ans.isCorrect;
          const isPartial = !isCorrect && ans.pointsEarned > 0;
          
          return (
            <div key={i} className={`chaos-card p-5 border-2 ${isCorrect ? "border-chaos/50 bg-chaos/5" : isPartial ? "border-yellow-500/50 bg-yellow-500/5" : "border-destructive/50 bg-destructive/5"}`}>
              <div className="flex justify-between items-start gap-4 mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <span className="chaos-heading text-base shrink-0 border-2 border-foreground w-8 h-8 flex items-center justify-center bg-background">
                    {i+1}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold mb-1">{ans.questionText}</h3>
                    <div className="flex items-center gap-2 mt-2">
                       {isCorrect ? <CheckCircle2 size={14} className="text-chaos" /> : isPartial ? <Minus size={14} className="text-yellow-500" /> : <XCircle size={14} className="text-destructive" />}
                       <p className="text-xs text-muted-foreground mt-0.5">
                        Answer: <span className="text-foreground font-mono">{ans.answer || "(No answer)"}</span>
                      </p>
                    </div>
                    {ans.questionType === "written" && (
                       <p className="text-[10px] text-muted-foreground mt-2 italic">Teacher keywords were: {ans.correctAnswers?.join(", ") || "None"}</p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 min-w-[100px]">
                  {editingId === ans.questionId ? (
                    <div className="flex items-center justify-end gap-1">
                      <input 
                        type="number" 
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="w-14 bg-background border-2 border-foreground text-center font-mono py-1 px-1 text-sm outline-none focus:border-chaos"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleSaveOverride(ans.questionId)}
                      />
                      <span className="text-xs text-muted-foreground">/{ans.totalPoints}</span>
                      <button onClick={() => handleSaveOverride(ans.questionId)} className="p-1 hover:text-chaos ml-1"><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:text-destructive"><XCircle size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 group">
                      <span className={`chaos-heading text-lg ${isCorrect ? 'text-chaos' : isPartial ? 'text-yellow-500' : 'text-destructive'}`}>
                        {ans.pointsEarned} <span className="text-xs text-muted-foreground">/{ans.totalPoints} pts</span>
                      </span>
                      <button 
                         onClick={() => { setEditingId(ans.questionId); setEditVal(ans.pointsEarned.toString()); }}
                         className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity"
                         title="Override Score"
                      >
                         <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="p-8 chaos-pulse">Loading stats...</div>}>
      <StatsContent />
    </Suspense>
  );
}
