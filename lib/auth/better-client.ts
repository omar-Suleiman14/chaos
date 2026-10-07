"use client";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
// Clerk deployments must not initialize or retain the unused Better Auth client.
export const authClient = (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? createAuthClient({
  plugins: [convexClient(), oauthProviderClient()],
}) : null)!;
