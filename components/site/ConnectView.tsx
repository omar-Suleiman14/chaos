"use client";

import { useState } from "react";
import inventory from "@/lib/mcp/inventory.json";
import AiArchitecture from "./AiArchitecture";
import McpWorkflowDemo from "./McpWorkflowDemo";
import McpOutcomes from "./McpOutcomes";
import Link from "@/components/site/SiteLink";
import { Check, Copy, ExternalLink } from "lucide-react";
import LegalPage from "@/components/site/LegalPage";
import { AiMark } from "@/components/site/aiMarks";
import { useCopy } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";

const mcpUrl = `${siteUrl}/mcp`;
// claude.ai opens its "Add custom connector" dialog with these values filled in; the person still confirms.
const claudeLink = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Chaos&connectorUrl=${encodeURIComponent(mcpUrl)}`;
// ChatGPT has no prefill link yet, so this opens its settings and the steps say what to choose.
const chatGptLink = "https://chatgpt.com/#settings/Connectors";

const copy = {
  en: {
    title: "Connect Chaos to Claude or ChatGPT",
    intro: "Optional. Connect once and your assistant can create and edit forms, quizzes, lessons and courses in your Chaos account. Lessons it creates show “Created with Claude” or “Created with ChatGPT” next to your name.",
    urlLabel: "Chaos connector URL", copyUrl: "Copy URL", copied: "Copied",
    claudeTitle: "Claude", claudeButton: "Add to Claude",
    claudeSteps: ["Open the link. Claude shows “Add custom connector” with Chaos and the URL already filled in.", "Check the values and choose Add.", "Choose Connect and sign in to Chaos. Your connector appears under Connectors."],
    chatgptTitle: "ChatGPT", chatgptButton: "Open ChatGPT settings",
    chatgptSteps: ["Copy the URL above, then open ChatGPT settings.", "Go to Apps › Advanced settings and turn on Developer mode (Plus, Pro, Business, Enterprise and Education).", "Choose Create. Name it Chaos, paste the URL, pick OAuth, and choose Create.", "Sign in to Chaos when asked. Chaos then appears in your connected apps."],
    more: ["What the assistant can do, and privacy: ", "Chaos in ChatGPT", "."],
  },
  ar: {
    title: "اربط Chaos بـ Claude أو ChatGPT",
    intro: "اختياري. اربطه مرة واحدة ليتمكن مساعدك من إنشاء النماذج والاختبارات والدروس والدورات وتعديلها في حسابك. وتظهر عبارة «أُنشئ باستخدام Claude» أو «أُنشئ باستخدام ChatGPT» بجانب اسمك في الدروس التي ينشئها.",
    urlLabel: "رابط موصّل Chaos", copyUrl: "نسخ الرابط", copied: "تم النسخ",
    claudeTitle: "Claude", claudeButton: "أضف إلى Claude",
    claudeSteps: ["افتح الرابط. يعرض Claude نافذة «إضافة موصّل مخصص» وفيها اسم Chaos والرابط جاهزين.", "راجع القيم واختر إضافة.", "اختر اتصال وسجّل الدخول إلى Chaos. يظهر الموصّل في قائمة الموصّلات."],
    chatgptTitle: "ChatGPT", chatgptButton: "افتح إعدادات ChatGPT",
    chatgptSteps: ["انسخ الرابط أعلاه، ثم افتح إعدادات ChatGPT.", "اذهب إلى التطبيقات › الإعدادات المتقدمة وفعّل وضع المطوّر (Plus وPro وBusiness وEnterprise وEducation).", "اختر إنشاء. سمّه Chaos، والصق الرابط، واختر OAuth، ثم اختر إنشاء.", "سجّل الدخول إلى Chaos عند الطلب. سيظهر Chaos في تطبيقاتك المتصلة."],
    more: ["ما يستطيع المساعد فعله والخصوصية: ", "Chaos في ChatGPT", "."],
  },
};

export default function ConnectView() {
  const t = useCopy(copy);
  const [copied, setCopied] = useState(false);
  const copyUrl = () => void navigator.clipboard?.writeText(mcpUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  return (
    <LegalPage title={t.title}>
      <p>{t.intro}</p>
      <AiArchitecture />
      <McpWorkflowDemo />
      <McpOutcomes />
      <p className="site-muted">{inventory.count} MCP tools</p>
      <p><strong>{t.urlLabel}</strong></p>
      <p className="site-connect-url"><code dir="ltr">{mcpUrl}</code> <button type="button" className="site-connect-btn" onClick={copyUrl}>{copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? t.copied : t.copyUrl}</button></p>

      <h2 className="site-connect-title"><AiMark client="claude" size={22} />{t.claudeTitle}</h2>
      <p><a className="site-connect-btn" href={claudeLink} target="_blank" rel="noopener noreferrer">{t.claudeButton}<ExternalLink size={14} aria-hidden /></a></p>
      <ol>{t.claudeSteps.map((step) => <li key={step}>{step}</li>)}</ol>

      <h2 className="site-connect-title"><AiMark client="chatgpt" size={22} />{t.chatgptTitle}</h2>
      <p><a className="site-connect-btn" href={chatGptLink} target="_blank" rel="noopener noreferrer">{t.chatgptButton}<ExternalLink size={14} aria-hidden /></a></p>
      <ol>{t.chatgptSteps.map((step) => <li key={step}>{step}</li>)}</ol>

      <p>{t.more[0]}<Link href="/chatgpt">{t.more[1]}</Link>{t.more[2]}</p>
    </LegalPage>
  );
}
