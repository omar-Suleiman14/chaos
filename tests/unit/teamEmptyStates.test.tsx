import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import TeamWorkspace from "@/components/workspace/TeamWorkspace";
import type { Id } from "@/convex/_generated/dataModel";

const data = vi.hoisted(() => ({ teams: undefined as unknown, resources: undefined as unknown }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard/teams/team", useSearchParams: () => new URLSearchParams() }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => vi.fn(),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "businessTeams:list") return data.teams;
    if (name === "businessTeams:resources") return data.resources;
    if (name === "users:me" || name === "users:current") return null;
    return [];
  },
}));
const art = () => document.querySelector(".state-illustration");
const team = "team" as Id<"businessTeams">;
beforeEach(() => { data.teams = [{ team: { _id: "team", name: "Chaos Team" }, role: "owner" }]; data.resources = []; });

it("shows the skeleton, not an unavailable state, while teams load", () => {
  data.teams = undefined;
  render(<TeamWorkspace teamId={team} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading team");
  expect(art()).toBeNull();
});

it("draws the not-found illustration when the team is no longer available, and keeps the way back", () => {
  data.teams = [];
  render(<TeamWorkspace teamId={team} />);
  expect(screen.getByRole("status")).toHaveTextContent("This team is no longer available to you.");
  expect(art()).toHaveAttribute("data-variant", "not-found");
  expect(art()).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("link", { name: "All teams" })).toHaveAttribute("href", "/dashboard/teams");
});

it("draws the creating illustration when nothing is shared yet, and none while resources load", () => {
  const view = render(<TeamWorkspace teamId={team} />);
  expect(screen.getByText("No shared resources yet.")).toBeInTheDocument();
  expect(art()).toHaveAttribute("data-variant", "create");
  data.resources = undefined;
  view.rerender(<TeamWorkspace teamId={team} />);
  expect(screen.queryByText("No shared resources yet.")).toBeNull();
});
