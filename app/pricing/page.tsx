import { pageMetadata } from "@/lib/seo";
import PricingView from "@/components/site/PricingView";

export const metadata = pageMetadata("Pricing", "Free for personal use, with no monthly caps. Business use is planned at 50 EGP per creator seat per month. Checkout is not live.", "/pricing");

export default function PricingPage() {
  return <PricingView />;
}
