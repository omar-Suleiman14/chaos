"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useExamIntegrityTelemetry } from "./useExamIntegrityTelemetry";

export type ExamDraft = {
  choiceIds: string[]; text: string; flagged: boolean; savedForLater: boolean;
};
export type AutosaveState = "loading" | "saved" | "pending" | "saving" |
  "offline" | "conflict" | "error";
type Pending = { answer: ExamDraft; expectedRevision: number;
  mutationId: string; createdAt: number };
const MAX_AGE = 4 * 60 * 60 * 1000;
const empty: ExamDraft = { choiceIds: [], text: "", flagged: false, savedForLater: false };

function keyFor(id: Id<"examAttempts">, index: number) {
  return "chaos:unsaved-exam:" + id + ":" + index;
}
function recover(key: string): Pending | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Pending;
    if (!value || !Number.isSafeInteger(value.expectedRevision) ||
        !Number.isFinite(value.createdAt) ||
        Date.now() - value.createdAt > MAX_AGE ||
        !Array.isArray(value.answer?.choiceIds) ||
        typeof value.answer.text !== "string" || typeof value.mutationId !== "string") {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch { return null; }
}

/**
 * For the future authenticated live attempt player ONLY. Synthetic exam previews
 * never call this hook. Session drafts are explicitly UNSAVED until server ACK.
 */
export function useExamAnswerAutosave(
  attemptId: Id<"examAttempts"> | null, questionIndex: number,
  options: { monitorBrowser?: boolean; telemetryConsented?: boolean } = {},
) {
  // Monitoring is opt-in and requires disclosed exam-rule consent. Preview never uses this hook.
  const integrity = useExamIntegrityTelemetry(
    attemptId, options.monitorBrowser ?? false, options.telemetryConsented ?? false,
  );
  const key = attemptId ? keyFor(attemptId, questionIndex) : "";
  const rows = useQuery(api.examAnswers.getMine, attemptId ? { attemptId } : "skip");
  const save = useMutation(api.examAnswers.save);
  const [pending, setPending] = useState<Pending | null>(() => key ? recover(key) : null);
  const [status, setStatus] = useState<AutosaveState>(pending ? "pending" : "loading");
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false);
  const [revision, setRevision] = useState(0);
  const latest = useRef(pending);
  const busy = useRef(false);
  const remote = rows?.find(row => row.questionIndex === questionIndex);
  const remoteRevision = remote?.revision ?? 0;

  useEffect(() => { latest.current = pending; }, [pending]);
  useEffect(() => {
    if (!key) return;
    if (pending) window.sessionStorage.setItem(key, JSON.stringify(pending));
    else window.sessionStorage.removeItem(key);
  }, [key, pending]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!pending) { if (status !== (rows === undefined ? "loading" : "saved")) setStatus(rows === undefined ? "loading" : "saved"); }
    else if (remote?.lastMutationId === pending.mutationId) {
      latest.current = null;
      setPending(null);
      setStatus("saved");
    } else if (!busy.current && rows !== undefined &&
        remoteRevision > pending.expectedRevision) setStatus("conflict");
    else if (!online) setStatus("offline");
    else if (status === "offline") setStatus("pending");
  }, [pending, rows, remote, remoteRevision, online, status]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const flush = useCallback(async () => {
    if (!attemptId || !pending || rows === undefined || !online ||
        busy.current || status !== "pending") return;
    if (remoteRevision !== pending.expectedRevision) {
      setStatus("conflict"); return;
    }
    busy.current = true;
    setStatus("saving");
    try {
      const ack = await save({
        attemptId, questionIndex, expectedRevision: pending.expectedRevision,
        mutationId: pending.mutationId, answer: pending.answer,
      });
      setRevision(ack.revision);
      const current = latest.current;
      if (current?.mutationId === pending.mutationId) {
        latest.current = null;
        setPending(null);
        setStatus("saved");
      } else if (current) {
        const next = { ...current, expectedRevision: ack.revision };
        latest.current = next;
        setPending(next);
        setStatus("pending");
      }
    } catch (error) {
      const message = String(error);
      setStatus(message.includes("REVISION_CONFLICT") ? "conflict" :
        navigator.onLine === false || message.includes("Network") ? "offline" : "error");
    } finally { busy.current = false; }
  }, [attemptId, pending, rows, online, status, remoteRevision, save, questionIndex]);

  useEffect(() => {
    if (!pending || !online || status !== "pending" || rows === undefined) return;
    const handle = window.setTimeout(() => { void flush(); }, 650);
    return () => window.clearTimeout(handle);
  }, [pending, online, status, rows, flush]);

  const change = useCallback((answer: ExamDraft) => {
    if (!attemptId) return;
    const next = { answer, expectedRevision: latest.current?.expectedRevision ??
      (revision || remoteRevision), mutationId: crypto.randomUUID(), createdAt: Date.now() };
    latest.current = next;
    setPending(next);
    setStatus(navigator.onLine === false ? "offline" : "pending");
  }, [attemptId, revision, remoteRevision]);

  const discardLocalDraft = useCallback(() => {
    latest.current = null;
    setPending(null);
    setStatus(rows === undefined ? "loading" : "saved");
  }, [rows]);

  return {
    answer: pending?.answer ?? (remote ? {
      choiceIds: remote.choiceIds, text: remote.text,
      flagged: remote.flagged, savedForLater: remote.savedForLater,
    } : empty),
    status,
    savedAt: pending ? null : (remote?.savedAt ?? null),
    hasUnsavedChanges: pending !== null,
    change,
    retry: () => { if (pending) setStatus(online ? "pending" : "offline"); },
    discardLocalDraft,
    integrityStatus: integrity.status,
  };
}
