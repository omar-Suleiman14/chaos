import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import CopyrightView from "@/components/site/CopyrightView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Copyright policy", description: "How sharing, attribution, copying and copyright reports work for lessons, courses, quizzes and other content on Chaos." },
    ar: { title: "سياسة حقوق النشر", description: "كيف تعمل المشاركة والإسناد والنسخ وبلاغات حقوق النشر للدروس والدورات والاختبارات والمحتوى الآخر على Chaos." },
  }, "/copyright");
}

export default function CopyrightPage() {
  return <CopyrightView />;
}

