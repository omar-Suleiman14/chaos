import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import FlashcardBlockEditor from "@/components/learn/editor/FlashcardBlockEditor";
const mocks = vi.hoisted(() => ({ create: vi.fn(), publish: vi.fn(), loadMore: vi.fn(), deck: null as null | { _id: string; title: string; revision: number; cards: { id: string }[]; publishedVersionId?: string; visibility: string } }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ status: "CanLoadMore", results: [{ _id: "existing", title: "Anatomy", archived: false, visibility: "public", publishedVersionId: "v1" }], loadMore: mocks.loadMore }),
  useQuery: () => mocks.deck,
  useMutation: () => (args: { setId?: string }) => args.setId ? mocks.publish(args) : mocks.create(args),
}));
beforeEach(() => { vi.clearAllMocks(); mocks.deck = null; mocks.create.mockResolvedValue("new-deck"); mocks.publish.mockResolvedValue("version"); });
afterEach(() => vi.restoreAllMocks());
it("attaches an existing deck by title and can load another page", () => {
  const onSelect = vi.fn(); render(<FlashcardBlockEditor setId="" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("combobox", { name: "Attach existing" }));
  fireEvent.click(screen.getByRole("option", { name: "Anatomy" }));
  expect(onSelect).toHaveBeenCalledWith("existing");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(mocks.loadMore).toHaveBeenCalledWith(20);
});
it("creates a reusable private deck without silently publishing it", async () => {
  const onSelect = vi.fn(); render(<FlashcardBlockEditor setId="" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new" }));
  expect(screen.getByRole("button", { name: "Create deck" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Deck title"), { target: { value: " Cranial nerves " } });
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Function?" } });
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Recall" } });
  fireEvent.click(screen.getByRole("button", { name: "Create deck" }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith("new-deck"));
  expect(mocks.create).toHaveBeenCalledWith({ title: "Cranial nerves", cards: [{ id: "card_1", front: "Function?", back: "Recall", conceptIds: [] }] });
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("publishes a selected draft only after the author clicks Publish deck", async () => {
  mocks.deck = { _id: "new-deck", title: "Deck", revision: 3, cards: [{ id: "c" }], visibility: "private" };
  render(<FlashcardBlockEditor setId="new-deck" onSelect={vi.fn()} />);
  expect(mocks.publish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publish deck for learners" }));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ setId: "new-deck", expectedRevision: 3, visibility: "public" }));
});
it("shows a failed creation and preserves the author input for retry", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Could not save"));
  render(<FlashcardBlockEditor setId="" onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new" }));
  for (const [label, value] of [["Deck title", "Deck"], ["Question", "Front"], ["Answer", "Back"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create deck" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByLabelText("Question")).toHaveValue("Front");
  expect(screen.getByRole("button", { name: "Create deck" })).toBeEnabled();
});

it("labels deck creation fields for keyboard and screen reader use", async () => {
  const { container } = render(<FlashcardBlockEditor setId="" onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create new" }));
  expect((await axe(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } })).violations).toEqual([]);
});
