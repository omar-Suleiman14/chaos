"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "@/lib/analytics";
import { useUser } from "@clerk/nextjs";

export function analyticsScreen(path: string): string {
  if (path === "/") return "home";
  if (path === "/admin") return "admin";
  if (path === "/privacy" || path === "/terms") return path.slice(1);
  if (path.startsWith("/dashboard/forms/"))
    return path.endsWith("/responses") ? "responses" : "form_builder";
  if (path.startsWith("/dashboard/")) {
    const section = path.split("/")[2];
    return ["settings", "connections", "editor", "results", "forms"].includes(
      section,
    )
      ? section
      : "workspace";
  }
  if (path === "/dashboard") return "workspace";
  return "respondent";
}

/** Captures a sanitized logical screen name; private links never leave Chaos. */
export default function ProductAnalytics() {
  const path = usePathname();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
    posthog.capture("screen_viewed", { screen: analyticsScreen(path) });
  }, [path]);
  return null;
}

/**
 * Links a signed-in creator's events to their Clerk account id (never email or name) and
 * forgets them on sign-out, so the next person on the browser starts anonymous.
 * Respondents who aren't signed in stay anonymous. Must render inside ClerkProvider.
 */
export function AnalyticsIdentity() {
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !isLoaded) return;
    if (userId) posthog.identify(userId);
    else posthog.resetIfIdentified();
  }, [isLoaded, userId]);
  return null;
}
