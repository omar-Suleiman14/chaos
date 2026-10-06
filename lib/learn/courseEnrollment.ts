"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLearnViewer } from "./data";
import { cacheScope } from "@/lib/confirmedQuery";

const noSubscribe = () => () => {};

// A random id that lets this device enroll in courses without an account. Only its hash reaches the server.
const TOKEN_KEY = "chaos.learn.guest-token";
const NAME_KEY = "chaos.learn.guest-name";

function guestToken(): string | undefined {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch { return undefined; }
}

/**
 * Courses this device has started, per learner, so an enrolled learner's next visit opens the lesson
 * at once instead of waiting for sign-in and the enrollment check. Kept per account (the device
 * cache's verified account) or per this device's guest token, so one learner's courses never unlock
 * the lesson view for someone else; the live answer always replaces it.
 */
const ENROLLED_KEY = "chaos.learn.enrolled.v1";
type EnrolledMemo = Record<string, string[]>;
function readEnrolled(): EnrolledMemo { try { return JSON.parse(localStorage.getItem(ENROLLED_KEY) ?? "{}") as EnrolledMemo; } catch { return {}; } }
function learnerKeys(): string[] {
  const keys: string[] = [];
  const account = cacheScope();
  if (account) keys.push(`u:${account}`);
  try { const token = localStorage.getItem(TOKEN_KEY); if (token) keys.push(`g:${token.slice(0, 16)}`); } catch { /* unavailable */ }
  return keys;
}
function rememberEnrolled(learner: string, courseId: string, enrolled: boolean) {
  const memo = readEnrolled();
  const list = (memo[learner] ?? []).filter((id) => id !== courseId);
  if (enrolled) list.push(courseId);
  memo[learner] = list.slice(-100);
  // Only the current learners' entries stay: signing in as someone else drops the previous account's list.
  const current = new Set([learner, ...learnerKeys()]);
  for (const key of Object.keys(memo)) if (!current.has(key)) delete memo[key];
  try { localStorage.setItem(ENROLLED_KEY, JSON.stringify(memo)); } catch { /* storage full or blocked */ }
}
function knownEnrolled(courseId: string): boolean {
  if (typeof window === "undefined") return false;
  const memo = readEnrolled();
  return learnerKeys().some((key) => memo[key]?.includes(courseId));
}

export function savedGuestName() { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } }

/** Whether the viewer has started a course; owners always count as enrolled. undefined while loading. */
export function useCourseEnrollment(courseId: string | null | undefined) {
  const viewer = useLearnViewer();
  const [token, setToken] = useState<string | null>();
  // null: this browser can't keep a guest token, so the learner has to sign in.
  useEffect(() => { if (viewer && !viewer.signedIn) setToken(guestToken() ?? null); }, [viewer]);
  const signedIn = !!viewer?.signedIn;
  const guest = signedIn || !token ? undefined : token;
  const ready = !!courseId && !!viewer && (signedIn || !!guest);
  const state = useQuery(api.courseStudents.myEnrollment, ready ? { courseId: courseId!, guestToken: guest } : "skip");
  const enrollMutation = useMutation(api.courseStudents.enroll);
  const recordMutation = useMutation(api.courseStudents.recordLesson);
  const enroll = useCallback(async (guestName?: string) => {
    if (!courseId) return;
    if (guestName !== undefined) { try { localStorage.setItem(NAME_KEY, guestName.trim()); } catch { /* unavailable */ } }
    await enrollMutation({ courseId, guestToken: guest, guestName: guestName?.trim() || undefined });
  }, [courseId, guest, enrollMutation]);
  const recordLesson = useCallback((lessonId: string, completed?: boolean) => {
    if (!ready || !courseId) return;
    void recordMutation({ courseId, guestToken: guest, lessonId, ...(completed === undefined ? {} : { completed }) }).catch(() => { /* analytics only */ });
  }, [ready, courseId, guest, recordMutation]);
  const noStorage = !!courseId && !!viewer && !signedIn && token === null;
  const learner = signedIn ? `u:${viewer!.id}` : guest ? `g:${guest.slice(0, 16)}` : null;
  useEffect(() => { if (courseId && learner && state) rememberEnrolled(learner, courseId, state.enrolled); }, [courseId, learner, state]);
  // The server render and hydration see no memo, so markup matches; the browser then applies it.
  const optimistic = useSyncExternalStore(noSubscribe, () => !!courseId && knownEnrolled(courseId), () => false);
  const live = noStorage ? { enrolled: false, owner: false } : ready ? state : undefined;
  return { state: live === undefined && optimistic ? { enrolled: true, owner: false } : live, signedIn, enroll, recordLesson };
}
