import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import PrivacyView from "@/components/site/PrivacyView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Privacy policy", description: "How Chaos handles accounts, responses, lessons, learning progress, connections and your choices about data." },
    ar: { title: "سياسة الخصوصية", description: "كيف يتعامل Chaos مع الحسابات والردود والدروس وتقدم التعلم والاتصالات وخياراتك بشأن البيانات." },
  }, "/privacy");
}

export default function PrivacyPage() {
  return <PrivacyView />;
}

