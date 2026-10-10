"use client";

import { parseStoredJson } from "@/lib/storageJson";

import type {
  CardReview, ContentReport, CurriculumNode, DiscussionThread, FlashcardSet, Folder, FolderItem, Highlight, Lesson,
  LessonProgress, LessonVersion, MyCourse, PersonalNote, Person, SavedItem,
} from "./types";

/**
 * Learn's device-local compatibility store: one JSON document in localStorage,
 * shared on this browser, with personal state under `mine[viewerId]`. Legacy asset
 * snapshots, recent items, profile edits and folder pins still have local readers.
 * Legacy `chaos-learn-file:` references resolve files from this browser's IndexedDB.
 *
 * Lessons, publication/version history, library assets, discussions, reports and
 * signed-in study already use Convex through the Learn hooks and service clients.
 * Public visibility and access are decided by those server APIs; local snapshots
 * remain device-only compatibility data. Preserve storage keys, schema and legacy
 * file resolution until their readers have a verified migration.
 */

export interface LearnState {
  v: 1;
  lessons: Record<string, Lesson>;
  versions: LessonVersion[];
  folders: Record<string, Folder>;
  folderItems: FolderItem[];
  curriculum: Record<string, CurriculumNode>;
  people: Record<string, Person>;
  flashcards: Record<string, FlashcardSet>;
  threads: DiscussionThread[];
  reports: ContentReport[];
  /** Everything below is private to one person, keyed by their id. */
  mine: Record<string, PersonalState>;
}

export interface PersonalState {
  courses: MyCourse[];
  saves: SavedItem[];
  highlights: Highlight[];
  notes: PersonalNote[];
  progress: Record<string, LessonProgress>;
  votes: Record<string, "helpful" | "not_helpful">;
  recent: Record<string, number>;
  reviews: CardReview[];
  pinnedFolders: string[];
}

const KEY = "chaos.learn.v1";
const EVENT = "chaos-learn-change";

export const emptyPersonal = (): PersonalState => ({
  courses: [], saves: [], highlights: [], notes: [], progress: {}, votes: {}, recent: {}, reviews: [], pinnedFolders: [],
});

export const emptyState = (): LearnState => ({
  v: 1, lessons: {}, versions: [], folders: {}, folderItems: [], curriculum: {}, people: {}, flashcards: {}, threads: [], reports: [], mine: {},
});

let cache: { raw: string | null; state: LearnState } | null = null;
let memoryOnly: LearnState | null = null;

function parse(raw: string | null): LearnState {
  const parsed = parseStoredJson<Partial<LearnState> & { v: 1 }>(
    raw, () => ({ v: 1 }), (value): value is Partial<LearnState> & { v: 1 } =>
      value !== null && typeof value === "object" && (value as { v?: unknown }).v === 1,
  );
  return { ...emptyState(), ...parsed } as LearnState;
}

export function readState(): LearnState {
  if (typeof window === "undefined") return EMPTY;
  if (memoryOnly) return memoryOnly;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (cache && cache.raw === raw) return cache.state;
  cache = { raw, state: parse(raw) };
  return cache.state;
}

const EMPTY = emptyState();
export const serverState = () => EMPTY;

/** Applies a change and notifies every subscriber. The recipe returns a new state; never mutate the old one. */
export function writeState(recipe: (state: LearnState) => LearnState) {
  const next = recipe(readState());
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, raw);
    cache = { raw, state: next };
    memoryOnly = null;
  } catch {
    // Quota or private mode: keep working for this tab rather than losing the edit.
    memoryOnly = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onStorage); };
}

export function personal(state: LearnState, userId: string): PersonalState {
  return { ...emptyPersonal(), ...state.mine[userId] };
}

export function updatePersonal(userId: string, recipe: (mine: PersonalState) => PersonalState) {
  writeState((s) => ({ ...s, mine: { ...s.mine, [userId]: recipe(personal(s, userId)) } }));
}

export const newId = (prefix: string) =>
  `${prefix}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2, 18)}`;

/* ── Files ────────────────────────────────────────────────────────────────── */

/** Stored in lesson documents instead of blob URLs, which die with the tab. */
export const FILE_SCHEME = "chaos-learn-file:";
const DB = "chaos-learn-files";
const STORE = "files";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putFile(file: Blob): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
  const id = newId("file");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return FILE_SCHEME + id;
}

const urls = new Map<string, Promise<string>>();

/** Turns a stored file reference into something an <img>/<a> can use. Other URLs pass through. */
export function resolveFileUrl(url: string): Promise<string> {
  if (!url.startsWith(FILE_SCHEME)) return Promise.resolve(url);
  let pending = urls.get(url);
  if (!pending) {
    pending = openDb().then((db) => new Promise<string>((resolve) => {
      const request = db.transaction(STORE).objectStore(STORE).get(url.slice(FILE_SCHEME.length));
      request.onsuccess = () => resolve(request.result instanceof Blob ? URL.createObjectURL(request.result) : "");
      request.onerror = () => resolve("");
    })).catch(() => "");
    urls.set(url, pending);
  }
  return pending;
}
