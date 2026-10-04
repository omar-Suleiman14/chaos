import ProductPage from "@/components/site/ProductPage";
import { productPages } from "@/lib/productPages";
import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
export async function generateMetadata({ params }: SitePageProps) {
 const page = productPages["ai"];
 return sitePageMetadata((await params).lang, { en: { title: page.en.title, description: page.en.lead + " " + page.en.example }, ar: { title: page.ar.title, description: page.ar.lead + " " + page.ar.example } }, "/ai");
}
export default function Page() { return <ProductPage kind="ai" />; }
