import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import AdminPage from "@/app/[lang]/(app)/admin/page";

const state = vi.hoisted(() => ({
  admin: true,
  mutate: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "quizFunctions:getIsAdmin") return state.admin;
    if (name === "adminAnalytics:overview") return null;
    return undefined;
  },
  useMutation:
    (ref: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      state.mutate(getFunctionName(ref), args),
  usePaginatedQuery: (ref: Parameters<typeof getFunctionName>[0], args: { kind?: string }) =>
    getFunctionName(ref) === "admin:learningContent" ? { results: [{ id: "content1", title: `Chaos ${args.kind}`, ownerId: "c1", ownerName: "Alice", ownerEmail: "alice@example.com", status: "draft", count: 2, updatedAt: 10 }], status: "Exhausted", loadMore: vi.fn() } : getFunctionName(ref) === "admin:teams" ? { results: [{ id: "team1", name: "Chaos Team", ownerId: "c1", ownerName: "Alice", ownerEmail: "alice@example.com", members: 3, sharedResources: 4, createdAt: 10 }], status: "Exhausted", loadMore: vi.fn() } : getFunctionName(ref) === "admin:contacts"
      ? { results: [], status: "Exhausted", loadMore: vi.fn() }
      : {
          results: [
            {
              _id: "u1",
              clerkId: "c1",
              name: "Alice",
              email: "alice@example.com",
              username: "alice",
              state: "active",
              plan: "free",
              reason: "",
              planExpiresAt: null,
            },
            {
              _id: "u2",
              clerkId: "c2",
              name: "Bob",
              email: "bob@example.com",
              username: "bob",
              state: "active",
              plan: "free",
              reason: "",
              planExpiresAt: null,
            },
          ],
          status: "Exhausted",
          loadMore: vi.fn(),
        },
}));
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  state.admin = true;
  state.mutate.mockReset().mockResolvedValue(null);
});
it("hides privileged controls from non-admins", () => {
  state.admin = false;
  render(<AdminPage />);
  expect(screen.getByText("Admin access required")).toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "Accounts" }),
  ).not.toBeInTheDocument();
});
it("removes plan controls and adds accounts to persistent CRM", async () => {
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
  expect(
    screen.queryByText(/Grant Pro|Upgrade \/ renew|Downgrade/),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Add to relationships" })[0]);
  await waitFor(() =>
    expect(state.mutate).toHaveBeenCalledWith("admin:saveContact", {
      name: "Alice",
      email: "alice@example.com",
      organization: "",
      stage: "new",
      owner: "",
      source: "Chaos account",
      userId: "u1",
    }),
  );
  expect(
    await screen.findByText("Alice added to Contacts."),
  ).toBeInTheDocument();
});
it("requires a reason for moderation and displays save failures", async () => {
  state.mutate.mockRejectedValue(new Error("Server unavailable"));
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Accounts" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Ban" })[0]);
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for the activity log"), {
    target: { value: "Abuse report" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable"),
  );
  expect(state.mutate).toHaveBeenCalledWith("admin:moderateUser", {
    userId: "u1",
    state: "banned",
    reason: "Abuse report",
    days: 7,
  });
});
it("saves a new CRM contact through the editor", async () => {
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Relationships" }));
  fireEvent.click(screen.getByRole("button", { name: "New contact" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Maya" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "maya@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Organization"), {
    target: { value: "School" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
  await waitFor(() =>
    expect(state.mutate).toHaveBeenCalledWith(
      "admin:saveContact",
      expect.objectContaining({
        name: "Maya",
        email: "maya@example.com",
        organization: "School",
        stage: "new",
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("starts with Chaos operations and keeps relationships secondary", () => {
  render(<AdminPage />);
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("region", { name: "Platform operations" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New contact" })).toBeNull();
});
it.each(["Courses", "Lessons", "Flashcards"])("shows %s in platform content", label => {
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Content" }));
  fireEvent.click(screen.getByRole("tab", { name: label }));
  expect(screen.getByRole("table")).toHaveTextContent(`Chaos ${label.toLowerCase()}`);
  expect(screen.getByRole("table")).toHaveTextContent("Alice");
  fireEvent.change(screen.getByRole("textbox", { name: "Search loaded learning content" }), { target: { value: "missing" } });
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("heading", { name: "No matching content" })).toBeInTheDocument();
});
it("shows real team ownership and collaboration counts", () => {
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("Chaos Team");
  expect(table).toHaveTextContent("Alice");
  expect(screen.getByRole("columnheader", { name: "Members" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "4" })).toBeInTheDocument();
});
