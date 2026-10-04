import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DocumentationPanel from "@/components/admin/DocumentationPanel";

const { save } = vi.hoisted(() => ({ save: vi.fn(async () => ({ revision: 0 })) }));
vi.mock("convex/react", () => ({ useQuery: () => [], useMutation: () => save }));

describe("documentation block authoring", () => {
  it("authors and reorders readable blocks before publishing, without requiring JSON", async () => {
    render(<DocumentationPanel />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Connect Chaos" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "connect-chaos" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Use the HTTP endpoint." } });
    fireEvent.click(screen.getByLabelText("New block type")); fireEvent.click(screen.getByRole("option", { name: "Heading" }));
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    fireEvent.change(screen.getAllByLabelText("Text")[1], { target: { value: "Sign in" } });
    fireEvent.change(screen.getByLabelText("Link anchor"), { target: { value: "sign-in" } });
    fireEvent.click(screen.getByRole("button", { name: "Move block 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish guide" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ publish: true, content: expect.objectContaining({ blocks: [{ type: "heading", id: "sign-in", text: "Sign in" }, { type: "p", text: "Use the HTTP endpoint." }] }) })));
    expect(screen.queryByLabelText("Content blocks (JSON)")).toBeNull();
  });
});
