import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/** Metadata and rendered content share the same public, privacy-filtered lookup. */
export const publicCard = cache(async (rawUsername: string) => {
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) return null;
  return cachedCard(username).catch(() => fetchQuery(api.memberCards.byUsername, { username }));
});

class Missing extends Error {}
/**
 * Found cards are shared across requests for a minute (an anonymous, privacy-filtered read, the same
 * for every visitor); the page's live query shows newer changes as soon as it connects. Misses throw,
 * which unstable_cache never stores, so a new username works at once.
 */
const cachedCard = unstable_cache(async (username: string) => {
  const card = await fetchQuery(api.memberCards.byUsername, { username });
  if (!card) throw new Missing(username);
  return card;
}, ["public-member-card"], { revalidate: 60 });

/** The first page of the author directory, for the first HTML of /card. */
export const fetchAuthorDirectory = unstable_cache(async () => {
  try { return (await fetchQuery(api.publicAuthors.browse, { paginationOpts: { numItems: 24, cursor: null } })).page; } catch { return []; }
}, ["public-author-directory"], { revalidate: 60 });
