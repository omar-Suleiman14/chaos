import { useEffect, useSyncExternalStore } from "react";
import { vi } from "vitest";
import { getFunctionName } from "convex/server";

/**
 * A reactive stand-in for convex/react: queries answer from `server.data` by
 * function name, `server.push` delivers a server update the way the Convex
 * client does (a fresh object, so memoization by reference is not flattered),
 * and every mounted query is counted as a live subscription.
 */
type Answer = unknown | ((args: Record<string, unknown>) => unknown);
const listeners = new Set<() => void>();
let version = 0;
const results = new Map<string, { version: number; value: unknown }>();
const subscriptions = new Map<string, number>();
/** Mounted query hooks by function and arguments; more than one is the same data subscribed twice. */
const mounts = new Map<string, number>();
const mount = (key: string, delta: number) => { const n = (mounts.get(key) ?? 0) + delta; if (n > 0) mounts.set(key, n); else mounts.delete(key); };
const mutations: string[] = [];

export const server = {
  data: new Map<string, Answer>(),
  mutations,
  /** Live query subscriptions by function name (args-distinct subscriptions count separately). */
  get subscriptions() { return new Map(subscriptions); },
  get subscriptionCount() { return [...subscriptions.values()].reduce((a, b) => a + b, 0); },
  /**
   * Duplicate query patterns: hooks for the same function and arguments mounted more than once
   * (the client shares one subscription, but two components are each deriving the same data),
   * and functions held with several different arguments at once (often one broad query would do).
   */
  get duplicates() {
    const sameArgs = [...mounts.values()].reduce((n, c) => n + c - 1, 0);
    const byName = new Map<string, number>();
    for (const key of mounts.keys()) { const name = key.slice(0, key.indexOf("|")); byName.set(name, (byName.get(name) ?? 0) + 1); }
    const manyArgs = [...byName.entries()].filter(([, n]) => n > 1);
    return { sameArgs, manyArgs: manyArgs.reduce((n, [, c]) => n + c - 1, 0), names: [...new Set([...[...mounts].filter(([, c]) => c > 1).map(([k]) => k.slice(0, k.indexOf("|"))), ...manyArgs.map(([n]) => n)])] };
  },
  set(name: string, answer: Answer) { server.data.set(name, answer); version++; },
  /** A server update: answers for `name` become fresh objects and subscribers re-read. */
  push(name: string, answer: Answer) { server.data.set(name, answer); version++; for (const l of listeners) l(); },
  reset() { server.data.clear(); results.clear(); subscriptions.clear(); mounts.clear(); mutations.length = 0; version++; },
};

const resolve = (name: string, args: unknown) => {
  const key = `${name}:${JSON.stringify(args ?? {})}`;
  const cached = results.get(key);
  if (cached?.version === version) return cached.value;
  const answer = server.data.get(name);
  const value = typeof answer === "function" ? (answer as (a: unknown) => unknown)(args ?? {}) : answer === undefined ? undefined : structuredClone(answer);
  // Unchanged answers keep their identity, as the Convex client keeps an unchanged result.
  const same = cached && JSON.stringify(cached.value) === JSON.stringify(value);
  results.set(key, { version, value: same ? cached.value : value });
  return same ? cached.value : value;
};

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function useSubscription(name: string | null, key: string) {
  useEffect(() => {
    if (name === null) return;
    subscriptions.set(name, (subscriptions.get(name) ?? 0) + 1);
    mount(`${name}|${key}`, 1);
    return () => { const n = (subscriptions.get(name) ?? 1) - 1; if (n) subscriptions.set(name, n); else subscriptions.delete(name); mount(`${name}|${key}`, -1); };
  }, [name, key]);
}

function useQuery(ref: unknown, args?: unknown) {
  const name = args === "skip" ? null : getFunctionName(ref as never);
  useSubscription(name, JSON.stringify(args ?? null));
  return useSyncExternalStore(subscribe, () => (name === null ? undefined : resolve(name, args)), () => undefined);
}

function useQueries(queries: Record<string, { query: unknown; args: unknown }>) {
  const names = Object.values(queries).map((q) => getFunctionName(q.query as never));
  const key = JSON.stringify(Object.values(queries).map((q, i) => [names[i], q.args]));
  useEffect(() => {
    const keys = Object.values(queries).map((q, i) => `${names[i]}|${JSON.stringify(q.args ?? null)}`);
    for (const n of names) subscriptions.set(n, (subscriptions.get(n) ?? 0) + 1);
    for (const k of keys) mount(k, 1);
    return () => { for (const n of names) { const c = (subscriptions.get(n) ?? 1) - 1; if (c) subscriptions.set(n, c); else subscriptions.delete(n); } for (const k of keys) mount(k, -1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, () => version, () => 0);
  void snapshot;
  return Object.fromEntries(Object.entries(queries).map(([k, q]) => [k, resolve(getFunctionName(q.query as never), q.args)]));
}

function usePaginatedQuery(ref: unknown, args: unknown) {
  const results = useQuery(ref, args) as unknown[] | { page: unknown[] } | undefined;
  const page = Array.isArray(results) ? results : results?.page;
  return { results: page ?? [], status: page ? "Exhausted" : "LoadingFirstPage", isLoading: !page, loadMore: () => {} };
}

const stableMutations = new Map<string, unknown>();
function useMutation(ref: unknown) {
  const name = getFunctionName(ref as never);
  let fn = stableMutations.get(name);
  if (!fn) {
    const call = vi.fn(async () => { mutations.push(name); return null; });
    fn = Object.assign(call, { withOptimisticUpdate: () => call });
    stableMutations.set(name, fn);
  }
  return fn;
}

const client = { query: vi.fn(async () => undefined), mutation: vi.fn(async () => null), action: vi.fn(async () => null), watchQuery: () => ({ onUpdate: () => () => {}, localQueryResult: () => undefined }), prewarmQuery: () => {} };

export const convexReact = {
  useQuery, useQueries, usePaginatedQuery, useMutation, useAction: useMutation,
  useConvex: () => client,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true, connectionCount: 1, connectionRetries: 0, hasInflightRequests: false, timeOfOldestInflightRequest: null, inflightMutations: 0, inflightActions: 0 }),
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
};
