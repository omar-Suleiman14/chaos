export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "chaos-theme";

export const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;
