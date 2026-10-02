"use client";

import { useStableQueries } from "@/lib/stableQueries";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useConvex, useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { DurableLibraryClient, useLibraryAnnotations, useLibraryFolders, useLibraryMembers, useLibraryFolderItems, useLibraryCurriculum, useLibraryCourses, useLibraryFlashcards, useLibraryFlashcardRows, annotationSave, annotationHighlight, annotationNote, flashcardUi } from "./libraryClient";
import { DurableLessonClient, DurableProgressClient, durableMetadata } from "./durableClient";
import { fromDurableDocument, toDurableDocument } from "./chaosDocument";
import { useUser } from "@clerk/nextjs";
import { documentText, excerpt as makeExcerpt } from "./doc";
import { emptyPersonal, newId, personal, readState, serverState, subscribe, updatePersonal, writeState } from "./localStore";
import type { LearnState, PersonalState } from "./localStore";
import { searchLessons } from "./search";
import { StudyClient, studyReads, useStudyCapabilities } from "./studyClient";
import type {
  AttachedQuiz, ContentReport, CurriculumNode, DiscussionThread, Flashcard, FlashcardSet, Folder, FolderItem, Highlight, HighlightColor,
  LearnCapabilities, Lesson, LessonMeta, LessonProgress, LessonSource, LessonVersion, LibraryItemKind, MyCourse, PersonalNote, Person,
  ProgressState, ReportReason, ReportTarget, SavedItem, SearchFilters, VerificationKind, Visibility, WeakArea,
} from "./types";

/**
 * Every Learn screen reads and writes through these hooks. Loading returns `undefined`,
 * like Convex's `useQuery`, so swapping the local store for the backend keeps the
 * screens unchanged.
 */

/** Durable library/student flows; discussions, folder pins and tutor history remain local-only. */
export const localCapabilities: LearnCapabilities = {
  sharedPublishing: true, versionRestore: true, verification: false, discussions: true, reports: true,
  deviceSync: true, weakAreas: false, curriculumDirectory: true, quizForks: false,
};

export function useLearnCapabilities(): LearnCapabilities {
  const study = useStudyCapabilities();
  return useMemo(() => ({ ...localCapabilities, quizForks: study.quizForks, verification: study.verification, weakAreas: study.weakAreas }), [study.quizForks, study.verification, study.weakAreas]);
}

function useLearnState(): LearnState | undefined {
  const state = useSyncExternalStore(subscribe, readState, serverState);
  // The server snapshot is a shared empty object: report it as loading.
  return state === serverState() ? undefined : state;
}

export interface LearnViewer { id: string; name: string; signedIn: boolean; imageUrl?: string }

const GUEST: LearnViewer = { id: "guest", name: "Guest", signedIn: false };

export function useLearnViewer(): LearnViewer | undefined {
  const { user, isLoaded } = useUser();
  return useMemo(() => {
    if (!isLoaded) return undefined;
    if (!user) return GUEST;
    return { id: user.id, name: user.fullName || user.username || "You", signedIn: true, imageUrl: user.imageUrl };
  }, [isLoaded, user]);
}

function usePersonal(): PersonalState | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return state && viewer ? personal(state, viewer.id) : undefined;
}

/* ── Queries ─────────────────────────────────────────────────────────────── */


const durableRows = new Map<string, Doc<"lessons">>();
const progressTargets = new Map<string, { lessonId: Id<"lessons">; versionId: Id<"lessonVersions">; blockIds: string[] }>();
const listeners = new Set<() => void>();
let targetGeneration = 0;
function rememberProgress(userId: string, row: { lessonId: Id<"lessons">; version: Doc<"lessonVersions"> }) {
  const key = userId + ":" + row.lessonId;
  const old = progressTargets.get(key);
  if (old?.versionId === row.version._id) return;
  progressTargets.set(key, { lessonId: row.lessonId, versionId: row.version._id, blockIds: row.version.document.blocks.map(b => b.id) });
  targetGeneration++; listeners.forEach(fn => fn());
}
function useOwnedRows() {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.lessons.listOwned, auth.isAuthenticated ? {} : "skip", { initialNumItems: 10 });
  useEffect(() => { if (page.status === "CanLoadMore" && page.results.length < 250) page.loadMore(10); }, [page.status, page.results.length, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status === "LoadingFirstPage") ? undefined : auth.isAuthenticated ? page.results : [];
}
function uiMeta(metadata: Doc<"lessons">["metadata"]): LessonMeta { return { ...metadata, curricula: [], indexing: metadata.indexing ?? "noindex" }; }
function uiLesson(row: Doc<"lessons">, version?: Doc<"lessonVersions"> | null): Lesson {
  const draft = { meta: uiMeta(row.metadata), content: fromDurableDocument(row.draft), updatedAt: row.updatedAt };
  return { id: row._id, ownerId: row.ownerId, ownerName: row.metadata.authorDisplay ?? "Chaos creator", draft,
    ...(version ? { published: { version: version.number, meta: { ...uiMeta(version.metadata), curricula: (version.curriculumMappings ?? []).map(m => ({ moduleId: m.nodeId, versionId: m.versionId, path: [], versionLabel: "" })) }, content: fromDurableDocument(version.document), publishedAt: version.publishedAt }, publishedDraftAt: JSON.stringify(row.draft) === JSON.stringify(version.document) && JSON.stringify(row.metadata) === JSON.stringify(version.metadata) ? row.updatedAt : version.publishedAt } : {}),
    visibility: row.visibility === "public" ? "public" : "private", sources: [], quizzes: [],
    moderation: row.communityState === "review" ? "under_review" : row.communityState === "hidden" ? "restricted" : row.communityState === "removed" ? "removed" : "ok",
    quality: "none", stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, archived: row.status === "archived", createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.parentLessonId ? { forkedFrom: { kind: "lesson" as const, sourceId: row.parentLessonId, sourceTitle: "Original lesson", authorId: "", authorName: "Chaos creator", forkedAt: row.createdAt, originId: row.originLessonId } } : {}),
  };
}
function publicUiLesson(result: { lessonId: Id<"lessons">; ownerId: string; ownerName: string; createdAt: number; version: Doc<"lessonVersions"> }): Lesson {
  return { ...uiLesson({ _id: result.lessonId, _creationTime: result.createdAt, ownerId: result.ownerId, metadata: result.version.metadata, draft: result.version.document, revision: 0, status: "active", visibility: "public", communityState: "ok", createdAt: result.createdAt, updatedAt: result.version.publishedAt, searchText: "", publishedVersionId: result.version._id }, result.version), ownerName: result.ownerName };
}
function useOwnedLessons(archived: boolean): Lesson[] | undefined {
  const rows = useOwnedRows();
  const members = useLibraryMembers();
  const viewer = useLearnViewer();
  const queries = useMemo(() => Object.fromEntries((rows ?? []).filter(r => r.publishedVersionId).map(row => [row._id, { query: api.lessons.getPublished, args: { lessonId: row._id } }])), [rows]);
  const versions = useStableQueries(queries);
  useEffect(() => { if (viewer?.signedIn) for (const row of rows ?? []) { const version = versions[row._id]; if (version && !(version instanceof Error)) rememberProgress(viewer.id, { lessonId: row._id, version }); } }, [rows, versions, viewer?.id, viewer?.signedIn]);
  if (rows === undefined || rows.some(r => r.publishedVersionId && versions[r._id] === undefined)) return undefined;
  return rows.filter(r => (r.status === "archived") === archived).map(row => { const version = versions[row._id]; if (version instanceof Error) throw version; return { ...uiLesson(row, version as Doc<"lessonVersions"> | undefined), folderId: members?.find(m => m.asset.kind === "lesson" && m.asset.id === row._id)?.folderId }; });
}
export function useMyLessons(): Lesson[] | undefined { return useOwnedLessons(false); }
export function useArchivedLessons(): Lesson[] | undefined { return useOwnedLessons(true); }
export function useCanEditLesson(id: string | undefined): boolean | undefined {
  const auth = useConvexAuth();
  const row = useQuery(api.learnFrontend.editableLesson, auth.isAuthenticated && id ? { id } : "skip");
  return auth.isLoading || (auth.isAuthenticated && row === undefined) ? undefined : !!row;
}
export function useLesson(id: string | undefined): Lesson | null | undefined {
  const auth = useConvexAuth();
  const viewer = useLearnViewer();
  const editable = useQuery(api.learnFrontend.editableLesson, auth.isAuthenticated && id ? { id } : "skip");
  const published = useQuery(api.lessons.getPublished, editable ? { lessonId: editable._id } : "skip");
  const result = useQuery(api.learnFrontend.publicLesson, id ? { id } : "skip");
  useEffect(() => {
    if (editable && viewer?.signedIn) durableRows.set(viewer.id + ":" + editable._id, editable);
    const version = editable && published ? { lessonId: editable._id, version: published } : result;
    if (version && viewer?.signedIn) rememberProgress(viewer.id, version);
  }, [editable, published, result, viewer?.id, viewer?.signedIn]);
  if (!id) return null;
  if (!viewer || auth.isLoading || (auth.isAuthenticated && editable === undefined) || (editable ? published === undefined : result === undefined)) return undefined;
  return editable ? uiLesson(editable, published) : result ? publicUiLesson(result) : null;
}
export function isListed(lesson: Lesson): boolean { return !!lesson.published && lesson.visibility === "public" && !lesson.archived && lesson.moderation === "ok"; }
export function usePublicLessons(filters: SearchFilters = {}): Lesson[] | undefined {
  const [asOf] = useState(() => Date.now());
  const rank = useQuery(api.learnCommunity.rank, { asOf, limit: 20, ...(filters.moduleId ? { nodeId: filters.moduleId as Id<"curriculumNodes"> } : {}), ...(filters.versionId ? { curriculumVersionId: filters.versionId as Id<"curriculumVersions"> } : {}) });
  const search = usePaginatedQuery(api.learnSearch.searchPublic, filters.q?.trim() ? { text: filters.q.trim().slice(0, 200) } : "skip", { initialNumItems: 20 });
  const ids = filters.q?.trim() ? search.results.map(r => r.lessonId) : rank?.map(r => r.lessonId);
  const batch = useQuery(api.learnFrontend.publicLessonsBatch, ids && ids.length > 0 ? { ids } : "skip");
  if (ids === undefined || (ids.length > 0 && batch === undefined)) return undefined;
  const lessons = (batch ?? []).map(publicUiLesson);
  return searchLessons(lessons, {}, filters);
}
export function useLessonVersions(lessonId: string | undefined): LessonVersion[] | undefined {
  const auth = useConvexAuth();
  const own = useQuery(api.learnFrontend.editableLesson, auth.isAuthenticated && lessonId ? { id: lessonId } : "skip");
  const result = usePaginatedQuery(api.lessons.listVersions, own ? { lessonId: own._id } : "skip", { initialNumItems: 10 });
  useEffect(() => { if (result.status === "CanLoadMore" && result.results.length < 100) result.loadMore(10); }, [result.status, result.results.length, result.loadMore]);
  if (auth.isLoading || (auth.isAuthenticated && own === undefined) || (own && result.status === "LoadingFirstPage")) return undefined;
  return result.results.map(v => ({ lessonId: v.lessonId, version: v.number, meta: uiMeta(v.metadata), content: fromDurableDocument(v.document), publishedAt: v.publishedAt, publishedBy: v.authorId, note: v.note }));
}
export function useLessonRecovery(lessonId: string | undefined) {
  const auth = useConvexAuth(); const own = useQuery(api.learnFrontend.editableLesson, auth.isAuthenticated && lessonId ? { id: lessonId } : "skip");
  return useQuery(api.lessons.listRecovery, own ? { lessonId: own._id } : "skip");
}

export function useFolders(): Folder[] | undefined { return useLibraryFolders(); }

export function useFolderItems(): FolderItem[] | undefined { return useLibraryFolderItems(); }

/** Published collections anyone can open. */
export function usePublicCollections(): Folder[] | undefined {
  const state = useLearnState();
  return useMemo(() => state ? [] : undefined, [state]);
}

export function useFolder(id: string | undefined): Folder | null | undefined {
  const folders = useFolders();
  return folders === undefined ? undefined : folders.find(f => f.id === id) ?? null;
}

export function useCollectionLessons(folderId: string | undefined): Lesson[] | undefined {
  const folders = useFolders(), members = useLibraryMembers(), lessons = useMyLessons();
  if (!folders || !members || !lessons) return undefined;
  const ids = new Set(folderId ? [folderId] : []);
  for (let i = 0; i < 8; i++) for (const f of folders) if (f.parentId && ids.has(f.parentId)) ids.add(f.id);
  const lessonIds = new Set(members.filter(m => ids.has(m.folderId) && m.asset.kind === "lesson").map(m => m.asset.id));
  return lessons.filter(l => lessonIds.has(l.id as Id<"lessons">));
}

function descendantFolderIds(state: LearnState, rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of Object.values(state.folders)) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
  }
  return ids;
}

export function useCurriculumNodes(): CurriculumNode[] | undefined { return useLibraryCurriculum(); }

export function useMyCourses(): MyCourse[] | undefined { return useLibraryCourses(); }

export function useSaved(): SavedItem[] | undefined {
  return useLibraryAnnotations()?.filter(r => !r.deleted && r.kind === "save").map(annotationSave).sort((a,b) => b.createdAt - a.createdAt);
}

export function useHighlights(lessonId: string): Highlight[] | undefined {
  return useLibraryAnnotations()?.filter(r => !r.deleted && r.kind === "highlight" && r.lessonId === lessonId).map(annotationHighlight);
}

export function useNotes(lessonId?: string): PersonalNote[] | undefined {
  return useLibraryAnnotations()?.filter(r => !r.deleted && r.kind === "note" && (!lessonId || r.lessonId === lessonId)).map(annotationNote);
}

export function useProgress(): Record<string, LessonProgress> | undefined {
  const viewer = useLearnViewer(); const auth = useConvexAuth();
  useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => targetGeneration, () => 0);
  const targets = [...progressTargets.entries()].filter(([key]) => key.startsWith((viewer?.id ?? "guest") + ":")).map(([, value]) => value);
  const queries = Object.fromEntries(auth.isAuthenticated ? targets.map(target => [target.lessonId, { query: api.learnCommunity.getProgress, args: { lessonId: target.lessonId, versionId: target.versionId } }]) : []);
  const rows = useStableQueries(queries);
  if (!viewer || auth.isLoading) return undefined;
  const result: Record<string, LessonProgress> = {};
  if (auth.isAuthenticated && targets.some(target => rows[target.lessonId] === undefined)) return undefined;
  for (const target of targets) {
    const row = rows[target.lessonId];
    if (row instanceof Error) throw row;
    if (!row) continue;
    const count = row.completedBlocks.length, total = target.blockIds.length;
    result[target.lessonId] = { lessonId: target.lessonId, state: total > 0 && count >= total ? "completed" : "in_progress", percent: total ? Math.round(count * 100 / total) : 0, lastBlockId: row.completedBlocks.at(-1), updatedAt: row.updatedAt };
  }
  return result;
}

export function useVote(lessonId: string): "helpful" | "not_helpful" | null | undefined {
  const auth = useConvexAuth();
  const signals = useQuery(api.learnCommunity.getMySignals, auth.isAuthenticated ? { lessonId: lessonId as Id<"lessons"> } : "skip");
  return auth.isLoading || (auth.isAuthenticated && !signals) ? undefined : signals?.helpful ? "helpful" : null;
}

/** Lessons this person opened, most recent first, with the time they last opened each. */
export function useRecentLessons(limit = 12): { lesson: Lesson; openedAt: number }[] | undefined {
  const state = useLearnState();
  const mine = usePersonal();
  const viewer = useLearnViewer();
  return useMemo(() => {
    if (!state || !mine || !viewer) return undefined;
    return Object.entries(mine.recent)
      .map(([id, openedAt]) => ({ lesson: state.lessons[id], openedAt }))
      .filter((r): r is { lesson: Lesson; openedAt: number } => !!r.lesson && !r.lesson.archived && (r.lesson.ownerId === viewer.id || isListed(r.lesson) || r.lesson.visibility === "unlisted"))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, limit);
  }, [state, mine, viewer, limit]);
}

export function useThreads(lessonId: string): DiscussionThread[] | undefined {
  const rows = useQuery(api.learnDiscussions.listThreads, lessonId ? { lessonId: lessonId as Id<"lessons"> } : "skip");
  return useMemo(() => rows?.map(t => ({ ...t, comments: t.comments.map(c => ({ ...c, moderation: c.moderation as DiscussionThread["comments"][number]["moderation"] })) })).sort((a, b) => a.createdAt - b.createdAt), [rows]);
}

export function useMyReports(): ContentReport[] | undefined {
  const state = useLearnState();
  return state?.reports;
}

/** A contributor: their profile if one exists, otherwise built from their published work. */
export function usePerson(id: string | undefined): (Person & { lessons: Lesson[]; flashcards: FlashcardSet[] }) | null | undefined {
  const state = useLearnState();
  return useMemo(() => {
    if (!state || !id) return state ? null : undefined;
    const lessons = Object.values(state.lessons).filter((l) => l.ownerId === id && isListed(l));
    const flashcards = Object.values(state.flashcards).filter((f) => f.ownerId === id && f.visibility === "public");
    const person = state.people[id];
    if (!person && !lessons.length && !flashcards.length) return null;
    const name = person?.name ?? lessons[0]?.ownerName ?? flashcards[0]?.ownerName ?? "";
    return { ...person, affiliations: person?.affiliations ?? [], verifications: person?.verifications ?? [], id, name, lessons, flashcards };
  }, [state, id]);
}

export function useFlashcardSets(): FlashcardSet[] | undefined { return useLibraryFlashcards(); }

export function useFlashcardSet(id: string | undefined): FlashcardSet | null | undefined {
  const row = useQuery(api.learnLibrary.flashcard, id ? { id } : "skip");
  return !id ? null : row === undefined ? undefined : row ? flashcardUi(row) : null;
}

export function useLessonFlashcards(lessonId: string): FlashcardSet[] | undefined {
  const attachments = useQuery(api.flashcardStudy.listAttached, { lessonId: lessonId as Id<"lessons"> });
  const rows = useStableQueries(Object.fromEntries((attachments ?? []).map(r => [r.setId, { query: api.learnLibrary.flashcard, args: { id: r.setId } }])));
  if (!attachments || attachments.some(r => rows[r.setId] === undefined)) return undefined;
  return attachments.flatMap(a => { const row = rows[a.setId]; if (row instanceof Error) throw row; return row ? [{ ...flashcardUi(row), lessonId }] : []; });
}

export function useCardReviews(setId: string) {
  const auth = useConvexAuth();
  const version = useQuery(api.flashcards.getPublished, { setId: setId as Id<"flashcardSets"> });
  const [now] = useState(() => Date.now());
  const summary = useQuery(api.flashcardStudy.reviewSchedule, auth.isAuthenticated && version ? { versionId: version._id, now, limit: 100 } : "skip");
  return auth.isLoading || version === undefined || (auth.isAuthenticated && version && !summary) ? undefined : (summary?.items ?? []).map(r => ({ setId, cardId: r.cardId, box: r.box, reviewedAt: 0 }));
}

export function usePinnedFolders(): string[] | undefined {
  // Sidebar pin preferences remain device-only; they are not library synchronization.
  return usePersonal()?.pinnedFolders;
}

/** Concepts the reader keeps missing in graded quizzes, with a lesson block to reread. */
export function useWeakAreas(): WeakArea[] | undefined {
  const auth = useConvexAuth();
  const [now] = useState(() => Date.now());
  const rows = useQuery(studyReads.weakAreas, auth.isAuthenticated ? { now } : "skip");
  return useMemo(() => {
    if (auth.isLoading) return undefined;
    if (!auth.isAuthenticated) return [];
    return rows?.filter(r => r.lessonId).map(r => ({ concept: r.title, lessonId: r.lessonId!, blockId: r.blockId, quizFormId: r.formId, confidence: 0, lastSeenAt: r.lastSeenAt }));
  }, [auth.isLoading, auth.isAuthenticated, rows]);
}

/* ── Actions ─────────────────────────────────────────────────────────────── */

export const blankMeta = (language: string, title = ""): LessonMeta => ({ title, description: "", tags: [], language, curricula: [], indexing: "noindex" });

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().replace(/^#/, "").slice(0, 40)).filter(Boolean))].slice(0, 12);

function requireOwned(state: LearnState, id: string, userId: string): Lesson {
  const lesson = state.lessons[id];
  if (!lesson || lesson.ownerId !== userId) throw new Error("NOT_FOUND");
  return lesson;
}

function putLesson(state: LearnState, lesson: Lesson): LearnState {
  return { ...state, lessons: { ...state.lessons, [lesson.id]: lesson } };
}

export class LearnError extends Error {}

/**
 * Mutations for the signed-in person. Every function validates ownership the same way the
 * backend must; signed-out viewers get only reading and local progress.
 */
export function useLearnActions() {
  const viewer = useLearnViewer();
  const client = useConvex();
  const annotations = useLibraryAnnotations();
  const flashcardRows = useLibraryFlashcardRows();
  const library = useMemo(() => { void viewer?.id; return new DurableLibraryClient(client); }, [client, viewer?.id]);
  useEffect(() => { if (annotations) library.observe(annotations); if (flashcardRows) library.observeFlashcards(flashcardRows); }, [library, annotations, flashcardRows]);
  const service = useMemo(() => { void viewer?.id; return new DurableLessonClient(client); }, [client, viewer?.id]);
  for (const [key, row] of durableRows) if (key.startsWith((viewer?.id ?? "guest") + ":")) service.observe(row);
  const progressService = useMemo(() => { void viewer?.id; return new DurableProgressClient(client); }, [client, viewer?.id]);
  useEffect(() => { for (const [key, row] of durableRows) if (key.startsWith((viewer?.id ?? "guest") + ":")) service.observe(row); });
  useEffect(() => {
    for (const key of durableRows.keys()) if (!key.startsWith((viewer?.id ?? "guest") + ":")) durableRows.delete(key);
    for (const key of progressTargets.keys()) if (!key.startsWith((viewer?.id ?? "guest") + ":")) progressTargets.delete(key);
  }, [viewer?.id]);
  const me = viewer?.id ?? "guest";
  const myName = viewer?.name ?? "";
  const requireSignIn = useCallback(() => { if (!viewer?.signedIn) throw new LearnError("SIGN_IN_REQUIRED"); }, [viewer]);

  return useMemo(() => {
    return {
      async createLesson(input: { language: string; folderId?: string; title?: string; content?: unknown[] } = { language: "en" }): Promise<string> {
        requireSignIn();
        const id = await client.mutation(api.lessons.create, { metadata: durableMetadata(blankMeta(input.language, input.title || "Untitled lesson")), document: toDurableDocument(input.content ?? []) });
        if (input.folderId) await library.moveAsset("lesson", id, input.folderId);
        return id;
      },
      saveDraftContent(id: string, content: unknown[]) { requireSignIn(); return service.saveContent(id, content); },
      async reloadDraft(id: string) { requireSignIn(); const row = await service.reload(id); return uiLesson(row); },
      async recoverDraft(id: string, recoveryId: string) { requireSignIn(); return uiLesson(await service.recover(id, recoveryId as Id<"lessonDraftRecovery">)); },
      saveDraftMeta(id: string, patch: Partial<LessonMeta>) { requireSignIn(); return service.saveMeta(id, { ...patch, ...(patch.tags ? { tags: cleanTags(patch.tags) } : {}) }); },
      setVisibility(id: string, visibility: Visibility) { requireSignIn(); service.setVisibility(id, visibility); },
      setSources(_id: string, _sources: LessonSource[]) { void _id; void _sources; throw new LearnError("Source editing must use the durable source API. No device-local sources were saved."); },
      setQuizzes(_id: string, _quizzes: AttachedQuiz[]) { void _id; void _quizzes; throw new LearnError("Assessment attachment editing is not wired yet. Existing server relationships are unchanged."); },
      publish(id: string, note?: string) { requireSignIn(); return service.publish(id, note); },
      unpublish(id: string) { requireSignIn(); return service.lifecycle(id, "unpublish"); },
      discardDraft(id: string) { requireSignIn(); return service.restore(id); },
      restoreVersion(id: string, version: number) { requireSignIn(); return service.restore(id, version); },
      archiveLesson(id: string, archived = true) { requireSignIn(); return service.lifecycle(id, archived ? "archive" : "reactivate"); },
      deleteLesson(_id: string) { void _id; throw new LearnError("Permanent deletion is unavailable. Archive this lesson to preserve its history."); },
      async duplicateLesson(id: string): Promise<string> {
        requireSignIn();
        const row = await client.query(api.lessons.getDraft, { lessonId: id as Id<"lessons"> });
        return client.mutation(api.lessons.create, { metadata: { ...row.metadata, title: (row.metadata.title + " (copy)").slice(0, 200), indexing: "noindex" }, document: row.draft });
      },
      async forkLesson(id: string): Promise<string> {
        requireSignIn(); const source = await client.query(api.learnFrontend.publicLesson, { id });
        if (!source) throw new LearnError("NOT_FOUND");
        return client.mutation(api.lessons.fork, { lessonId: source.lessonId, versionId: source.version._id });
      },
      async recordView(id: string, engagement?: { blockId: string; engagedSeconds: number }) {
        requireSignIn();
        if (!engagement) return false;
        const version = await library.published(id);
        return client.mutation(api.learnCommunity.recordView, { lessonId: version.lessonId, versionId: version._id, ...engagement });
      },
      async vote(id: string, vote: "helpful" | "not_helpful" | null) {
        requireSignIn();
        if (vote === "not_helpful") throw new LearnError("Only Helpful votes are supported. Report inaccurate or unsafe material instead.");
        return client.mutation(api.learnCommunity.setSignals, { lessonId: id as Id<"lessons">, helpful: vote === "helpful" });
      },
      saveLesson(lesson: Lesson) {
        requireSignIn();
        return library.put({ key: "lesson_" + lesson.id, lessonId: lesson.id, kind: "save" });
      },
      async saveBlock(lesson: Lesson, blockId: string, excerptText: string, _imageUrl?: string) {
        requireSignIn();
        const version = await library.published(lesson.id);
        const block = version.document.blocks.find(b => b.id === blockId);
        const start = block && "text" in block ? block.text.indexOf(excerptText) : -1;
        return library.put({ key: "block_" + lesson.id + "_" + blockId, lessonId: lesson.id, blockId, kind: "save", ...(excerptText && excerptText.length <= 2000 && start >= 0 ? { anchor: { start, end: start + excerptText.length, quote: excerptText } } : {}) });
      },
      removeSave(saveId: string) { requireSignIn(); return library.remove(saveId); },
      addHighlight(h: { lessonId: string; blockId: string; quote: string; offset: number; color: HighlightColor }) {
        requireSignIn();
        return library.put({ key: "hl_" + h.color + "_" + crypto.randomUUID().replaceAll("-", "_"), lessonId: h.lessonId, blockId: h.blockId, kind: "highlight", anchor: { start: h.offset, end: h.offset + h.quote.length, quote: h.quote } });
      },
      removeHighlight(id: string) { requireSignIn(); return library.remove(id); },
      upsertNote(note: { id?: string; lessonId: string; blockId: string; body: string }) {
        requireSignIn(); return library.put({ key: note.id, lessonId: note.lessonId, blockId: note.blockId, kind: "note", note: note.body });
      },
      deleteNote(id: string) { requireSignIn(); return library.remove(id); },
      setProgress(lessonId: string, patch: { state?: ProgressState; lastBlockId?: string; percent?: number }): Promise<void> {
        requireSignIn();
        const key = me + ":" + lessonId;
        const target = progressTargets.get(key);
        if (!target) return Promise.reject(new LearnError("Open the published lesson before recording progress."));
        if (patch.state === "not_started") return Promise.reject(new LearnError("Progress reset is not supported by the durable backend; existing evidence is preserved."));
        return progressService.save(target, patch);
      },

      /* Library folders and collections. */
      createFolder(name: string, parentId?: string): Promise<string> { requireSignIn(); return client.mutation(api.folders.create, { name, parentId: parentId as Id<"folders"> ?? null }); },
      renameFolder(id: string, name: string) { requireSignIn(); return client.mutation(api.folders.rename, { folderId: id as Id<"folders">, name }); },
      moveFolder(id: string, parentId: string | undefined) { requireSignIn(); return client.mutation(api.folders.move, { folderId: id as Id<"folders">, parentId: parentId as Id<"folders"> ?? null }); },
      archiveFolder(_id: string, _archived = true) { throw new LearnError("Folder archiving is not supported. Move its contents or remove an empty folder."); },
      duplicateFolder(_id: string): string { throw new LearnError("Folder duplication is not supported by the backend."); },
      moveLesson(lessonId: string, folderId: string | undefined) { requireSignIn(); return library.moveAsset("lesson", lessonId, folderId); },
      addToFolder(item: { folderId: string; kind: Exclude<LibraryItemKind, "lesson">; refId: string; title: string }) { requireSignIn(); return library.moveAsset(item.kind, item.refId, item.folderId); },
      removeFromFolder(kind: LibraryItemKind, refId: string) { requireSignIn(); return library.moveAsset(kind, refId); },
      togglePinnedFolder(id: string) {
        updatePersonal(me, (mine) => ({ ...mine, pinnedFolders: mine.pinnedFolders.includes(id) ? mine.pinnedFolders.filter((x) => x !== id) : [...mine.pinnedFolders, id] }));
      },
      async createLibraryCollection(input: { title: string; description: string; language: string; folderId: string; visibility: Visibility }) {
        requireSignIn();
        if (input.visibility === "unlisted") throw new LearnError("Unlisted collections are not supported. Choose private or public.");
        let cursor: string | null = null;
        const members: Doc<"folderMembers">[] = [];
        do {
          const page: { page: Doc<"folderMembers">[]; isDone: boolean; continueCursor: string } = await client.query(api.folders.listMembers, { folderId: input.folderId as Id<"folders">, paginationOpts: { cursor, numItems: 25 } });
          members.push(...page.page);
          cursor = page.isDone ? null : page.continueCursor;
        } while (cursor);
        const items: Doc<"learnCollections">["items"] = [];
        for (const member of members) {
          if (member.asset.kind === "lesson") { const version = await library.published(member.asset.id); items.push({ kind: "lesson", id: member.asset.id, versionId: version._id }); }
          else if (member.asset.kind === "source") items.push({ kind: "source", id: member.asset.id });
          else throw new LearnError("Collections support published lessons and source metadata only. Use a folder containing only those assets.");
        }
        if (!items.length) throw new LearnError("Add published lessons or source metadata to this folder first.");
        const collectionId = await client.mutation(api.learnCollections.create, { metadata: durableMetadata({ ...blankMeta(input.language, input.title), description: input.description }) });
        const revision = await client.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 0, items });
        await client.mutation(api.learnCollections.publish, { collectionId, expectedRevision: revision, visibility: input.visibility });
        return collectionId;
      },
      setCollection(_id: string, _collection: Folder["collection"]) { throw new LearnError("Collections are separate durable assets. Use createLibraryCollection and publishLibraryCollection; folders cannot be published in place."); },
      addCurriculumNode(_node: Omit<CurriculumNode, "id">): string { throw new LearnError("The canonical curriculum directory is administered on the server."); },
      renameCurriculumNode(_id: string, _name: string) { throw new LearnError("Canonical curriculum records are immutable."); },
      setCurrentVersion(_versionId: string) { throw new LearnError("The curriculum backend has no current-version setting."); },
      followCourse(moduleId: string, _versionId: string) { requireSignIn(); return library.follow(moduleId, true); },
      unfollowCourse(moduleId: string) { requireSignIn(); return library.follow(moduleId, false); },
      openCourse(_moduleId: string) { /* The backend does not record course-open timestamps. */ },
      async startThread(input: { lessonId: string; blockId?: string; anchorExcerpt?: string; body: string }): Promise<string> {
        requireSignIn();
        if (!input.body.trim()) throw new LearnError("EMPTY");
        return client.mutation(api.learnDiscussions.startThread, { lessonId: input.lessonId as Id<"lessons">, blockId: input.blockId, anchorExcerpt: input.anchorExcerpt && makeExcerpt(input.anchorExcerpt, 140), body: input.body });
      },
      async reply(threadId: string, body: string) {
        requireSignIn();
        if (!body.trim()) throw new LearnError("EMPTY");
        await client.mutation(api.learnDiscussions.reply, { threadId: threadId as Id<"learnThreads">, body });
      },
      /** Thread starter or lesson owner can resolve. */
      async resolveThread(threadId: string, resolved: boolean) {
        requireSignIn();
        await client.mutation(api.learnDiscussions.resolve, { threadId: threadId as Id<"learnThreads">, resolved });
      },
      async deleteComment(_threadId: string, commentId: string) {
        requireSignIn();
        await client.mutation(api.learnDiscussions.removeComment, { commentId: commentId as Id<"learnComments"> });
      },
      async report(target: ReportTarget, reason: ReportReason, details: string) {
        requireSignIn();
        if (target.kind !== "lesson") throw new LearnError("Reports for this asset type are not supported.");
        if (reason === "other") throw new LearnError("Choose a supported report category.");
        const category = reason === "incorrect" ? "inaccurate" : reason === "abuse" ? "unsafe" : reason;
        return client.mutation(api.learnCommunity.report, { lessonId: target.id as Id<"lessons">, category, detail: details });
      },
      updateProfile(patch: Partial<Pick<Person, "name" | "bio" | "username">>) {
        requireSignIn();
        writeState((s) => {
          const current = s.people[me] ?? { id: me, name: myName, affiliations: [], verifications: [] };
          return { ...s, people: { ...s.people, [me]: { ...current, ...patch, bio: patch.bio?.slice(0, 600) ?? current.bio } } };
        });
      },
      /** Submits a claim for manual review; badges appear only after an admin verifies it. */
      async requestVerification(kind: VerificationKind, institution: string) {
        requireSignIn();
        await new StudyClient(client).claimIdentity(kind, institution);
      },

      /* Flashcards. */
      async createFlashcardSet(input: { title: string; lessonId?: string; cards?: Flashcard[] }): Promise<string> {
        requireSignIn();
        if (input.lessonId) throw new LearnError("Create a set first, publish it, then attach its version to a lesson.");
        return client.mutation(api.flashcards.create, { title: input.title, cards: (input.cards ?? []).map(c => ({ id: c.id, front: c.front, back: c.back, conceptIds: [] })) });
      },
      async publishFlashcardStudy(id: string) {
        requireSignIn(); const row = await client.query(api.learnLibrary.flashcard, { id });
        if (!row) throw new LearnError("NOT_FOUND");
        return client.mutation(api.flashcards.publish, { setId: row._id, expectedRevision: row.revision, visibility: row.visibility });
      },
      updateFlashcardSet(id: string, patch: Partial<Pick<FlashcardSet, "title" | "description" | "cards" | "visibility" | "lessonId">>) { requireSignIn(); return library.updateFlashcards(id, patch); },
      async deleteFlashcardSet(id: string) {
        requireSignIn(); const row = await client.query(api.learnLibrary.flashcard, { id });
        if (!row) throw new LearnError("NOT_FOUND");
        return client.mutation(api.flashcards.setLifecycle, { setId: row._id, expectedRevision: row.revision, action: "archive" });
      },
      async forkFlashcardSet(id: string): Promise<string> {
        requireSignIn(); const version = await client.query(api.flashcards.getPublished, { setId: id as Id<"flashcardSets"> });
        if (!version) throw new LearnError("No published flashcards to fork.");
        return client.mutation(api.flashcards.fork, { setId: version.setId, versionId: version._id });
      },
      reviewCard(setId: string, cardId: string, knewIt: boolean) { requireSignIn(); return library.review(setId, cardId, knewIt); },
      resetReviews(_setId: string) { throw new LearnError("Study evidence cannot be reset. Restart the queue to practice again."); },

      /**
       * Fork a quiz attached to a public lesson into the reader’s Chaos library as a draft with provenance.
       * Needs the backend: the browser never sees answer keys, so it cannot copy a quiz faithfully.
       */
      async forkQuiz(formId: string, from: { lessonId: string }): Promise<string> {
        requireSignIn();
        void from; // Provenance is recorded server-side from the published source quiz.
        return new StudyClient(client).forkQuiz(formId);
      },
    };
  }, [me, myName, requireSignIn, client, service, progressService, library]);
}

export type LearnActions = ReturnType<typeof useLearnActions>;

/** Plain text of a lesson for search and previews. */
export const lessonText = (lesson: Lesson) => documentText((lesson.published ?? lesson.draft).content);

let toastSeq = 0;
/** Ids for undo toasts. */
export const nextToastId = () => ++toastSeq;

export const hasUnpublishedChanges = (lesson: Lesson) => !!lesson.published && lesson.draft.updatedAt !== lesson.publishedDraftAt;

/** Which copy readers see, and which the owner edits. */
export const readerView = (lesson: Lesson) => lesson.published ?? { version: 0, meta: lesson.draft.meta, content: lesson.draft.content, publishedAt: lesson.draft.updatedAt };

export { emptyPersonal };

/** Every highlight this person made, newest first (Saved → Highlights). */
export function useAllHighlights(): Highlight[] | undefined { return useLibraryAnnotations()?.filter(r => !r.deleted && r.kind === "highlight").map(annotationHighlight); }

/** Titles for lesson ids, for lists that reference lessons (saved items, notes). */
export function useLessonTitles(): ((id: string) => string | undefined) | undefined {
  const annotations = useLibraryAnnotations();
  const results = useStableQueries(Object.fromEntries([...new Set(annotations?.map(a => a.lessonId) ?? [])].map(id => [id, { query: api.learnFrontend.publicLesson, args: { id } }])));
  return annotations === undefined ? undefined : id => { const row = results[id]; return row && !(row instanceof Error) ? row.version.metadata.title : undefined; };
}

/** Ids for client-created parts of a lesson (cards, sources). */
export { newId } from "./localStore";
/** Lesson file storage (images, PDFs). Stored references resolve to displayable URLs. */
export { putFile as uploadLearnFile, resolveFileUrl as resolveLearnFileUrl, MAX_FILE_BYTES as LEARN_MAX_FILE_BYTES } from "./localStore";

export { DurableLibraryClient, useLibraryCollections } from "./libraryClient";

export function usePublishedCollection(id: string) { return useQuery(api.learnLibrary.collection, { id }); }
export function useCollectionSnapshotLessons(id: string): Lesson[] | undefined {
  const snapshot = usePublishedCollection(id);
  const items = snapshot?.items.filter(i => i.kind === "lesson") ?? [];
  const versions = useStableQueries(Object.fromEntries(items.map(i => [i.id, { query: api.lessonVersionReads.get, args: { lessonId: i.id, versionId: i.versionId } }])));
  if (snapshot === undefined || items.some(i => versions[i.id] === undefined)) return undefined;
  return items.flatMap(i => { const version = versions[i.id]; if (!version || version instanceof Error) return []; return [publicUiLesson({ lessonId: i.id, ownerId: "", ownerName: version.metadata.authorDisplay ?? "Chaos creator", createdAt: version.publishedAt, version })]; });
}
