"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/client";
import { setCacheScope } from "@/lib/confirmedQuery";

/** Tells the device cache whose workspace this is; signing out clears it. */
export default function CacheScope() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => { if (isLoaded) setCacheScope(userId ?? null); }, [isLoaded, userId]);
  return null;
}
