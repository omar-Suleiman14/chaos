import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import FaqView from "@/components/site/FaqView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Frequently asked questions", description: "Answers to common questions about Chaos: getting started, pricing, sharing forms, live games, exports and self-hosting." },
    ar: { title: "الأسئلة الشائعة", description: "إجابات عن الأسئلة الشائعة حول Chaos: البدء والأسعار ومشاركة النماذج والألعاب المباشرة والتصدير والاستضافة الذاتية." },
  }, "/faq");
}

export default function FaqPage() {
  return <FaqView />;
}
