import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import IntegrationView from "@/components/site/IntegrationView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Chaos in Gemini", description: "Connect Chaos to eligible Gemini Apps via OAuth or configure Gemini CLI with a secure remote MCP server." },
    ar: { title: "Chaos في Gemini", description: "اربط Chaos بتطبيقات Gemini المؤهلة أو Gemini CLI عبر MCP مع تسجيل دخول OAuth." },
  }, "/gemini");
}

export default function GeminiPage() {
  return <IntegrationView platform="gemini" />;
}
