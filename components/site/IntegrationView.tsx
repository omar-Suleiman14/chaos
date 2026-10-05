"use client";

/* eslint-disable @next/next/no-img-element -- the static Chaos mark; next/image adds nothing here */
import "@/app/landing.css";
import "./integrations.css";
import { useState } from "react";
import { AlertCircle, Check, Copy, Download, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import inventory from "@/lib/mcp/inventory.json";
import { chaosIntegration as chaos, integrationPlatforms, packageDownloadPath, type IntegrationPlatform, type IntegrationPlatformId } from "@/lib/integrations";
import { useLocale } from "@/lib/i18n";
import { SiteFooter, SiteNav } from "./SiteChrome";
import Link from "./SiteLink";
import { AiMark } from "./aiMarks";
import { ChatGptMark } from "./marks";
import McpWorkflowDemo from "./McpWorkflowDemo";

type Copy = {
  eyebrow: string; title: string; lead: string; add: string; download: string; downloading: string; downloaded: string; downloadFailed: string; copyFailed: string;
  connectTitle: string; connectLead: string; recommended: string; connectorTitle: string; connectorSteps: string[];
  packageTitle: string; packageLead: string; packageSteps: string[]; packageNote: string;
  extraTitle?: string; extraLead?: string; extraCommand?: string;
  canTitle: string; canLead: string; can: [string, string][];
  examplesTitle: string; examples: string[]; copied: string;
  manualTitle: string; manualLead: string; nameLabel: string; logoLabel: string; logoFiles: string; urlLabel: string; authLabel: string; authValue: string; copy: string; manualSteps: string[];
  securityTitle: string; security: string[];
  privacy: [string, string, string]; help: [string, string]; tools: (n: number) => string;
  otherTitle: string; otherLead: string;
};

const copy: Record<IntegrationPlatformId, { en: Copy; ar: Copy }> = {
  claude: {
    en: {
      eyebrow: "Chaos for Claude",
      title: "Create with Chaos without leaving Claude.",
      lead: "Connect Chaos once, and Claude can make forms, quizzes, lessons and courses in your Chaos account, check your results and run live games, right from the conversation.",
      add: "Add Chaos to Claude", download: "Download Chaos for Claude", downloading: "Preparing…", downloaded: "Downloaded", downloadFailed: "Couldn’t download. Try again", copyFailed: "Couldn’t copy",
      connectTitle: "Connect Chaos", connectLead: "Pick one. Both sign in with your Chaos account and give Claude the same access.", recommended: "Recommended",
      connectorTitle: "Add the Chaos connector",
      connectorSteps: ["Choose Add Chaos to Claude. Claude opens “Add custom connector” with Chaos and its URL filled in.", "Check the details and choose Add.", "Choose Connect and sign in to Chaos. Chaos then appears in your connectors on claude.ai, Claude Desktop and the mobile apps."],
      packageTitle: "Install the Chaos plugin", packageLead: "A plugin package with the Chaos connector, logo and a short guide that tells Claude when to use Chaos.",
      packageSteps: ["Download the ZIP.", "In Claude, open Customize › Plugins and upload it. In Claude Code, unzip it and run claude --plugin-dir with the folder.", "Turn Chaos on and sign in when asked."],
      packageNote: "The package holds no keys or passwords, only the public Chaos address.",
      extraTitle: "Claude Code", extraLead: "Add Chaos with one command, then run /mcp to sign in.", extraCommand: `claude mcp add --transport http ${chaos.id} ${chaos.mcpUrl}`,
      canTitle: "What Claude can do with Chaos", canLead: "Ask in your own words. Claude picks the right Chaos action and shows you what it made.",
      can: [["Forms and surveys", "Draft, edit, theme and publish forms, then close or reopen them."], ["Quizzes", "Write quizzes with answers, points and explanations."], ["Lessons", "Turn notes into lessons with callouts, flashcards and checkpoint quizzes."], ["Courses", "Put lessons together into a course and publish it when it’s ready."], ["Results", "Summarize results and, only when you ask, read individual answers."], ["Live games", "Open a live lobby from a quiz and move the game on when you say so."]],
      examplesTitle: "Try asking", examples: ["Create a 50-question quiz from this PDF and publish it.", "Turn these notes into a Chaos lesson.", "Create a course containing these lectures.", "Show me the results from my latest quiz."], copied: "Copied",
      manualTitle: "Manual setup", manualLead: "For workspace owners and anyone adding Chaos by hand.",
      nameLabel: "Connector name", logoLabel: "Logo", logoFiles: "SVG · PNG 512", urlLabel: "Remote MCP server URL", authLabel: "Sign-in", authValue: "OAuth with your Chaos account. Leave client ID and secret empty.", copy: "Copy",
      manualSteps: ["In Claude, open Customize › Connectors and choose + › Add custom connector.", "Enter the name and URL above, then choose Add.", "Choose Connect and sign in to Chaos. On Team and Enterprise plans, an owner adds it in organization settings first."],
      securityTitle: "Security and permissions",
      security: ["Claude acts as you. It can only see and change what your Chaos account can, and Chaos checks permission on every request.", "Administrator and internal tools are never offered to regular connections.", "You sign in on chaos.fail. Claude never sees your password, and nothing in the download is secret.", "Disconnect any time from Claude’s connector settings or from Connections in Chaos."],
      privacy: ["What Claude reads is sent to Anthropic. Only ask it to read individual answers when you’re allowed to share them. See the ", "privacy policy", "."],
      help: ["Something not working? Email ", "."], tools: (n) => `${n} Chaos tools, all checked against your account.`,
      otherTitle: "Also in ChatGPT", otherLead: "The same Chaos account works in ChatGPT.",
    },
    ar: {
      eyebrow: "Chaos لـ Claude",
      title: "أنشئ في Chaos دون أن تغادر Claude.",
      lead: "اربط Chaos مرة واحدة، وسيتمكن Claude من إنشاء النماذج والاختبارات والدروس والدورات في حسابك، ومتابعة النتائج وتشغيل الألعاب المباشرة، من داخل المحادثة.",
      add: "أضف Chaos إلى Claude", download: "نزّل Chaos لـ Claude", downloading: "جارٍ التجهيز…", downloaded: "تم التنزيل", downloadFailed: "تعذّر التنزيل. حاول مجددًا", copyFailed: "تعذّر النسخ",
      connectTitle: "اربط Chaos", connectLead: "اختر طريقة واحدة. كلتاهما تسجّل الدخول بحسابك في Chaos وتمنح Claude الصلاحيات نفسها.", recommended: "موصى به",
      connectorTitle: "أضف موصّل Chaos",
      connectorSteps: ["اختر «أضف Chaos إلى Claude». يفتح Claude نافذة «إضافة موصّل مخصص» وفيها اسم Chaos ورابطه.", "راجع البيانات واختر إضافة.", "اختر اتصال وسجّل الدخول إلى Chaos. يظهر Chaos بعدها في موصّلاتك على claude.ai وClaude Desktop وتطبيقات الهاتف."],
      packageTitle: "ثبّت إضافة Chaos", packageLead: "حزمة إضافة فيها موصّل Chaos وشعاره ودليل قصير يخبر Claude متى يستخدم Chaos.",
      packageSteps: ["نزّل ملف ZIP.", "في Claude افتح التخصيص › الإضافات وارفعه. وفي Claude Code فك الضغط وشغّل claude --plugin-dir مع المجلد.", "فعّل Chaos وسجّل الدخول عند الطلب."],
      packageNote: "لا تحتوي الحزمة على مفاتيح أو كلمات مرور، بل على عنوان Chaos العام فقط.",
      extraTitle: "Claude Code", extraLead: "أضف Chaos بأمر واحد، ثم شغّل ‎/mcp لتسجيل الدخول.", extraCommand: `claude mcp add --transport http ${chaos.id} ${chaos.mcpUrl}`,
      canTitle: "ما يستطيع Claude فعله مع Chaos", canLead: "اطلب بكلماتك. يختار Claude إجراء Chaos المناسب ويريك ما أنشأه.",
      can: [["النماذج والاستطلاعات", "صياغة النماذج وتعديلها وتنسيقها ونشرها، ثم إغلاقها أو إعادة فتحها."], ["الاختبارات", "كتابة اختبارات بإجابات ودرجات وتفسيرات."], ["الدروس", "تحويل الملاحظات إلى دروس فيها تنبيهات وبطاقات واختبارات قصيرة."], ["الدورات", "جمع الدروس في دورة ونشرها حين تكون جاهزة."], ["النتائج", "تلخيص النتائج، وقراءة الإجابات الفردية عند طلبك فقط."], ["الألعاب المباشرة", "فتح غرفة مباشرة من اختبار وتحريك اللعبة حين تطلب."]],
      examplesTitle: "جرّب أن تطلب", examples: ["أنشئ اختبارًا من 50 سؤالًا من ملف PDF هذا وانشره.", "حوّل هذه الملاحظات إلى درس في Chaos.", "أنشئ دورة تضم هذه المحاضرات.", "اعرض لي نتائج آخر اختبار لي."], copied: "تم النسخ",
      manualTitle: "الإعداد اليدوي", manualLead: "لمالكي مساحات العمل ولمن يضيف Chaos يدويًا.",
      nameLabel: "اسم الموصّل", logoLabel: "الشعار", logoFiles: "SVG · PNG 512", urlLabel: "رابط خادم MCP البعيد", authLabel: "تسجيل الدخول", authValue: "OAuth بحسابك في Chaos. اترك معرّف العميل والسر فارغين.", copy: "نسخ",
      manualSteps: ["في Claude افتح التخصيص › الموصّلات واختر + › إضافة موصّل مخصص.", "أدخل الاسم والرابط أعلاه ثم اختر إضافة.", "اختر اتصال وسجّل الدخول إلى Chaos. في خطط Team وEnterprise يضيفه المالك أولًا من إعدادات المؤسسة."],
      securityTitle: "الأمان والصلاحيات",
      security: ["يعمل Claude باسمك. لا يرى ولا يغيّر إلا ما يسمح به حسابك في Chaos، ويتحقق Chaos من الصلاحية في كل طلب.", "لا تُعرض أدوات الإدارة والأدوات الداخلية على الاتصالات العادية أبدًا.", "تسجّل الدخول على chaos.fail. لا يرى Claude كلمة مرورك، ولا شيء سري في الملف المنزّل.", "افصل الاتصال متى شئت من إعدادات الموصّلات في Claude أو من الاتصالات في Chaos."],
      privacy: ["ما يقرؤه Claude يُرسَل إلى Anthropic. لا تطلب منه قراءة إجابات أفراد إلا إذا كان مسموحًا لك بمشاركتها. راجع ", "سياسة الخصوصية", "."],
      help: ["هل هناك ما لا يعمل؟ راسلنا على ", "."], tools: (n) => `${n} أداة في Chaos، وكلها تخضع لصلاحيات حسابك.`,
      otherTitle: "متاح أيضًا في ChatGPT", otherLead: "حسابك نفسه في Chaos يعمل في ChatGPT.",
    },
  },
  chatgpt: {
    en: {
      eyebrow: "Chaos for ChatGPT",
      title: "Use Chaos directly from ChatGPT.",
      lead: "The Chaos app lets ChatGPT work in your Chaos account. Ask it to turn a conversation into a quiz, draft a survey, check how a form is doing or publish it when you’re ready. It’s optional and included on every plan, and Chaos works on its own too.",
      add: "Add Chaos to ChatGPT", download: "Download Chaos for ChatGPT", downloading: "Preparing…", downloaded: "Downloaded", downloadFailed: "Couldn’t download. Try again", copyFailed: "Couldn’t copy",
      connectTitle: "Connect Chaos", connectLead: "Pick one. Both sign in with your Chaos account and give ChatGPT the same access.", recommended: "Recommended",
      connectorTitle: "Add Chaos as an app",
      connectorSteps: ["Copy the Chaos URL below, then choose Add Chaos to ChatGPT to open your settings.", "Go to Apps › Advanced settings and turn on Developer mode (Plus, Pro, Business, Enterprise and Education).", "Choose Create. Name it Chaos, paste the URL, pick OAuth and choose Create.", "Sign in to Chaos when asked. Chaos then appears in your apps."],
      packageTitle: "Install the Chaos plugin", packageLead: "An OpenAI plugin package for Codex with the Chaos logo, the connector and a short guide that tells the assistant when to use Chaos.",
      packageSteps: ["Download the ZIP and unzip it to ~/plugins/chaos.", "Add it to your Codex plugin marketplace as the README inside shows, then install Chaos.", "Sign in to Chaos when asked."],
      packageNote: "The package holds no keys or passwords, only the public Chaos address.",
      canTitle: "What ChatGPT can do with Chaos", canLead: "Ask in your own words. ChatGPT picks the right Chaos action and shows you what it made.",
      can: [["Forms and surveys", "Draft, edit, theme and publish forms, then close, reopen or archive them."], ["Quizzes", "Use quiz mode: right answers, points and a short explanation for each question."], ["Lessons", "Draft lessons and edit their blocks. Review changes before publishing."], ["Courses", "Build a course from lessons. Publishing uses the published lesson versions."], ["Results", "Summarize results and, only when you ask, read individual answers."], ["Live games", "Open a live lobby from a quiz and move the game on when you say so."]],
      examplesTitle: "Things to try", examples: ["Make a 10-question quiz about what we just discussed, using Chaos.", "Create a Chaos feedback form for tonight’s workshop with a 1–5 rating and one open question.", "How is my Chaos form ‘Team lunch’ doing? Summarize the results.", "Create a Chaos course draft called Introduction to biology and add a lesson draft about cells. Leave it unpublished."], copied: "Copied",
      manualTitle: "Manual setup", manualLead: "Everything ChatGPT asks for when you add Chaos by hand.",
      nameLabel: "App name", logoLabel: "Logo", logoFiles: "SVG · PNG 512", urlLabel: "MCP server URL", authLabel: "Authentication", authValue: "OAuth with your Chaos account. No API key.", copy: "Copy",
      manualSteps: ["Open ChatGPT settings › Apps › Advanced settings and turn on Developer mode.", "Choose Create, enter the name and URL above and pick OAuth.", "Choose Create and sign in to Chaos. Add Chaos from the tools menu in a new chat."],
      securityTitle: "Security and permissions",
      security: ["ChatGPT acts as you. It can only see and change what your Chaos account can, and Chaos checks permission on every request.", "Administrator and internal tools are never offered to regular connections.", "You sign in on chaos.fail. ChatGPT never sees your password, and nothing in the download is secret.", "To disconnect, remove Chaos from your apps in ChatGPT’s settings, or from Connections in Chaos."],
      privacy: ["What ChatGPT reads is sent to OpenAI. Only ask it to read individual answers when you’re allowed to share them. See the ", "privacy policy", "."],
      help: ["Something not working? Email ", "."], tools: (n) => `${n} Chaos tools, all checked against your account.`,
      otherTitle: "Also in Claude", otherLead: "The same Chaos account works in Claude, with a one-click connector.",
    },
    ar: {
      eyebrow: "Chaos لـ ChatGPT",
      title: "استخدم Chaos مباشرة من ChatGPT.",
      lead: "يتيح تطبيق Chaos لـ ChatGPT أن يعمل داخل حسابك في Chaos. اطلب منه تحويل محادثة إلى اختبار، أو صياغة استطلاع، أو متابعة نتائج نموذج، أو نشره حين تكون جاهزًا. الربط اختياري ومتاح في كل الخطط، ويعمل Chaos أيضًا بمفرده.",
      add: "أضف Chaos إلى ChatGPT", download: "نزّل Chaos لـ ChatGPT", downloading: "جارٍ التجهيز…", downloaded: "تم التنزيل", downloadFailed: "تعذّر التنزيل. حاول مجددًا", copyFailed: "تعذّر النسخ",
      connectTitle: "اربط Chaos", connectLead: "اختر طريقة واحدة. كلتاهما تسجّل الدخول بحسابك في Chaos وتمنح ChatGPT الصلاحيات نفسها.", recommended: "موصى به",
      connectorTitle: "أضف Chaos كتطبيق",
      connectorSteps: ["انسخ رابط Chaos أدناه، ثم اختر «أضف Chaos إلى ChatGPT» لفتح الإعدادات.", "اذهب إلى التطبيقات › الإعدادات المتقدمة وفعّل وضع المطوّر (Plus وPro وBusiness وEnterprise وEducation).", "اختر إنشاء. سمّه Chaos، والصق الرابط، واختر OAuth، ثم اختر إنشاء.", "سجّل الدخول إلى Chaos عند الطلب. يظهر Chaos بعدها في تطبيقاتك."],
      packageTitle: "ثبّت إضافة Chaos", packageLead: "حزمة إضافة OpenAI لـ Codex فيها شعار Chaos والموصّل ودليل قصير يخبر المساعد متى يستخدم Chaos.",
      packageSteps: ["نزّل ملف ZIP وفك ضغطه إلى ‎~/plugins/chaos.", "أضفه إلى سوق إضافات Codex كما يشرح ملف README داخله، ثم ثبّت Chaos.", "سجّل الدخول إلى Chaos عند الطلب."],
      packageNote: "لا تحتوي الحزمة على مفاتيح أو كلمات مرور، بل على عنوان Chaos العام فقط.",
      canTitle: "ما يستطيع ChatGPT فعله مع Chaos", canLead: "اطلب بكلماتك. يختار ChatGPT إجراء Chaos المناسب ويريك ما أنشأه.",
      can: [["النماذج والاستطلاعات", "صياغة النماذج وتعديلها وتنسيقها ونشرها، ثم إغلاقها أو إعادة فتحها أو أرشفتها."], ["الاختبارات", "وضع الاختبار: إجابات صحيحة ودرجات وشرح قصير لكل سؤال."], ["الدروس", "إنشاء مسودات الدروس وتعديل كتلها. راجع التغييرات قبل النشر."], ["الدورات", "بناء دورة من الدروس. يستخدم النشر نسخ الدروس المنشورة."], ["النتائج", "تلخيص النتائج، وقراءة الإجابات الفردية عند طلبك فقط."], ["الألعاب المباشرة", "فتح غرفة مباشرة من اختبار وتحريك اللعبة حين تطلب."]],
      examplesTitle: "جرّب هذه الطلبات", examples: ["اصنع اختبارًا من 10 أسئلة عمّا ناقشناه للتو، باستخدام Chaos.", "أنشئ نموذج ملاحظات في Chaos لورشة الليلة، بتقييم من 1 إلى 5 وسؤال مفتوح واحد.", "كيف حال نموذج ‹غداء الفريق› في Chaos؟ لخّص لي النتائج.", "أنشئ مسودة دورة في Chaos بعنوان مقدمة في الأحياء وأضف مسودة درس عن الخلايا. لا تنشرها."], copied: "تم النسخ",
      manualTitle: "الإعداد اليدوي", manualLead: "كل ما يطلبه ChatGPT حين تضيف Chaos يدويًا.",
      nameLabel: "اسم التطبيق", logoLabel: "الشعار", logoFiles: "SVG · PNG 512", urlLabel: "رابط خادم MCP", authLabel: "المصادقة", authValue: "OAuth بحسابك في Chaos. بلا مفتاح API.", copy: "نسخ",
      manualSteps: ["افتح إعدادات ChatGPT › التطبيقات › الإعدادات المتقدمة وفعّل وضع المطوّر.", "اختر إنشاء، وأدخل الاسم والرابط أعلاه، واختر OAuth.", "اختر إنشاء وسجّل الدخول إلى Chaos. أضف Chaos من قائمة الأدوات في محادثة جديدة."],
      securityTitle: "الأمان والصلاحيات",
      security: ["يعمل ChatGPT باسمك. لا يرى ولا يغيّر إلا ما يسمح به حسابك في Chaos، ويتحقق Chaos من الصلاحية في كل طلب.", "لا تُعرض أدوات الإدارة والأدوات الداخلية على الاتصالات العادية أبدًا.", "تسجّل الدخول على chaos.fail. لا يرى ChatGPT كلمة مرورك، ولا شيء سري في الملف المنزّل.", "لفصل الاتصال، أزل Chaos من تطبيقاتك في إعدادات ChatGPT أو من الاتصالات في Chaos."],
      privacy: ["ما يقرؤه ChatGPT يُرسَل إلى OpenAI. لا تطلب منه قراءة إجابات أفراد إلا إذا كان مسموحًا لك بمشاركتها. راجع ", "سياسة الخصوصية", "."],
      help: ["هل هناك ما لا يعمل؟ راسلنا على ", "."], tools: (n) => `${n} أداة في Chaos، وكلها تخضع لصلاحيات حسابك.`,
      otherTitle: "متاح أيضًا في Claude", otherLead: "حسابك نفسه في Chaos يعمل في Claude بموصّل بنقرة واحدة.",
    },
  },
};

/** The platform's mark in its own colours: Claude's orange spark, ChatGPT's monochrome blossom. */
export function PlatformMark({ platform, size }: { platform: IntegrationPlatformId; size: number }) {
  return platform === "chatgpt" ? <ChatGptMark size={size} /> : <AiMark client="claude" size={size} />;
}

/** Chaos mark + platform mark, the lockup used on integration pages and cards. */
export function IntegrationLockup({ platform, size = 44 }: { platform: IntegrationPlatformId; size?: number }) {
  return (
    <span className="site-int-lockup" aria-hidden>
      <span className="site-int-lockup__tile"><img src={chaos.logoPath} alt="" width={size} height={size} /></span>
      <span className="site-int-lockup__plus">+</span>
      <span className="site-int-lockup__tile"><PlatformMark platform={platform} size={Math.round(size * 0.72)} /></span>
    </span>
  );
}

function CopyButton({ value, t }: { value: string; t: Copy }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const run = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button type="button" className="site-int-copy" data-state={state} onClick={() => void run()} aria-label={`${t.copy}: ${value}`}>
      {state === "done" ? <Check size={15} aria-hidden /> : state === "failed" ? <AlertCircle size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      <span aria-live="polite">{state === "done" ? t.copied : state === "failed" ? t.copyFailed : t.copy}</span>
    </button>
  );
}

/** Fetches the package first, so a failed build or network error says so instead of saving an error page. */
function DownloadButton({ platform, t, primary }: { platform: IntegrationPlatform; t: Copy; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const href = packageDownloadPath(platform);
  const start = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      const response = await fetch(href);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("zip")) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: platform.packageFile });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("done");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 3000);
  };
  return (
    <a className={`site-btn site-btn--lg ${primary ? "site-btn--primary" : "site-btn--outline"}`} href={href} download={platform.packageFile} onClick={start} aria-busy={state === "busy"} data-state={state}>
      {state === "busy" ? <Loader2 size={17} className="site-int-spin" aria-hidden /> : state === "done" ? <Check size={17} aria-hidden /> : state === "failed" ? <AlertCircle size={17} aria-hidden /> : <Download size={17} aria-hidden />}
      <span aria-live="polite">{state === "busy" ? t.downloading : state === "done" ? t.downloaded : state === "failed" ? t.downloadFailed : t.download}</span>
    </a>
  );
}

export default function IntegrationView({ platform: id }: { platform: IntegrationPlatformId }) {
  const { locale } = useLocale();
  const t = copy[id][locale === "ar" ? "ar" : "en"];
  const platform = integrationPlatforms[id];
  const other = integrationPlatforms[id === "claude" ? "chatgpt" : "claude"];
  const otherT = copy[other.id][locale === "ar" ? "ar" : "en"];

  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1} className="site-int" dir={locale === "ar" ? "rtl" : "ltr"}>
        <header className="site-int-hero">
          <IntegrationLockup platform={id} size={52} />
          <p className="site-int-eyebrow">{t.eyebrow}</p>
          <h1 className="site-int-title">{t.title}</h1>
          <p className="site-int-lead">{t.lead}</p>
          <div className="site-int-actions">
            <a className="site-btn site-btn--lg site-btn--primary" href={platform.connectUrl} target="_blank" rel="noopener noreferrer">
              {t.add}<ExternalLink size={16} aria-hidden />
            </a>
            <DownloadButton platform={platform} t={t} />
          </div>
          <p className="site-int-fine">{t.tools(inventory.count)}</p>
        </header>

        <section aria-labelledby="int-connect">
          <h2 id="int-connect">{t.connectTitle}</h2>
          <p>{t.connectLead}</p>
          <div className="site-int-grid">
            <article className="site-int-card site-int-card--main">
              <span className="site-int-badge">{t.recommended}</span>
              <h3>{t.connectorTitle}</h3>
              <ol>{t.connectorSteps.map((step) => <li key={step}>{step}</li>)}</ol>
              <a className="site-btn site-btn--primary" href={platform.connectUrl} target="_blank" rel="noopener noreferrer">{t.add}<ExternalLink size={15} aria-hidden /></a>
            </article>
            <article className="site-int-card">
              <h3>{t.packageTitle}</h3>
              <p>{t.packageLead}</p>
              <ol>{t.packageSteps.map((step) => <li key={step}>{step}</li>)}</ol>
              <DownloadButton platform={platform} t={t} />
              <p className="site-int-fine">{t.packageNote} v{chaos.version}</p>
            </article>
          </div>
          {t.extraCommand && (
            <div className="site-int-command">
              <h3>{t.extraTitle}</h3>
              <p>{t.extraLead}</p>
              <div className="site-int-field"><code dir="ltr">{t.extraCommand}</code><CopyButton value={t.extraCommand} t={t} /></div>
            </div>
          )}
        </section>

        <section aria-labelledby="int-can">
          <h2 id="int-can">{t.canTitle}</h2>
          <p>{t.canLead}</p>
          <ul className="site-int-can">{t.can.map(([title, body]) => <li key={title}><strong>{title}</strong><span>{body}</span></li>)}</ul>
          <h3>{t.examplesTitle}</h3>
          <ul className="site-int-prompts">
            {t.examples.map((prompt) => (
              <li key={prompt}><q>{prompt}</q><CopyButton value={prompt} t={t} /></li>
            ))}
          </ul>
          <McpWorkflowDemo />
        </section>

        <section aria-labelledby="int-manual">
          <h2 id="int-manual">{t.manualTitle}</h2>
          <p>{t.manualLead}</p>
          <dl className="site-int-fields">
            <div><dt>{t.nameLabel}</dt><dd className="site-int-field"><code>{chaos.name}</code><CopyButton value={chaos.name} t={t} /></dd></div>
            <div>
              <dt>{t.logoLabel}</dt>
              <dd className="site-int-field">
                <img src={chaos.logoPath} alt="Chaos" width={32} height={32} />
                <a href={chaos.logoPath} download="chaos.svg">SVG</a> · <a href="/api/plugins/chaos-icon-512.png" download="chaos-512.png">PNG 512</a>
              </dd>
            </div>
            <div><dt>{t.urlLabel}</dt><dd className="site-int-field"><code dir="ltr">{chaos.mcpUrl}</code><CopyButton value={chaos.mcpUrl} t={t} /></dd></div>
            <div><dt>{t.authLabel}</dt><dd>{t.authValue}</dd></div>
          </dl>
          <ol>{t.manualSteps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>

        <section aria-labelledby="int-security">
          <h2 id="int-security" className="site-int-h-icon"><ShieldCheck size={22} aria-hidden />{t.securityTitle}</h2>
          <ul>{t.security.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>{t.privacy[0]}<Link href="/privacy">{t.privacy[1]}</Link>{t.privacy[2]}</p>
          <p>{t.help[0]}<a href={`mailto:${chaos.supportEmail}`}>{chaos.supportEmail}</a>{t.help[1]}</p>
        </section>

        <aside className="site-int-other">
          <IntegrationLockup platform={other.id} size={32} />
          <div>
            <h2>{t.otherTitle}</h2>
            <p>{t.otherLead}</p>
          </div>
          <Link className="site-btn site-btn--outline" href={other.pagePath}>{otherT.eyebrow}</Link>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
