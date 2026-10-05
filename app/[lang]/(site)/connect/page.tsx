import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import ConnectView from "@/components/site/ConnectView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Connect Chaos to your assistant", description: "Add Chaos to Claude in one click, or to ChatGPT in a few steps. Optional, on every Chaos plan." },
    ar: { title: "اربط Chaos بمساعدك", description: "أضف Chaos إلى Claude بنقرة واحدة، أو إلى ChatGPT في خطوات قليلة. اختياري ومتاح في كل خطط Chaos." },
  }, "/connect");
}

export default function ConnectPage() {
  return <ConnectView />;
}
