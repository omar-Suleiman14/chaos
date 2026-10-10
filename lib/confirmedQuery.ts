"use client";

import { useContext, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { CacheZone } from "@/lib/workspaceQueryAuth";
export { CacheZone } from "@/lib/workspaceQueryAuth";
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
 *
 * A live result only counts once Convex has authenticated the visitor: before
 * that, Convex answers as a signed-out visitor (an empty library), which must
 * neither replace the cached copy nor be shown as confirmed.
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

/**
 * Writes are coalesced per key and made when the page is idle: hooks that combine several
 * queries build a new value on every render, and serialising each one would cost more than it saves.
 */
const queued = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
/** Writes queued copies now (also on leaving the page, so the newest one is what the next visit shows). */
export function flushConfirmedWrites() {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  for (const [key, value] of queued) write(key, value);
  queued.clear();
}
const flush = flushConfirmedWrites;
if (typeof window !== "undefined") window.addEventListener("pagehide", flushConfirmedWrites);
function queueWrite(key: string, value: unknown) {
  queued.set(key, value);
  flushTimer ??= setTimeout(flush, 400);
}

/** Removes cached results, all of them or every account except `keepUserId`. */
export function clearConfirmedCache(keepUserId?: string) {
  const s = storage();
  if (!s) return;
  queued.clear();
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
 *
 * The last account is remembered on the device, so a reload shows its cached
 * workspace at once instead of waiting for the sign-in library to load. It is
 * trusted only while Clerk's session marker cookie (__client_uat, readable by
 * scripts) is the one it was saved with, so after a sign-out or another
 * person's sign-in nothing shows until Clerk names the account. When Clerk
 * reports someone else, or no one, the copies go with it.
 */
const SCOPE_KEY = "chaos.cache.scope";
function sessionMarker(): string | null {
  if (typeof document === "undefined") return null;
  const value = /(?:^|;\s*)__client_uat(?:_[^=;]*)?=([^;]*)/.exec(document.cookie)?.[1];
  return value && value !== "0" ? value : null;
}
let scope: string | null = (() => {
  try {
    const saved = JSON.parse(storage()?.getItem(SCOPE_KEY) ?? "null") as { userId: string; session: string } | null;
    const session = sessionMarker();
    return saved && session && saved.session === session ? saved.userId : null;
  } catch { return null; }
})();
const scopeListeners = new Set<() => void>();
/**
 * True when this browser certainly has no Clerk session (no session marker cookie), so public pages
 * can treat the visitor as signed out before the sign-in library loads. Never true for Better Auth.
 */
export function signedOutForSure(): boolean {
  if (typeof document === "undefined" || process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth") return false;
  return sessionMarker() === null;
}
/** The account the device cache currently belongs to (checked against the session cookie), or null. */
export function cacheScope(): string | null { return scope; }
export function setCacheScope(userId: string | null) {
  if (scope === userId) return;
  scope = userId;
  // Signed out: nothing private stays on the device. Signed in: drop other accounts' copies.
  clearConfirmedCache(userId ?? undefined);
  try {
    const session = sessionMarker();
    if (userId && session) storage()?.setItem(SCOPE_KEY, JSON.stringify({ userId, session }));
    else storage()?.removeItem(SCOPE_KEY);
  } catch { /* storage unavailable */ }
  for (const listener of scopeListeners) listener();
}

/**
 * Where cached copies may be shown: the signed-in workspace (components/workspace/CacheScope.tsx),
 * with whether Convex has authenticated the visitor yet. Hooks shared with public pages (lesson
 * lists, progress) pass live values straight through elsewhere.
 */

/**
 * How many mounted views are showing cached, unconfirmed data. The workspace fades its content
 * area while any are (DashboardShell), so pages need no wrapper of their own.
 */
let pending = 0;
const pendingListeners = new Set<() => void>();
const setPending = (change: number) => { pending += change; for (const listener of pendingListeners) listener(); };
const subscribePending = (listener: () => void) => { pendingListeners.add(listener); return () => { pendingListeners.delete(listener); }; };
export function useCachePending(): boolean {
  return useSyncExternalStore(subscribePending, () => pending > 0, () => false);
}
const subscribeScope = (listener: () => void) => { scopeListeners.add(listener); return () => { scopeListeners.delete(listener); }; };
const noop = () => () => {};

export type Confirmed<T> = {
  /** Live data, or the cached copy while Convex has not answered yet. */
  data: T | undefined;
  /** True once the data came from Convex in this session. */
  confirmed: boolean;
};

/**
 * Any value computed from Convex (a query, or a hook that combines several), shown from the device
 * cache until it is live. `name` identifies it within the account; `live` is undefined while loading.
 * The value must be plain data (it is stored as JSON).
 */
export function useConfirmed<T>(name: string | null, live: T | undefined): Confirmed<T> {
  const zone = useContext(CacheZone);
  const scoped = useSyncExternalStore(subscribeScope, () => scope, () => null);
  const userId = zone ? scoped : null;
  const isAuthenticated = zone?.authenticated ?? false;
  const key = name === null || !userId ? null : `${PREFIX}${userId}:${name}`;
  // The server and hydration render see no cache, so markup matches; the client then shows it.
  const cached = useSyncExternalStore(noop, () => read(key), () => undefined) as T | undefined;
  // Without a scope nothing is cached and the live value passes straight through, as before.
  const confirmed = live !== undefined && (isAuthenticated || !key);
  const showingCache = !confirmed && key !== null && cached !== undefined;

  useEffect(() => { if (key && confirmed) queueWrite(key, live); }, [key, confirmed, live]);
  // A layout effect, so the fade is applied before the cached content is first painted.
  useLayoutEffect(() => {
    if (!showingCache) return;
    setPending(1);
    return () => setPending(-1);
  }, [showingCache]);

  if (confirmed) return { data: live, confirmed: true };
  // Nothing cached yet: whatever is live, as useQuery would show it.
  return { data: showingCache ? cached : live, confirmed: false };
}

/**
 * useQuery that renders the last-known result immediately and says whether it is confirmed.
 * In the workspace the query waits for Convex to authenticate the visitor: the page now renders
 * before that (from the cache), and queries that require a sign-in throw when asked anonymously.
 */
export function useConfirmedQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip" = {} as FunctionArgs<Q>): Confirmed<FunctionReturnType<Q>> {
  const zone = useContext(CacheZone);
  const live = useQuery(query, (zone && !zone.authenticated ? "skip" : args) as never) as FunctionReturnType<Q> | undefined;
  return useConfirmed(args === "skip" ? null : `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`, live);
}
