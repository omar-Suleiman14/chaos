import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/[lang]/(app)/dashboard/learn/flashcards/[id]/page";

const route = vi.hoisted(() => ({ id: "first", update: vi.fn(), replace: vi.fn(), mode: "edit" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: route.id }), useSearchParams: () => new URLSearchParams(route.mode ? `mode=${route.mode}` : ""), useRouter: () => ({ push: vi.fn(), replace: route.replace }) }));
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useQuery: () => [] }));
vi.mock("@/lib/learn/data", () => ({
  useFlashcardSet: () => ({ id: route.id, title: route.id === "first" ? "First set" : "New set", description: "", ownerId: "owner", cards: [], visibility: "private" }),
  useLearnViewer: () => ({ id: "owner", signedIn: true }),
  useLearnActions: () => ({ updateFlashcardSet: route.update }),
  newId: () => "blank-card",
}));
vi.mock("@/components/learn/study/FlashcardStudy", () => ({ default: () => <p>Study screen</p> }));
vi.mock("@/components/learn/reader/LessonReader", () => ({ UnavailableLesson: () => null }));
vi.mock("@/components/learn/ui", () => ({ ProvenanceLine: () => null }));
beforeEach(() => { route.id = "first"; route.update.mockClear(); route.replace.mockClear(); route.mode = "edit"; });

it("opens a new empty set with a first card ready to type", () => {
  render(<Page />);
  expect(screen.getByRole("textbox", { name: "Front" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Back" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

it("opens the next newly created set in edit mode without retaining the old set's state", () => {
  const view = render(<Page />);
  fireEvent.change(screen.getByRole("textbox", { name: "Front" }), { target: { value: "Old draft" } });
  fireEvent.click(screen.getByRole("tab", { name: "Study" }));
  expect(screen.getByText("Study screen")).toBeInTheDocument();
  route.id = "next";
  view.rerender(<Page />);
  expect(screen.queryByText("Study screen")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Front" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("New set");
});

it("saves to Study and removes edit mode so a refresh stays out of the editor", async () => {
  const view = render(<Page />);
  fireEvent.change(screen.getByRole("textbox", { name: "Front" }), { target: { value: "Question" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Back" }), { target: { value: "Answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(route.replace).toHaveBeenCalledWith("/dashboard/learn/flashcards/first"));
  expect(screen.getByText("Study screen")).toBeInTheDocument();
  view.unmount();
  route.mode = "";
  render(<Page />);
  expect(screen.queryByRole("textbox", { name: "Front" })).toBeNull();
});
