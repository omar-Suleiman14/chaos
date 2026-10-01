"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import HomeworkManager from "@/components/forms/homework/HomeworkManager";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";

export default function HomeworkPage() {
  const { formId } = useParams<{ formId: Id<"forms"> }>();
  return <QueryErrorBoundary key={formId}><HomeworkManager formId={formId} /></QueryErrorBoundary>;
}
