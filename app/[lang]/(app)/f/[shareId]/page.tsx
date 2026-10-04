"use client";

import { useParams } from "next/navigation";
import { RespondToForm } from "@/components/forms/respond/RespondPage";

export default function RespondPageRoute() {
  const { shareId } = useParams<{ shareId: string }>();
  return <RespondToForm shareId={shareId} />;
}
