"use client";

import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import ConnectivityBanner from "@/components/ConnectivityBanner";
import { convex } from "@/lib/convexClient";

// Analytics identity is handled by AnalyticsIdentity (components/ProductAnalytics.tsx), which
// links events to the Clerk account id only, never an email address or name.

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!convex) return <>{children}</>;

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <ConnectivityBanner />
      {children}
    </ConvexProviderWithClerk>
  );
}
