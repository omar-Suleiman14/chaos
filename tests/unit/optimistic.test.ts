import { describe, expect, it } from "vitest";
import { getFunctionName } from "convex/server";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { deleteFormLocally, markNotificationsReadLocally, setFormStatusLocally, setReviewedLocally } from "@/lib/optimistic";

/** A tiny stand-in for Convex's local query store, keyed by function name and args. */
function fakeStore(entries: [unknown, Record<string, unknown>, unknown][]) {
  const map = new Map(entries.map(([q, args, value]) => [`${getFunctionName(q as never)}:${JSON.stringify(args)}`, { args, value }]));
  const key = (q: unknown, args: unknown) => `${getFunctionName(q as never)}:${JSON.stringify(args)}`;
  const store = {
    getQuery: (q: unknown, args: unknown) => map.get(key(q, args ?? {}))?.value,
    setQuery: (q: unknown, args: unknown, value: unknown) => { map.set(key(q, args ?? {}), { args: args as Record<string, unknown>, value }); },
    getAllQueries: (q: unknown) => [...map.entries()].filter(([k]) => k.startsWith(`${getFunctionName(q as never)}:`)).map(([, v]) => v),
  };
  return { store: store as unknown as OptimisticLocalStore, get: (q: unknown, args: unknown) => store.getQuery(q, args) as never };
}

describe("optimistic updates", () => {
  it("moves a form's status in the library and the builder at once, and removes deleted forms", () => {
    const library = { owned: [{ _id: "a", status: "live" }, { _id: "b", status: "draft" }], shared: [] };
    const { store, get } = fakeStore([[api.forms.listMyForms, {}, library], [api.forms.getFormForEditor, { formId: "a" }, { _id: "a", status: "live" }]]);
    setFormStatusLocally(store, { formId: "a" as never, status: "archived" });
    expect(get(api.forms.listMyForms, {})).toEqual({ owned: [{ _id: "a", status: "archived" }, { _id: "b", status: "draft" }], shared: [] });
    expect(get(api.forms.getFormForEditor, { formId: "a" })).toMatchObject({ status: "archived" });
    deleteFormLocally(store, { formId: "a" as never });
    expect((get(api.forms.listMyForms, {}) as typeof library).owned.map((f) => f._id)).toEqual(["b"]);
  });

  it("marks responses reviewed on every loaded page of that form", () => {
    const pageArgs = { formId: "f", filter: {}, paginationOpts: { numItems: 50, cursor: null } };
    const { store, get } = fakeStore([[api.formResults.listResponses, pageArgs, { page: [{ _id: "r1", reviewed: false }, { _id: "r2", reviewed: false }], isDone: true, continueCursor: "" }]]);
    setReviewedLocally(store, { formId: "f" as never, responseIds: ["r2" as never], reviewed: true });
    expect((get(api.formResults.listResponses, pageArgs) as { page: unknown[] }).page).toEqual([{ _id: "r1", reviewed: false }, { _id: "r2", reviewed: true }]);
  });

  it("clears the unread count when notifications are marked read", () => {
    const { store, get } = fakeStore([[api.notifications.listNotifications, {}, { items: [{ _id: "n1", read: false }, { _id: "n2", read: false }], unread: 2 }]]);
    markNotificationsReadLocally(store, { ids: ["n1" as never] });
    expect(get(api.notifications.listNotifications, {})).toMatchObject({ unread: 1 });
    markNotificationsReadLocally(store, {});
    expect(get(api.notifications.listNotifications, {})).toMatchObject({ unread: 0 });
  });
});
