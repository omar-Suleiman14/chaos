import { Suspense } from "react";
import ConvertedQuizRedirect from "@/components/library/ConvertedQuizRedirect";

/** Classic quizzes became quiz forms; old links still lead somewhere useful. */
export default function Page() {
  return <Suspense fallback={null}><ConvertedQuizRedirect to="responses" /></Suspense>;
}
