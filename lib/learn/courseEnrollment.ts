"use client";
import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLearnViewer } from "./data";

const NOT_ENROLLED = { enrolled: false, owner: false };

/**
 * Approval is a server-owned state, never a browser/device token or cached guess.
 * Guests can browse public course previews, but cannot enroll or record progress.
 */
export function useCourseEnrollment(courseId: string | null | undefined) {
  const viewer = useLearnViewer();
  const signedIn = !!viewer?.signedIn;
  const ready = !!courseId && signedIn;
  const enrollment = useQuery(
    api.courseStudents.myEnrollment,
    ready ? { courseId } : "skip",
  );
  const serverStatus = useQuery(
    api.courseJoinRequests.myStatus,
    ready ? { courseId: courseId as Id<"learnCollections"> } : "skip",
  );
  const requestMutation = useMutation(api.courseJoinRequests.requestJoin);
  const withdrawMutation = useMutation(api.courseJoinRequests.withdraw);
  const recordMutation = useMutation(api.courseStudents.recordLesson);

  // Legacy self-enrollment rows do not grant permission without a doctor's approval.
  const state = !signedIn
    ? NOT_ENROLLED
    : enrollment === undefined || serverStatus === undefined
      ? undefined
      : serverStatus === "approved" ? enrollment : NOT_ENROLLED;
  const requestStatus = !signedIn ? "none" as const : serverStatus;

  const requestJoin = useCallback(async () => {
    if (!courseId || !signedIn) throw new Error("Sign in to request course access.");
    await requestMutation({ courseId });
  }, [courseId, signedIn, requestMutation]);

  const withdraw = useCallback(async () => {
    if (!courseId || !signedIn) return;
    await withdrawMutation({ courseId: courseId as Id<"learnCollections"> });
  }, [courseId, signedIn, withdrawMutation]);

  const recordLesson = useCallback((lessonId: string, completed?: boolean) => {
    if (!courseId || !signedIn || !state?.enrolled) return;
    void recordMutation({ courseId, lessonId, ...(completed === undefined ? {} : { completed }) })
      .catch(() => { /* Progress is non-critical; answers and permissions live on the server. */ });
  }, [courseId, signedIn, state?.enrolled, recordMutation]);

  return { state, requestStatus, signedIn, requestJoin, withdraw, recordLesson };
}
