import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const push = vi.fn();
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useQuery: () => [{ team: { _id: "team1", name: "Anatomy Lab" }, role: "admin" }] }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/teams/team1", useRouter: () => ({ push }) }));
const { default: AccountMenu } = await import("@/components/workspace/AccountMenu");

it("shows the person and workspace at the bottom and opens a menu with everything account related", () => {
  const manage = vi.fn(), signOut = vi.fn();
  render(<LocaleProvider initial="en"><div className="workspace-ui"><AccountMenu user={{ name: "Omar Suleiman", email: "omar@example.com" }} onManageAccount={manage} onSignOut={signOut} /></div></LocaleProvider>);
  const trigger = screen.getByRole("button", { name: "Account" });
  expect(trigger).toHaveTextContent("Omar Suleiman");
  expect(trigger).toHaveTextContent("Anatomy Lab");
  fireEvent.click(trigger);
  expect(screen.getByRole("menu")).toHaveTextContent("omar@example.com");
  expect(screen.getByRole("menuitemradio", { name: /Anatomy Lab/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("menuitem", { name: "Workspace settings" }));
  expect(push).toHaveBeenLastCalledWith("/dashboard/teams/team1?tab=settings");
  for (const [name, href] of [["Settings", "/dashboard/settings"], ["Archive", "/dashboard/archive"], ["Profile and card", "/dashboard/card"]] as const) {
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name }));
    expect(push).toHaveBeenLastCalledWith(href);
  }
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage account" }));
  expect(manage).toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalled();
});
