"use client";
// Ban check: isBanned users see a quota-exceeded screen

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { haptics } from "@/lib/haptics";
import {
  FileText, Plus, Trash2, Copy, ExternalLink, Edit3, MoreVertical,
  BarChart3, Globe, Lock, FolderPlus, ChevronDown, ChevronRight,
  GripVertical, Folder, FolderOpen, Check, X, Pencil,
} from "lucide-react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";

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

  const [localQuizzes, setLocalQuizzes] = useState<any[]>([]);
  const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({});
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (quizzes) setLocalQuizzes(quizzes);
  }, [quizzes]);

  useEffect(() => {
    if (currentUser?.username && /^user\d+$/.test(currentUser.username)) {
      setShowUsernameModal(true);
    }
  }, [currentUser]);

  const folderNames = Array.from(
    new Set([
      ...localQuizzes.map(q => q.groupName || "Ungrouped"),
      ...customFolders,
    ])
  ).sort((a, b) =>
    a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b)
  );

  const handleSaveUsername = async () => {
    try {
      setUsernameError("");
      await setUsername({ username: newUsername });
      setShowUsernameModal(false);
      haptics.success();
    } catch (e: any) {
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
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
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
    if (confirm("Delete this quiz, all its questions, and all player scores? This cannot be undone.")) {
      haptics.heavy();
      await deleteQuiz({ quizId });
    }
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCustomFolders(prev => [...prev, name]);
    setFolderOpen(prev => ({ ...prev, [name]: true }));
    setNewFolderName("");
    setShowNewFolder(false);
    haptics.light();
  };

  const handleRenameFolder = async (oldName: string) => {
    const newName = editingFolderName.trim();
    if (!newName || newName === oldName) { setEditingFolder(null); return; }
    const affected = localQuizzes.filter(q => (q.groupName || "Ungrouped") === oldName);
    for (const q of affected) {
      await updateQuiz({ quizId: q._id, groupName: newName === "Ungrouped" ? undefined : newName });
    }
    setLocalQuizzes(prev =>
      prev.map(q => (q.groupName || "Ungrouped") === oldName ? { ...q, groupName: newName } : q)
    );
    if (customFolders.includes(oldName)) {
      setCustomFolders(prev => prev.map(f => f === oldName ? newName : f));
    }
    setFolderOpen(prev => {
      const next = { ...prev };
      next[newName] = next[oldName] ?? true;
      delete next[oldName];
      return next;
    });
    setEditingFolder(null);
    haptics.success();
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (source.droppableId === destination.droppableId) {
      // Reorder within same folder
      const folderQ = localQuizzes.filter(q => (q.groupName || "Ungrouped") === source.droppableId);
      const otherQ = localQuizzes.filter(q => (q.groupName || "Ungrouped") !== source.droppableId);
      const reordered = [...folderQ];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      setLocalQuizzes([...otherQ, ...reordered]);
      haptics.light();
    } else {
      // Move to different folder
      const newGroup = destination.droppableId === "Ungrouped" ? undefined : destination.droppableId;
      updateQuiz({ quizId: draggableId as any, groupName: newGroup });
      setLocalQuizzes(prev =>
        prev.map(q =>
          q._id === draggableId
            ? { ...q, groupName: destination.droppableId === "Ungrouped" ? undefined : destination.droppableId }
            : q
        )
      );
      haptics.select();
    }
  };

  if (!mounted) return null;

  // Banned user — show quota exceeded message, no dashboard access
  if (currentUser && currentUser.isBanned) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="chaos-card bg-card p-10 max-w-md w-full">
          <div className="w-14 h-14 border-[3px] border-destructive mx-auto flex items-center justify-center mb-6">
            <span className="text-2xl">X</span>
          </div>
          <h2 className="chaos-heading text-2xl text-destructive mb-3">FREE QUOTA EXCEEDED.</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Your free plan quota has been exceeded. Contact us to renew your subscription and regain full access.
          </p>
          <a
            href="https://wa.me/201012756994"
            target="_blank"
            rel="noopener noreferrer"
            className="kb-btn kb-btn-primary w-full"
          >
            📞 +20 101 275 6994
          </a>
          <p className="text-xs text-muted-foreground mt-4">&ldquo;Free quote exceeded contact +201012756994 to renew your subscription&rdquo;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="chaos-card bg-card p-8 max-w-md w-full relative">
            <h2 className="chaos-heading text-2xl mb-2">CHOOSE YOUR USERNAME</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Your public quiz links use your username. Pick a unique handle before continuing.
            </p>
            <input
              type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
              className="kb-input mb-2"
              placeholder="E.G. BIOLOGY_NERD"
              autoFocus
              onKeyDown={e => e.key === "Enter" && newUsername.length >= 3 && handleSaveUsername()}
            />
            {usernameError && <p className="text-destructive text-xs font-semibold mb-2">{usernameError}</p>}
            <button
              onClick={handleSaveUsername}
              disabled={newUsername.length < 3}
              className="kb-btn kb-btn-primary w-full mt-4 disabled:opacity-50"
            >
              SAVE & CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="chaos-display text-4xl mb-1">MY QUIZZES.</h1>
          <p className="text-sm text-muted-foreground">Create and manage your assessments.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => { setShowNewFolder(true); haptics.light(); }}
            className="kb-btn kb-btn-ghost flex items-center gap-2"
          >
            <FolderPlus size={16} /> NEW FOLDER
          </button>
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="kb-btn kb-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} />
            {isCreating ? "CREATING..." : "NEW QUIZ"}
          </button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="chaos-card bg-card p-4 flex gap-3 items-center animate-in fade-in slide-in-from-top-2 duration-200">
          <Folder size={18} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="text" value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
            className="flex-1 bg-background border-2 border-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono uppercase"
            placeholder="FOLDER NAME..."
          />
          <button onClick={handleCreateFolder} className="kb-btn kb-btn-primary px-3 py-2"><Check size={16} /></button>
          <button onClick={() => setShowNewFolder(false)} className="p-2 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
      )}

      {/* Loading */}
      {quizzes === undefined ? (
        <div className="py-20 text-center chaos-pulse">
          <FileText size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="chaos-heading text-sm text-muted-foreground">Loading quizzes...</p>
        </div>
      ) : localQuizzes.length === 0 && customFolders.length === 0 ? (
        <div className="chaos-card bg-card p-12 text-center">
          <div className="w-16 h-16 border-[3px] border-foreground mx-auto flex items-center justify-center mb-6">
            <FileText size={24} className="text-foreground" />
          </div>
          <h2 className="chaos-heading text-xl mb-2">NO QUIZZES YET</h2>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto text-sm">
            Create your first interactive quiz in less than 60 seconds.
          </p>
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="kb-btn kb-btn-primary disabled:opacity-50"
          >
            <Plus size={18} /> {isCreating ? "CREATING..." : "START CREATING"}
          </button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-6">
            {folderNames.map(folderName => {
              const folderQuizzes = localQuizzes.filter(
                q => (q.groupName || "Ungrouped") === folderName
              );
              const isOpen = folderOpen[folderName] !== false;

              return (
                <div key={folderName} className="chaos-card bg-card overflow-visible">
                  {/* Folder Header */}
                  <div className="flex items-center gap-3 p-4 border-b-[3px] border-foreground/20">
                    {editingFolder === folderName ? (
                      <div className="flex flex-1 items-center gap-2">
                        <FolderOpen size={18} className="text-primary shrink-0" />
                        <input
                          autoFocus
                          type="text" value={editingFolderName}
                          onChange={e => setEditingFolderName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleRenameFolder(folderName); if (e.key === "Escape") setEditingFolder(null); }}
                          className="flex-1 bg-background border-2 border-foreground px-2 py-1 text-sm focus:outline-none chaos-heading"
                        />
                        <button onClick={() => handleRenameFolder(folderName)} className="p-1 text-muted-foreground hover:text-primary"><Check size={16} /></button>
                        <button onClick={() => setEditingFolder(null)} className="p-1 text-muted-foreground hover:text-destructive"><X size={16} /></button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setFolderOpen(prev => ({ ...prev, [folderName]: !isOpen }))}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          {isOpen
                            ? <FolderOpen size={18} className="text-primary shrink-0" />
                            : <Folder size={18} className="text-primary shrink-0" />
                          }
                          <span className="chaos-heading text-base">{folderName}</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="chaos-heading text-[10px] text-muted-foreground border border-foreground/20 px-2 py-0.5">
                            {folderQuizzes.length}
                          </span>
                          {folderName !== "Ungrouped" && (
                            <button
                              onClick={() => { setEditingFolder(folderName); setEditingFolderName(folderName); }}
                              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                              title="Rename folder"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setFolderOpen(prev => ({ ...prev, [folderName]: !isOpen }))}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Quiz List */}
                  {isOpen && (
                    <Droppable droppableId={folderName}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[56px] divide-y-2 divide-foreground/10 transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                        >
                          {folderQuizzes.length === 0 && !snapshot.isDraggingOver && (
                            <div className="p-6 text-center">
                              <p className="chaos-heading text-xs text-muted-foreground/60">DRAG QUIZZES HERE</p>
                            </div>
                          )}

                          {folderQuizzes.map((quiz, index) => (
                            <Draggable key={quiz._id} draggableId={quiz._id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-3 transition-all group ${
                                    snapshot.isDragging
                                      ? "chaos-card bg-card z-50 opacity-95"
                                      : "hover:bg-muted/30"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 w-full sm:w-auto flex-1 min-w-0">
                                    {/* Drag Handle */}
                                    <div
                                      {...provided.dragHandleProps}
                                      className="p-1 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
                                    >
                                      <GripVertical size={18} />
                                    </div>

                                  {/* Quiz Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-sm truncate max-w-[200px] sm:max-w-xs" title={quiz.title}>
                                        {quiz.title}
                                      </p>
                                      <span className="chaos-heading text-[10px] border border-foreground/20 px-1.5 py-0.5 shrink-0">
                                        {quiz.questionCount}Qs
                                      </span>
                                      <span className={`chaos-heading text-[10px] px-1.5 py-0.5 shrink-0 ${
                                        quiz.isPublished ? "bg-chaos text-chaos-foreground" : "bg-muted text-muted-foreground"
                                      }`}>
                                        {quiz.isPublished ? "LIVE" : "DRAFT"}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      {quiz.isPublished ? <Globe size={10} /> : <Lock size={10} />}
                                      /{quiz.creatorUsername}/{quiz.slug}
                                      <span className="opacity-40">·</span>
                                      {quiz.sessionCount} plays
                                      <span className="opacity-40">·</span>
                                      Avg {quiz.avgScore}%
                                    </p>
                                  </div>
                                  </div> {/* End of Top Row / Mobile First Layer */}

                                  {/* Action buttons */}
                                  <div className="flex items-center w-full sm:w-auto gap-1.5 mt-1 sm:mt-0 sm:ml-auto sm:shrink-0">
                                    <Link
                                      href={`/dashboard/editor?id=${quiz._id}`}
                                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 border border-foreground/15 bg-muted/30 text-muted-foreground text-xs font-semibold hover:bg-muted hover:text-foreground hover:border-foreground/30 transition-all"
                                      title="Edit"
                                    >
                                      <Edit3 size={13} />
                                      Edit
                                    </Link>
                                    <Link
                                      href={`/dashboard/stats?id=${quiz._id}`}
                                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 border border-foreground/15 bg-muted/30 text-muted-foreground text-xs font-semibold hover:bg-muted hover:text-foreground hover:border-foreground/30 transition-all"
                                      title="Stats"
                                    >
                                      <BarChart3 size={13} />
                                      Stats
                                    </Link>
                                    <button
                                      onClick={() => handleCopyLink(quiz.creatorUsername, quiz.slug)}
                                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 border border-foreground/15 bg-muted/30 text-muted-foreground text-xs font-semibold hover:bg-muted hover:text-foreground hover:border-foreground/30 transition-all"
                                      title="Copy Link"
                                    >
                                      {copiedId === quiz.slug
                                        ? <><Check size={13} className="text-primary" /><span className="text-primary">Copied</span></>
                                        : <><Copy size={13} />Link</>
                                      }
                                    </button>

                                    {/* More menu */}
                                    <div className="relative">
                                      <button
                                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === quiz._id ? null : quiz._id); }}
                                        className="inline-flex items-center justify-center px-2 py-2 sm:py-1.5 border border-foreground/15 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-foreground/30 transition-all"
                                      >
                                        <MoreVertical size={13} />
                                      </button>
                                      {openMenuId === quiz._id && (
                                        <>
                                          <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                                          <div className="absolute top-full right-0 mt-2 w-48 chaos-card bg-card z-40 p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
                                            <a
                                              href={`/${quiz.creatorUsername}/${quiz.slug}`}
                                              target="_blank" rel="noopener noreferrer"
                                              className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-muted transition-colors"
                                            >
                                              <ExternalLink size={14} /> Open Live Page
                                            </a>
                                            <button
                                              onClick={() => handleTogglePublish(quiz._id, quiz.isPublished)}
                                              className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-muted transition-colors"
                                            >
                                              {quiz.isPublished ? <Lock size={14} /> : <Globe size={14} />}
                                              {quiz.isPublished ? "Unpublish" : "Publish"}
                                            </button>
                                            <div className="h-px bg-foreground/10 my-1" />
                                            <button
                                              onClick={() => handleDelete(quiz._id)}
                                              className="w-full text-left px-3 py-2 text-sm text-destructive flex items-center gap-3 hover:bg-destructive/10 transition-colors"
                                            >
                                              <Trash2 size={14} /> Delete Quiz
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
