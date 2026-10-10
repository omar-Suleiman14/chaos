import { ConvexError } from "convex/values";

/** Preserve the existing structured conflict error for stale or unsafe revisions. */
export function revision(current: number, expected: number) {
  if (!Number.isSafeInteger(expected) || current !== expected)
    throw new ConvexError({
      code: "REVISION_CONFLICT",
      currentRevision: current,
    });
}
