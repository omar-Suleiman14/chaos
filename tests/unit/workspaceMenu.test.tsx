import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const push = vi.fn();
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useQuery: () => [{ team: { _id: "team1", name: "Anatomy Lab" }, role: "admin" }] }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/teams/team1", useRouter: () => ({ push }) }));
const { default: TeamSwitcher } = await import("@/components/workspace/TeamSwitcher");

it("opens a workspace menu with switching, workspace settings and app settings", () => {
  render(<LocaleProvider initial="en"><div className="workspace-ui"><TeamSwitcher /></div></LocaleProvider>);
  const trigger = screen.getByRole("button", { name: "Workspace" });
  expect(trigger).toHaveTextContent("Anatomy Lab");
  expect(trigger).toHaveTextContent("Business · Admin");
  fireEvent.click(trigger);
  expect(screen.getByRole("menuitemradio", { name: /Anatomy Lab/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("menuitem", { name: "Workspace settings" }));
  expect(push).toHaveBeenLastCalledWith("/dashboard/teams/team1?tab=settings");
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  expect(push).toHaveBeenLastCalledWith("/dashboard/settings");
});
