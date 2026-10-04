"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLearnViewer } from "./data";
import { useGuestStudy } from "./guestStudy";
export function useCourseProgress(courseId: string) {
  const viewer = useLearnViewer(), guest = useGuestStudy();
  const rows = useQuery(api.courses.myProgress, viewer?.signedIn ? { courseId } : "skip");
  return viewer?.signedIn ? Object.fromEntries((rows ?? []).map(r => [r.lessonId, { completed: r.completed, percent: r.percent }])) : Object.fromEntries(Object.entries(guest.progress).map(([id, r]) => [id, { completed: r.state === "completed", percent: r.percent }]));
}
