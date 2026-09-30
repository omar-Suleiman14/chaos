import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFormDraft } from "@/app/dashboard/forms/[formId]/use-form-draft";
import { emptyDefinition } from "@/convex/formLogic";
import type { Id } from "@/convex/_generated/dataModel";

const mutation = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useMutation: () => mutation }));
const formId = "form-a" as Id<"forms">;
const server = { draft: emptyDefinition("Original"), draftRevision: 1 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => { vi.useFakeTimers(); mutation.mockReset(); localStorage.clear(); });
afterEach(() => vi.useRealTimers());

it("drains edits made during a slow autosave and lets explicit saves join it", async () => {
  const first = deferred<{ draftRevision: number }>();
  const second = deferred<{ draftRevision: number }>();
  mutation.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useFormDraft(formId, server, true));
  act(() => result.current.change((d) => ({ ...d, title: "First" })));
  act(() => vi.advanceTimersByTime(1200));
  act(() => result.current.change((d) => ({ ...d, title: "Latest" })));
  act(() => vi.advanceTimersByTime(1200));
  let waiting!: Promise<boolean>;
  act(() => { waiting = result.current.save(); });
  let finished = false;
  void waiting.then(() => { finished = true; });
  await act(async () => first.resolve({ draftRevision: 2 }));
  expect(finished).toBe(false);
  expect(mutation).toHaveBeenCalledTimes(2);
  expect(mutation.mock.calls[1][0]).toMatchObject({ expectedRevision: 2, definition: { title: "Latest" } });
  await act(async () => second.resolve({ draftRevision: 3 }));
  expect(await waiting).toBe(true);
  expect(result.current.isDirty()).toBe(false);
  expect(localStorage.getItem(`chaos-form-draft:${formId}`)).toBeNull();
});

it("keeps recovery after failure and does not automatically retry a conflict online", async () => {
  mutation.mockRejectedValue(new Error("DRAFT_CONFLICT: Changed elsewhere"));
  const { result } = renderHook(() => useFormDraft(formId, server, true));
  act(() => result.current.change((d) => ({ ...d, title: "Local" })));
  await act(async () => { expect(await result.current.save()).toBe(false); });
  act(() => window.dispatchEvent(new Event("online")));
  expect(mutation).toHaveBeenCalledTimes(1);
  expect(result.current.saveState.kind).toBe("conflict");
  expect(localStorage.getItem(`chaos-form-draft:${formId}`)).toContain("Local");
});

it("does not clear recovery when a save completes after unmount", async () => {
  const pending = deferred<{ draftRevision: number }>();
  mutation.mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(() => useFormDraft(formId, server, true));
  act(() => result.current.change((d) => ({ ...d, title: "Pending" })));
  let saving!: Promise<boolean>;
  act(() => { saving = result.current.save(); });
  unmount();
  pending.resolve({ draftRevision: 2 });
  expect(await saving).toBe(false);
  expect(localStorage.getItem(`chaos-form-draft:${formId}`)).toContain("Pending");
});

it("ignores undo and redo after edit permission is lost", async () => {
  const { result, rerender } = renderHook(({ canEdit }) => useFormDraft(formId, server, canEdit), { initialProps: { canEdit: true } });
  act(() => result.current.change((d) => ({ ...d, title: "Changed" })));
  rerender({ canEdit: false });
  act(() => result.current.undo());
  expect(result.current.draft?.title).toBe("Changed");
  expect(await result.current.save()).toBe(false);
  expect(mutation).not.toHaveBeenCalled();
  expect(localStorage.getItem(`chaos-form-draft:${formId}`)).toContain("Changed");
});

it("retains recovery when an in-flight save is rejected after permission loss", async () => {
  let reject!: (reason: Error) => void;
  mutation.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const { result, rerender } = renderHook(({ canEdit }) => useFormDraft(formId, server, canEdit), { initialProps: { canEdit: true } });
  act(() => result.current.change((d) => ({ ...d, title: "Recovery" })));
  let saving!: Promise<boolean>;
  act(() => { saving = result.current.save(); });
  rerender({ canEdit: false });
  await act(async () => reject(new Error("FORBIDDEN: Editing is no longer allowed")));
  expect(await saving).toBe(false);
  expect(result.current.isDirty()).toBe(true);
  expect(result.current.saveState.kind).toBe("error");
  expect(localStorage.getItem(`chaos-form-draft:${formId}`)).toContain("Recovery");
});
