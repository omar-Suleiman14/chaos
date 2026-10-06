import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import TeamsHome from "@/components/workspace/TeamsHome";
import AccountMenu from "@/components/workspace/AccountMenu";
import TeamWorkspace from "@/components/workspace/TeamWorkspace";
import type { Id } from "@/convex/_generated/dataModel";

const auth = vi.hoisted(() => ({ ready: false, queries: vi.fn(), push: vi.fn(), path: "/dashboard/teams", rows: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: auth.push }), usePathname: () => auth.path }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: auth.ready, isLoading: !auth.ready }),
  useMutation: () => vi.fn(),
  useQuery: (_ref: unknown, args: unknown) => {
    auth.queries(args);
    if (!auth.ready && args !== "skip") throw new Error("Not authenticated");
    return args === "skip" ? undefined : auth.rows;
  },
}));
beforeEach(() => { auth.ready = false; auth.queries.mockClear(); auth.push.mockClear(); auth.path = "/dashboard/teams"; auth.rows = []; });

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
  render(<><AccountMenu user={{ name: "Omar Suleiman", email: "omar@example.com" }} onManageAccount={vi.fn()} onSignOut={vi.fn()} /><TeamWorkspace teamId={"team" as Id<"businessTeams">} /></>);
  expect(auth.queries.mock.calls.every(([args]) => args === "skip")).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("Loading team");
});

it("switches workspaces through the Chaos menu and marks the current team", () => {
  auth.ready = true;
  auth.path = "/dashboard/teams/team";
  auth.rows = [{ team: { _id: "team", name: "Chaos Team" }, role: "owner" }];
  const { container } = render(<AccountMenu user={{ name: "Omar Suleiman", email: "omar@example.com" }} onManageAccount={vi.fn()} onSignOut={vi.fn()} />);
  expect(container.querySelector("select")).toBeNull();
  expect(screen.getByRole("button", { name: "Account" })).toHaveTextContent("Chaos Team");
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
  expect(screen.getByRole("menuitemradio", { name: /Chaos Team/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Personal/ }));
  expect(auth.push).toHaveBeenCalledWith("/dashboard");
  expect(screen.queryByRole("menu")).toBeNull();
});

it("keeps pricing off Teams and opens team creation in a Chaos dialog", () => {
  auth.ready = true;
  render(<TeamsHome />);
  expect(screen.queryByText(/EGP|100% off|checkout/i)).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Team name" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create free Business team" }));
  expect(screen.getByRole("dialog", { name: "Create free Business team" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Team name" })).toHaveFocus();
});
