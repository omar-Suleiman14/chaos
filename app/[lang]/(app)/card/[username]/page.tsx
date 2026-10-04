import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import PublicCard from "./PublicCard";
import { publicCard } from "./lookup";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  try {
    const card = await publicCard(username);
    if (!card) return { title: "Card unavailable", robots: { index: false, follow: false } };
    return {
      ...pageMetadata(`${card.name || `@${card.username}`} on Chaos`, `@${card.username}'s public Chaos member card.`, `/card/${encodeURIComponent(card.username)}`),
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: "Card unavailable", robots: { index: false, follow: false } };
  }
}

export default async function CardPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const card = await publicCard(username);
  if (!card) notFound();
  if (username !== card.username) permanentRedirect(`/card/${encodeURIComponent(card.username)}`);
  return <PublicCard username={card.username} initialCard={card} />;
}
