"use client";

import { createContext } from "react";

/** Only signed-in workspace routes use this context; public queries remain anonymous-capable. */
export const CacheZone = createContext<{ authenticated: boolean } | null>(null);
