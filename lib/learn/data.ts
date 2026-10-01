"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useConvex, useConvexAuth, usePaginatedQuery, useQueries, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { DurableLessonClient, DurableProgressClient, durableMetadata } from "./durableClient";
import { fromDurableDocument, toDurableDocument } from "./chaosDocument";
import { useUser } from "@clerk/nextjs";
import { documentText, excerpt as makeExcerpt } from "./doc";
import { emptyPersonal, newId, personal, readState, serverState, subscribe, updatePersonal, writeState } from "./localStore";
import type { LearnState, PersonalState } from "./localStore";
import { searchLessons } from "./search";
import type {
  AttachedQuiz, ContentReport, CurriculumNode, DiscussionThread, Flashcard, FlashcardSet, Folder, FolderItem, Highlight, HighlightColor,
  LearnCapabilities, Lesson, LessonMeta, LessonProgress, LessonSource, LessonVersion, LibraryItemKind, MyCourse, PersonalNote, Person,
  ProgressState, ReportReason, ReportTarget, SavedItem, SearchFilters, TutorMessage, VerificationKind, Visibility, WeakArea,
} from "./types";

/**
 * Every Learn screen reads and writes through these hooks. Loading returns `undefined`,
 * like Convex's `useQuery`, so swapping the local store for the backend keeps the
 * screens unchanged. See docs/learn-frontend-contract.md for the matching backend API.
 */

/** Local store: publishing is device-only; AI, verification and weak areas wait for the backend. */
export const localCapabilities: LearnCapabilities = {
  sharedPublishing: true, versionRestore: true, ai: false, verification: false, discussions: false, reports: false,
  deviceSync: false, weakAreas: false, curriculumDirectory: false, quizForks: false,
};

export function useLearnCapabilities(): LearnCapabilities {
  return localCapabilities;
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
    ...(version ? { published: { version: version.number, meta: uiMeta(version.metadata), content: fromDurableDocument(version.document), publishedAt: version.publishedAt }, publishedDraftAt: JSON.stringify(row.draft) === JSON.stringify(version.document) && JSON.stringify(row.metadata) === JSON.stringify(version.metadata) ? row.updatedAt : version.publishedAt } : {}),
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
  const viewer = useLearnViewer();
  const queries = useMemo(() => Object.fromEntries((rows ?? []).filter(r => r.publishedVersionId).map(row => [row._id, { query: api.lessons.getPublished, args: { lessonId: row._id } }])), [rows]);
  const versions = useQueries(queries);
  useEffect(() => { if (viewer?.signedIn) for (const row of rows ?? []) { const version = versions[row._id]; if (version && !(version instanceof Error)) rememberProgress(viewer.id, { lessonId: row._id, version }); } }, [rows, versions, viewer?.id, viewer?.signedIn]);
  if (rows === undefined || rows.some(r => r.publishedVersionId && versions[r._id] === undefined)) return undefined;
  return rows.filter(r => (r.status === "archived") === archived).map(row => { const version = versions[row._id]; if (version instanceof Error) throw version; return uiLesson(row, version as Doc<"lessonVersions"> | undefined); });
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
  const rank = useQuery(api.learnCommunity.rank, { asOf, limit: 20 });
  const search = usePaginatedQuery(api.learnSearch.searchPublic, filters.q?.trim() ? { text: filters.q.trim().slice(0, 200) } : "skip", { initialNumItems: 20 });
  const ids = filters.q?.trim() ? search.results.map(r => r.lessonId) : rank?.map(r => r.lessonId);
  const queries = Object.fromEntries((ids ?? []).map(id => [id, { query: api.learnFrontend.publicLesson, args: { id } }]));
  const results = useQueries(queries);
  if (ids === undefined || ids.some(id => results[id] === undefined)) return undefined;
  const lessons = ids.flatMap(id => { const result = results[id]; if (result instanceof Error) throw result; return result ? [publicUiLesson(result)] : []; });
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

export function useFolders(): Folder[] | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return useMemo(() => state && viewer ? Object.values(state.folders).filter((f) => f.ownerId === viewer.id).sort((a, b) => a.name.localeCompare(b.name)) : undefined, [state, viewer]);
}

export function useFolderItems(): FolderItem[] | undefined {
  const state = useLearnState();
  const folders = useFolders();
  return useMemo(() => {
    if (!state || !folders) return undefined;
    const mine = new Set(folders.map((f) => f.id));
    return state.folderItems.filter((i) => mine.has(i.folderId));
  }, [state, folders]);
}

/** Published collections anyone can open. */
export function usePublicCollections(): Folder[] | undefined {
  const state = useLearnState();
  return useMemo(() => state ? [] : undefined, [state]);
}

export function useFolder(id: string | undefined): Folder | null | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  if (!state || !viewer) return undefined;
  const folder = id ? state.folders[id] : undefined;
  if (!folder) return null;
  if (folder.ownerId === viewer.id) return folder;
  return folder.collection?.publishedAt && folder.collection.visibility !== "private" ? folder : null;
}

export function useCollectionLessons(folderId: string | undefined): Lesson[] | undefined {
  const state = useLearnState();
  return useMemo(() => {
    if (!state || !folderId) return undefined;
    const ids = descendantFolderIds(state, folderId);
    return Object.values(state.lessons).filter((l) => l.folderId && ids.has(l.folderId) && !l.archived);
  }, [state, folderId]);
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

export function useCurriculumNodes(): CurriculumNode[] | undefined {
  const state = useLearnState();
  return useMemo(() => state ? Object.values(state.curriculum).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)) : undefined, [state]);
}

export function useMyCourses(): MyCourse[] | undefined {
  return usePersonal()?.courses;
}

export function useSaved(): SavedItem[] | undefined {
  const mine = usePersonal();
  return useMemo(() => mine ? [...mine.saves].sort((a, b) => b.createdAt - a.createdAt) : undefined, [mine]);
}

export function useHighlights(lessonId: string): Highlight[] | undefined {
  const mine = usePersonal();
  return useMemo(() => mine?.highlights.filter((h) => h.lessonId === lessonId), [mine, lessonId]);
}

export function useNotes(lessonId?: string): PersonalNote[] | undefined {
  const mine = usePersonal();
  return useMemo(() => mine?.notes.filter((n) => !lessonId || n.lessonId === lessonId), [mine, lessonId]);
}

export function useProgress(): Record<string, LessonProgress> | undefined {
  const viewer = useLearnViewer(); const auth = useConvexAuth();
  useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => targetGeneration, () => 0);
  const targets = [...progressTargets.entries()].filter(([key]) => key.startsWith((viewer?.id ?? "guest") + ":")).map(([, value]) => value);
  const queries = Object.fromEntries(auth.isAuthenticated ? targets.map(target => [target.lessonId, { query: api.learnCommunity.getProgress, args: { lessonId: target.lessonId, versionId: target.versionId } }]) : []);
  const rows = useQueries(queries);
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
  const mine = usePersonal();
  return mine ? mine.votes[lessonId] ?? null : undefined;
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
  const state = useLearnState();
  return useMemo(() => state?.threads.filter((t) => t.lessonId === lessonId).sort((a, b) => a.createdAt - b.createdAt), [state, lessonId]);
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

export function useFlashcardSets(): FlashcardSet[] | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return useMemo(() => state && viewer ? Object.values(state.flashcards).filter((f) => f.ownerId === viewer.id).sort((a, b) => b.updatedAt - a.updatedAt) : undefined, [state, viewer]);
}

export function useFlashcardSet(id: string | undefined): FlashcardSet | null | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  if (!state || !viewer) return undefined;
  const set = id ? state.flashcards[id] : undefined;
  if (!set) return null;
  return set.ownerId === viewer.id || set.visibility !== "private" ? set : null;
}

export function useLessonFlashcards(lessonId: string): FlashcardSet[] | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return useMemo(() => state && viewer ? Object.values(state.flashcards).filter((f) => f.lessonId === lessonId && (f.ownerId === viewer.id || f.visibility === "public")) : undefined, [state, viewer, lessonId]);
}

export function useCardReviews(setId: string) {
  const mine = usePersonal();
  return useMemo(() => mine?.reviews.filter((r) => r.setId === setId), [mine, setId]);
}

export function useTutorThread(lessonId: string): TutorMessage[] | undefined {
  const mine = usePersonal();
  return mine ? mine.tutor[lessonId] ?? [] : undefined;
}

export function usePinnedFolders(): string[] | undefined {
  return usePersonal()?.pinnedFolders;
}

/** Filled by the learning-state backend; empty until then (`capabilities.weakAreas`). */
export function useWeakAreas(): WeakArea[] | undefined {
  return EMPTY_WEAK;
}
const EMPTY_WEAK: WeakArea[] = [];

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
        if (input.folderId) throw new LearnError("Folder membership is not wired to durable Learn yet. Create at the library root.");
        return client.mutation(api.lessons.create, { metadata: durableMetadata(blankMeta(input.language, input.title || "Untitled lesson")), document: toDurableDocument(input.content ?? []) });
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
      recordView(id: string) {
        writeState((s) => {
          const l = s.lessons[id];
          if (!l) return s;
          const mine = personal(s, me);
          const seenRecently = (mine.recent[id] ?? 0) > Date.now() - 30 * 60_000;
          const lessons = l.ownerId === me || seenRecently ? s.lessons : { ...s.lessons, [id]: { ...l, stats: { ...l.stats, views: l.stats.views + 1 } } };
          return { ...s, lessons, mine: { ...s.mine, [me]: { ...mine, recent: { ...mine.recent, [id]: Date.now() } } } };
        });
      },
      vote(id: string, vote: "helpful" | "not_helpful" | null) {
        requireSignIn();
        writeState((s) => {
          const l = s.lessons[id];
          if (!l || l.ownerId === me) return s;
          const mine = personal(s, me);
          const before = mine.votes[id];
          const stats = { ...l.stats };
          if (before === "helpful") stats.helpful--;
          if (before === "not_helpful") stats.notHelpful--;
          if (vote === "helpful") stats.helpful++;
          if (vote === "not_helpful") stats.notHelpful++;
          const votes = { ...mine.votes };
          if (vote) votes[id] = vote; else delete votes[id];
          return { ...s, lessons: { ...s.lessons, [id]: { ...l, stats } }, mine: { ...s.mine, [me]: { ...mine, votes } } };
        });
      },

      /* Saves, highlights, notes, progress: private to this person. */
      saveLesson(lesson: Lesson) {
        requireSignIn();
        writeState((s) => {
          const mine = personal(s, me);
          if (mine.saves.some((x) => x.kind === "lesson" && x.lessonId === lesson.id)) return s;
          const item: SavedItem = { id: newId("save"), kind: "lesson", lessonId: lesson.id, lessonTitle: (lesson.published ?? lesson.draft).meta.title, createdAt: Date.now() };
          const l = s.lessons[lesson.id];
          const lessons = l && l.ownerId !== me ? { ...s.lessons, [l.id]: { ...l, stats: { ...l.stats, saves: l.stats.saves + 1 } } } : s.lessons;
          return { ...s, lessons, mine: { ...s.mine, [me]: { ...mine, saves: [item, ...mine.saves] } } };
        });
      },
      saveBlock(lesson: Lesson, blockId: string, excerptText: string, imageUrl?: string) {
        requireSignIn();
        updatePersonal(me, (mine) => mine.saves.some((x) => x.kind === "block" && x.lessonId === lesson.id && x.blockId === blockId) ? mine : {
          ...mine, saves: [{ id: newId("save"), kind: "block", lessonId: lesson.id, lessonTitle: (lesson.published ?? lesson.draft).meta.title, blockId, excerpt: makeExcerpt(excerptText, 280), imageUrl, createdAt: Date.now() }, ...mine.saves],
        });
      },
      removeSave(saveId: string) {
        writeState((s) => {
          const mine = personal(s, me);
          const item = mine.saves.find((x) => x.id === saveId);
          if (!item) return s;
          const l = item.kind === "lesson" ? s.lessons[item.lessonId] : undefined;
          const lessons = l && l.ownerId !== me ? { ...s.lessons, [l.id]: { ...l, stats: { ...l.stats, saves: Math.max(0, l.stats.saves - 1) } } } : s.lessons;
          return { ...s, lessons, mine: { ...s.mine, [me]: { ...mine, saves: mine.saves.filter((x) => x.id !== saveId) } } };
        });
      },
      addHighlight(h: { lessonId: string; blockId: string; quote: string; offset: number; color: HighlightColor }) {
        requireSignIn();
        updatePersonal(me, (mine) => ({ ...mine, highlights: [...mine.highlights, { ...h, quote: h.quote.slice(0, 2000), id: newId("hl"), createdAt: Date.now() }] }));
      },
      removeHighlight(id: string) {
        updatePersonal(me, (mine) => ({ ...mine, highlights: mine.highlights.filter((h) => h.id !== id) }));
      },
      upsertNote(note: { id?: string; lessonId: string; blockId: string; body: string }) {
        requireSignIn();
        const now = Date.now();
        updatePersonal(me, (mine) => {
          const body = note.body.slice(0, 5000);
          if (note.id && mine.notes.some((n) => n.id === note.id)) return { ...mine, notes: mine.notes.map((n) => n.id === note.id ? { ...n, body, updatedAt: now } : n) };
          return { ...mine, notes: [...mine.notes, { id: newId("note"), lessonId: note.lessonId, blockId: note.blockId, body, createdAt: now, updatedAt: now }] };
        });
      },
      deleteNote(id: string) {
        updatePersonal(me, (mine) => ({ ...mine, notes: mine.notes.filter((n) => n.id !== id) }));
      },
      setProgress(lessonId: string, patch: { state?: ProgressState; lastBlockId?: string; percent?: number }): Promise<void> {
        requireSignIn();
        const key = me + ":" + lessonId;
        const target = progressTargets.get(key);
        if (!target) return Promise.reject(new LearnError("Open the published lesson before recording progress."));
        if (patch.state === "not_started") return Promise.reject(new LearnError("Progress reset is not supported by the durable backend; existing evidence is preserved."));
        return progressService.save(target, patch);
      },

      /* Library folders and collections. */
      createFolder(name: string, parentId?: string): string {
        requireSignIn();
        const id = newId("folder");
        const now = Date.now();
        writeState((s) => {
          if (parentId && s.folders[parentId]?.ownerId !== me) throw new LearnError("NOT_FOUND");
          return { ...s, folders: { ...s.folders, [id]: { id, ownerId: me, name: name.trim().slice(0, 120) || "Untitled folder", parentId, createdAt: now, updatedAt: now } } };
        });
        return id;
      },
      renameFolder(id: string, name: string) {
        writeState((s) => {
          const f = s.folders[id];
          if (f?.ownerId !== me) throw new LearnError("NOT_FOUND");
          return { ...s, folders: { ...s.folders, [id]: { ...f, name: name.trim().slice(0, 120) || f.name, updatedAt: Date.now() } } };
        });
      },
      /** Refuses moves into itself or its own subfolders. */
      moveFolder(id: string, parentId: string | undefined) {
        writeState((s) => {
          const f = s.folders[id];
          if (f?.ownerId !== me || (parentId && s.folders[parentId]?.ownerId !== me)) throw new LearnError("NOT_FOUND");
          if (parentId && descendantFolderIds(s, id).has(parentId)) throw new LearnError("FOLDER_CYCLE");
          return { ...s, folders: { ...s.folders, [id]: { ...f, parentId, updatedAt: Date.now() } } };
        });
      },
      archiveFolder(id: string, archived = true) {
        writeState((s) => {
          const f = s.folders[id];
          if (f?.ownerId !== me) throw new LearnError("NOT_FOUND");
          const ids = descendantFolderIds(s, id);
          const folders = { ...s.folders };
          for (const fid of ids) folders[fid] = { ...folders[fid], archived };
          return { ...s, folders };
        });
      },
      duplicateFolder(id: string): string {
        requireSignIn();
        const newRoot = newId("folder");
        writeState((s) => {
          const root = s.folders[id];
          if (root?.ownerId !== me) throw new LearnError("NOT_FOUND");
          const now = Date.now();
          const map = new Map<string, string>([[id, newRoot]]);
          for (const fid of descendantFolderIds(s, id)) if (!map.has(fid)) map.set(fid, newId("folder"));
          const folders = { ...s.folders };
          for (const [oldId, nid] of map) {
            const f = s.folders[oldId];
            folders[nid] = { ...f, id: nid, name: oldId === id ? `${f.name} (copy)` : f.name, parentId: oldId === id ? f.parentId : map.get(f.parentId!), collection: f.collection ? { ...f.collection, publishedAt: undefined, visibility: "private" } : undefined, createdAt: now, updatedAt: now };
          }
          // Items are references, so the copy points at the same forms and lessons stay where they are.
          const items = s.folderItems.filter((i) => map.has(i.folderId)).map((i) => ({ ...i, folderId: map.get(i.folderId)!, addedAt: now }));
          return { ...s, folders, folderItems: [...s.folderItems, ...items] };
        });
        return newRoot;
      },
      moveLesson(lessonId: string, folderId: string | undefined) {
        writeState((s) => {
          const l = requireOwned(s, lessonId, me);
          if (folderId && s.folders[folderId]?.ownerId !== me) throw new LearnError("NOT_FOUND");
          return putLesson(s, { ...l, folderId });
        });
      },
      addToFolder(item: { folderId: string; kind: Exclude<LibraryItemKind, "lesson">; refId: string; title: string }) {
        writeState((s) => {
          if (s.folders[item.folderId]?.ownerId !== me) throw new LearnError("NOT_FOUND");
          const rest = s.folderItems.filter((i) => !(i.kind === item.kind && i.refId === item.refId && s.folders[i.folderId]?.ownerId === me));
          return { ...s, folderItems: [...rest, { ...item, addedAt: Date.now() }] };
        });
      },
      removeFromFolder(kind: LibraryItemKind, refId: string) {
        writeState((s) => ({ ...s, folderItems: s.folderItems.filter((i) => !(i.kind === kind && i.refId === refId && s.folders[i.folderId]?.ownerId === me)) }));
      },
      togglePinnedFolder(id: string) {
        updatePersonal(me, (mine) => ({ ...mine, pinnedFolders: mine.pinnedFolders.includes(id) ? mine.pinnedFolders.filter((x) => x !== id) : [...mine.pinnedFolders, id] }));
      },
      setCollection(id: string, collection: Folder["collection"]) {
        writeState((s) => {
          const f = s.folders[id];
          if (f?.ownerId !== me) throw new LearnError("NOT_FOUND");
          return { ...s, folders: { ...s.folders, [id]: { ...f, collection, updatedAt: Date.now() } } };
        });
      },

      /* Curriculum: the local store lets people build their own tree until the shared directory exists. */
      addCurriculumNode(node: Omit<CurriculumNode, "id">): string {
        requireSignIn();
        const id = newId("cur");
        writeState((s) => ({ ...s, curriculum: { ...s.curriculum, [id]: { ...node, name: node.name.trim().slice(0, 160), id } } }));
        return id;
      },
      renameCurriculumNode(id: string, name: string) {
        writeState((s) => s.curriculum[id] ? { ...s, curriculum: { ...s.curriculum, [id]: { ...s.curriculum[id], name: name.trim().slice(0, 160) || s.curriculum[id].name } } } : s);
      },
      setCurrentVersion(versionId: string) {
        writeState((s) => {
          const v = s.curriculum[versionId];
          if (v?.kind !== "version") return s;
          const curriculum = { ...s.curriculum };
          for (const n of Object.values(curriculum)) if (n.kind === "version" && n.parentId === v.parentId) curriculum[n.id] = { ...n, current: n.id === versionId };
          return { ...s, curriculum };
        });
      },
      followCourse(moduleId: string, versionId: string) {
        requireSignIn();
        updatePersonal(me, (mine) => mine.courses.some((c) => c.moduleId === moduleId) ? mine : { ...mine, courses: [...mine.courses, { moduleId, versionId, addedAt: Date.now() }] });
      },
      unfollowCourse(moduleId: string) {
        updatePersonal(me, (mine) => ({ ...mine, courses: mine.courses.filter((c) => c.moduleId !== moduleId) }));
      },
      openCourse(moduleId: string) {
        updatePersonal(me, (mine) => ({ ...mine, courses: mine.courses.map((c) => c.moduleId === moduleId ? { ...c, lastOpenedAt: Date.now() } : c) }));
      },

      /* Community. */
      startThread(input: { lessonId: string; blockId?: string; anchorExcerpt?: string; body: string }): string {
        requireSignIn();
        const id = newId("thread");
        const now = Date.now();
        const body = input.body.trim().slice(0, 4000);
        if (!body) throw new LearnError("EMPTY");
        writeState((s) => ({ ...s, threads: [...s.threads, { id, lessonId: input.lessonId, blockId: input.blockId, anchorExcerpt: input.anchorExcerpt && makeExcerpt(input.anchorExcerpt, 140), resolved: false, createdAt: now, comments: [{ id: newId("c"), authorId: me, authorName: myName, body, createdAt: now, moderation: "ok" }] }] }));
        return id;
      },
      reply(threadId: string, body: string) {
        requireSignIn();
        const text = body.trim().slice(0, 4000);
        if (!text) throw new LearnError("EMPTY");
        writeState((s) => ({ ...s, threads: s.threads.map((t) => t.id === threadId ? { ...t, comments: [...t.comments, { id: newId("c"), authorId: me, authorName: myName, body: text, createdAt: Date.now(), moderation: "ok" as const }] } : t) }));
      },
      /** Thread starter or lesson owner can resolve. */
      resolveThread(threadId: string, resolved: boolean) {
        writeState((s) => ({
          ...s, threads: s.threads.map((t) => {
            if (t.id !== threadId) return t;
            const owner = s.lessons[t.lessonId]?.ownerId === me;
            if (!owner && t.comments[0]?.authorId !== me) throw new LearnError("FORBIDDEN");
            return { ...t, resolved };
          }),
        }));
      },
      deleteComment(threadId: string, commentId: string) {
        writeState((s) => ({
          ...s, threads: s.threads.map((t) => t.id !== threadId ? t : { ...t, comments: t.comments.map((c) => c.id === commentId && c.authorId === me ? { ...c, body: "", moderation: "removed" as const } : c) }),
        }));
      },
      report(target: ReportTarget, reason: ReportReason, details: string) {
        requireSignIn();
        writeState((s) => ({ ...s, reports: [...s.reports, { id: newId("report"), target, reason, details: details.trim().slice(0, 2000), createdAt: Date.now(), status: "open" }] }));
      },

      /* Profiles and verification. */
      updateProfile(patch: Partial<Pick<Person, "name" | "bio" | "username">>) {
        requireSignIn();
        writeState((s) => {
          const current = s.people[me] ?? { id: me, name: myName, affiliations: [], verifications: [] };
          return { ...s, people: { ...s.people, [me]: { ...current, ...patch, bio: patch.bio?.slice(0, 600) ?? current.bio } } };
        });
      },
      /** Records a pending request locally; review needs the backend (`capabilities.verification`). */
      requestVerification(kind: VerificationKind, institution: string) {
        requireSignIn();
        writeState((s) => {
          const current = s.people[me] ?? { id: me, name: myName, affiliations: [], verifications: [] };
          const verifications = [...current.verifications.filter((v) => v.kind !== kind), { kind, status: "pending" as const, institution: institution.trim().slice(0, 160), submittedAt: Date.now() }];
          return { ...s, people: { ...s.people, [me]: { ...current, verifications } } };
        });
      },

      /* Flashcards. */
      createFlashcardSet(input: { title: string; lessonId?: string; cards?: Flashcard[] }): string {
        requireSignIn();
        const id = newId("cards");
        const now = Date.now();
        writeState((s) => ({ ...s, flashcards: { ...s.flashcards, [id]: { id, ownerId: me, ownerName: myName, title: input.title.trim().slice(0, 160) || "Untitled set", description: "", lessonId: input.lessonId, cards: input.cards ?? [], visibility: "private", createdAt: now, updatedAt: now } } }));
        return id;
      },
      updateFlashcardSet(id: string, patch: Partial<Pick<FlashcardSet, "title" | "description" | "cards" | "visibility" | "lessonId">>) {
        writeState((s) => {
          const set = s.flashcards[id];
          if (set?.ownerId !== me) throw new LearnError("NOT_FOUND");
          const cards = patch.cards?.slice(0, 500).map((c) => ({ ...c, front: c.front.slice(0, 1000), back: c.back.slice(0, 2000) }));
          return { ...s, flashcards: { ...s.flashcards, [id]: { ...set, ...patch, ...(cards ? { cards } : {}), updatedAt: Date.now() } } };
        });
      },
      deleteFlashcardSet(id: string) {
        writeState((s) => {
          if (s.flashcards[id]?.ownerId !== me) throw new LearnError("NOT_FOUND");
          const flashcards = { ...s.flashcards };
          delete flashcards[id];
          return { ...s, flashcards };
        });
      },
      forkFlashcardSet(id: string): string {
        requireSignIn();
        const forkId = newId("cards");
        writeState((s) => {
          const src = s.flashcards[id];
          if (!src || src.visibility === "private") throw new LearnError("NOT_FOUND");
          const now = Date.now();
          return { ...s, flashcards: { ...s.flashcards, [forkId]: { ...src, id: forkId, ownerId: me, ownerName: myName, visibility: "private", cards: src.cards.map((c) => ({ ...c, id: newId("card") })), forkedFrom: { kind: "flashcards", sourceId: src.id, sourceTitle: src.title, authorId: src.ownerId, authorName: src.ownerName, forkedAt: now }, createdAt: now, updatedAt: now } } };
        });
        return forkId;
      },
      /** Leitner boxes: right moves a card up a box, wrong sends it back to box 1. */
      reviewCard(setId: string, cardId: string, knewIt: boolean) {
        updatePersonal(me, (mine) => {
          const current = mine.reviews.find((r) => r.setId === setId && r.cardId === cardId);
          const box = knewIt ? Math.min(5, (current?.box ?? 0) + 1) : 1;
          return { ...mine, reviews: [...mine.reviews.filter((r) => r !== current), { setId, cardId, box, reviewedAt: Date.now() }] };
        });
      },
      resetReviews(setId: string) {
        updatePersonal(me, (mine) => ({ ...mine, reviews: mine.reviews.filter((r) => r.setId !== setId) }));
      },

      /**
       * Fork a quiz attached to a public lesson into the reader’s Chaos library as a draft with provenance.
       * Needs the backend: the browser never sees answer keys, so it cannot copy a quiz faithfully.
       */
      async forkQuiz(formId: string, from: { lessonId: string }): Promise<string> {
        requireSignIn();
        void formId; void from;
        throw new LearnError("BACKEND_REQUIRED");
      },

      /* Tutor conversation history (answers come from the backend when `capabilities.ai`). */
      appendTutor(lessonId: string, message: Omit<TutorMessage, "id" | "createdAt">) {
        updatePersonal(me, (mine) => ({ ...mine, tutor: { ...mine.tutor, [lessonId]: [...(mine.tutor[lessonId] ?? []), { ...message, id: newId("msg"), createdAt: Date.now() }].slice(-100) } }));
      },
      clearTutor(lessonId: string) {
        updatePersonal(me, (mine) => { const tutor = { ...mine.tutor }; delete tutor[lessonId]; return { ...mine, tutor }; });
      },
    };
  }, [me, myName, requireSignIn, client, service, progressService]);
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
export function useAllHighlights(): Highlight[] | undefined {
  const mine = usePersonal();
  return useMemo(() => mine?.highlights.slice().sort((a, b) => b.createdAt - a.createdAt), [mine]);
}

/** Titles for lesson ids, for lists that reference lessons (saved items, notes). */
export function useLessonTitles(): ((id: string) => string | undefined) | undefined {
  const state = useLearnState();
  return useMemo(() => state ? (id: string) => { const l = state.lessons[id]; return l ? (l.published ?? l.draft).meta.title : undefined; } : undefined, [state]);
}

/** Ids for client-created parts of a lesson (cards, sources). */
export { newId } from "./localStore";
/** Lesson file storage (images, PDFs). Stored references resolve to displayable URLs. */
export { putFile as uploadLearnFile, resolveFileUrl as resolveLearnFileUrl, MAX_FILE_BYTES as LEARN_MAX_FILE_BYTES } from "./localStore";
