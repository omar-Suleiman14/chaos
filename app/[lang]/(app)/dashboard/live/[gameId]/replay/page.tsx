"use client";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import ClassroomReplay from "@/components/live/ClassroomReplay";
export default function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  return <ClassroomReplay gameId={gameId as Id<"liveGames">} />;
}
