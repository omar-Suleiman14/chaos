"use client";

import { use } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import TeamWorkspace from "@/components/workspace/TeamWorkspace";

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TeamWorkspace teamId={id as Id<"businessTeams">} />;
}
