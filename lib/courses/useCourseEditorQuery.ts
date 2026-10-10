"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * A full-page reload can restore the UI before Convex has received its
 * authentication token. The editor query requires an active account and must
 * never run during that window. The course data loads once auth is ready.
 */
export function useCourseEditorQuery(courseId: Id<"learnCollections">) {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.courses.get, isAuthenticated ? { courseId } : "skip");
}
