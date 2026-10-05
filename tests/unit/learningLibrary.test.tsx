import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import userEvent from "@testing-library/user-event";
import FlashcardsHub from "@/components/learn/FlashcardsHub";
import CoursesHub from "@/components/courses/CoursesHub";
import { filterLearningRows } from "@/components/library/LearningLibrary";

const rows = [
  { id: "a", title: "Alpha", published: false, updatedAt: 100, count: 2, href: "/a" },
  { id: "b", title: "Beta", published: true, updatedAt: 200, count: 5, href: "/b" },
];
const calls = vi.hoisted(() => ({ push: vi.fn(), createDeck: vi.fn(), archiveDeck: vi.fn(), restoreDeck: vi.fn(), archiveCourse: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: calls.push }) }));
vi.mock("@/lib/learn/data", () => ({ useFlashcardSets: () => rows.map(row => ({ ...row, cards: Array.from({ length: row.count }, (_, index) => ({ id: `card_${index}`, front: "Question", back: "Answer" })), description: "", visibility: "private" })), useLearnActions: () => ({ createFlashcardSet: calls.createDeck, deleteFlashcardSet: calls.archiveDeck }) }));
vi.mock("convex/react", () => ({ useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "courses:setArchived" ? calls.archiveCourse : getFunctionName(ref) === "flashcards:setLifecycle" ? calls.restoreDeck : vi.fn(), useQuery: () => rows.map(row => ({ ...row, lessons: row.count, visibility: "public", archived: false })) }));
beforeEach(() => {
  vi.clearAllMocks();
  calls.createDeck.mockResolvedValue("new-deck");
  calls.archiveDeck.mockResolvedValue(8);
  calls.restoreDeck.mockResolvedValue(9);
  calls.archiveCourse.mockResolvedValue(null);
});

it("filters by title and actual publication state and sorts every table column", () => {
  expect(filterLearningRows(rows, { search: "  ALP ", statuses: ["draft"] }).map(row => row.id)).toEqual(["a"]);
  expect(filterLearningRows(rows, { statuses: ["live"] }).map(row => row.id)).toEqual(["b"]);
  for (const sort of ["name", "status", "count", "edited"] as const) {
    const asc = filterLearningRows(rows, { sort, dir: "asc" });
    expect(filterLearningRows(rows, { sort, dir: "desc" }).map(row => row.id)).toEqual(asc.map(row => row.id).reverse());
  }
});

it.each([[FlashcardsHub, "Cards"], [CoursesHub, "Lessons"]] as const)("renders a real sortable learning table", (Hub, countLabel) => {
  const onSort = vi.fn();
  render(<Hub embedded view="list" sort="name" dir="asc" onSort={onSort} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Name", "Status", countLabel, "Edited", "Actions"]);
  expect(within(table).getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  fireEvent.click(within(table).getByRole("button", { name: "Name" }));
  expect(onSort).toHaveBeenCalledWith("name", "desc");
  fireEvent.click(within(table).getByRole("button", { name: countLabel }));
  expect(onSort).toHaveBeenCalledWith("count", "desc");
  expect(within(table).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", expect.stringContaining("/a"));
});

it.each(["list", "gallery"] as const)("offers course actions and reverses an archive in %s view", async view => {
  const user = userEvent.setup();
  render(<div className="workspace-ui"><CoursesHub embedded view={view} /></div>);
  const trigger = screen.getByRole("button", { name: "Actions for Beta" });
  expect(trigger.closest("a")).toBeNull();
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Open / Edit" })).toHaveFocus();
  expect(screen.getByRole("menuitem", { name: "Open / Edit" })).toHaveAttribute("href", "/dashboard/courses/b");
  expect(screen.getByRole("menuitem", { name: "View live" })).toHaveAttribute("href", "/learn/courses/b");
  expect(screen.queryByRole("menuitem", { name: "Duplicate" })).toBeNull();
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(calls.archiveCourse).toHaveBeenCalledWith({ courseId: "b", archived: true }));
  await user.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() => expect(calls.archiveCourse).toHaveBeenLastCalledWith({ courseId: "b", archived: false }));
  expect(calls.push).not.toHaveBeenCalled();
});

it.each(["list", "gallery"] as const)("offers deck actions, duplicates cards and supports archive undo in %s view", async view => {
  const user = userEvent.setup();
  render(<div className="workspace-ui"><FlashcardsHub embedded view={view} /></div>);
  const trigger = screen.getByRole("button", { name: "Actions for Beta" });
  expect(trigger.closest("a")).toBeNull();
  await user.click(trigger);
  expect(screen.getByRole("menuitem", { name: "Open / Edit" })).toHaveAttribute("href", "/dashboard/learn/flashcards/b?mode=edit");
  expect(screen.getByRole("menuitem", { name: "Study" })).toHaveAttribute("href", "/dashboard/learn/flashcards/b");
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(calls.createDeck).toHaveBeenCalledWith({ title: "Beta (copy)", cards: Array.from({ length: 5 }, (_, index) => ({ id: `card_${index}`, front: "Question", back: "Answer" })) }));
  expect(calls.push).toHaveBeenCalledWith("/dashboard/learn/flashcards/new-deck?mode=edit");
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(calls.archiveDeck).toHaveBeenCalledWith("b"));
  await user.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() => expect(calls.restoreDeck).toHaveBeenCalledWith({ setId: "b", expectedRevision: 8, action: "restore" }));
});

it.each([FlashcardsHub, CoursesHub])("shows draft actions without published-only links and reports failed archives", async Hub => {
  calls.archiveDeck.mockRejectedValueOnce(new Error("Could not archive"));
  calls.archiveCourse.mockRejectedValueOnce(new Error("Could not archive"));
  render(<Hub embedded view="list" />);
  fireEvent.click(screen.getByRole("button", { name: "Actions for Alpha" }));
  expect(screen.queryByRole("menuitem", { name: "Study" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "View live" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not archive");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

it.each([FlashcardsHub, CoursesHub])("shows no results for an unmatched title", Hub => {
  render(<Hub embedded view="list" search="missing" />);
  expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Alpha" })).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse public courses" })).toBeNull();
});
