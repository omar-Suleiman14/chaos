"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import Link from "@/components/site/SiteLink";
import LegalPage from "@/components/site/LegalPage";
import { useCopy } from "@/lib/i18n";
import { chaosIntegration, integrationPlatformList, packageDownloadPath } from "@/lib/integrations";
import { IntegrationLockup } from "./IntegrationView";

const copy = {
  en: {
    title: "Connect Chaos to your assistant",
    intro: "Pick your assistant. You sign in with your Chaos account once, and it can make and manage your forms, quizzes, lessons and courses. Optional, on every plan.",
    cards: {
      claude: { title: "Claude", body: "One click on the web, desktop and phone." },
      chatgpt: { title: "ChatGPT", body: "Add Chaos as an app in a few steps." },
    },
    open: "Set up", download: "Download plugin",
    otherTitle: "Another assistant?", otherBody: "Any app that supports remote MCP servers can connect. Add this address and sign in with OAuth when asked.",
    copyUrl: "Copy", copied: "Copied",
  },
  ar: {
    title: "اربط Chaos بمساعدك",
    intro: "اختر مساعدك. تسجّل الدخول بحسابك في Chaos مرة واحدة، ويستطيع بعدها إنشاء نماذجك واختباراتك ودروسك ودوراتك وإدارتها. اختياري ومتاح في كل الخطط.",
    cards: {
      claude: { title: "Claude", body: "نقرة واحدة على الويب وسطح المكتب والهاتف." },
      chatgpt: { title: "ChatGPT", body: "أضف Chaos كتطبيق في خطوات قليلة." },
    },
    open: "الإعداد", download: "نزّل الإضافة",
    otherTitle: "مساعد آخر؟", otherBody: "يمكن لأي تطبيق يدعم خوادم MCP البعيدة الاتصال. أضف هذا العنوان وسجّل الدخول عبر OAuth عند الطلب.",
    copyUrl: "نسخ", copied: "تم النسخ",
  },
};

/** One choice per assistant; each platform page has the full setup, examples and security notes. */
export default function ConnectView() {
  const t = useCopy(copy);
  const [copied, setCopied] = useState(false);
  const copyUrl = () => void copyText(chaosIntegration.mcpUrl).then((ok) => { if (!ok) return; setCopied(true); setTimeout(() => setCopied(false), 2000); });
  return (
    <LegalPage title={t.title}>
      <p>{t.intro}</p>
      <div className="site-int-cards">
        {integrationPlatformList.map((platform) => (
          <article key={platform.id}>
            <IntegrationLockup platform={platform.id} size={30} />
            <h2>{t.cards[platform.id].title}</h2>
            <p>{t.cards[platform.id].body}</p>
            <div className="site-int-cards__actions">
              <Link className="site-btn site-btn--primary" href={platform.pagePath}>{t.open}</Link>
              <a className="site-btn site-btn--outline" href={packageDownloadPath(platform)} download={platform.packageFile}>{t.download}</a>
            </div>
          </article>
        ))}
      </div>
      <h2>{t.otherTitle}</h2>
      <p>{t.otherBody}</p>
      <p className="site-connect-url">
        <code dir="ltr">{chaosIntegration.mcpUrl}</code>
        <button type="button" className="site-connect-btn" onClick={copyUrl}>{copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? t.copied : t.copyUrl}</button>
      </p>
    </LegalPage>
  );
}
