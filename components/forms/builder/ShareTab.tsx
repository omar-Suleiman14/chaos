"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { useConvex, useMutation, useQuery } from "convex/react";
import posthog from "@/lib/analytics";
import { Copy, Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { downloadBlob, safeFilename } from "@/lib/xlsx";
import QrShare from "./QrShare";
import { useCopy, useLocale } from "@/lib/i18n";
import EmbedPanel from "./EmbedPanel";
import FallbackBoundary from "@/components/FallbackBoundary";
import DocHint from "@/components/forms/DocHint";
import { shortShareUrl } from "@/lib/site";
import { linkOrigin } from "@/lib/hosts";

const copy = {
  en: {
    copied: "Copied", copy: "Copy", shareLink: "Share link", link: "Link", publishFirst: "Publish the form to start collecting. The link below works once it is live.",
    notLive: (status: string) => `This form is ${status}; the link shows your closed message.`, publicLink: "Public link", shortLink: "Short link", shortHelp: "Same form on the short address. Both links keep working.",
    langBefore: "Add ", langMid: " or ", langAfter: " to open in a specific language.", embed: "Embed code", openLive: "Open live form",
    domainLabel: "Custom domain", domain: "Custom domains aren’t available yet. Use the link or embed code.",
    portability: "Portability", exportReuse: "Export & reuse",
    exportNote: "Questions, logic and design, without responses.",
    download: "Download form file", saveAsTemplate: "Save as template", savedTemplate: "Saved to your templates.", saveTemplate: "Save template",
    webhooks: "Webhooks and the API can send each new response to your own tools; set them up in Connections.",
    connectedApps: "Connected apps", appsBefore: "Apps such as Max can show this form’s status and a privacy-safe summary when you share it with a connection. Manage what each app can see in ", connections: "Connections", appsAfter: ".",
  },
  ar: {
    copied: "تم النسخ", copy: "انسخ", shareLink: "رابط المشاركة", link: "الرابط", publishFirst: "انشر النموذج لتبدأ جمع الردود. يعمل الرابط أدناه بعد النشر.",
    notLive: (status: string) => `هذا النموذج ${status}. يعرض الرابط رسالة الإغلاق التي كتبتها.`, publicLink: "الرابط العام", shortLink: "رابط قصير", shortHelp: "النموذج نفسه على العنوان القصير. يعمل الرابطان معًا.",
    langBefore: "أضف ", langMid: " أو ", langAfter: " لفتحه بلغة محددة.", embed: "رمز التضمين", openLive: "افتح النموذج المنشور",
    domainLabel: "نطاق مخصص", domain: "النطاقات المخصصة غير متاحة بعد. استخدم الرابط أو رمز التضمين.",
    portability: "النقل", exportReuse: "التصدير وإعادة الاستخدام",
    exportNote: "الأسئلة والمنطق والتصميم، دون الردود.",
    download: "نزّل ملف النموذج", saveAsTemplate: "احفظ كقالب", savedTemplate: "حُفظ في قوالبك.", saveTemplate: "احفظ القالب",
    webhooks: "يمكن للويب هوك والواجهة البرمجية إرسال كل رد جديد إلى أدواتك؛ اضبطها من الاتصالات.",
    connectedApps: "التطبيقات المتصلة", appsBefore: "تعرض تطبيقات مثل Max حالة هذا النموذج وملخصًا يحفظ الخصوصية عند مشاركته مع اتصال. أدِر ما يراه كل تطبيق في ", connections: "الاتصالات", appsAfter: ".",
  },
};

const statusName = { en: { draft: "draft", closed: "closed", archived: "archived", live: "live" }, ar: { draft: "مسودة", closed: "مغلق", archived: "مؤرشف", live: "منشور" } } as const;

function CopyBox({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const t = useCopy(copy);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="chaos-heading text-[10px] text-muted-foreground">{label}</p>
      <div className="flex gap-2 items-start">
        {multiline
          ? <textarea readOnly value={value} rows={3} className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={label} />
          : <input readOnly value={value} className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={label} />}
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => void copyText(value).then((ok) => { if (!ok) return; setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
          <Copy size={14} /> {copied ? t.copied : t.copy}
        </button>
      </div>
    </div>
  );
}

export default function ShareTab({ formId, shareId, title, published, status, slug }: { formId: Id<"forms">; shareId: string; title: string; published: boolean; status: string; slug?: string | null }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const me = useQuery(api.links.getMyLinkIdentity, slug ? {} : "skip");
  const convex = useConvex();
  const saveAsTemplate = useMutation(api.forms.saveAsTemplate);
  const [origin, setOrigin] = useState("");
  const [templateName, setTemplateName] = useState(title);
  useEffect(() => setOrigin(linkOrigin("main")), []);
  // The custom link when there is one; /f/<id> always keeps working too.
  const path = slug && me ? `/${me.username}/${slug}` : `/f/${shareId}`;
  const link = `${origin}${path}`;
  // Only when a short share domain is configured (NEXT_PUBLIC_SHORT_SHARE_ORIGIN).
  const short = shortShareUrl(path);

  const exportDefinition = async () => {
    const data = await convex.query(api.forms.exportDefinition, { formId });
    if (!data) return;
    downloadBlob(JSON.stringify({ ...data, exportedAt: Date.now() }, null, 2), `${safeFilename(title)}.chaos-form.json`, "application/json");
    posthog.capture("form_definition_exported");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="chaos-card bg-card p-5 space-y-4" aria-label={t.shareLink}>
        <h2 className="chaos-heading text-sm">{t.link}</h2>
        {!published && <p className="text-sm text-muted-foreground">{t.publishFirst}</p>}
        {published && status !== "live" && <p className="text-sm text-muted-foreground">{t.notLive(statusName[locale][status as keyof typeof statusName.en] ?? status)}</p>}
        <CopyBox label={t.publicLink} value={link} />
        {short && <><CopyBox label={t.shortLink} value={short} /><p className="text-xs text-muted-foreground">{t.shortHelp}</p></>}
        <p className="text-xs text-muted-foreground">{t.langBefore}<code>?lang=ar</code>{t.langMid}<code>?lang=en</code>{t.langAfter}</p>
        {published && <a href={`/f/${shareId}`} target="_blank" rel="noreferrer" className="kb-btn kb-btn-ghost text-xs inline-flex">{t.openLive}</a>}
      </section>

      <QrShare link={short ?? link} title={title} published={published} />

      <FallbackBoundary fallback={null}><EmbedPanel formId={formId} link={link} title={title} /></FallbackBoundary>

      <section className="chaos-card bg-card p-5 space-y-2 text-sm" aria-label={t.domainLabel}>
        <h2 className="chaos-heading text-sm">{t.domainLabel}</h2>
        <p className="text-muted-foreground">{t.domain}</p>
      </section>

      <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.portability}>
        <h2 className="chaos-heading text-sm">{t.exportReuse}</h2>
        <p className="text-xs text-muted-foreground">{t.exportNote}</p>
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => exportDefinition().catch((e) => toast.error(e))}><Download size={14} /> {t.download}</button>
        <div className="flex gap-2 items-end flex-wrap pt-2 border-t border-foreground/10">
          <label className="text-sm flex-1 min-w-48">{t.saveAsTemplate}
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="kb-input mt-1" maxLength={120} />
          </label>
          <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => saveAsTemplate({ formId, name: templateName, category: "Custom" }).then(() => { posthog.capture("form_template_saved"); toast.success(t.savedTemplate); }).catch((e) => toast.error(e))}>{t.saveTemplate}</button>
        </div>
      </section>

      <section className="chaos-card bg-card p-5 space-y-2 text-sm" aria-label={t.connectedApps}>
        <h2 className="chaos-heading text-sm">{t.connectedApps}</h2>
        <p className="text-muted-foreground">
          {t.appsBefore}<Link href="/dashboard/connections" className="underline">{t.connections}</Link>{t.appsAfter}
        </p>
        <DocHint slug="webhooks">{t.webhooks}</DocHint>
      </section>
    </div>
  );
}
