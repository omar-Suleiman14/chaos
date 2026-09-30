"use client";

import { createContext, useContext } from "react";
import type { FormTheme } from "@/convex/formLogic";

/**
 * The form's theme, fetched on the server with the page, so the loading screen
 * already looks like the form instead of flashing the default Chaos look.
 */
const InitialTheme = createContext<FormTheme | null>(null);

export function InitialThemeProvider({ theme, children }: { theme: FormTheme | null; children: React.ReactNode }) {
  return <InitialTheme.Provider value={theme}>{children}</InitialTheme.Provider>;
}

export const useInitialTheme = () => useContext(InitialTheme);
