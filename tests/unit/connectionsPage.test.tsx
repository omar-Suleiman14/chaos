import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import ConnectionsPage from "@/app/dashboard/connections/page";

const now = Date.now();
const NEW_TOKEN = "chaos_" + "b".repeat(64);
const connections = [{
  _id: "c1", label: "Max", tokenHint: "chaos_aaaaaa…", scopes: ["items:read", "drafts:create"], access: "selected",
  items: [{ ref: "form_1", title: "Survey" }], createdAt: now - 86_400_000, expiresAt: null, lastUsedAt: now - 60_000, revokedAt: null,
  rotatedAt: null, previousTokenExpiresAt: now + 3_600_000,
  activity: [{ at: now - 60_000, action: "draft.created", itemRef: "form_1" }],
}];
const m = vi.hoisted(() => ({
  rotate: vi.fn(async () => ({ token: "chaos_" + "b".repeat(64), previousTokenExpiresAt: Date.now() + 86_400_000 })),
  revoke: vi.fn(async () => null),
  other: vi.fn(async () => null),
}));
const query = (ref: Parameters<typeof getFunctionName>[0]) => {
  const name = getFunctionName(ref);
  return name === "integrations:listConnections" ? connections : name === "integrations:apiLimits" ? { read: 300, write: 60 } : undefined;
};
vi.mock("@/lib/convexCache", () => ({ useQuery: (ref: Parameters<typeof getFunctionName>[0]) => query(ref) }));
vi.mock("@/lib/analytics", () => ({ default: { capture: vi.fn() } }));
vi.mock("@/app/dashboard/connections/WebhooksSection", () => ({ default: () => null }));
vi.mock("@/lib/learn/data", () => ({ useMyLessons: () => [], useFolders: () => [], useCurriculumNodes: () => [] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => query(ref),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    return name === "integrations:rotateConnection" ? m.rotate : name === "integrations:revokeConnection" ? m.revoke : m.other;
  },
}));

describe("connections page", () => {
  it("lists scopes, last use, activity and limits, rotates once-shown tokens and explains revocation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ConnectionsPage />);
    expect(screen.getByText("See titles and status · Create drafts")).toBeInTheDocument();
    expect(screen.getByText(/last used/)).toBeInTheDocument();
    expect(screen.getByText(/old token works until/)).toBeInTheDocument();
    expect(screen.getByText("Each connection can make up to 300 reads and 60 changes a minute.")).toBeInTheDocument();
    expect(within(screen.getByText("Recent activity").closest("details")!).getByText("Max created draft “Survey”")).toBeInTheDocument();
    // Scopes are also explained as plain sentences, including what it cannot do.
    const access = screen.getByText("What Max can and cannot do").closest("details")!;
    expect(within(access).getByText("Max can create new form and quiz drafts. You review and publish them in Chaos.")).toBeInTheDocument();
    expect(within(access).getByText("Max cannot publish, close or share anything for you.")).toBeInTheDocument();
    expect(within(access).getByText("Max cannot read or change your lessons.")).toBeInTheDocument();
    // Only the hint is shown for an existing token.
    expect(screen.queryByLabelText("Connection token")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New token" }));
    // Confirmed in the app's own dialog, never window.confirm.
    const rotateDialog = await screen.findByRole("dialog");
    fireEvent.click(within(rotateDialog).getByRole("button", { name: "New token" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("Connection token")).toHaveValue(NEW_TOKEN);
    expect(m.rotate).toHaveBeenCalledWith({ tokenId: "c1" });
    expect(screen.getByText(/The old token stops working/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I have saved it" }));
    expect(screen.queryByLabelText("Connection token")).toBeNull();
    expect(document.body.textContent).not.toContain(NEW_TOKEN);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/can no longer read your items, create or update drafts[^]*Drafts and items it created stay/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect(m.revoke).toHaveBeenCalledWith({ tokenId: "c1" });
    confirm.mockRestore();
  });
});
