import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import HomeworkStudent from "@/components/forms/homework/HomeworkStudent";

export const metadata: Metadata = { title: "Homework", robots: { index: false, follow: false } };

export default async function HomeworkPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return <HomeworkStudent assignmentId={assignmentId as Id<"homeworkAssignments">} />;
}
