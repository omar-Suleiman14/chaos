import View from "@/components/site/ChangelogView";
import { sitePageMetadata, type SitePageProps } from "@/lib/seo";
export async function generateMetadata({params}:SitePageProps){return sitePageMetadata((await params).lang,{en:{title:"Changelog",description:"Chaos operational information and recent product changes."},ar:{title:"سجل التغييرات",description:"معلومات تشغيل Chaos وآخر التغييرات."}},"/changelog");}
export default function Page(){return <View/>;}
