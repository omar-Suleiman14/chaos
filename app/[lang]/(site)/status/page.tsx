import View from "@/components/site/StatusView";
import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
export async function generateMetadata({params}:SitePageProps){return sitePageMetadata((await params).lang,{en:{title:"Service status and trust",description:"Chaos operational information and recent product changes."},ar:{title:"حالة الخدمة والثقة",description:"معلومات تشغيل Chaos وآخر التغييرات."}},"/status");}
export default function Page(){return <View/>;}
