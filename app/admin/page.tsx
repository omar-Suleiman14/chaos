"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser, UserButton } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { haptics } from "@/lib/haptics";
import {
  ShieldAlert,
  Users,
  FileText,
  BarChart3,
  Search,
  Ban,
  CheckCircle2,
  Trash2,
  Home,
  Zap,
  Eye,
  X as XIcon,
  ChevronRight,
  Printer,
} from "lucide-react";

const ADMIN_EMAILS = ["support@chaos.fail", "khomod14@gmail.com"];

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const isAdmin = isLoaded && ADMIN_EMAILS.includes(user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "");

  const stats = useQuery(api.quizFunctions.getAdminStats, isAdmin ? undefined : "skip");
  const usersList = useQuery(api.quizFunctions.getAdminUsers, isAdmin ? undefined : "skip");
  const quizzesList = useQuery(api.quizFunctions.getAdminQuizzes, isAdmin ? undefined : "skip");

  const toggleUserBan = useMutation(api.quizFunctions.adminToggleUserBan);
  const toggleQuizBan = useMutation(api.quizFunctions.adminToggleQuizBan);
  const toggleUserElevation = useMutation(api.quizFunctions.adminToggleUserElevation);
  const toggleQuizElevation = useMutation(api.quizFunctions.adminToggleQuizElevation);
  const deleteQuiz = useMutation(api.quizFunctions.adminDeleteQuiz);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "quizzes">("users");
  const [mounted, setMounted] = useState(false);
  const [previewQuizId, setPreviewQuizId] = useState<string | null>(null);

  const previewQuestions = useQuery(
    api.quizFunctions.getQuestions,
    previewQuizId ? { quizId: previewQuizId as any } : "skip"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isLoaded) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <ShieldAlert size={64} className="text-destructive mb-6" />
        <h1 className="chaos-display text-4xl mb-2 uppercase">Access Denied</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You are not authorized to view the admin control panel.
        </p>
        <Link
          href="/dashboard"
          className="chaos-heading text-sm bg-foreground text-background px-6 py-3 border-2 border-foreground hover:bg-chaos hover:text-chaos-foreground transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const handleToggleUserBan = async (clerkId: string, currentBan: boolean) => {
    haptics.heavy();
    await toggleUserBan({ clerkId, ban: !currentBan });
  };

  const handleToggleUserElevation = async (clerkId: string, current: boolean) => {
    haptics.heavy();
    await toggleUserElevation({ clerkId, elevate: !current });
  };

  const handleToggleQuizBan = async (quizId: any, currentBan: boolean) => {
    haptics.heavy();
    await toggleQuizBan({ quizId, ban: !currentBan });
  };

  const handleToggleQuizElevation = async (quizId: any, current: boolean) => {
    haptics.heavy();
    await toggleQuizElevation({ quizId, elevate: !current });
  };

  const handleDeleteQuiz = async (quizId: any) => {
    if (confirm("FORCE DELETE this quiz? This is irreversible.")) {
      haptics.heavy();
      await deleteQuiz({ quizId });
    }
  };

  const filteredUsers = usersList?.filter((u: any) =>
    u.username.includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const filteredQuizzes = quizzesList?.filter((q: any) =>
    q.title.toLowerCase().includes(search.toLowerCase()) || q.creatorUsername.includes(search.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Navbar */}
      <nav className="sticky top-0 z-40 border-b-[3px] border-destructive bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-xs font-bold font-mono tracking-widest flex items-center gap-2">
              <Home size={14} /> DASHBOARD
            </Link>
            <span className="w-1 h-4 bg-foreground/20" />
            <span className="chaos-heading text-sm text-destructive flex items-center gap-2">
              <ShieldAlert size={16} /> CHAOS ADMIN
            </span>
          </div>
          <UserButton />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="chaos-card bg-card p-6 border-destructive flex flex-col items-center justify-center text-center">
            <Users size={24} className="text-muted-foreground mb-2" />
            {stats ? (
              <p className="text-4xl font-black font-mono leading-none mb-1 text-chaos">{stats.totalUsers}</p>
            ) : (
              <div className="w-16 h-10 bg-muted animate-pulse mb-1" />
            )}
            <p className="chaos-heading text-xs text-muted-foreground">TOTAL CREATORS</p>
          </div>
          <div className="chaos-card bg-card p-6 border-destructive flex flex-col items-center justify-center text-center">
            <FileText size={24} className="text-muted-foreground mb-2" />
            {stats ? (
              <p className="text-4xl font-black font-mono leading-none mb-1 text-chaos">{stats.totalQuizzes}</p>
            ) : (
              <div className="w-16 h-10 bg-muted animate-pulse mb-1" />
            )}
            <p className="chaos-heading text-xs text-muted-foreground">TOTAL QUIZZES</p>
          </div>
          <div className="chaos-card bg-card p-6 border-destructive flex flex-col items-center justify-center text-center">
            <BarChart3 size={24} className="text-muted-foreground mb-2" />
            {stats ? (
              <p className="text-4xl font-black font-mono leading-none mb-1 text-chaos">{stats.totalSubmissions}</p>
            ) : (
              <div className="w-16 h-10 bg-muted animate-pulse mb-1" />
            )}
            <p className="chaos-heading text-xs text-muted-foreground">TOTAL PLAYS</p>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-4 border-b-2 border-foreground/20">
          <button
            onClick={() => setTab("users")}
            className={`pb-3 chaos-heading text-sm px-2 border-b-2 ${tab === "users" ? "border-destructive text-destructive" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="inline-block mr-1.5" size={16} /> USERS
          </button>
          <button
            onClick={() => setTab("quizzes")}
            className={`pb-3 chaos-heading text-sm px-2 border-b-2 ${tab === "quizzes" ? "border-destructive text-destructive" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <FileText className="inline-block mr-1.5" size={16} /> QUIZZES
          </button>
        </div>

        {/* SEARCH */}
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background border-2 border-foreground p-3 pl-10 focus:outline-none focus:border-destructive text-sm"
            placeholder={tab === "users" ? "Search by username or name..." : "Search by quiz title or creator..."}
          />
        </div>

        {/* CONTENT */}
        <div className="chaos-card bg-card p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-[3px] border-foreground">
                {tab === "users" ? (
                  <>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">User</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Quizzes</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">AI Quizzes</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase hidden sm:table-cell">Joined</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Status</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-right">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Quiz</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Creator</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">Qs</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">Plays</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Source</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Published</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Status</th>
                    <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-right">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-foreground/20">
              {tab === "users" ? (
                filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No users found.</td></tr>
                ) : (
                  filteredUsers.map((u: any) => (
                    <tr key={u._id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base">{u.name}</span>
                          {u.isElevated && (
                            <span title="Elevated — unlimited plays" className="text-yellow-500"><Zap size={13} /></span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                      </td>
                      <td className="p-4 text-center font-mono font-bold">{u.quizCount || 0}</td>
                      <td className="p-4 text-center hidden sm:table-cell">
                        <span className={`chaos-heading text-[10px] px-2 py-1 ${(u.aiQuizCount || 0) > 0 ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground"}`}>
                          {u.aiQuizCount || 0} AI
                        </span>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground hidden sm:table-cell">
                        {formatDistanceToNow(u.createdAt, { addSuffix: true })}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`chaos-heading text-[10px] px-2 py-1 flex items-center gap-1 justify-center max-w-[80px] mx-auto ${u.isBanned ? "bg-destructive text-destructive-foreground border border-destructive" : "bg-muted text-muted-foreground border border-foreground/20"}`}>
                          {u.isBanned ? <Ban size={10} /> : <CheckCircle2 size={10} />}
                          {u.isBanned ? "BANNED" : "ACTIVE"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleUserElevation(u.clerkId, !!u.isElevated)}
                            title={u.isElevated ? "Demote user" : "Elevate user (unlimited plays)"}
                            className={`chaos-heading text-[10px] border-2 px-2 py-1.5 transition-colors flex items-center gap-1 ${
                              u.isElevated
                                ? "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-background"
                                : "border-foreground/40 text-muted-foreground hover:border-yellow-500 hover:text-yellow-500"
                            }`}
                          >
                            <Zap size={10} />
                            {u.isElevated ? "DEMOTE" : "ELEVATE"}
                          </button>
                          <button
                            onClick={() => handleToggleUserBan(u.clerkId, !!u.isBanned)}
                            className={`chaos-heading text-xs border-2 px-3 py-1.5 transition-colors ${u.isBanned ? "border-foreground hover:bg-foreground hover:text-background" : "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"}`}
                          >
                            {u.isBanned ? "UNBAN" : "BAN"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : (
                filteredQuizzes.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No quizzes found.</td></tr>
                ) : (
                  filteredQuizzes.map((q: any) => (
                    <tr key={q._id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {q.isPublished ? (
                            <a href={`/${q.creatorUsername}/${q.slug}`} target="_blank" className="font-bold text-base hover:text-chaos transition-colors">{q.title}</a>
                          ) : (
                            <button
                              onClick={() => setPreviewQuizId(q._id)}
                              className="font-bold text-base hover:text-chaos transition-colors flex items-center gap-1.5 text-left"
                            >
                              <Eye size={14} className="text-muted-foreground flex-shrink-0" />
                              {q.title}
                            </button>
                          )}
                          {q.isElevated && (
                            <span title="Elevated — unlimited plays" className="text-yellow-500"><Zap size={13} /></span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">/{q.creatorUsername}/{q.slug}</div>
                      </td>
                      <td className="p-4 font-mono text-sm max-w-[120px] truncate">@{q.creatorUsername}</td>
                      <td className="p-4 text-center font-mono font-bold hidden sm:table-cell" title={`${q.questionCount ?? 0} questions`}>
                        {q.questionCount ?? 0}
                      </td>
                      <td className="p-4 text-center font-mono font-bold hidden sm:table-cell">
                        <span title={q.isElevated ? "Unlimited (elevated)" : `${q.sessionCount} of 100 plays used`}>
                          {q.isElevated ? "∞" : `${q.sessionCount ?? 0}/100`}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`chaos-heading text-[10px] px-2 py-1 ${q.isAiGenerated ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-foreground/20"}`}>
                          {q.isAiGenerated ? "AI" : "MANUAL"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`chaos-heading text-[10px] px-2 py-1 ${q.isPublished ? "bg-chaos text-chaos-foreground" : "bg-muted text-muted-foreground border border-foreground/20"}`}>
                          {q.isPublished ? "LIVE" : "DRAFT"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`chaos-heading text-[10px] px-2 py-1 flex items-center gap-1 justify-center max-w-[80px] mx-auto ${q.isBanned ? "bg-destructive text-destructive-foreground border border-destructive" : "bg-muted text-muted-foreground border border-foreground/20"}`}>
                          {q.isBanned ? <Ban size={10} /> : <CheckCircle2 size={10} />}
                          {q.isBanned ? "BANNED" : "ACTIVE"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleQuizElevation(q._id, !!q.isElevated)}
                            title={q.isElevated ? "Remove quiz elevation" : "Elevate this quiz (unlimited plays)"}
                            className={`chaos-heading text-[10px] border-2 px-2 py-1.5 transition-colors flex items-center gap-1 ${
                              q.isElevated
                                ? "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-background"
                                : "border-foreground/40 text-muted-foreground hover:border-yellow-500 hover:text-yellow-500"
                            }`}
                          >
                            <Zap size={10} />
                            {q.isElevated ? "DEMOTE" : "ELEVATE"}
                          </button>
                          <button
                            onClick={() => handleToggleQuizBan(q._id, !!q.isBanned)}
                            className={`chaos-heading text-[10px] border-2 px-2 py-1.5 transition-colors ${q.isBanned ? "border-foreground hover:bg-foreground hover:text-background" : "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"}`}
                          >
                            {q.isBanned ? "UNBAN" : "BAN"}
                          </button>
                          <a
                            href={`/print/${q._id}`}
                            target="_blank" rel="noopener noreferrer"
                            className="p-1.5 border-2 border-transparent hover:border-foreground transition-colors shrink-0"
                            title="Print / Save PDF"
                          >
                            <Printer size={14} />
                          </a>
                          <button
                            onClick={() => handleDeleteQuiz(q._id)}
                            className="p-1.5 border-2 border-transparent text-destructive hover:border-destructive transition-colors shrink-0"
                            title="Force Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Draft Quiz Preview Modal */}
      {previewQuizId && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewQuizId(null); }}
        >
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="chaos-card bg-card w-full max-w-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b-2 border-foreground">
                <div>
                  <span className="chaos-heading text-[10px] bg-muted text-muted-foreground border border-foreground/20 px-2 py-1 mr-2">DRAFT</span>
                  <span className="chaos-heading text-sm">Question Preview</span>
                </div>
                <button
                  onClick={() => setPreviewQuizId(null)}
                  className="p-1.5 border-2 border-transparent hover:border-foreground transition-colors"
                >
                  <XIcon size={16} />
                </button>
              </div>

              {/* Questions */}
              <div className="p-6 space-y-4">
                {!previewQuestions ? (
                  <p className="text-sm text-muted-foreground chaos-pulse">Loading questions...</p>
                ) : previewQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No questions added yet.</p>
                ) : (
                  previewQuestions.map((q: any, i: number) => (
                    <div key={q._id} className="border-2 border-foreground/20 p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="chaos-heading text-xs bg-foreground text-background w-7 h-7 flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="chaos-heading text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 uppercase">
                              {q.type.replace("_", " ")}
                            </span>
                            <span className="text-xs text-muted-foreground">{q.points} marks</span>
                          </div>
                          <p className="text-sm font-medium">{q.questionText}</p>
                        </div>
                      </div>

                      {/* Options */}
                      {q.options && q.options.length > 0 && (
                        <div className="ml-10 space-y-1">
                          {q.options.map((opt: string, oi: number) => {
                            const isCorrect = q.correctAnswer === opt || q.correctAnswers?.includes(opt);
                            return (
                              <div key={oi} className={`flex items-center gap-2 text-sm px-3 py-1.5 border ${isCorrect ? "border-chaos bg-chaos/10 text-chaos" : "border-foreground/10"}`}>
                                <ChevronRight size={12} className="flex-shrink-0" />
                                <span>{opt}</span>
                                {isCorrect && <span className="ml-auto chaos-heading text-[10px] text-chaos">✓ CORRECT</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Written answer / keywords */}
                      {q.type === "written" && q.keywords?.length > 0 && (
                        <div className="ml-10 mt-2 flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground mr-1">Keywords:</span>
                          {q.keywords.map((kw: string) => (
                            <span key={kw} className="text-xs bg-muted px-2 py-0.5 border border-foreground/20">{kw}</span>
                          ))}
                        </div>
                      )}

                      {/* True/False answer */}
                      {q.type === "true_false" && q.correctAnswer && (
                        <div className="ml-10 mt-2 text-xs text-chaos chaos-heading">
                          ✓ Answer: {q.correctAnswer}
                        </div>
                      )}

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="ml-10 mt-2 text-xs text-muted-foreground italic border-l-2 border-foreground/20 pl-2">
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
