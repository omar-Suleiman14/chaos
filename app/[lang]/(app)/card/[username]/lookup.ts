import "server-only";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/** Metadata and rendered content share the same public, privacy-filtered lookup. */
export const publicCard = cache(async (rawUsername: string) => {
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) return null;
  return fetchQuery(api.memberCards.byUsername, { username });
});
