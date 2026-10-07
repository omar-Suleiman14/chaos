import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import CookiesView from "@/components/site/CookiesView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Cookie policy", description: "Cookies, browser storage, optional PostHog analytics and your privacy choices on Chaos." },
    ar: { title: "سياسة ملفات تعريف الارتباط", description: "ملفات تعريف الارتباط والتخزين والتحليلات الاختيارية وخيارات الخصوصية في Chaos." },
  }, "/cookies");
}

export default function CookiesPage() { return <CookiesView />; }
