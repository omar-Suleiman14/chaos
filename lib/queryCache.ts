"use client";

import { useEffect } from "react";
import { useQuery, type ConvexReactClient } from "convex/react";
import { convex } from "@/lib/convexClient";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";

/**
 * Keeps Convex query results warm after the page that used them goes away, so going back to a course or
 * on to the next lesson renders at once instead of waiting for a fresh subscription. A kept query is
 * still a live subscription: it updates while kept, then stops a few minutes after the last user left.
 */
const KEEP_MS = 5 * 60_000;
/** Idle kept queries beyond this are dropped oldest first, so a long session can't pile up subscriptions. */
const MAX_IDLE = 40;

type Entry = { stop: () => void; users: number; timer?: ReturnType<typeof setTimeout> };
const entries = new Map<string, Entry>();

const keyOf = (query: FunctionReference<"query">, args: Record<string, unknown>) => `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;

function trim() {
  const idle = [...entries].filter(([, entry]) => entry.users <= 0);
  for (const [key, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
    clearTimeout(entry.timer);
    entry.stop();
    entries.delete(key);
  }
}

/** Holds a live subscription for this query until the returned release runs, then for KEEP_MS more. */
export function retainQuery<Q extends FunctionReference<"query">>(client: ConvexReactClient, query: Q, args: FunctionArgs<Q>): () => void {
  const key = keyOf(query, args);
  let entry = entries.get(key);
  if (!entry) {
    // Entries are re-inserted on use, so Map order doubles as least-recently-used order for trim().
    entry = { stop: client.watchQuery(query, args).onUpdate(() => {}), users: 0 };
  } else entries.delete(key);
  entries.set(key, entry);
  clearTimeout(entry.timer);
  entry.users++;
  let released = false;
  const kept = entry;
  return () => {
    if (released) return;
    released = true;
    kept.users--;
    if (kept.users > 0) return;
    kept.timer = setTimeout(() => { if (kept.users <= 0 && entries.get(key) === kept) { kept.stop(); entries.delete(key); } }, KEEP_MS);
    trim();
  };
}

/** Starts loading a query someone is about to need (a hovered link, the next lesson) and keeps it warm. */
export function prefetchQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q>) {
  if (convex) retainQuery(convex, query, args)();
}

/** useQuery whose result outlives the component for a few minutes. Same arguments and result as useQuery. */
export function useKeptQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip"): FunctionReturnType<Q> | undefined {
  const key = args === "skip" ? null : keyOf(query, args);
  useEffect(() => {
    // The app's one client (lib/convexClient); absent in tests and previews without a backend.
    if (args === "skip" || !convex) return;
    return retainQuery(convex, query, args);
    // The key captures the query and its arguments; args is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useQuery(query, args as never) as FunctionReturnType<Q> | undefined;
}

/** Test helper: forget everything kept. */
export function resetQueryCache() {
  for (const entry of entries.values()) { clearTimeout(entry.timer); entry.stop(); }
  entries.clear();
}
