import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import TermsView from "@/components/site/TermsView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Terms and conditions", description: "Terms for creating and sharing forms, quizzes, lessons and courses, answering questions and using the Chaos service." },
    ar: { title: "الشروط والأحكام", description: "شروط إنشاء النماذج والاختبارات والدروس والدورات ومشاركتها، والإجابة عن الأسئلة، واستخدام خدمة Chaos." },
  }, "/terms");
}

export default function TermsPage() {
  return <TermsView />;
}

