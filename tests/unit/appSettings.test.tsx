import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import SettingsPage from "@/app/dashboard/settings/page";
import { defaultPreferences, readPreferences } from "@/lib/preferences";

const mocks = vi.hoisted(() => ({ setMode: vi.fn(), openUserProfile: vi.fn(), signOut: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { fullName: "Omar", primaryEmailAddress: { emailAddress: "omar@example.com" } } }),
  useClerk: () => ({ openUserProfile: mocks.openUserProfile, signOut: mocks.signOut }),
}));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ mode: "system", setMode: mocks.setMode }) }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "quizFunctions:getCurrentUser" ? { username: "user12345", name: "Omar", email: "omar@example.com" } : getFunctionName(ref) === "quizFunctions:getMyQuizzes" ? [] : undefined),
  useMutation: () => vi.fn(),
}));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("app settings", () => {
  it("applies appearance, motion, sounds and new-form defaults as they change", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(mocks.setMode).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("switch", { name: "Sounds for new forms" }));
    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    fireEvent.click(screen.getByRole("radio", { name: "Midnight" }));
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(readPreferences()).toMatchObject({ newFormSound: true, reduceMotion: true, newFormPreset: "midnight", libraryView: "list" });
  });

  it("stores glass opacity (default 85), clamps it and resets", () => {
    expect(defaultPreferences.popupOpacity).toBe(85);
    render(<SettingsPage />);
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
    expect(screen.getByRole("radio", { name: "Google Forms style" })).toBeChecked();
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it("links to the archive, connections and docs, and signs out", () => {
    render(<SettingsPage />);
    expect(screen.getAllByRole("link", { name: /Open/ }).map((a) => a.getAttribute("href"))).toEqual(["/dashboard/archive", "/dashboard/connections", "/docs"]);
    fireEvent.click(screen.getByRole("button", { name: "Password and security" }));
    expect(mocks.openUserProfile).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });
});
