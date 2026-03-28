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
  Home
} from "lucide-react";

const ADMIN_EMAIL = "khomod14@gmail.com";

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const isAdmin = isLoaded && user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL;

  const stats = useQuery(api.quizFunctions.getAdminStats, isAdmin ? undefined : "skip");
  const users = useQuery(api.quizFunctions.getAdminUsers, isAdmin ? undefined : "skip");
  const quizzes = useQuery(api.quizFunctions.getAdminQuizzes, isAdmin ? undefined : "skip");

  const toggleUserBan = useMutation(api.quizFunctions.adminToggleUserBan);
  const toggleQuizBan = useMutation(api.quizFunctions.adminToggleQuizBan);
  const deleteQuiz = useMutation(api.quizFunctions.deleteQuiz);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "quizzes">("users");
  const [mounted, setMounted] = useState(false);

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

  const handleToggleQuizBan = async (quizId: any, currentBan: boolean) => {
    haptics.heavy();
    await toggleQuizBan({ quizId, ban: !currentBan });
  };

  const handleDeleteQuiz = async (quizId: any) => {
    if (confirm("FORCE DELETE this quiz? This is irreversible.")) {
      haptics.heavy();
      await deleteQuiz({ quizId });
    }
  };

  const filteredUsers = users?.filter((u: any) => u.username.includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase())) || [];
  const filteredQuizzes = quizzes?.filter((q: any) => q.title.toLowerCase().includes(search.toLowerCase()) || q.creatorUsername.includes(search.toLowerCase())) || [];

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
             className={`pb-3 chaos-heading text-sm px-2 border-b-2 ${tab === 'users' ? 'border-destructive text-destructive' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
           >
             MANAGE USERS
           </button>
           <button 
             onClick={() => setTab("quizzes")} 
             className={`pb-3 chaos-heading text-sm px-2 border-b-2 ${tab === 'quizzes' ? 'border-destructive text-destructive' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
           >
             MANAGE QUIZZES
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

        {/* DATA TABLES */}
        <div className="chaos-card bg-card p-0 overflow-x-auto">
           <table className="w-full text-left border-collapse">
             <thead>
                <tr className="border-b-[3px] border-foreground">
                  {tab === "users" ? (
                    <>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">User</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Quizzes</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase hidden sm:table-cell">Joined</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Status</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-right">Action</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Quiz</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase">Creator</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center hidden sm:table-cell">Plays</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-center">Status</th>
                      <th className="p-4 chaos-heading text-xs text-muted-foreground uppercase text-right">Action</th>
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
                           <div className="font-bold text-base">{u.name}</div>
                           <div className="text-xs text-muted-foreground">@{u.username}</div>
                        </td>
                        <td className="p-4 text-center font-mono font-bold">
                           {u.quizCount || 0}
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
                           <button 
                             onClick={() => handleToggleUserBan(u.clerkId, !!u.isBanned)}
                             className={`chaos-heading text-xs border-2 px-3 py-1.5 transition-colors ${u.isBanned ? "border-foreground hover:bg-foreground hover:text-background" : "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"}`}
                           >
                              {u.isBanned ? "UNBAN USER" : "BAN USER"}
                           </button>
                        </td>
                     </tr>
                   ))
                 )
               ) : (
                 filteredQuizzes.length === 0 ? (
                   <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No quizzes found.</td></tr>
                 ) : (
                   filteredQuizzes.map((q: any) => (
                     <tr key={q._id} className="hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                           <a href={`/${q.creatorUsername}/${q.slug}`} target="_blank" className="font-bold text-base hover:text-chaos transition-colors">{q.title}</a>
                           <div className="text-xs text-muted-foreground mt-0.5">/{q.creatorUsername}/{q.slug}</div>
                        </td>
                        <td className="p-4 font-mono text-sm max-w-[120px] truncate">
                           @{q.creatorUsername}
                        </td>
                        <td className="p-4 text-center font-mono font-bold hidden sm:table-cell">
                           {q.sessionCount || 0}
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
                               onClick={() => handleToggleQuizBan(q._id, !!q.isBanned)}
                               className={`chaos-heading text-[10px] border-2 px-2 py-1.5 transition-colors ${q.isBanned ? "border-foreground hover:bg-foreground hover:text-background" : "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"}`}
                             >
                                {q.isBanned ? "UNBAN" : "BAN"}
                             </button>
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
    </div>
  );
}
