import { pageMetadata } from "@/lib/seo";
import TermsView from "@/components/site/TermsView";

export const metadata = pageMetadata("Terms and conditions", "Terms for creating and sharing forms, quizzes, lessons and courses, answering questions and using the Chaos service.", "/terms");

export default function TermsPage() {
  return <TermsView />;
}

