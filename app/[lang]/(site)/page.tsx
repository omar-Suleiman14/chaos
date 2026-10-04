import { siteDescription, sitePageMetadata, type SitePageProps } from "@/lib/seo";
import HomeView from "./HomeView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos · Forms, quizzes, lessons, courses and live games", description: siteDescription },
    ar: {
      title: "Chaos · نماذج واختبارات ودروس ودورات وألعاب مباشرة",
      description: "أنشئ النماذج والاختبارات والدروس والدورات والألعاب المباشرة في مساحة عمل واحدة مجانية ومفتوحة المصدر. بالعربية والإنجليزية، مع MCP وAPI وWebhooks واستضافة ذاتية.",
    },
  }, "/", { absoluteTitle: true });
}

export default function HomePage() {
  return <HomeView />;
}
