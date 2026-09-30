import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { useEditorDraft } from "@/app/dashboard/editor/use-editor-draft";
import { blankQuestion, type EditorDraft } from "@/app/dashboard/editor/editor-draft";
import type { Id } from "@/convex/_generated/dataModel";

const saveDraft = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useMutation: (ref: never) => getFunctionName(ref) === "quizFunctions:saveQuizDraft" ? saveDraft : vi.fn() }));

const quizId = "quiz-a" as Id<"quizzes">;
const initial = (): EditorDraft => ({
  title: "Original", description: "", slug: "original", groupName: "",
  quizSettings: { randomizeQuestions: false, randomizeOptions: false, showCorrectAnswers: false, showExplanations: false, passingThreshold: 50, disableAnimations: false, poolSize: 0, resultRelease: "immediate" },
  questions: [blankQuestion("mcq", 60)],
});

beforeEach(() => { localStorage.clear(); saveDraft.mockReset(); });

describe("quiz editor recovery during an in-flight save", () => {
  it("retains the latest edits in recovery when an older save fails", async () => {
    let reject!: (error: Error) => void;
    saveDraft.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const { result } = renderHook(() => useEditorDraft(quizId, "owner"));
    act(() => result.current.initialize(initial(), 1));
    act(() => result.current.change((draft) => ({ ...draft, title: "First edit" })));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.save(); });
    act(() => result.current.change((draft) => ({ ...draft, title: "Newest edit" })));
    await act(async () => { reject(new Error("save rejected")); expect(await saving).toBe(false); });
    expect(result.current.draft?.title).toBe("Newest edit");
    const recovery = JSON.parse(localStorage.getItem("chaos-editor-v2:owner:quiz-a")!);
    expect(recovery.draft.title).toBe("Newest edit");
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveState.kind).toBe("error");
  });

  it("acknowledges question IDs without discarding edits made during a successful save", async () => {
    let resolve!: (value: unknown) => void;
    saveDraft.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useEditorDraft(quizId, "owner"));
    act(() => result.current.initialize(initial(), 1));
    act(() => result.current.change((draft) => ({ ...draft, title: "First edit" })));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.save(); });
    act(() => result.current.change((draft) => ({ ...draft, title: "Newest edit" })));
    await act(async () => { resolve({ updatedAt: 2, questionIds: ["question-a"] }); expect(await saving).toBe(true); });
    expect(result.current.draft?.title).toBe("Newest edit");
    expect(result.current.draft?.questions[0].id).toBe("question-a");
    expect(result.current.dirty).toBe(true);
    expect(JSON.parse(localStorage.getItem("chaos-editor-v2:owner:quiz-a")!).draft.title).toBe("Newest edit");
  });
});
