"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import ConnectivityBanner from "@/components/ConnectivityBanner";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!convex) {
    throw new Error(
      "Missing NEXT_PUBLIC_CONVEX_URL. Configure the Convex deployment URL before rendering the app.",
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <ConnectivityBanner />
      {children}
    </ConvexProviderWithClerk>
  );
}
