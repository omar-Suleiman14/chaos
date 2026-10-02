import { pageMetadata } from "@/lib/seo";
import PrivacyView from "@/components/site/PrivacyView";

export const metadata = pageMetadata("Privacy policy", "How Chaos handles accounts, responses, lessons, learning progress, connections and your choices about data.", "/privacy");

export default function PrivacyPage() {
  return <PrivacyView />;
}

