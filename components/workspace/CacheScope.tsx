"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { useAuth } from "@/lib/auth/client";
import { CacheZone, setCacheScope } from "@/lib/confirmedQuery";

/** Tells the device cache whose workspace this is; signing out clears it. */
export default function CacheScope() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => { if (isLoaded) setCacheScope(userId ?? null); }, [isLoaded, userId]);
  return null;
}

/** The workspace: cached copies may show here (lib/confirmedQuery.ts), for the account CacheScope names. */
export function WorkspaceCache({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const zone = useMemo(() => ({ authenticated: isAuthenticated }), [isAuthenticated]);
  return <CacheZone.Provider value={zone}><CacheScope />{children}</CacheZone.Provider>;
}
