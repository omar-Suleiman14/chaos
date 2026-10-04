import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import ChatGptView from "@/components/site/ChatGptView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos in ChatGPT", description: "Optionally connect Chaos to ChatGPT to create draft forms, quizzes, lessons and courses. Review before publishing. Available on every Chaos plan; Chaos also works on its own." },
    ar: { title: "Chaos في ChatGPT", description: "اربط Chaos اختياريًا بـ ChatGPT لإنشاء مسودات النماذج والاختبارات والدروس والدورات، وراجعها قبل النشر. متاح في كل خطط Chaos، ويعمل Chaos أيضًا بمفرده." },
  }, "/chatgpt");
}

export default function ChatGptPage() {
  return <ChatGptView />;
}
