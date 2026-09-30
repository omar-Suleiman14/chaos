import { useMemo } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";

/**
 * Optimistic updates for the everyday mutations, so the screen changes on the tap and the
 * server confirms (or Convex rolls it back) a moment later. Each one only edits results
 * already in the local store; nothing is fetched.
 */

/** Archive, restore, close or reopen: the library, archive and builder show the new status at once. */
export function setFormStatusLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.forms.setFormStatus>) {
  const library = store.getQuery(api.forms.listMyForms, {});
  if (library) {
    const patch = <T extends { _id: string; status: string }>(list: T[]) => list.map((f) => (f._id === args.formId ? { ...f, status: args.status } : f));
    store.setQuery(api.forms.listMyForms, {}, { owned: patch(library.owned), shared: patch(library.shared) });
  }
  const editor = store.getQuery(api.forms.getFormForEditor, { formId: args.formId });
  if (editor) store.setQuery(api.forms.getFormForEditor, { formId: args.formId }, { ...editor, status: args.status });
}

/** Deleting from the Archive removes the row at once. */
export function deleteFormLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.forms.deleteForm>) {
  const library = store.getQuery(api.forms.listMyForms, {});
  if (!library) return;
  store.setQuery(api.forms.listMyForms, {}, {
    owned: library.owned.filter((f) => f._id !== args.formId),
    shared: library.shared.filter((f) => f._id !== args.formId),
  });
}

/** Mark reviewed / unreviewed: every loaded page of the inbox and the open response update together. */
export function setReviewedLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.formResults.setReviewed>) {
  const ids = new Set<string>(args.responseIds);
  for (const { args: queryArgs, value } of store.getAllQueries(api.formResults.listResponses)) {
    if (!value || queryArgs.formId !== args.formId) continue;
    // Rows that no longer match a reviewed filter stay until the server answers, so nothing jumps under the pointer.
    store.setQuery(api.formResults.listResponses, queryArgs, { ...value, page: value.page.map((r) => (ids.has(r._id) ? { ...r, reviewed: args.reviewed } : r)) });
  }
  for (const id of args.responseIds) {
    const response = store.getQuery(api.formResults.getResponse, { responseId: id });
    if (response) store.setQuery(api.formResults.getResponse, { responseId: id }, { ...response, reviewed: args.reviewed });
  }
}

/** Opening the bell marks notifications read without waiting. */
export function markNotificationsReadLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.notifications.markNotificationsRead>) {
  const current = store.getQuery(api.notifications.listNotifications, {});
  if (!current) return;
  const ids = args.ids ? new Set<string>(args.ids) : null;
  const items = current.items.map((n) => (!ids || ids.has(n._id) ? { ...n, read: true } : n));
  store.setQuery(api.notifications.listNotifications, {}, { items, unread: items.filter((n) => !n.read).length });
}

/** useMutation with an optimistic update attached once (stable identity across renders). */
export function useOptimisticMutation<M extends FunctionReference<"mutation">>(ref: M, update: (store: OptimisticLocalStore, args: FunctionArgs<M>) => void) {
  const mutation = useMutation(ref);
  // Test doubles are plain functions without withOptimisticUpdate; they run unchanged.
  return useMemo(() => (typeof mutation.withOptimisticUpdate === "function" ? mutation.withOptimisticUpdate(update) : mutation), [mutation, update]);
}
