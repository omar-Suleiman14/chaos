"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, Download, Inbox } from "lucide-react";
import { useQuery } from "@/lib/convexCache";
import { WsTabs } from "@/components/workspace/primitives";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber, pluralForm, useCopy, useLocale } from "@/lib/i18n";
import { resultsCopy } from "@/components/forms/results/copy";
import { SummaryHeader, SummaryTab } from "@/components/forms/results/Summary";
import { ResponsesTab } from "@/components/forms/results/Responses";
import { ExportTab } from "@/components/forms/results/Export";
import Segments from "@/components/forms/results/Segments";

const tabs = ["summary", "responses", "segments", "export"] as const;
type Tab = (typeof tabs)[number];

/** Form results, built like Google Forms / Typeform results: numbers first, then per-question summaries, individual responses and export. */
export default function ResponsesPage() {
  const { formId } = useParams<{ formId: Id<"forms"> }>();
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const form = useQuery(api.forms.getFormForEditor, { formId });
  const analysis = useQuery(api.formResults.getAnalysis, form ? { formId } : "skip");
  const [tab, setTab] = useState<Tab>("summary");
  if (form === undefined) return <PageSkeleton label={t.loading} />;
  if (form === null) return <p className="ws-empty">{t.notFound}</p>;
  const quiz = !!(form.draft as { quiz?: { enabled: boolean } }).quiz?.enabled || !!analysis?.quizEnabled;
  return (
    <div className="ws-results-page font-sans">
      <header className="ws-results-header">
        <Link href={`/dashboard/forms/${formId}`} className="ws-link-quiet inline-flex items-center gap-1.5">
          <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden="true" /> {t.backToForm}
        </Link>
        <h1 className="ws-page-title">{form.title}</h1>
        <p className="ws-page-subtitle">
          {formatNumber(locale, form.responseCount)} {pluralForm(locale, form.responseCount, t.responses)}
          {quiz && form.role === "owner" && <> · <Link href={`/dashboard/forms/${formId}/homework`} className="ws-link-quiet">{locale === "ar" ? "الواجب" : "Homework"}</Link></>}
          {tab !== "export" && <> · <button type="button" className="ws-link-quiet inline-flex items-center gap-1" onClick={() => setTab("export")}><Download size={13} aria-hidden="true" /> {t.exportShortcut}</button></>}
        </p>
      </header>
      <SummaryHeader analysis={analysis ?? undefined} />
      <WsTabs tabs={tabs} value={tab} onChange={setTab} label={t.tabsLabel} labels={t.tabs}
        icons={{ summary: BarChart3, responses: Inbox, segments: BarChart3, export: Download }}
        badge={(x) => (x === "responses" && form.responseCount > 0 ? <span className="ws-count">{formatNumber(locale, form.responseCount)}</span> : null)} />
      <div className="ws-results-body">
        {tab === "summary" && <SummaryTab analysis={analysis === null ? undefined : analysis} formId={formId} />}
        {tab === "responses" && <ResponsesTab formId={formId} role={form.role} quiz={quiz} />}
        {tab === "export" && <ExportTab formId={formId} title={form.title} />}
        {tab === "segments" && <Segments formId={formId} versions={form.versions} publishedVersion={form.publishedVersion ?? null} parameters={[...(form.settings.hiddenParameters ?? []), ...(form.settings.hiddenFields ?? []).filter(name => !form.settings.hiddenParameters?.some(parameter => parameter.name === name)).map(name => ({ name, type: "string" as const }))]} />}
      </div>
    </div>
  );
}
