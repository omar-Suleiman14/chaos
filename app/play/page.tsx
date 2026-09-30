import type { Metadata } from "next";
import PlayerScreen from "@/components/live/PlayerScreen";

export const metadata: Metadata = {
  title: "Play",
  description: "Join a live Chaos quiz with the game PIN on the big screen.",
  alternates: { canonical: "/play" },
  // A PIN in the address is temporary; nothing here belongs in search results.
  robots: { index: false, follow: false },
};

/** Public: no account needed. Framing is denied like every non-form page (next.config.ts, lib/embed.ts). */
export default async function PlayPage({ searchParams }: { searchParams: Promise<{ pin?: string | string[] }> }) {
  const { pin } = await searchParams;
  const value = typeof pin === "string" && /^\d{6}$/.test(pin) ? pin : undefined;
  return <PlayerScreen initialPin={value} />;
}
