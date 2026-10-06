"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { useAuth } from "@/lib/auth/client";
import { CacheZone, setCacheScope } from "@/lib/confirmedQuery";
import { resetQueryCache } from "@/lib/queryCache";

/** Tells the device cache whose workspace this is; signing out clears it. */
export default function CacheScope() {
  const { isLoaded, userId } = useAuth();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    setCacheScope(userId ?? null);
    // Kept subscriptions hold the last account's results; drop them when the account changes in this tab.
    if (previous.current && previous.current !== (userId ?? null)) resetQueryCache();
    previous.current = userId ?? null;
  }, [isLoaded, userId]);
  return null;
}

/** The workspace: cached copies may show here (lib/confirmedQuery.ts), for the account CacheScope names. */
export function WorkspaceCache({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const zone = useMemo(() => ({ authenticated: isAuthenticated }), [isAuthenticated]);
  return <CacheZone.Provider value={zone}><CacheScope />{children}</CacheZone.Provider>;
}
