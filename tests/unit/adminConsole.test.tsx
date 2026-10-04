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
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "quizFunctions:getIsAdmin") return state.admin;
    if (name === "adminAnalytics:overview") return null;
    return undefined;
  },
  useMutation:
    (ref: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      state.mutate(getFunctionName(ref), args),
  usePaginatedQuery: () => ({
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
  }),
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
  expect(screen.queryByText("Users & plans")).not.toBeInTheDocument();
});
it("selects accounts and submits a confirmed bulk grant", async () => {
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Users & plans" }));
  fireEvent.click(screen.getByLabelText("Select loaded (up to 100)"));
  expect(screen.getByText("2 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upgrade / renew" }));
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for the activity log"), {
    target: { value: "Launch offer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(state.mutate).toHaveBeenCalledWith("admin:bulkPlan", {
      userIds: ["u1", "u2"],
      plan: "pro",
      reason: "Launch offer",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
it("makes select-all scope explicit and shows mutation failures", async () => {
  state.mutate.mockRejectedValue(new Error("Server unavailable"));
  render(<AdminPage />);
  fireEvent.click(screen.getByRole("tab", { name: "Users & plans" }));
  fireEvent.click(screen.getByRole("button", { name: "Select all accounts" }));
  fireEvent.click(screen.getByRole("button", { name: "Downgrade" }));
  expect(
    screen.getByText(/every account currently in Chaos/),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason for the activity log"), {
    target: { value: "End trial" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable"),
  );
  expect(state.mutate).toHaveBeenCalledWith("admin:allUsersPlan", {
    plan: "free",
    reason: "End trial",
  });
});
