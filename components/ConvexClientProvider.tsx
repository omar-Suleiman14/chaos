"use client";
import { DocsProvider } from "@/lib/docs/provider";


import { ReactNode, useCallback } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { useAuth } from "@/lib/auth/client";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth/better-client";
import ConnectivityBanner from "@/components/ConnectivityBanner";
import { convex } from "@/lib/convexClient";

// Analytics identity is handled by AnalyticsIdentity (components/ProductAnalytics.tsx), which
// links events to the stable account id only, never an email address or name.
function useBackendAuth() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchAccessToken = useCallback(({ forceRefreshToken }: { forceRefreshToken: boolean }) => getToken({ template: "convex", skipCache: forceRefreshToken }), [getToken]);
  return { isLoading: !isLoaded, isAuthenticated: !!isSignedIn, fetchAccessToken };
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!convex) return <>{children}</>;

  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth") return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as import("@convex-dev/better-auth/react").AuthClient}>
      <ConnectivityBanner />
      <DocsProvider>{children}</DocsProvider>
    </ConvexBetterAuthProvider>
  );
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useBackendAuth}>
      <ConnectivityBanner />
      <DocsProvider>{children}</DocsProvider>
    </ConvexProviderWithAuth>
  );
}
