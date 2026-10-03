import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export function betterAuthServer() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexUrl || !convexSiteUrl)
    throw new Error("Better Auth requires both public Convex URLs");
  return convexBetterAuthNextJs({ convexUrl, convexSiteUrl });
}
