"use client";
import { useLocale } from "@/lib/i18n";
import { repoUrl, securityPolicyUrl } from "@/lib/site";
import Link from "./SiteLink";
export default function OpenTrust() {
 const { locale }=useLocale(), ar=locale==="ar";
 return <section className="site-section"><h2 className="site-h2">{ar ? "محتواك التعليمي ليس محبوسًا" : "Your teaching material isn’t trapped."}</h2><p>{ar ? "شيفرة مفتوحة واستضافة ذاتية وتصدير وAPI للوصول إلى محتواك." : "Open source, self-hostable, exportable and accessible through an API."}</p><div className="site-hero__actions"><a className="site-btn" href={repoUrl}>GitHub</a><Link className="site-btn" href="/docs/self-hosting">{ar ? "الاستضافة الذاتية" : "Self-hosting"}</Link><a className="site-btn" href={securityPolicyUrl}>{ar ? "الأمن" : "Security"}</a><Link className="site-btn" href="/docs/integration-api">{ar ? "دليل API" : "API docs"}</Link></div></section>;
}
