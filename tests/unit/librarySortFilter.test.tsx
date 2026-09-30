import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import CreatorLibrary from "@/components/library/CreatorLibrary";

const theme = { accent: "#3595e3", background: "plain", font: "sans", radius: "small" };
const form = (id: string, title: string, status: string, updatedAt: number, responseCount: number) => ({
  _id: id, title, status, updatedAt, responseCount, quizMode: false, hasUnpublishedChanges: false, groupName: "", theme, presentation: "page", shareId: id,
});
const forms = {
  owned: [
    form("a", "Beta survey", "live", 3, 5),
    form("b", "Alpha form", "draft", 2, 40),
    form("c", "Old signup", "archived", 1, 9),
  ],
  shared: [],
};
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const setFormStatus = vi.hoisted(() => vi.fn(async () => null));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:listMyForms" ? forms : getFunctionName(ref) === "quizFunctions:getMyQuizzes" ? [] : undefined),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:setFormStatus" ? setFormStatus : vi.fn()),
}));
vi.mock("@/components/workspace/useCreateForm", () => ({ useCreateForm: () => ({ create: vi.fn(), busy: false }) }));
vi.mock("./FormThumb", () => ({ default: () => null }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chaos-library-view", "list");
  Element.prototype.scrollIntoView = vi.fn();
});

const names = () => within(screen.getByRole("table")).getAllByRole("link").map((a) => a.textContent?.trim());

describe("library sort and filter", () => {
  it("sorts from the column headers, and a second click reverses", () => {
    render(<CreatorLibrary />);
    expect(names()).toEqual(["BBeta survey", "AAlpha form"]);
    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(names()).toEqual(["AAlpha form", "BBeta survey"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(names()).toEqual(["BBeta survey", "AAlpha form"]);
    fireEvent.click(screen.getByRole("button", { name: /^Responses/ }));
    expect(names()).toEqual(["AAlpha form", "BBeta survey"]);
    expect(localStorage.getItem("chaos-library-sort")).toBe("responses");
  });

  it("archives from the row menu, with undo", async () => {
    render(<CreatorLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Beta survey" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await screen.findByText(/Archived “Beta survey”/);
    expect(setFormStatus).toHaveBeenCalledWith({ formId: "a", status: "archived" });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(setFormStatus).toHaveBeenLastCalledWith({ formId: "a", status: "live" });
  });

  it("filters by status, keeps archived forms out and offers no delete", () => {
    render(<CreatorLibrary />);
    expect(screen.queryByText("Old signup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter by status" }));
    expect(screen.queryByRole("menuitemcheckbox", { name: "Archived" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Draft" }));
    expect(names()).toEqual(["AAlpha form"]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Clear filter/ }));
    expect(names()).toEqual(["BBeta survey", "AAlpha form"]);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Beta survey" }));
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).toBeNull();
  });
});
