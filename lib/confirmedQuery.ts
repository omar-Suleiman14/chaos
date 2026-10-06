"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, jsonToConvex, type Value } from "convex/values";
import { useQuery } from "@/lib/convexCache";

/**
 * Last-known results, shown at once and marked unconfirmed until Convex
 * answers. The live result always wins: it replaces the cached copy whole,
 * so something deleted elsewhere disappears the moment Convex confirms.
 *
 * Cached copies are per account (never shown to anyone else), expire after
 * a week, are skipped when large, and are wiped on sign-out.
 */
const PREFIX = "chaos.cache.v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_BYTES = 256 * 1024;

type Stored = { at: number; value: unknown };
const parsed = new Map<string, { raw: string; value: unknown }>();

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function read(key: string | null): unknown {
  if (!key) return undefined;
  const raw = storage()?.getItem(key) ?? null;
  if (raw === null) return undefined;
  // useSyncExternalStore needs the same reference for unchanged data.
  const hit = parsed.get(key);
  if (hit?.raw === raw) return hit.value;
  try {
    const stored = JSON.parse(raw) as Stored;
    if (Date.now() - stored.at > MAX_AGE_MS) { storage()?.removeItem(key); return undefined; }
    const value = jsonToConvex(stored.value as never);
    parsed.set(key, { raw, value });
    return value;
  } catch { return undefined; }
}

function write(key: string, value: unknown) {
  const s = storage();
  if (!s) return;
  try {
    const raw = JSON.stringify({ at: Date.now(), value: convexToJson(value as Value) } satisfies Stored);
    if (raw.length > MAX_BYTES) { s.removeItem(key); return; }
    s.setItem(key, raw);
  } catch { /* Storage full or unavailable: the live result still renders. */ }
}

/** Removes cached results, all of them or every account except `keepUserId`. */
export function clearConfirmedCache(keepUserId?: string) {
  const s = storage();
  if (!s) return;
  for (let i = s.length - 1; i >= 0; i--) {
    const key = s.key(i);
    if (key?.startsWith(PREFIX) && (!keepUserId || !key.startsWith(`${PREFIX}${keepUserId}:`))) s.removeItem(key);
  }
  parsed.clear();
}

/**
 * The signed-in account, published by <CacheScope /> (components/workspace).
 * Without one nothing is cached, so surfaces outside the workspace and tests
 * behave exactly like useQuery.
 */
let scope: string | null = null;
const scopeListeners = new Set<() => void>();
export function setCacheScope(userId: string | null) {
  if (scope === userId) return;
  scope = userId;
  // Signed out: nothing private stays on the device. Signed in: drop other accounts' copies.
  clearConfirmedCache(userId ?? undefined);
  for (const listener of scopeListeners) listener();
}
const subscribeScope = (listener: () => void) => { scopeListeners.add(listener); return () => { scopeListeners.delete(listener); }; };
const noop = () => () => {};

export type Confirmed<T> = {
  /** Live data, or the cached copy while Convex has not answered yet. */
  data: T | undefined;
  /** True once the data came from Convex in this session. */
  confirmed: boolean;
};

/** useQuery that renders the last-known result immediately and says whether it is confirmed. */
export function useConfirmedQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip" = {} as FunctionArgs<Q>): Confirmed<FunctionReturnType<Q>> {
  const userId = useSyncExternalStore(subscribeScope, () => scope, () => null);
  const live = useQuery(query, args as never) as FunctionReturnType<Q> | undefined;
  const key = args === "skip" || !userId ? null : `${PREFIX}${userId}:${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;
  // The server and hydration render see no cache, so markup matches; the client then shows it.
  const cached = useSyncExternalStore(noop, () => read(key), () => undefined) as FunctionReturnType<Q> | undefined;

  useEffect(() => { if (key && live !== undefined) write(key, live); }, [key, live]);

  if (live !== undefined) return { data: live, confirmed: true };
  return { data: key ? cached : undefined, confirmed: false };
}
