import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
import PricingView from "@/components/site/PricingView";

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Pricing", description: "Free for personal use, with no monthly caps. Business use is planned at 50 EGP per person per month. Checkout is not live." },
    ar: { title: "الأسعار", description: "مجاني للاستخدام الشخصي بلا حدود شهرية. الاستخدام التجاري مخطط له بسعر 50 جنيهًا مصريًا لكل شخص شهريًا. الدفع غير متاح بعد." },
  }, "/pricing");
}

export default function PricingPage() {
  return <PricingView />;
}
