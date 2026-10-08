import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import QuizBlockEditor from "@/components/learn/editor/QuizBlockEditor";
const mocks = vi.hoisted(() => ({ create: vi.fn(), more: vi.fn() }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [{ id: "existing", title: "Anatomy checkpoint", published: true }], status: "CanLoadMore", loadMore: mocks.more }),
  useMutation: () => mocks.create,
}));
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue("new-form"); });
it("chooses a titled existing quiz form and pages the library", () => {
  const select = vi.fn(); render(<QuizBlockEditor assetId="" onSelect={select} />);
  fireEvent.click(screen.getByLabelText("Attach existing quiz")); fireEvent.click(screen.getByRole("option", { name: "Anatomy checkpoint" }));
  expect(select).toHaveBeenCalledWith({ kind: "form", id: "existing" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(mocks.more).toHaveBeenCalledWith(20);
  expect(screen.queryByLabelText("Quiz type")).toBeNull();
});
it("creates a quiz draft from the block and offers its question editor without publishing", async () => {
  const select = vi.fn(); const ui = render(<QuizBlockEditor assetId="" onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new quiz" }));
  expect(screen.getByRole("button", { name: "Create quiz draft" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Quiz title"), { target: { value: " Checkpoint " } });
  fireEvent.click(screen.getByRole("button", { name: "Create quiz draft" }));
  await waitFor(() => expect(select).toHaveBeenCalledWith({ kind: "form", id: "new-form" }));
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ title: "Checkpoint", quizMode: true });
  ui.rerender(<QuizBlockEditor assetId="new-form" onSelect={select} />);
  expect(screen.getByRole("link", { name: "Edit questions and publish" })).toHaveAttribute("href", "/dashboard/forms/new-form");
});
it("preserves failed creation input and allows retry", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Save failed"));
  render(<QuizBlockEditor assetId="" onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new quiz" }));
  fireEvent.change(screen.getByLabelText("Quiz title"), { target: { value: "Checkpoint" } });
  fireEvent.click(screen.getByRole("button", { name: "Create quiz draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("Quiz title")).toHaveValue("Checkpoint");
  expect(screen.getByRole("button", { name: "Create quiz draft" })).toBeEnabled();
});
it("labels the picker and creation controls accessibly", async () => {
  const { container } = render(<QuizBlockEditor assetId="" onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new quiz" }));
  expect((await axe(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } })).violations).toEqual([]);
});
