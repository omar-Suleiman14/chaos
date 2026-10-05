import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import IntegrationView from "@/components/site/IntegrationView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos in ChatGPT", description: "Optionally connect Chaos to ChatGPT to create forms, quizzes, lessons and courses, or download the Chaos plugin. Available on every Chaos plan; Chaos also works on its own." },
    ar: { title: "Chaos في ChatGPT", description: "اربط Chaos اختياريًا بـ ChatGPT لإنشاء النماذج والاختبارات والدروس والدورات، أو نزّل إضافة Chaos. متاح في كل خطط Chaos، ويعمل Chaos أيضًا بمفرده." },
  }, "/chatgpt");
}

export default function ChatGptPage() {
  return <IntegrationView platform="chatgpt" />;
}
