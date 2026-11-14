import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { useExamAnswerAutosave } from "../../components/exams/useExamAnswerAutosave";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{
    questionIndex: number; choiceIds: string[]; text: string; flagged: boolean;
    savedForLater: boolean; revision: number; savedAt: number; lastMutationId: string;
  }>,
  save: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.rows,
  useMutation: () => mocks.save,
}));

const attemptId = "fake-attempt-01" as Id<"examAttempts">;
const draft = { choiceIds: ["a"], text: "", flagged: true, savedForLater: false };
beforeEach(() => {
  mocks.rows = [];
  mocks.save.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "fixture-mutation-token-123" });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("exam answer autosave hook", () => {
  it("keeps pending local drafts explicitly unsaved through connection loss", async () => {
    const { result } = renderHook(() => useExamAnswerAutosave(attemptId, 0));
    await waitFor(() => expect(result.current.status).toBe("saved"));
    act(() => { result.current.change(draft); });
    expect(result.current.status).toBe("pending");
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.savedAt).toBeNull();
    await waitFor(() => expect(window.sessionStorage.length).toBe(1));
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current.status).toBe("offline");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.status).toBe("pending"));
    act(() => { result.current.discardLocalDraft(); });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("marks other-tab changes as conflicts instead of falsely acknowledging them", async () => {
    const { result, rerender } = renderHook(() => useExamAnswerAutosave(attemptId, 0));
    act(() => { result.current.change(draft); });
    mocks.rows = [{
      questionIndex: 0, choiceIds: ["b"], text: "", flagged: false,
      savedForLater: false, revision: 2, savedAt: 123,
      lastMutationId: "other-tab-unique-token",
    }];
    rerender();
    await waitFor(() => expect(result.current.status).toBe("conflict"));
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.savedAt).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
