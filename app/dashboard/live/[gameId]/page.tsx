"use client";

import { useParams } from "next/navigation";
import HostScreen from "@/components/live/HostScreen";
import type { Id } from "@/convex/_generated/dataModel";

/** The host's projector screen. DashboardShell renders it without the workspace sidebar. */
export default function LiveHostPage() {
  const { gameId } = useParams<{ gameId: string }>();
  return <HostScreen gameId={gameId as Id<"liveGames">} />;
}
