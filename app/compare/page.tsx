import { pageMetadata } from "@/lib/seo";
import CompareView from "@/components/site/CompareView";

export const metadata = pageMetadata(
  "Chaos compared with Google Forms, Microsoft Forms, Typeform and Kahoot!",
  "A factual comparison: what Chaos does, what it doesn't do yet, and how it lines up with Google Forms, Microsoft Forms, Typeform and Kahoot!.",
  "/compare",
);

export default function ComparePage() {
  return <CompareView />;
}
