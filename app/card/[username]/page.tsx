import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import PublicCard from "./PublicCard";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const name = decodeURIComponent(username).slice(0, 64);
  // Cards are shared by QR and link, not discovered through search.
  return { ...pageMetadata(`@${name} on Chaos`, `@${name}'s Chaos member card.`, `/card/${encodeURIComponent(name)}`), robots: { index: false, follow: false } };
}

export default async function CardPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PublicCard username={decodeURIComponent(username).slice(0, 64)} />;
}
