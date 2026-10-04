import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import TeamsHome from "@/components/workspace/TeamsHome";
import TeamSwitcher from "@/components/workspace/TeamSwitcher";
import TeamWorkspace from "@/components/workspace/TeamWorkspace";
import type { Id } from "@/convex/_generated/dataModel";

const auth = vi.hoisted(() => ({ ready: false, queries: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard/teams" }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: auth.ready, isLoading: !auth.ready }),
  useMutation: () => vi.fn(),
  useQuery: (_ref: unknown, args: unknown) => {
    auth.queries(args);
    if (!auth.ready && args !== "skip") throw new Error("Not authenticated");
    return args === "skip" ? undefined : [];
  },
}));
beforeEach(() => { auth.ready = false; auth.queries.mockClear(); });

it("waits for Convex authentication before loading teams and invitations", () => {
  const view = render(<TeamsHome />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading teams");
  expect(screen.queryByRole("button", { name: "Create free Business team" })).toBeNull();
  auth.ready = true;
  view.rerender(<TeamsHome />);
  expect(screen.getByRole("button", { name: "Create free Business team" })).toBeEnabled();
  expect(screen.getByText("No Business teams yet.")).toBeInTheDocument();
});

it("keeps the switcher and team detail safe while authentication initializes", () => {
  render(<><TeamSwitcher /><TeamWorkspace teamId={"team" as Id<"businessTeams">} /></>);
  expect(auth.queries.mock.calls.every(([args]) => args === "skip")).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("Loading team");
});
