import { pageMetadata } from "@/lib/seo";
import SupportView from "@/components/site/SupportView";

export const metadata = pageMetadata("Support", "Get help with Chaos: contact support by email, read the guides, report bugs on GitHub and report security problems privately.", "/support");

export default function SupportPage() {
  return <SupportView />;
}
