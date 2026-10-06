import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import PublicExplore from "@/components/site/PublicExplore";
import { fetchCourseDirectory } from "@/lib/learn/server";

// The course list in the HTML is at most a minute old; the live query updates it on load.
export const revalidate = 60;

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos Learn · Free courses", description: "Browse free public courses in Chaos Learn. No sign-in needed to explore published content." },
    ar: { title: "Chaos Learn · دورات مجانية", description: "تصفح الدورات العامة المجانية في Chaos Learn. لا حاجة إلى تسجيل الدخول لاستكشاف المحتوى المنشور." },
  }, "/learn");
}

export default async function LearnPage() { return <PublicExplore initial={await fetchCourseDirectory()} />; }
