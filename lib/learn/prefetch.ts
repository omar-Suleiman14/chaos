"use client";

import { api } from "@/convex/_generated/api";
import { prefetchQuery } from "@/lib/queryCache";

/** Starts loading a published lesson someone is about to open (hover, focus, or the next lesson in a course). */
export function prefetchLesson(id: string) {
  prefetchQuery(api.learnFrontend.publicLesson, { id });
}
