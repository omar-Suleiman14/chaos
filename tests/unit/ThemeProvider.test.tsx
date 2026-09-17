import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function Consumer() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("uses the OS preference on first visit and persists an explicit toggle", async () => {
    mockMatchMedia(true);
    render(<ThemeProvider><Consumer /></ThemeProvider>);

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("lets a stored preference override the OS preference", async () => {
    mockMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(<ThemeProvider><Consumer /></ThemeProvider>);

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
