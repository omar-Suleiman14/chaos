import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import ArchivePage from "@/app/dashboard/archive/page";

const theme = { accent: "#3595e3", background: "plain", font: "sans", radius: "small" };
const forms = { owned: [
  { _id: "a", title: "Live one", status: "live", updatedAt: Date.now(), responseCount: 1, theme },
  { _id: "b", title: "Old signup", status: "archived", updatedAt: Date.now() - 1000, responseCount: 9, theme, publishedVersion: 2 },
], shared: [] };
const m = vi.hoisted(() => ({ setFormStatus: vi.fn(async () => null), deleteForm: vi.fn(async () => null) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:listMyForms" ? forms : undefined),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:deleteForm" ? m.deleteForm : m.setFormStatus),
}));

describe("archive page", () => {
  it("lists only archived forms, restores with undo and deletes after confirming", async () => {
    render(<ArchivePage />);
    expect(screen.queryByText("Live one")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    await screen.findByText(/Restored “Old signup”/);
    expect(m.setFormStatus).toHaveBeenCalledWith({ formId: "b", status: "closed" });
    fireEvent.click(screen.getByRole("button", { name: "More for Old signup" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete forever/ }));
    expect(screen.getByRole("dialog", { name: /Delete “Old signup” forever/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Delete forever$/ }));
    await screen.findByText(/Deleted “Old signup”/);
    expect(m.deleteForm).toHaveBeenCalledWith({ formId: "b" });
  });
});
