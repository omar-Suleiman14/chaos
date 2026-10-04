"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CurriculumBrowser from "@/components/learn/CurriculumBrowser";

function Browse() {
  const node = useSearchParams().get("node") ?? undefined;
  return <CurriculumBrowser key={node} nodeId={node} />;
}

export default function BrowsePage() {
  return <Suspense fallback={null}><Browse /></Suspense>;
}
