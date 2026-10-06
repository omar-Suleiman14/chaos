"use client";

import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A function with a fixed identity that always calls the latest `fn`, for handlers passed to
 * memoized children. Only for calls made after render (events, effects), never during it.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
