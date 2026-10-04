"use client";
import { useLocale } from "@/lib/i18n";
import { productPages } from "@/lib/productPages";
import { repoUrl, securityPolicyUrl } from "@/lib/site";
import LegalPage from "./LegalPage";
import Link from "./SiteLink";
import ProductDemo from "./ProductDemo";
import McpWorkflowDemo from "./McpWorkflowDemo";
import McpOutcomes from "./McpOutcomes";
export default function ProductPage({ kind }: { kind: keyof typeof productPages }) {
 const { locale } = useLocale(), ar = locale === "ar", t = productPages[kind][ar ? "ar" : "en"];
 return <LegalPage title={t.title}><p className="site-lead">{t.lead}</p><p>{t.example}</p><ul>{t.features.map(f => <li key={f}>{f}</li>)}</ul><p><Link className="site-btn site-btn--primary" href={t.guide}>{ar ? "ابدأ هنا" : "Start here"}</Link></p>{kind === "forms-quizzes" || kind === "live-games" ? <ProductDemo /> : kind === "ai" ? <><McpWorkflowDemo /><McpOutcomes /></> : <p><a href={repoUrl}>GitHub</a> · <a href={securityPolicyUrl}>{ar ? "سياسة الأمن" : "Security policy"}</a></p>}</LegalPage>;
}
