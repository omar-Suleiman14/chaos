import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import CompareView from "@/components/site/CompareView";

// The title already names Chaos, so it skips the " · Chaos" template.
export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: {
      title: "Chaos vs Google Forms, Typeform, Microsoft Forms & Kahoot!",
      description: "A factual comparison: what Chaos does, what it doesn't do yet, and how it lines up with Google Forms, Microsoft Forms, Typeform and Kahoot!.",
    },
    ar: {
      title: "Chaos مقابل Google Forms وTypeform وMicrosoft Forms وKahoot!",
      description: "مقارنة واقعية: ما يقدمه Chaos، وما لا يقدمه بعد، وكيف يقارن بـ Google Forms وMicrosoft Forms وTypeform وKahoot!.",
    },
  }, "/compare", { absoluteTitle: true });
}

export default function ComparePage() {
  return <CompareView />;
}
