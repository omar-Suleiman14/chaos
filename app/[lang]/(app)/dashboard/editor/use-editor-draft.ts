"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type EditorDraft, parseRecovery, publicationProblems, questionPayload, recoveryRecord } from "./editor-draft";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "offline" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

function errorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  // Convex prefixes server errors with request metadata; keep the readable part.
  const match = raw.match(/(?:Uncaught Error: )?([A-Z_]+: [\s\S]*?)(?:\n\s+at |$)/);
  return match?.[1]?.trim() || raw || fallback;
}

export function useEditorDraft(quizId: Id<"quizzes"> | null, userId: string | undefined) {
  const saveQuizDraft = useMutation(api.quizFunctions.saveQuizDraft);
  const publishQuiz = useMutation(api.quizFunctions.publishQuiz);
  const unpublishQuiz = useMutation(api.quizFunctions.unpublishQuiz);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const current = useRef<EditorDraft | null>(null);
  const baseline = useRef("");
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const revisionRef = useRef<number | undefined>(undefined);
  const past = useRef<EditorDraft[]>([]);
  const future = useRef<EditorDraft[]>([]);
  const busy = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<ReturnType<typeof parseRecovery>>(null);
  const [publishProblems, setPublishProblems] = useState<string[]>([]);
  const key = quizId && userId ? `chaos-editor-v2:${userId}:${quizId}` : null;

  const adoptRevision = (value: number | undefined) => {
    revisionRef.current = value;
    setRevision(value);
  };

  const persist = useCallback((value: EditorDraft) => {
    if (!key) return;
    try {
      localStorage.setItem(key, recoveryRecord(value, baseline.current));
      setStorageError(null);
    } catch {
      setStorageError("This browser could not keep a local recovery copy. Keep this page open until the server save succeeds.");
    }
  }, [key]);

  /** Load server state once. Later reactive updates never overwrite local edits. */
  const initialize = useCallback((value: EditorDraft, updatedAt: number) => {
    if (current.current || !key) return;
    current.current = value;
    baseline.current = JSON.stringify(value);
    adoptRevision(updatedAt);
    setDraft(value);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = parseRecovery(raw);
        if (!saved) setStorageError("A local recovery copy exists but could not be read. It was left untouched.");
        else if (JSON.stringify(saved.draft) !== baseline.current) setRecovery(saved);
      }
    } catch {
      setStorageError("Local recovery storage could not be read.");
    }
  }, [key]);

  /** Replace local state with the server version (used after a conflict). */
  const reloadFromServer = useCallback((value: EditorDraft, updatedAt: number) => {
    current.current = value;
    baseline.current = JSON.stringify(value);
    past.current = [];
    future.current = [];
    adoptRevision(updatedAt);
    setDraft(value);
    setSaveState({ kind: "idle" });
    persist(value);
  }, [persist]);

  const change = useCallback((update: (prev: EditorDraft) => EditorDraft) => {
    const prev = current.current;
    if (!prev) return;
    const next = update(prev);
    if (next === prev) return;
    past.current = [...past.current.slice(-99), prev];
    future.current = [];
    current.current = next;
    setDraft(next);
    setPublishProblems([]);
    // A validation error is resolved by editing; conflicts and offline need an explicit action.
    setSaveState((s) => (s.kind === "error" ? { kind: "idle" } : s));
    persist(next);
  }, [persist]);

  const travel = (direction: "undo" | "redo") => {
    if (!current.current) return;
    const from = direction === "undo" ? past : future;
    const to = direction === "undo" ? future : past;
    const value = from.current.pop();
    if (!value) return;
    to.current.push(current.current);
    current.current = value;
    setDraft(value);
    persist(value);
  };

  const restore = () => {
    if (!recovery || !current.current) return;
    // Only reuse question IDs that still exist on the server. Anything else is
    // restored as a new question so historical answers stay untouched.
    const known = new Set(current.current.questions.flatMap((q) => (q.id ? [q.id] : [])));
    const restored = { ...recovery.draft, questions: recovery.draft.questions.map((q) => (q.id && !known.has(q.id) ? { ...q, id: undefined } : q)) };
    change(() => restored);
    setRecovery(null);
  };

  const discardRecovery = () => {
    try {
      if (key && current.current) localStorage.setItem(key, recoveryRecord(current.current, baseline.current));
    } catch {
      setStorageError("Could not remove the local recovery copy.");
    }
    setRecovery(null);
  };

  const save = useCallback(async (options?: { force?: boolean }): Promise<boolean> => {
    const value = current.current;
    if (!value || !quizId || busy.current || recovery) return false;
    if (JSON.stringify(value) === baseline.current && !options?.force) return true;
    const missingNumber = value.questions.findIndex((q) => !Number.isFinite(q.points) || !Number.isFinite(q.timeLimit));
    if (missingNumber >= 0 || !Number.isFinite(value.quizSettings.passingThreshold)) {
      setSaveState({ kind: "error", message: missingNumber >= 0
        ? `Question ${missingNumber + 1}: enter a number for marks and timer before saving.`
        : "Enter a passing threshold before saving." });
      return false;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      persist(value);
      setSaveState({ kind: "offline" });
      return false;
    }
    busy.current = true;
    setSaveState({ kind: "saving" });
    try {
      const result = await saveQuizDraft({
        quizId,
        expectedUpdatedAt: options?.force ? undefined : revisionRef.current,
        title: value.title,
        description: value.description || undefined,
        // An incomplete slug stays local until it is valid; the editor flags it inline.
        slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ? value.slug : undefined,
        groupName: value.groupName,
        ...value.quizSettings,
        // An unfinished pool size stays local; publication checks flag it.
        poolSize: Number.isInteger(value.quizSettings.poolSize) && value.quizSettings.poolSize >= 0 && value.quizSettings.poolSize <= 200 ? value.quizSettings.poolSize : undefined,
        questions: value.questions.map((q, order) => ({ ...questionPayload(q, order), id: q.id })),
      });
      adoptRevision(result.updatedAt);
      // Record acknowledged IDs so a retry or reload never recreates questions.
      const ack = new Map(value.questions.map((q, i) => [q.clientKey, result.questionIds[i]]));
      const withIds = (d: EditorDraft): EditorDraft => ({
        ...d,
        questions: d.questions.map((q) => (ack.has(q.clientKey) ? { ...q, id: ack.get(q.clientKey) } : q)),
      });
      const acknowledged = withIds(value);
      baseline.current = JSON.stringify(acknowledged);
      // Edits made while the request was in flight stay local and dirty.
      const latest = current.current === value ? acknowledged : withIds(current.current!);
      current.current = latest;
      past.current = past.current.map(withIds);
      future.current = future.current.map(withIds);
      setDraft(latest);
      persist(latest);
      setSaveState({ kind: "saved", at: new Date() });
      return true;
    } catch (error) {
      const message = errorMessage(error, "Save failed. Your changes are kept in this browser; retry when connected.");
      setSaveState(message.startsWith("DRAFT_CONFLICT") ? { kind: "conflict" } : { kind: "error", message });
      persist(current.current ?? value);
      return false;
    } finally {
      busy.current = false;
    }
  }, [quizId, recovery, saveQuizDraft, persist]);

  const publish = useCallback(async (): Promise<boolean> => {
    const value = current.current;
    if (!value || !quizId) return false;
    const problems = publicationProblems(value);
    setPublishProblems(problems);
    if (problems.length) return false;
    if (!(await save())) return false;
    try {
      const result = await publishQuiz({ quizId, expectedUpdatedAt: revisionRef.current });
      adoptRevision(result.updatedAt);
      return true;
    } catch (error) {
      const message = errorMessage(error, "Publication failed.");
      if (message.startsWith("PUBLICATION_BLOCKED")) setPublishProblems(message.split("\n").slice(1));
      else if (message.startsWith("DRAFT_CONFLICT")) setSaveState({ kind: "conflict" });
      else setSaveState({ kind: "error", message });
      return false;
    }
  }, [quizId, save, publishQuiz]);

  const unpublish = useCallback(async (): Promise<boolean> => {
    if (!quizId) return false;
    try {
      if (!(await save())) return false;
      const result = await unpublishQuiz({ quizId });
      adoptRevision(result.updatedAt);
      return true;
    } catch (error) {
      setSaveState({ kind: "error", message: errorMessage(error, "Could not unpublish.") });
      return false;
    }
  }, [quizId, save, unpublishQuiz]);

  const dirty = draft !== null && JSON.stringify(draft) !== baseline.current;
  const blocked = saveState.kind === "conflict" || saveState.kind === "error" || saveState.kind === "offline";

  // Debounced autosave. Failures stop autosave until the user retries or the
  // browser reports connectivity again, so errors are never silently looped.
  useEffect(() => {
    if (!dirty || recovery || saveState.kind === "saving" || blocked) return;
    const timer = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(timer);
  }, [draft, dirty, recovery, saveState.kind, blocked, save]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current && JSON.stringify(current.current) !== baseline.current) {
        persist(current.current);
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const online = () => setSaveState((s) => (s.kind === "offline" ? { kind: "idle" } : s));
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
    };
  }, [persist]);

  return {
    draft, initialize, reloadFromServer, change, dirty, saveState, storageError,
    revision, recovery, restore, discardRecovery, save, publish, unpublish, publishProblems,
    retry: () => { setSaveState({ kind: "idle" }); void save(); },
    overwrite: () => { setSaveState({ kind: "idle" }); void save({ force: true }); },
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    undo: () => travel("undo"), redo: () => travel("redo"),
  };
}
