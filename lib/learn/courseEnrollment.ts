"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLearnViewer } from "./data";

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
  return { state: noStorage ? { enrolled: false, owner: false } : ready ? state : undefined, signedIn, enroll, recordLesson };
}
