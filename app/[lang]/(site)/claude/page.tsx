import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import IntegrationView from "@/components/site/IntegrationView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos in Claude", description: "Add Chaos to Claude in one click. Claude can then create forms, quizzes, lessons and courses, check results and run live games in your Chaos account. Free on every plan." },
    ar: { title: "Chaos في Claude", description: "أضف Chaos إلى Claude بنقرة واحدة، ليتمكن Claude من إنشاء النماذج والاختبارات والدروس والدورات ومتابعة النتائج وتشغيل الألعاب المباشرة في حسابك. مجاني في كل الخطط." },
  }, "/claude");
}

export default function ClaudePage() {
  return <IntegrationView platform="claude" />;
}
