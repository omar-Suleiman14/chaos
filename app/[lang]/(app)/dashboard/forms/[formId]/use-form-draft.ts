"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormDefinition } from "@/convex/formLogic";
import { parseError } from "@/lib/errors";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "offline" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

const HISTORY_LIMIT = 100;
const AUTOSAVE_MS = 1200;
/** Keystrokes within this window collapse into one undo step. */
const COALESCE_MS = 800;

interface Recovery { draft: FormDefinition; baseRevision: number; savedAt: number }

/**
 * Draft state for the form builder: autosave with revision checks, undo/redo,
 * conflict handling and a local recovery copy that survives crashes and
 * offline periods.
 */
export function useFormDraft(formId: Id<"forms">, server: { draft: FormDefinition; draftRevision: number } | null | undefined, canEdit: boolean) {
  const saveDraft = useMutation(api.forms.saveFormDraft);
  const storageKey = `chaos-form-draft:${formId}`;
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
  const revision = useRef(0);
  const baseline = useRef("");
  const current = useRef<FormDefinition | null>(null);
  const past = useRef<FormDefinition[]>([]);
  const future = useRef<FormDefinition[]>([]);
  const lastChange = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const active = useRef(true);
  const initialized = useRef(false);
  const conflict = useRef(false);

  const syncHistory = () => setHistoryInfo({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });
  const dirty = () => current.current !== null && JSON.stringify(current.current) !== baseline.current;

  const adopt = useCallback((def: FormDefinition, rev: number) => {
    revision.current = rev;
    baseline.current = JSON.stringify(def);
    current.current = def;
    setDraft(def);
  }, []);

  // First load, and live updates from collaborators while this copy is clean.
  useEffect(() => {
    if (!server) return;
    if (!initialized.current) {
      initialized.current = true;
      adopt(server.draft, server.draftRevision);
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as Recovery;
          if (saved?.draft && JSON.stringify(saved.draft) !== JSON.stringify(server.draft)) setRecovery(saved);
          else window.localStorage.removeItem(storageKey);
        }
      } catch { /* storage unavailable */ }
      return;
    }
    if (server.draftRevision !== revision.current && !dirty() && !busy.current) adopt(server.draft, server.draftRevision);
  }, [server, adopt, storageKey]);

  const persistLocal = (def: FormDefinition) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ draft: def, baseRevision: revision.current, savedAt: Date.now() } satisfies Recovery));
    } catch { /* storage unavailable or full */ }
  };

  const save = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    if (!current.current || !canEdit || conflict.current || !active.current) return Promise.resolve(false);
    if (!dirty()) return Promise.resolve(true);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSaveState({ kind: "offline" });
      return Promise.resolve(false);
    }
    busy.current = true;
    setSaveState({ kind: "saving" });
    const operation = (async () => {
      try {
        // Edits made during a request must be saved with its returned revision.
        // Publish and restore callers wait until the entire draft is clean.
        while (dirty()) {
          const value = current.current!;
          const result = await saveDraft({ formId, expectedRevision: revision.current, definition: value });
          if (!active.current) return false;
          revision.current = result.draftRevision;
          baseline.current = JSON.stringify(value);
        }
        try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
        setSaveState({ kind: "saved", at: Date.now() });
        return true;
      } catch (err) {
        if (!active.current) return false;
        const { code, message } = parseError(err, "Saving failed.");
        if (code === "DRAFT_CONFLICT") { conflict.current = true; setSaveState({ kind: "conflict" }); }
        else if (code === "NETWORK") setSaveState({ kind: "offline" });
        else setSaveState({ kind: "error", message });
        return false;
      } finally {
        busy.current = false;
        inFlight.current = null;
      }
    })();
    inFlight.current = operation;
    return operation;
  }, [canEdit, formId, saveDraft, storageKey]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!conflict.current) void save();
    }, AUTOSAVE_MS);
  }, [save]);

  /** A checkpoint is its own undo step, e.g. deleting a question or switching theme, even right after typing. */
  const change = useCallback((updater: (d: FormDefinition) => FormDefinition, options?: { checkpoint?: boolean }) => {
    const prev = current.current;
    if (!prev || !canEdit) return;
    const next = updater(prev);
    if (next === prev) return;
    const now = Date.now();
    if (options?.checkpoint || now - lastChange.current > COALESCE_MS || past.current.length === 0) {
      past.current = [...past.current, prev].slice(-HISTORY_LIMIT);
    }
    lastChange.current = options?.checkpoint ? 0 : now;
    future.current = [];
    current.current = next;
    setDraft(next);
    syncHistory();
    persistLocal(next);
    setSaveState((s) => (s.kind === "error" ? { kind: "idle" } : s));
    schedule();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- persistLocal only reads refs
  }, [canEdit, schedule]);

  const step = (from: React.MutableRefObject<FormDefinition[]>, to: React.MutableRefObject<FormDefinition[]>) => {
    const target = from.current[from.current.length - 1];
    if (!target || !current.current || !canEdit) return;
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, current.current].slice(-HISTORY_LIMIT);
    current.current = target;
    lastChange.current = 0;
    setDraft(target);
    syncHistory();
    persistLocal(target);
    schedule();
  };
  const undo = () => step(past, future);
  const redo = () => step(future, past);

  /** Conflict: discard local edits and take the saved version. */
  const loadTheirs = () => {
    if (!server) return;
    adopt(server.draft, server.draftRevision);
    past.current = [];
    future.current = [];
    syncHistory();
    try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    conflict.current = false;
    setSaveState({ kind: "idle" });
  };
  /** Conflict: keep local edits and overwrite the saved version. */
  const keepMine = async () => {
    if (!server) return;
    revision.current = server.draftRevision;
    conflict.current = false;
    setSaveState({ kind: "idle" });
    await save();
  };

  const restoreRecovery = () => {
    if (!recovery) return;
    change(() => recovery.draft);
    setRecovery(null);
  };
  const discardRecovery = () => {
    setRecovery(null);
    try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  // Save when the connection returns; warn before leaving with unsaved edits.
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const online = () => { setSaveState((s) => (s.kind === "offline" ? { kind: "idle" } : s)); void save(); };
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty()) e.preventDefault(); };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save]);

  return {
    draft, change, save, undo, redo, ...historyInfo, saveState, recovery, restoreRecovery, discardRecovery, loadTheirs, keepMine,
    revision: () => revision.current,
    isDirty: dirty,
  };
}
