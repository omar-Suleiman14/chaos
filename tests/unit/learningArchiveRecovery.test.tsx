import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import LearningArchive from "@/components/library/LearningArchive";

const state = vi.hoisted(() => ({ restoreCourse: vi.fn(), restoreCards: vi.fn(), restoreLesson: vi.fn(), loadMore: vi.fn(), query: vi.fn(), status: "Exhausted", authenticated: true, courseArchived: true, revision: 7 }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "courses:setArchived" ? state.restoreCourse : getFunctionName(ref) === "lessons:setLifecycle" ? state.restoreLesson : state.restoreCards,
  usePaginatedQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown, options: unknown) => {
    const name = getFunctionName(ref); state.query(name, args, options);
    // The server returns archived rows only, already summarised (no drafts or card text).
    const kind = (args as { kind?: string } | "skip") === "skip" ? undefined : (args as { kind: string }).kind;
    return { status: state.status, loadMore: state.loadMore, results: kind === "courses" ? (state.courseArchived ? [{ id: "course-old", title: "Old course", updatedAt: 100, count: 1, published: false }] : [])
      : kind === "lessons" ? [{ id: "lesson-old", title: "Old lesson", updatedAt: 100, count: 1, published: false, revision: 4 }]
      : kind === "flashcards" ? [{ id: "cards-old", title: "Old cards", updatedAt: 100, count: 1, published: false, revision: state.revision }] : [] };
  },
}));
beforeEach(() => {
  vi.clearAllMocks(); state.status = "Exhausted"; state.authenticated = true; state.courseArchived = true; state.revision = 7;
  state.restoreCourse.mockResolvedValue(null); state.restoreCards.mockResolvedValue(8); state.restoreLesson.mockResolvedValue(5);
});

it("lists archived owned courses without draft links and restores them permanently", async () => {
  const view = render(<LearningArchive kind="courses" />);
  expect(state.query).toHaveBeenCalledWith("archive:list", { kind: "courses" }, { initialNumItems: 25 });
  expect(screen.getByText("Old course")).toBeInTheDocument();
  expect(screen.queryByText("Active course")).toBeNull();
  expect(screen.queryByRole("link", { name: "Old course" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Restore Old course" }));
  await waitFor(() => expect(state.restoreCourse).toHaveBeenCalledWith({ courseId: "course-old", archived: false }));
  expect(await screen.findByRole("status")).toHaveTextContent("Restored “Old course”");
  state.courseArchived = false; view.rerender(<LearningArchive kind="courses" />);
  expect(screen.queryByText("Old course")).toBeNull();
  expect(screen.getByText("Nothing archived")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to library" })).toBeNull();
});

it("restores archived cards using the current revision and keeps failed rows available for retry", async () => {
  state.restoreCards.mockRejectedValueOnce(new Error("CONFLICT: Reload before restoring."));
  const view = render(<LearningArchive kind="flashcards" />);
  expect(state.query).toHaveBeenCalledWith("archive:list", { kind: "flashcards" }, { initialNumItems: 25 });
  expect(screen.queryByText("Active cards")).toBeNull();
  expect(screen.queryByText("Private front")).toBeNull();
  expect(screen.queryByRole("link", { name: "Old cards" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Restore Old cards" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload before restoring.");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Restore Old cards" })).toBeEnabled();
  state.revision = 9; view.rerender(<LearningArchive kind="flashcards" />);
  fireEvent.click(screen.getByRole("button", { name: "Restore Old cards" }));
  await waitFor(() => expect(state.restoreCards).toHaveBeenLastCalledWith({ setId: "cards-old", expectedRevision: 9, action: "restore" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Restored “Old cards”");
});

it("disables restore and pagination during a restore and pages to older archived content", async () => {
  state.status = "CanLoadMore";
  let finish!: () => void;
  state.restoreCourse.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  render(<LearningArchive kind="courses" />);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(state.loadMore).toHaveBeenCalledWith(25);
  fireEvent.click(screen.getByRole("button", { name: "Restore Old course" }));
  expect(screen.getByRole("button", { name: "Restore Old course" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled();
  await act(async () => { finish(); });
  expect(screen.getByRole("button", { name: "Restore Old course" })).toBeEnabled();
});

it("shows a loading state and skips owner queries when signed out", () => {
  state.authenticated = false; state.status = "LoadingFirstPage";
  render(<LearningArchive kind="flashcards" />);
  expect(state.query).toHaveBeenCalledWith("archive:list", "skip", { initialNumItems: 25 });
  expect(screen.getByRole("status")).toHaveTextContent("Loading archive...");
  expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
});

it("reactivates archived lessons with their revision and only subscribes to the selected type", async () => {
  const view = render(<LearningArchive kind="courses" />);
  expect(state.query.mock.calls.every(([, args]) => (args as { kind: string }).kind === "courses")).toBe(true);
  state.query.mockClear();
  view.rerender(<LearningArchive kind="lessons" />);
  expect(state.query.mock.calls.every(([, args]) => (args as { kind: string }).kind === "lessons")).toBe(true);
  expect(screen.queryByText("Active lesson")).toBeNull();
  expect(screen.queryByText("Private prose")).toBeNull();
  expect(screen.queryByRole("link", { name: "Old lesson" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Restore Old lesson" }));
  await waitFor(() => expect(state.restoreLesson).toHaveBeenCalledWith({ lessonId: "lesson-old", expectedRevision: 4, action: "reactivate" }));
  expect(screen.queryByRole("link", { name: "Back to library" })).toBeNull();
});
