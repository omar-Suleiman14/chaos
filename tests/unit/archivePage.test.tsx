import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import ArchivePage from "@/app/[lang]/(app)/dashboard/archive/page";

const theme = { accent: "#3595e3", background: "plain", font: "sans", radius: "small" };
const forms = { owned: [
  { _id: "a", title: "Live one", status: "live", updatedAt: Date.now(), responseCount: 1, theme },
  { _id: "b", title: "Old signup", status: "archived", updatedAt: Date.now() - 1000, responseCount: 9, theme, publishedVersion: 2 },
  { _id: "c", title: "Old assessment", status: "archived", quizMode: true, updatedAt: Date.now() - 1000, responseCount: 3, theme },
], shared: [] };
const m = vi.hoisted(() => ({ setFormStatus: vi.fn(async () => null), deleteForm: vi.fn(async () => Date.now() + 5000), undoDeleteForm: vi.fn(async () => null) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  // archive:list returns only archived rows of the requested kind.
  usePaginatedQuery: (_ref: unknown, args: { kind?: string } | "skip") => ({ status: "Exhausted", loadMore: vi.fn(), results: args === "skip" ? [] : forms.owned
    .filter(f => f.status === "archived" && (args.kind === "quizzes" ? !!f.quizMode : args.kind === "forms" ? !f.quizMode : false))
    .map(f => ({ id: f._id, title: f.title, updatedAt: f.updatedAt, count: f.responseCount, published: f.publishedVersion !== undefined, accent: f.theme.accent })) }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:listMyForms" ? forms : undefined),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:deleteForm" ? m.deleteForm : getFunctionName(ref) === "forms:undoDeleteForm" ? m.undoDeleteForm : m.setFormStatus),
}));

describe("archive page", () => {
  it("keeps forms as the default and provides separate learning recovery tabs", () => {
    render(<ArchivePage />);
    expect(screen.getByRole("tab", { name: "Forms" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Old assessment")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Quizzes" }));
    expect(screen.getByText("Old assessment")).toBeInTheDocument();
    expect(screen.queryByText("Old signup")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Lessons" })).toBeInTheDocument();
    // An empty classic-quizzes section stays hidden.
    expect(screen.queryByText("Classic quizzes")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Courses" }));
    expect(screen.getByText("Nothing archived")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to library" })).toBeNull();
  });
  it("lists only archived forms, restores with undo and deletes after confirming", async () => {
    render(<ArchivePage />);
    expect(screen.queryByText("Live one")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    await screen.findByText(/Restored “Old signup”/);
    expect(m.setFormStatus).toHaveBeenCalledWith({ formId: "b", status: "closed" });
    fireEvent.click(screen.getByRole("button", { name: "More for Old signup" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete forever/ }));
    expect(screen.getByRole("dialog", { name: /Delete “Old signup” forever/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Delete forever$/ }), { key: "Enter" });
    await screen.findByText(/Deleting “Old signup”/);
    expect(m.deleteForm).toHaveBeenCalledWith({ formId: "b" });
  });
});
