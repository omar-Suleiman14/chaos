vi.mock("@/lib/cardFonts", () => ({ cardRuqaa: { variable: "ruqaa" } }));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import SettingsPage from "@/app/dashboard/settings/page";
import ProfilePage from "@/app/dashboard/card/page";
import { defaultPreferences, readPreferences } from "@/lib/preferences";

const mocks = vi.hoisted(() => ({ setMode: vi.fn(), openUserProfile: vi.fn(), signOut: vi.fn(), setListingVisibility: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { fullName: "Omar", primaryEmailAddress: { emailAddress: "omar@example.com" } } }),
  useClerk: () => ({ openUserProfile: mocks.openUserProfile, signOut: mocks.signOut }),
}));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ mode: "system", setMode: mocks.setMode }) }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "quizFunctions:getCurrentUser" ? { username: "user12345", name: "Omar", email: "omar@example.com" } : getFunctionName(ref) === "quizFunctions:getMyQuizzes" ? [] : getFunctionName(ref) === "memberCards:mine" ? { name: "Omar", username: "omar", seed: "chaos-abc", memberSince: 0, style: 1 } : undefined),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "publicAuthors:setListingVisibility" ? mocks.setListingVisibility : Object.assign(vi.fn(), { withOptimisticUpdate: () => vi.fn() }),
}));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("app settings", () => {
  it("defaults to publicly listed and lets an author opt out, with save failure feedback", async () => {
    mocks.setListingVisibility.mockRejectedValueOnce(new Error("offline"));
    render(<SettingsPage />);
    const toggle = screen.getByRole("switch", { name: "Show me in author lists" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(mocks.setListingVisibility).toHaveBeenCalledWith({ visible: false });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not save your author visibility. Try again."));
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    mocks.setListingVisibility.mockResolvedValueOnce(null);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });
  it("applies sounds and new-form defaults as they change", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("switch", { name: "Sounds for new forms" }));
    fireEvent.click(screen.getByRole("radio", { name: "Midnight" }));
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(readPreferences()).toMatchObject({ newFormSound: true, newFormPreset: "midnight", libraryView: "list" });
  });

  it("keeps account and appearance on the profile page", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("slider", { name: "Menu transparency" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Open/ })[0]).toHaveAttribute("href", "/dashboard/card");
  });

  it("applies appearance and motion on the profile page", () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(mocks.setMode).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(readPreferences()).toMatchObject({ reduceMotion: true });
  });

  it("stores glass opacity (default 85), clamps it and resets", () => {
    expect(defaultPreferences.popupOpacity).toBe(85);
    render(<ProfilePage />);
    const slider = screen.getByRole("slider", { name: "Menu transparency" });
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    fireEvent.change(slider, { target: { value: "65" } });
    expect(readPreferences().popupOpacity).toBe(65);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(readPreferences().popupOpacity).toBe(85);
    localStorage.setItem("chaos.ui.preferences", JSON.stringify({ popupOpacity: 5 }));
    expect(readPreferences().popupOpacity).toBe(60);
  });

  it("can search all theme defaults and reset without changing the workspace appearance", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "All themes (18)" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search themes" }), { target: { value: "sunset" } });
    fireEvent.click(screen.getByRole("radio", { name: "Sunset" }));
    expect(readPreferences().newFormPreset).toBe("sunset");
    fireEvent.click(screen.getByRole("button", { name: "Fewer themes" }));
    expect(screen.getByRole("radio", { name: "Sunset" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Reset theme" }));
    expect(readPreferences().newFormPreset).toBe(defaultPreferences.newFormPreset);
    expect(screen.getByRole("radio", { name: "Lilac" })).toBeChecked();
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it("links to profile, archive, connections and docs", () => {
    render(<SettingsPage />);
    expect(screen.getAllByRole("link", { name: /Open/ }).map((a) => a.getAttribute("href"))).toEqual(["/dashboard/card", "/dashboard/archive", "/dashboard/connections", "/docs"]);
  });

  it("opens account security and signs out from the profile page", () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Password and security" }));
    expect(mocks.openUserProfile).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });
});
