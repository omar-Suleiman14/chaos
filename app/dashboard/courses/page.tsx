import { redirect } from "next/navigation";

/** Courses live in the Library's Courses tab; each course keeps its own page at /dashboard/courses/<id>. */
export default function CoursesPage() {
  redirect("/dashboard?tab=courses");
}
