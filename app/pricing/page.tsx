import { pageMetadata } from "@/lib/seo";
import PricingView from "@/components/site/PricingView";

export const metadata = pageMetadata("Pricing", "Compare Chaos Free and Pro limits. Chaos is free while paid plans are being prepared; nobody is charged yet.", "/pricing");

export default function PricingPage() {
  return <PricingView />;
}
