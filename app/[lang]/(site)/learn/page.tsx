import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import PublicExplore from "@/components/site/PublicExplore";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos Learn · Free courses", description: "Browse free public courses in Chaos Learn. No sign-in needed to explore published content." },
    ar: { title: "Chaos Learn · دورات مجانية", description: "تصفح الدورات العامة المجانية في Chaos Learn. لا حاجة إلى تسجيل الدخول لاستكشاف المحتوى المنشور." },
  }, "/learn");
}

export default function LearnPage() { return <PublicExplore />; }
