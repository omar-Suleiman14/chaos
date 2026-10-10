import { parseError } from "@/lib/errors";
import { localizeMessage } from "@/lib/messages";

/**
 * App-wide toasts. One store, rendered once by <Toaster /> in the root layout, so any component,
 * hook or plain function can report an action's outcome:
 *
 *   toast.success("Lesson published");
 *   toast.error(err);                                   // Convex errors become readable messages
 *   toast("Course archived", { undo: () => restore() });
 *   await toast.promise(save(), { loading: "Saving…", success: "Saved", error: "Could not save" });
 *
 * Passing an existing `id` updates that toast in place (a loading toast turning into a result).
 */
export type ToastKind = "default" | "success" | "error" | "warning" | "info" | "loading";
export interface ToastAction { label: string; onClick: () => void }
export interface ToastOptions {
  /** Reuse an id to update a toast in place, or to show at most one of a kind. */
  id?: string;
  description?: string;
  /** Milliseconds on screen. Loading toasts stay until updated or dismissed. */
  duration?: number;
  action?: ToastAction;
  /** Shorthand for an Undo action. */
  undo?: () => void;
  /** An absolute server-owned deadline, useful for actions with a fixed undo window. */
  expiresAt?: number;
  /** Prevent an undo window from appearing longer than a server-side deadline. */
  pauseOnHover?: boolean;
}
export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration: number;
  action?: ToastAction;
  undo?: () => void;
  expiresAt?: number;
  pauseOnHover?: boolean;
  /** Bumped on every update so the timer restarts and the toast replays its entrance. */
  version: number;
  leaving?: boolean;
}

/** Every result stays five seconds (the timer pauses while hovered or focused); a running task stays until it finishes. */
const DURATION: Record<ToastKind, number> = { default: 5000, success: 5000, info: 5000, warning: 5000, error: 5000, loading: Infinity };
/** Older toasts beyond this are dropped; the stack shows the newest three. */
const LIMIT = 5;
export const EXIT_MS = 200;

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const set = (next: ToastItem[]) => { items = next; emit(); };

function show(kind: ToastKind, title: string, options: ToastOptions = {}): string {
  const id = options.id ?? `t${++counter}`;
  const prior = items.find(item => item.id === id);
  const duration = options.duration ?? DURATION[kind];
  const item: ToastItem = { id, kind, title, description: options.description, duration, action: options.action, undo: options.undo, expiresAt: options.expiresAt, pauseOnHover: options.pauseOnHover, version: (prior?.version ?? 0) + 1 };
  if (prior) { set(items.map(existing => existing.id === id ? item : existing)); return id; }
  const kept = items.filter(existing => !existing.leaving);
  // Drop the oldest finished toasts first; a running task stays visible.
  while (kept.length >= LIMIT) { const oldest = kept.findIndex(existing => existing.kind !== "loading"); kept.splice(oldest === -1 ? 0 : oldest, 1); }
  set([...kept, item, ...items.filter(existing => existing.leaving)]);
  return id;
}

function dismiss(id?: string) {
  const leaving = items.filter(item => (id === undefined || item.id === id) && !item.leaving);
  if (!leaving.length) return;
  set(items.map(item => leaving.includes(item) ? { ...item, leaving: true } : item));
  // Let the exit animation play before the toast leaves the DOM.
  setTimeout(() => set(items.filter(item => !leaving.some(gone => gone.id === item.id) || !item.leaving)), EXIT_MS);
}

/** The page language (<html lang>), so server messages read in Arabic for Arabic readers. */
export const pageLocale = (): "ar" | "en" => typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("ar") ? "ar" : "en";
/** Error toasts accept anything thrown; Convex errors lose their request IDs and stack traces. */
function errorText(error: unknown, fallback?: string) {
  return localizeMessage(pageLocale(), typeof error === "string" ? error : parseError(error, fallback).message);
}

type Message<T> = string | ((value: T) => string);
const text = <T,>(message: Message<T>, value: T) => typeof message === "function" ? message(value) : message;

export const toast = Object.assign((title: string, options?: ToastOptions) => show("default", title, options), {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  /** `toast.error(err)` shows the error's own message; `toast.error(err, { fallback })` covers unreadable ones. */
  error: (error: unknown, options?: ToastOptions & { fallback?: string }) => show("error", errorText(error, options?.fallback), options),
  loading: (title: string, options?: ToastOptions) => show("loading", title, options),
  dismiss,
  /**
   * Shows a loading toast while the promise runs, then the outcome in its place. Resolves or
   * rejects like the promise, so callers can still react to the result.
   */
  async promise<T>(promise: Promise<T> | (() => Promise<T>), messages: { loading: string; success: Message<T>; error?: Message<unknown>; description?: Message<T> }, options?: Omit<ToastOptions, "id">): Promise<T> {
    const id = show("loading", messages.loading);
    try {
      const value = await (typeof promise === "function" ? promise() : promise);
      show("success", text(messages.success, value), { ...options, id, description: messages.description ? text(messages.description, value) : options?.description });
      return value;
    } catch (error) {
      show("error", messages.error ? text(messages.error, error) : errorText(error), { id, description: messages.error ? errorText(error) : undefined });
      throw error;
    }
  },
});

export const toastStore = {
  /** Tests start each case with no toasts. */
  reset() { items = []; emit(); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => items,
  /** Server render and first paint: nothing yet. */
  empty: [] as ToastItem[],
};
