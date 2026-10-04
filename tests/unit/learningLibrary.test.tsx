import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import FlashcardsHub from "@/components/learn/FlashcardsHub";
import CoursesHub from "@/components/courses/CoursesHub";
import { filterLearningRows } from "@/components/library/LearningLibrary";

const rows = [
  { id: "a", title: "Alpha", published: false, updatedAt: 100, count: 2, href: "/a" },
  { id: "b", title: "Beta", published: true, updatedAt: 200, count: 5, href: "/b" },
];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/learn/data", () => ({ useFlashcardSets: () => rows.map(row => ({ ...row, cards: Array(row.count).fill({}), description: "", visibility: "private" })), useLearnActions: () => ({ createFlashcardSet: vi.fn() }) }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => rows.map(row => ({ ...row, lessons: row.count, visibility: "public", archived: false })) }));

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
  expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Name", "Status", countLabel, "Edited"]);
  expect(within(table).getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  fireEvent.click(within(table).getByRole("button", { name: "Name" }));
  expect(onSort).toHaveBeenCalledWith("name", "desc");
  fireEvent.click(within(table).getByRole("button", { name: countLabel }));
  expect(onSort).toHaveBeenCalledWith("count", "desc");
  expect(within(table).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", expect.stringContaining("/a"));
});

it.each([FlashcardsHub, CoursesHub])("shows no results for an unmatched title", Hub => {
  render(<Hub embedded view="list" search="missing" />);
  expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Alpha" })).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("link", { name: "Browse public courses" })).toBeNull();
});
