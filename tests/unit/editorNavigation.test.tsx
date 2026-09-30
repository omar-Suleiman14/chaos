import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import EditorPage from "@/app/dashboard/editor/page";

const route = vi.hoisted(() => ({ quizId: "quiz-a", userId: "owner-a" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ id: route.quizId }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: route.userId } }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/haptics", () => ({ haptics: { select: vi.fn() } }));
vi.mock("@/lib/convexCache", () => ({ useQuery: (ref: never) => {
  switch (getFunctionName(ref)) {
    case "quizFunctions:getQuizForOwner": return { _id: route.quizId, title: `${route.userId}:${route.quizId}`, slug: "example", updatedAt: 1 };
    case "quizFunctions:getQuestionsForOwner": case "quizFunctions:getMyQuizzes": return [];
    default: return {};
  }
} }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));

beforeEach(() => { localStorage.clear(); route.quizId = "quiz-a"; route.userId = "owner-a"; });

describe("editor draft identity", () => {
  it("loads the new quiz instead of carrying the previous quiz's unsaved draft", () => {
    const { rerender } = render(<EditorPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Unsaved quiz A" } });
    route.quizId = "quiz-b";
    rerender(<EditorPage />);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("owner-a:quiz-b");
    expect(JSON.parse(localStorage.getItem("chaos-editor-v2:owner-a:quiz-a")!).draft.title).toBe("Unsaved quiz A");
    expect(localStorage.getItem("chaos-editor-v2:owner-a:quiz-b")).toBeNull();
  });

  it("clears draft and undo state when the signed-in account changes", () => {
    const { rerender } = render(<EditorPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Owner A private draft" } });
    route.userId = "owner-b";
    rerender(<EditorPage />);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("owner-b:quiz-a");
    expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
  });
});
