import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import SupportView from "@/components/site/SupportView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Support", description: "Get help with Chaos: contact support by email, read the guides, report bugs on GitHub and report security problems privately." },
    ar: { title: "الدعم", description: "احصل على مساعدة في Chaos: راسل الدعم بالبريد الإلكتروني، واقرأ الأدلة، وأبلغ عن الأخطاء على GitHub، وأبلغ عن المشكلات الأمنية بشكل خاص." },
  }, "/support");
}

export default function SupportPage() {
  return <SupportView />;
}
