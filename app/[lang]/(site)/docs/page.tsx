import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import { DocsIndex } from "./DocsViews";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Documentation", description: "Guides to Chaos: forms, quizzes, live games, results and exports, file uploads, the integration API, webhooks and self-hosting." },
    ar: { title: "الدليل", description: "أدلة Chaos: النماذج والاختبارات والألعاب المباشرة والنتائج والتصدير ورفع الملفات وواجهة API والـ Webhooks والاستضافة الذاتية." },
  }, "/docs");
}

export default function DocsPage() {
  return <DocsIndex />;
}
