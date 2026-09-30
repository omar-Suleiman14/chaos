import { pageMetadata } from "@/lib/seo";
import PricingView from "@/components/site/PricingView";

export const metadata = pageMetadata("Pricing", "Free personal use with clear limits. Pro / Business is proposed at 20 EGP per active creator seat per month. Billing is not live.", "/pricing");

export default function PricingPage() {
  return <PricingView />;
}
