import { siteDescription, sitePageMetadata, type SitePageProps } from "@/lib/seo";
import HomeView from "./HomeView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos · Turn what you know into lessons that stick", description: siteDescription },
    ar: {
      title: "Chaos · حوّل ما تعرفه إلى دروس تبقى في الذاكرة",
      description: "حوّل ما تعرفه إلى دروس تبقى في الذاكرة. أنشئ الدروس والدورات والاختبارات ودرّس مباشرة، واربط ChatGPT أو Claude. بالعربية والإنجليزية.",
    },
  }, "/", { absoluteTitle: true });
}

export default function HomePage() {
  return <HomeView />;
}
