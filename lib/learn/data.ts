"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import { cloneWithNewIds, documentText, excerpt as makeExcerpt } from "./doc";
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
  sharedPublishing: false, versionRestore: true, ai: false, verification: false, discussions: true, reports: true,
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

export function useMyLessons(): Lesson[] | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return useMemo(() => state && viewer
    ? Object.values(state.lessons).filter((l) => l.ownerId === viewer.id && !l.archived).sort((a, b) => b.updatedAt - a.updatedAt)
    : undefined, [state, viewer]);
}

export function useArchivedLessons(): Lesson[] | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  return useMemo(() => state && viewer ? Object.values(state.lessons).filter((l) => l.ownerId === viewer.id && l.archived) : undefined, [state, viewer]);
}

/** `null` when missing or not readable by this person. Owners always see their own lessons. */
export function useLesson(id: string | undefined): Lesson | null | undefined {
  const state = useLearnState();
  const viewer = useLearnViewer();
  if (!state || !viewer) return undefined;
  const lesson = id ? state.lessons[id] : undefined;
  if (!lesson) return null;
  if (lesson.ownerId === viewer.id) return lesson;
  if (!lesson.published || lesson.visibility === "private" || lesson.archived) return null;
  return lesson;
}

/** Published, public, not removed. Unlisted lessons are readable by link but never listed. */
export function isListed(lesson: Lesson): boolean {
  return !!lesson.published && lesson.visibility === "public" && !lesson.archived && (lesson.moderation === "ok" || lesson.moderation === "under_review");
}

export function usePublicLessons(filters: SearchFilters = {}): Lesson[] | undefined {
  const state = useLearnState();
  const key = JSON.stringify(filters);
  return useMemo(() => {
    if (!state) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- key tracks filter identity
    key;
    return searchLessons(Object.values(state.lessons).filter(isListed), state.curriculum, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters are compared by value through key
  }, [state, key]);
}

export function useLessonVersions(lessonId: string | undefined): LessonVersion[] | undefined {
  const state = useLearnState();
  return useMemo(() => state ? state.versions.filter((v) => v.lessonId === lessonId).sort((a, b) => b.version - a.version) : undefined, [state, lessonId]);
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
  return useMemo(() => state ? Object.values(state.folders).filter((f) => f.collection?.visibility === "public" && f.collection.publishedAt && !f.archived) : undefined, [state]);
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
  return usePersonal()?.progress;
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
  const me = viewer?.id ?? "guest";
  const myName = viewer?.name ?? "";
  const requireSignIn = useCallback(() => { if (!viewer?.signedIn) throw new LearnError("SIGN_IN_REQUIRED"); }, [viewer]);

  return useMemo(() => {
    const editLesson = (id: string, recipe: (lesson: Lesson, now: number) => Lesson) => {
      requireSignIn();
      writeState((s) => { const now = Date.now(); return putLesson(s, { ...recipe(requireOwned(s, id, me), now), updatedAt: now }); });
    };

    return {
      createLesson(input: { language: string; folderId?: string; title?: string; content?: unknown[] } = { language: "en" }): string {
        requireSignIn();
        const id = newId("lesson");
        const now = Date.now();
        writeState((s) => putLesson(s, {
          id, ownerId: me, ownerName: myName, draft: { meta: blankMeta(input.language, input.title), content: input.content ?? [], updatedAt: now },
          visibility: "private", folderId: input.folderId, sources: [], quizzes: [],
          stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, moderation: "ok", quality: "none", createdAt: now, updatedAt: now,
        }));
        return id;
      },
      saveDraftContent(id: string, content: unknown[]) {
        editLesson(id, (l, now) => ({ ...l, draft: { ...l.draft, content, updatedAt: now } }));
      },
      saveDraftMeta(id: string, patch: Partial<LessonMeta>) {
        editLesson(id, (l, now) => ({ ...l, draft: { ...l.draft, meta: { ...l.draft.meta, ...patch, ...(patch.tags ? { tags: cleanTags(patch.tags) } : {}) }, updatedAt: now } }));
      },
      setVisibility(id: string, visibility: Visibility) {
        editLesson(id, (l) => ({ ...l, visibility }));
      },
      setSources(id: string, sources: LessonSource[]) {
        editLesson(id, (l) => ({ ...l, sources }));
      },
      setQuizzes(id: string, quizzes: AttachedQuiz[]) {
        editLesson(id, (l) => ({ ...l, quizzes: quizzes.map((q, order) => ({ ...q, order })) }));
      },
      /** Publishes the current draft as a new version. Moderated-away lessons cannot republish until reviewed. */
      publish(id: string, note?: string): number {
        requireSignIn();
        let version = 0;
        writeState((s) => {
          const l = requireOwned(s, id, me);
          if (l.moderation === "removed") throw new LearnError("REMOVED");
          if (!l.draft.meta.title.trim()) throw new LearnError("TITLE_REQUIRED");
          const now = Date.now();
          version = (l.published?.version ?? 0) + 1;
          const published = { version, meta: l.draft.meta, content: l.draft.content, publishedAt: now };
          return {
            ...putLesson(s, { ...l, published, publishedDraftAt: l.draft.updatedAt, updatedAt: now }),
            versions: [...s.versions, { lessonId: id, version, meta: l.draft.meta, content: l.draft.content, publishedAt: now, publishedBy: myName, note: note?.trim() || undefined }],
          };
        });
        return version;
      },
      unpublish(id: string) {
        editLesson(id, (l) => ({ ...l, published: undefined, publishedDraftAt: undefined }));
      },
      discardDraft(id: string) {
        editLesson(id, (l, now) => l.published ? { ...l, draft: { meta: l.published.meta, content: l.published.content, updatedAt: now }, publishedDraftAt: now } : l);
      },
      /** Copies an old version into the draft. Publishing it is a separate, visible step. */
      restoreVersion(id: string, version: number) {
        requireSignIn();
        writeState((s) => {
          const l = requireOwned(s, id, me);
          const v = s.versions.find((x) => x.lessonId === id && x.version === version);
          if (!v) throw new LearnError("NOT_FOUND");
          const now = Date.now();
          return putLesson(s, { ...l, draft: { meta: v.meta, content: v.content, updatedAt: now }, updatedAt: now });
        });
      },
      archiveLesson(id: string, archived = true) {
        editLesson(id, (l) => ({ ...l, archived }));
      },
      deleteLesson(id: string) {
        requireSignIn();
        writeState((s) => {
          requireOwned(s, id, me);
          const lessons = { ...s.lessons };
          delete lessons[id];
          return { ...s, lessons, versions: s.versions.filter((v) => v.lessonId !== id), threads: s.threads.filter((t) => t.lessonId !== id) };
        });
      },
      duplicateLesson(id: string): string {
        requireSignIn();
        const copyId = newId("lesson");
        writeState((s) => {
          const l = requireOwned(s, id, me);
          const now = Date.now();
          return putLesson(s, {
            ...l, id: copyId, draft: { meta: { ...l.draft.meta, title: `${l.draft.meta.title} (copy)`.trim() }, content: cloneWithNewIds(l.draft.content, () => newId("b")), updatedAt: now },
            published: undefined, publishedDraftAt: undefined, visibility: "private", stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 },
            moderation: "ok", quality: "none", externalRef: undefined, createdAt: now, updatedAt: now,
          });
        });
        return copyId;
      },
      /** Fork: an editable private copy of the published version, keeping visible attribution. */
      forkLesson(id: string): string {
        requireSignIn();
        const forkId = newId("lesson");
        writeState((s) => {
          const src = s.lessons[id];
          if (!src?.published || src.visibility === "private" || src.moderation === "removed") throw new LearnError("NOT_FOUND");
          const now = Date.now();
          const origin = src.forkedFrom ? { originId: src.forkedFrom.originId ?? src.forkedFrom.sourceId, originTitle: src.forkedFrom.originTitle ?? src.forkedFrom.sourceTitle } : {};
          const fork: Lesson = {
            id: forkId, ownerId: me, ownerName: myName,
            draft: { meta: { ...src.published.meta, indexing: "noindex" }, content: cloneWithNewIds(src.published.content, () => newId("b")), updatedAt: now },
            visibility: "private", sources: src.sources, quizzes: [],
            forkedFrom: { kind: "lesson", sourceId: src.id, sourceVersion: src.published.version, sourceTitle: src.published.meta.title, authorId: src.ownerId, authorName: src.ownerName, forkedAt: now, ...origin },
            stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, moderation: "ok", quality: "none", createdAt: now, updatedAt: now,
          };
          return { ...s, lessons: { ...s.lessons, [forkId]: fork, [src.id]: { ...src, stats: { ...src.stats, forks: src.stats.forks + 1 } } } };
        });
        return forkId;
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
      setProgress(lessonId: string, patch: { state?: ProgressState; lastBlockId?: string; percent?: number }) {
        updatePersonal(me, (mine) => {
          const current = mine.progress[lessonId] ?? { lessonId, state: "not_started" as const, percent: 0, updatedAt: 0 };
          const percent = Math.max(current.percent, Math.min(100, Math.round(patch.percent ?? current.percent)));
          // Completed stays completed until the reader resets it on purpose.
          const state = patch.state ?? (current.state === "completed" ? "completed" : percent > 0 || patch.lastBlockId ? "in_progress" : current.state);
          const next = { ...current, ...patch, state, percent: state === "not_started" ? 0 : percent, updatedAt: Date.now() };
          if (patch.state === "not_started") { next.percent = 0; next.lastBlockId = undefined; }
          return { ...mine, progress: { ...mine.progress, [lessonId]: next } };
        });
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
  }, [me, myName, requireSignIn]);
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
