"use client";

import { useMutation } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale/ar";
import { haptics } from "@/lib/haptics";
import {
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
  Check,
  Download,
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import LoadingState from "@/components/LoadingState";
import { csvCell } from "@/convex/formLogic";
import { parseMultiAnswer } from "@/convex/grading";
import { buildXlsx, downloadBlob, safeFilename } from "@/lib/xlsx";
import { toast } from "@/lib/toast";
import { useCopy, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { useConfirmedQuery } from "@/lib/confirmedQuery";

const copy = {
  en: {
    loadingAnalytics: "Loading analytics...", results: "Results", listSub: "View performance data and player results across all your quizzes.",
    searchQuizzes: "search quizzes...", quizName: "Quiz Name", status: "Status", submissions: "Submissions", avgScoreShort: "Avg Score", created: "Created",
    noQuizzes: "{t.noQuizzes}", live: "LIVE", draft: "Draft",
    loadingDashboard: "Loading dashboard...", hdrPlayer: "Player Name", hdrScore: "Score", hdrTotalMarks: "Total Marks", hdrPercentage: "Percentage", hdrCompletedAt: "Completed At",
    correct: "Correct", incorrect: "Incorrect", releaseFailed: "Could not change result release.", released: "Results released", withheldToast: "Results withheld",
    backAll: "Back to all", quizAnalytics: "Quiz Analytics", displayingAll: "Displaying all complete submissions.",
    withheldNote: " Scores are held: respondents see them after you release results.",
    editSettings: "Edit settings", releaseResults: "Release results", holdAgain: "Hold results again",
    totalSubmissions: "Total submissions", averageScore: "Average score", firstSubmission: "First submission", na: "N/A",
    topPerformers: "Top performers", marks: (n: number, total: number) => `${n}/${total} marks`,
    questionBreakdown: "Question breakdown", thPlayer: "Player Name", thScore: "Score", thTimeStarted: "Time Started", thAction: "Action",
    noSubmissions: "{t.noSubmissions}", view: "View",
    loadingSubmission: "Loading submission details...", notFound: "Submission not found", goBack: "Go back",
    overrideFailed: "Score override could not be saved. Please try again.", overrideSaved: "Score updated",
    backSubmissions: "Back to submissions", completed: "Completed", scoreLabel: "Score", marksLabel: "Marks",
    answerLabel: "Answer", noAnswer: "(No answer)", keywords: "Grading keywords", noneKeywords: "None (full marks unless reviewed)",
    reviewed: "Reviewed", autoGrade: (n: number, total: number) => `automatic grade was ${n}/${total}`, restore: "Restore", restoreFailed: "Could not restore the automatic grade.", restored: "Automatic grade restored",
    marksUnit: "marks", overrideTitle: "Override Score", overrideAria: "Change marks for this answer",
    loadingResults: "Loading results...",
  },
  ar: {
    loadingAnalytics: "جارٍ تحميل التحليلات...", results: "النتائج", listSub: "اطّلع على بيانات الأداء ونتائج اللاعبين في كل اختباراتك.",
    searchQuizzes: "ابحث في الاختبارات...", quizName: "اسم الاختبار", status: "الحالة", submissions: "التسليمات", avgScoreShort: "متوسط الدرجة", created: "تاريخ الإنشاء",
    noQuizzes: "لا توجد اختبارات.", live: "منشور", draft: "مسودة",
    loadingDashboard: "جارٍ تحميل لوحة النتائج...", hdrPlayer: "اسم اللاعب", hdrScore: "الدرجة", hdrTotalMarks: "مجموع النقاط", hdrPercentage: "النسبة", hdrCompletedAt: "وقت الإكمال",
    correct: "صحيحة", incorrect: "خاطئة", releaseFailed: "تعذّر تغيير حالة إعلان النتائج.", released: "أُعلنت النتائج", withheldToast: "حُجبت النتائج",
    backAll: "العودة إلى الكل", quizAnalytics: "تحليلات الاختبار", displayingAll: "تُعرض كل التسليمات المكتملة.",
    withheldNote: " الدرجات محجوبة: يراها المجيبون بعد أن تعلن النتائج.",
    editSettings: "عدّل الإعدادات", releaseResults: "أعلن النتائج", holdAgain: "احجب النتائج مجددًا",
    totalSubmissions: "إجمالي التسليمات", averageScore: "متوسط الدرجة", firstSubmission: "أول تسليم", na: "غير متاح",
    topPerformers: "الأعلى أداءً", marks: (n: number, total: number) => `${n}/${total} نقاط`,
    questionBreakdown: "تفصيل الأسئلة", thPlayer: "اسم اللاعب", thScore: "الدرجة", thTimeStarted: "وقت البدء", thAction: "الإجراء",
    noSubmissions: "لا توجد تسليمات بعد. شارك الرابط.", view: "عرض",
    loadingSubmission: "جارٍ تحميل تفاصيل التسليم...", notFound: "التسليم غير موجود", goBack: "رجوع",
    overrideFailed: "تعذّر حفظ تعديل الدرجة. حاول مرة أخرى.", overrideSaved: "تم تحديث الدرجة",
    backSubmissions: "العودة إلى التسليمات", completed: "أُكمل", scoreLabel: "الدرجة", marksLabel: "النقاط",
    answerLabel: "الإجابة", noAnswer: "(بلا إجابة)", keywords: "كلمات التصحيح", noneKeywords: "لا توجد (نقاط كاملة ما لم تتم المراجعة)",
    reviewed: "روجعت", autoGrade: (n: number, total: number) => `الدرجة التلقائية كانت ${n}/${total}`, restore: "استعادة", restoreFailed: "تعذّرت استعادة الدرجة التلقائية.", restored: "استُعيدت الدرجة التلقائية",
    marksUnit: "نقاط", overrideTitle: "تعديل الدرجة", overrideAria: "غيّر نقاط هذه الإجابة",
    loadingResults: "جارٍ تحميل النتائج...",
  },
};

const fmt = (locale: Locale, ts: number, pattern: string) => format(ts, pattern, { locale: locale === "ar" ? arLocale : undefined });

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
  const t = useCopy(copy);
  const { locale } = useLocale();
  const quizzes = useConfirmedQuery(api.quizFunctions.getMyQuizzes).data;
  const [search, setSearch] = useState("");

  if (quizzes === undefined) {
    return <LoadingState label={t.loadingAnalytics} />;
  }

  const filteredQuizzes = quizzes.filter(
    (q) => q.title.toLowerCase().includes(search.toLowerCase()) || q.slug.includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            {t.results}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.listSub}
          </p>
        </div>

        <div className="w-full md:w-auto relative max-w-sm">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t.searchQuizzes}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border-2 border-foreground p-3 ps-10 focus:outline-none focus:border-chaos transition-colors chaos-heading text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto chaos-card bg-card p-0">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b-[3px] border-foreground">
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">{t.quizName}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-32">{t.status}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-32">{t.submissions}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center w-24">{t.avgScoreShort}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase w-40 hidden md:table-cell">{t.created}</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-foreground/20">
            {filteredQuizzes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  {t.noQuizzes}
                </td>
              </tr>
            ) : (
              filteredQuizzes.map((quiz) => (
                <tr key={quiz._id} className="hover:bg-muted/50 transition-colors group">
                  <td className="p-4">
                    <Link href={`/dashboard/results?id=${quiz._id}`} className="font-bold text-base hover:text-chaos transition-colors block">
                      {quiz.title}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1">/{quiz.creatorUsername}/{quiz.slug}</div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`chaos-heading text-[10px] px-2 py-1 ${quiz.isPublished ? "bg-chaos text-chaos-foreground" : "bg-muted text-muted-foreground"}`}>
                      {quiz.isPublished ? t.live : t.draft}
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
                    {fmt(locale, quiz.createdAt, "MMM d, yyyy")}
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
  const t = useCopy(copy);
  const { locale, dir } = useLocale();
  const quiz = useQuery(api.quizFunctions.getQuiz, { quizId });
  const sessions = useQuery(api.quizFunctions.getQuizSessions, { quizId });
  const enhanced = useQuery(api.quizFunctions.getQuizStatsEnhanced, { quizId });
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"quizSessions"> | null>(null);
  const setResultsReleased = useMutation(api.quizFunctions.setResultsReleased);

  if (quiz === undefined || sessions === undefined) {
    return <LoadingState label={t.loadingDashboard} />;
  }

  if (selectedSessionId) {
    return (
      <SubmissionDetailView
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  const completed = sessions?.filter((s) => s.status === "completed") ?? [];
  const avgScore = completed.length > 0
    ? completed.reduce((sum, s) => sum + (s.totalPoints > 0 ? (s.score / s.totalPoints) * 100 : 0), 0) / completed.length
    : 0;

  const handleExport = (kind: "csv" | "xlsx") => {
    // Build ordered question list from enhanced stats (or fall back to answer order)
    const qList = enhanced?.questionStats ?? [];

    // Header row: summary columns + one column per question
    const header = [
      t.hdrPlayer, t.hdrScore, t.hdrTotalMarks, t.hdrPercentage, t.hdrCompletedAt,
      ...qList.map((q, i) => `Q${i + 1}: ${q.questionText.slice(0, 40)}`),
    ];

    // Build a map from questionId -> index for fast lookup
    const qIndexMap = new Map(qList.map((q, i) => [String(q.questionId), i]));

    const dataRows = completed.map((s) => {
      const pct = s.totalPoints > 0 ? Math.round((s.score / s.totalPoints) * 100) : 0;
      // Fill per-question cells
      const qCells = new Array(qList.length).fill("");
      for (const ans of s.answers) {
        const idx = qIndexMap.get(String(ans.questionId));
        if (idx !== undefined) {
          qCells[idx] = ans.isCorrect ? t.correct : t.incorrect;
        }
      }
      return [
        s.playerName,
        s.score,
        s.totalPoints,
        `${pct}%`,
        s.completedAt ? fmt(locale, s.completedAt, "yyyy-MM-dd HH:mm") : "",
        ...qCells,
      ];
    });

    const rows = [header, ...dataRows];
    const name = `${safeFilename(quiz?.title || "quiz")}-results`;
    if (kind === "xlsx") {
      downloadBlob(buildXlsx(rows), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return;
    }
    // csvCell neutralises spreadsheet formulas in respondent-supplied names.
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(csv, `${name}.csv`, "text/csv;charset=utf-8");
  };

  const withheld = quiz?.resultRelease === "manual" && quiz.resultsReleasedAt === undefined;
  const toggleRelease = async () => {
    try {
      await setResultsReleased({ quizId, released: withheld });
      toast.success(withheld ? t.released : t.withheldToast);
    } catch (err) {
      toast.error(err, { fallback: t.releaseFailed });
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <Link href="/dashboard/results" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 chaos-heading">
            <ArrowLeft size={12} className={dir === "rtl" ? "rotate-180" : ""} /> {t.backAll}
          </Link>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            {quiz?.title || t.quizAnalytics}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.displayingAll}
            {withheld && t.withheldNote}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Link
            href={`/dashboard/editor?id=${quizId}`}
            className="chaos-heading text-xs border-2 border-foreground px-4 py-2 hover:bg-foreground hover:text-background transition-colors"
          >
            {t.editSettings}
          </Link>
          {quiz?.resultRelease === "manual" && (
            <button
              onClick={toggleRelease}
              className={`chaos-heading text-xs border-2 px-4 py-2 transition-colors ${withheld ? "border-chaos bg-chaos text-chaos-foreground" : "border-foreground/40 hover:bg-foreground hover:text-background"}`}
            >
              {withheld ? t.releaseResults : t.holdAgain}
            </button>
          )}
          {completed.length > 0 && (
            <>
              <button
                onClick={() => handleExport("xlsx")}
                className="chaos-heading text-xs border-2 border-foreground/40 px-4 py-2 hover:bg-foreground hover:text-background transition-colors flex items-center gap-2"
              >
                <Download size={13} /> Excel
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="chaos-heading text-xs border-2 border-foreground/40 px-4 py-2 hover:bg-foreground hover:text-background transition-colors flex items-center gap-2"
              >
                <Download size={13} /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="chaos-card bg-foreground text-background p-6 flex flex-col items-center justify-center text-center">
          <Users size={24} className="text-muted-foreground mb-2" />
          <p className="text-3xl font-black font-mono leading-none mb-1">{completed.length}</p>
          <p className="chaos-heading text-xs text-muted-foreground">{t.totalSubmissions}</p>
        </div>

        <div className="chaos-card bg-card p-6 flex flex-col items-center justify-center text-center border-chaos text-chaos">
          <Trophy size={24} className="mb-2" />
          <p className="text-3xl font-black font-mono leading-none mb-1">{Math.round(avgScore)}%</p>
          <p className="chaos-heading text-xs">{t.averageScore}</p>
        </div>

        <div className="chaos-card bg-card p-6 flex flex-col items-center justify-center text-center">
          <Clock size={24} className="text-muted-foreground mb-2" />
          <p className="text-xl font-bold font-mono leading-none mb-2">
            {completed.length > 0 && completed[0].startedAt
              ? timeAgo(locale, completed[completed.length-1].startedAt)
              : t.na
            }
          </p>
          <p className="chaos-heading text-xs text-muted-foreground">{t.firstSubmission}</p>
        </div>
      </div>

      {/* Top 3 Performers */}
      {enhanced?.top3 && enhanced.top3.length > 0 && (
        <div className="chaos-card bg-card p-6">
          <h2 className="chaos-heading text-xs text-muted-foreground mb-4 flex items-center gap-2">
            <Trophy size={14} /> {t.topPerformers}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            {enhanced.top3.map((entry, i) => {
              const pct = entry.totalPoints > 0 ? Math.round((entry.score / entry.totalPoints) * 100) : 0;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={i} className={`flex-1 p-4 border-[3px] flex flex-col items-center text-center ${
                  i === 0 ? "border-yellow-400 bg-yellow-400/5" : "border-foreground/20"
                }`}>
                  <span className="text-2xl mb-1">{medals[i]}</span>
                  <p className="font-bold text-sm truncate w-full text-center">{entry.playerName}</p>
                  <p className={`chaos-heading text-xl mt-1 ${i === 0 ? "text-yellow-500" : "text-muted-foreground"}`}>{pct}%</p>
                  <p className="text-[10px] text-muted-foreground">{t.marks(entry.score, entry.totalPoints)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Question Breakdown */}
      {enhanced?.questionStats && enhanced.questionStats.length > 0 && (
        <div className="chaos-card bg-card p-6">
          <h2 className="chaos-heading text-xs text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 size={14} /> {t.questionBreakdown}
          </h2>
          <div className="space-y-3">
            {enhanced.questionStats.map((q, i) => (
              <div key={String(q.questionId)} className="flex items-center gap-4">
                <span className="chaos-heading text-xs text-muted-foreground w-6 shrink-0 text-end">{i + 1}</span>
                <p className="text-sm flex-1 truncate" title={q.questionText}>{q.questionText}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-primary flex items-center gap-1"><CheckCircle2 size={11} /> {q.correct}</span>
                  <span className="text-xs text-destructive flex items-center gap-1"><XCircle size={11} /> {q.incorrect}</span>
                  {q.correctRate !== null && (
                    <div className="w-16 h-1.5 bg-muted overflow-hidden">
                      <div className={`h-full ${
                        q.correctRate >= 70 ? 'bg-primary' : q.correctRate >= 40 ? 'bg-yellow-500' : 'bg-destructive'
                      }`} style={{ width: `${q.correctRate}%` }} />
                    </div>
                  )}
                  <span className="chaos-heading text-[10px] w-8 text-end text-muted-foreground">
                    {q.correctRate !== null ? `${q.correctRate}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="chaos-card bg-card p-0 overflow-hidden">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b-[3px] border-foreground bg-muted/30">
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">{t.thPlayer}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">{t.thScore}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">{t.thTimeStarted}</th>
              <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">{t.thAction}</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-foreground/20">
            {completed.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                  {t.noSubmissions}
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
                          {t.marks(session.score, session.totalPoints)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center hidden sm:table-cell text-xs text-muted-foreground">
                      {fmt(locale, session.startedAt, "MMM d, h:mm a")}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setSelectedSessionId(session._id)}
                        className="chaos-heading text-xs border-2 border-foreground px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                      >
                        {t.view}
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
  const t = useCopy(copy);
  const { locale, dir } = useLocale();
  const detail = useQuery(api.quizFunctions.getSessionDetail, { sessionId });
  const overrideScore = useMutation(api.quizFunctions.overrideScore);

  const [editingId, setEditingId] = useState<Id<"questions"> | null>(null);
  const [editVal, setEditVal] = useState("");

  if (detail === undefined) {
    return <LoadingState label={t.loadingSubmission} />;
  }

  if (detail === null) {
    return (
      <div className="py-20 text-center">
        <p className="chaos-heading text-sm text-destructive">{t.notFound}</p>
        <button onClick={onBack} className="mt-4 chaos-heading text-xs underline">{t.goBack}</button>
      </div>
    );
  }

  const percent = Math.round(detail.totalPoints > 0 ? (detail.score / detail.totalPoints) * 100 : 0);

  const handleSaveOverride = async (questionId: Id<"questions">) => {
    const val = parseInt(editVal);
    if (!isNaN(val) && val >= 0) {
      haptics.select();
      try {
        await overrideScore({ sessionId, questionId, newPoints: val });
        setEditingId(null);
        toast.success(t.overrideSaved);
      } catch (err) {
        toast.error(err, { fallback: t.overrideFailed });
        haptics.error();
      }
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-foreground pb-6">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 chaos-heading">
            <ArrowLeft size={12} className={dir === "rtl" ? "rotate-180" : ""} /> {t.backSubmissions}
          </button>
          <h1 className="chaos-display text-4xl mb-1 flex items-center gap-3">
            {detail.playerName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.completed} {detail.completedAt ? timeAgo(locale, detail.completedAt) : ""}
          </p>
        </div>

        <div className="chaos-card bg-foreground text-background p-4 flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-black font-mono leading-none">{percent}%</p>
            <p className="chaos-heading text-[10px] text-muted-foreground">{t.scoreLabel}</p>
          </div>
          <div className="w-0.5 h-8 bg-background/20" />
          <div className="text-center">
            <p className="text-xl font-bold font-mono leading-none">{detail.score}/{detail.totalPoints}</p>
            <p className="chaos-heading text-[10px] text-muted-foreground">{t.marksLabel}</p>
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
                        {t.answerLabel}: <span className="text-foreground font-mono">{(ans.questionType === "multi_select" ? parseMultiAnswer(ans.answer).join(", ") : ans.answer) || t.noAnswer}</span>
                      </p>
                    </div>
                    {ans.questionType === "written" && (
                       <p className="text-[10px] text-muted-foreground mt-2 italic">{t.keywords}: {ans.keywords?.join(", ") || t.noneKeywords}</p>
                    )}
                    {ans.originalPointsEarned !== undefined && ans.originalPointsEarned !== ans.pointsEarned && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t.reviewed}{ans.reviewedAt ? ` ${timeAgo(locale, ans.reviewedAt)}` : ""} · {t.autoGrade(ans.originalPointsEarned, ans.totalPoints)}{" "}
                        <button className="underline hover:text-foreground" onClick={() => overrideScore({ sessionId, questionId: ans.questionId, newPoints: ans.originalPointsEarned! }).then(() => toast.success(t.restored), (err: unknown) => toast.error(err, { fallback: t.restoreFailed }))}>
                          {t.restore}
                        </button>
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-end shrink-0 min-w-[100px]">
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
                      <button onClick={() => handleSaveOverride(ans.questionId)} className="p-1 hover:text-chaos ms-1"><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:text-destructive"><XCircle size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 group">
                      <span className={`chaos-heading text-lg ${isCorrect ? 'text-chaos' : isPartial ? 'text-yellow-500' : 'text-destructive'}`}>
                        {ans.pointsEarned} <span className="text-xs text-muted-foreground">/{ans.totalPoints} {t.marksUnit}</span>
                      </span>
                      <button
                         onClick={() => { setEditingId(ans.questionId); setEditVal(ans.pointsEarned.toString()); }}
                         className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity"
                         title={t.overrideTitle}
                         aria-label={t.overrideAria}
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
  const t = useCopy(copy);
  return (
    <Suspense fallback={<LoadingState label={t.loadingResults} className="p-8" />}>
      <StatsContent />
    </Suspense>
  );
}
