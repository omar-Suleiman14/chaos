"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { haptics } from "@/lib/haptics";
import {
  FileText,
  MoreVertical,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Edit3,
  BarChart3,
  Globe,
  Lock,
} from "lucide-react";

export default function DashboardQuizzes() {
  const quizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const deleteQuiz = useMutation(api.quizFunctions.deleteQuiz);
  const updateQuiz = useMutation(api.quizFunctions.updateQuiz);
  const createQuiz = useMutation(api.quizFunctions.createQuiz);
  const currentUser = useQuery(api.quizFunctions.getCurrentUser);
  const setUsername = useMutation(api.quizFunctions.setUsername);

  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (currentUser?.username && /^user\d+$/.test(currentUser.username)) {
      setShowUsernameModal(true);
    }
  }, [currentUser]);

  const handleSaveUsername = async () => {
    try {
      setUsernameError("");
      await setUsername({ username: newUsername });
      setShowUsernameModal(false);
      haptics.success();
    } catch(e: any) {
      setUsernameError(e.message || "Failed to set username");
      haptics.error();
    }
  };

  const handleCreateNew = async () => {
    if (isCreating) return;
    setIsCreating(true);
    haptics.heavy();
    try {
      const newId = await createQuiz({ title: "Untitled Quiz" });
      router.push(`/dashboard/editor?id=${newId}`);
    } catch (e) {
      console.error(e);
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (username: string, slug: string) => {
    const url = `${window.location.origin}/${username}/${slug}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      textArea.readOnly = true;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      try {
        document.execCommand("copy");
      } catch (copyErr) {
        console.error("Fallback copy failed", copyErr);
      }
      document.body.removeChild(textArea);
    }

    setCopiedId(slug);
    haptics.light();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTogglePublish = async (quizId: any, currentStatus: boolean) => {
    haptics.select();
    await updateQuiz({ quizId, isPublished: !currentStatus });
  };

  const handleDelete = async (quizId: any) => {
    if (confirm("Are you sure you want to delete this quiz, all its questions, and all player scores? This cannot be undone.")) {
      haptics.heavy();
      await deleteQuiz({ quizId });
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-8 font-sans">
      {showUsernameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <h2 className="text-2xl font-semibold text-[#111111] mb-2 tracking-tight">Choose your Username</h2>
            <p className="text-[#111111]/60 mb-6 text-sm font-medium">
              Your public quiz links use your username. Please pick a unique handle before continuing!
            </p>
            <input
              type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
              className="w-full bg-[#F0EFEA]/50 border border-[#111111]/10 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-[#2F5333] mb-2"
              placeholder="e.g. biology_nerd"
              autoFocus
            />
            {usernameError && <p className="text-red-600 text-xs font-semibold mb-2">{usernameError}</p>}
            <button
              onClick={handleSaveUsername}
              disabled={newUsername.length < 3}
              className="w-full bg-[#2F5333] text-white py-4 rounded-full font-medium mt-4 disabled:opacity-50 hover:bg-[#2F5333]/90 transition-colors"
            >
              Save & Continue
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#111111] mb-1">
            My Quizzes
          </h1>
          <p className="text-[#111111]/60 font-medium">
            Create and manage your assessments.
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          disabled={isCreating}
          className="flex items-center justify-center gap-2 bg-[#2F5333] text-white px-6 py-3 rounded-full font-medium hover:bg-[#2F5333]/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <Plus size={18} />
          {isCreating ? "Creating..." : "Create Quiz"}
        </button>
      </div>

      {quizzes === undefined ? (
        <div className="text-center py-20">
          <FileText size={48} className="mx-auto text-[#111111]/20 mb-4 animate-pulse" />
          <p className="text-sm text-[#111111]/60 font-medium">Loading quizzes...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-[#111111]/5">
          <div className="w-16 h-16 bg-[#F0EFEA] mx-auto rounded-full flex items-center justify-center mb-6">
            <FileText size={24} className="text-[#2F5333]" />
          </div>
          <h2 className="text-xl font-semibold text-[#111111] mb-2">No quizzes yet</h2>
          <p className="text-[#111111]/60 mb-8 max-w-sm mx-auto font-medium">
            Create your first interactive quiz in less than 60 seconds.
          </p>
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="inline-flex items-center gap-2 bg-[#2F5333] text-white px-8 py-4 rounded-full font-medium hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-50"
          >
            <Plus size={18} />
            {isCreating ? "Creating..." : "Start Creating"}
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {Array.from(new Set(quizzes.map(q => q.groupName || "Ungrouped"))).sort().map(groupName => {
            const groupQuizzes = quizzes.filter(q => (q.groupName || "Ungrouped") === groupName);
            return (
              <div key={groupName} className="space-y-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-[#111111]">{groupName}</h2>
                  <span className="bg-[#111111]/5 px-3 py-1 rounded-full text-xs font-semibold text-[#111111]/50">{groupQuizzes.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {groupQuizzes.map((quiz) => (
                    <div key={quiz._id} className="bg-white rounded-2xl flex flex-col shadow-sm border border-[#111111]/5 overflow-hidden transition-all hover:shadow-md hover:border-[#111111]/10">
                      
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-4 gap-4">
                          <h3 className="text-xl font-semibold leading-snug line-clamp-2 text-[#111111]" title={quiz.title}>
                            {quiz.title}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs font-semibold bg-[#F0EFEA] text-[#2F5333] px-2.5 py-1 rounded-full shrink-0">
                            {quiz.questionCount} Qs
                          </div>
                        </div>

                        <div className="text-sm text-[#111111]/50 mb-6 space-y-1.5 min-w-0 font-medium">
                          <p className="truncate flex items-center gap-2">
                            {quiz.isPublished ? <Globe size={14} className="text-[#2F5333]"/> : <Lock size={14} />}
                            /{quiz.creatorUsername}/{quiz.slug}
                          </p>
                          <p>Created {formatDistanceToNow(quiz.createdAt, { addSuffix: true })}</p>
                        </div>

                        <div className="mt-auto pt-4 border-t border-[#111111]/5 flex justify-between items-center">
                          <div className="flex items-center gap-2 text-sm font-medium text-[#111111]/60">
                            <BarChart3 size={16} />
                            {quiz.sessionCount} Plays
                          </div>
                          <div className="text-sm font-semibold text-[#2F5333]">
                            Avg: {quiz.avgScore}%
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#F0EFEA]/50 border-t border-[#111111]/5 flex divide-x divide-[#111111]/5">
                        <Link
                          href={`/dashboard/editor?id=${quiz._id}`}
                          className="flex-1 py-4 text-center text-[#111111]/60 hover:text-[#2F5333] hover:bg-[#F0EFEA] transition-colors"
                          title="Edit Quiz"
                        >
                          <Edit3 size={18} className="mx-auto" />
                        </Link>
                        
                        <Link
                          href={`/dashboard/stats?id=${quiz._id}`}
                          className="flex-1 py-4 text-center text-[#111111]/60 hover:text-[#2F5333] hover:bg-[#F0EFEA] transition-colors"
                          title="View Stats"
                        >
                          <BarChart3 size={18} className="mx-auto" />
                        </Link>

                        <button
                          onClick={() => handleCopyLink(quiz.creatorUsername, quiz.slug)}
                          className="flex-1 py-4 text-center text-[#111111]/60 hover:text-[#2F5333] hover:bg-[#F0EFEA] transition-colors relative"
                          title="Copy Live Link"
                        >
                          <div className="flex items-center justify-center">
                            {copiedId === quiz.slug ? (
                              <span className="text-xs font-semibold text-[#2F5333]">COPIED</span>
                            ) : (
                              <Copy size={18} />
                            )}
                          </div>
                        </button>

                        <div className="relative flex-1 flex items-stretch">
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              setOpenMenuId(openMenuId === quiz._id ? null : quiz._id);
                            }}
                            className="flex-1 py-4 text-[#111111]/60 hover:text-[#111111] hover:bg-[#F0EFEA] transition-colors relative z-20"
                          >
                            <MoreVertical size={18} className="mx-auto pointer-events-none" />
                          </button>

                          {openMenuId === quiz._id && (
                            <>
                              <div 
                                className="fixed inset-0 z-30" 
                                onClick={(e) => {
                                  e.preventDefault();
                                  setOpenMenuId(null);
                                }}
                              />
                              <div className="absolute bottom-full right-0 mb-3 w-48 bg-white rounded-xl shadow-lg border border-[#111111]/10 z-40 p-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <a
                                  href={`/${quiz.creatorUsername}/${quiz.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full text-left px-4 py-2 text-sm font-medium text-[#111111]/70 flex items-center gap-3 hover:bg-[#F0EFEA] hover:text-[#111111] rounded-lg transition-colors"
                                >
                                  <ExternalLink size={16} /> Open Live Page
                                </a>
                                <button
                                  onClick={() => handleTogglePublish(quiz._id, quiz.isPublished)}
                                  className="w-full text-left px-4 py-2 text-sm font-medium text-[#111111]/70 flex items-center gap-3 hover:bg-[#F0EFEA] hover:text-[#111111] rounded-lg transition-colors"
                                >
                                  {quiz.isPublished ? <Lock size={16} /> : <Globe size={16} />}
                                  {quiz.isPublished ? "Unpublish" : "Publish"}
                                </button>
                                <div className="h-px bg-[#111111]/5 my-2" />
                                <button
                                  onClick={() => handleDelete(quiz._id)}
                                  className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 flex items-center gap-3 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} /> Delete Quiz
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
