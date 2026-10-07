"use client";

import { useMemo } from "react";
import { useQueries } from "convex/react";
import { getFunctionName } from "convex/server";

type Requests = Parameters<typeof useQueries>[0];

/**
 * useQueries resubscribes whenever the request object changes identity, and doing that
 * during render loops forever (React error #301) once results arrive. Callers build the
 * object inline, so key it by content instead.
 */
export function useStableQueries(queries: Requests): ReturnType<typeof useQueries> {
  const key = JSON.stringify(Object.entries(queries).map(([k, q]) => [k, getFunctionName(q.query), q.args]));
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by content on purpose
  const stable = useMemo(() => queries, [key]);
  return useQueries(stable);
}
