"use client";

import Link from "next/link";
import LegalPage from "@/components/site/LegalPage";
import { useCopy } from "@/lib/i18n";
import { repoIssuesUrl, repoUrl, securityPolicyUrl, statusPageUrl, supportEmail } from "@/lib/site";

const copy = {
  en: {
    title: "Support",
    intro: "Need help with Chaos? Start with the docs, then write to us. We answer by email, at the address you wrote from. There is no phone line or live chat.",
    contactTitle: "Contact",
    contact: ["Email ", ". Tell us which form it is about, with its link, what you did and what you expected. If an error screen showed a ", "Reference", " code, include it."],
    dataNote: "Don’t send respondents’ personal data unless we ask for it.",
    docsTitle: "Guides",
    docs: [
      { href: "/docs", label: "All docs" },
      { href: "/docs/get-help", label: "Get help" },
      { href: "/docs/access-and-limits", label: "Who can respond, and limits" },
      { href: "/docs/file-uploads", label: "File uploads" },
      { href: "/docs/partial-responses", label: "Unfinished responses" },
      { href: "/docs/export-responses", label: "Export responses" },
      { href: "/docs/live-games", label: "Live games" },
      { href: "/docs/integration-api", label: "Integration API" },
    ],
    statusTitle: "Service status",
    status: ["See ", "the status page", " for outages and maintenance."],
    githubTitle: "Bugs and ideas",
    github: ["Chaos is open source. Report bugs and suggest features in ", "GitHub issues", ". Issues are public, so never paste respondents’ answers, emails or access codes. The code is at ", "github.com/omar-Suleiman14/chaos", "."],
    securityTitle: "Security",
    security: ["Report security problems privately, never in a public issue: use ", "Report a vulnerability", " on the repository’s Security tab, or email ", ". Read the ", "security policy", " and ", "security.txt", "."],
    selfHostTitle: "Self-hosted copies",
    selfHost: ["If your organisation runs its own copy of Chaos, contact whoever runs it first. For problems with the software itself, use GitHub issues. See ", "Open source and self-hosting", "."],
  },
  ar: {
    title: "الدعم",
    intro: "تحتاج إلى مساعدة في Chaos؟ ابدأ بالدليل، ثم راسلنا. نرد بالبريد الإلكتروني على العنوان الذي راسلتنا منه. لا يوجد خط هاتفي ولا محادثة مباشرة.",
    contactTitle: "التواصل",
    contact: ["راسلنا على ", ". اذكر النموذج المقصود ورابطه، وما فعلته وما كنت تتوقعه. وإن ظهر في شاشة خطأ رمز ", "المرجع", " فأرفقه."],
    dataNote: "لا ترسل بيانات شخصية للمجيبين إلا إذا طلبناها.",
    docsTitle: "الأدلة",
    docs: [
      { href: "/docs", label: "كل الدليل" },
      { href: "/docs/get-help", label: "احصل على المساعدة" },
      { href: "/docs/access-and-limits", label: "من يستطيع الإجابة، والحدود" },
      { href: "/docs/file-uploads", label: "رفع الملفات" },
      { href: "/docs/partial-responses", label: "الردود غير المكتملة" },
      { href: "/docs/export-responses", label: "تصدير الردود" },
      { href: "/docs/live-games", label: "الألعاب المباشرة" },
      { href: "/docs/integration-api", label: "API التكامل" },
    ],
    statusTitle: "حالة الخدمة",
    status: ["راجع ", "صفحة الحالة", " لمعرفة الأعطال والصيانة."],
    githubTitle: "الأخطاء والأفكار",
    github: ["Chaos مفتوح المصدر. أبلغ عن الأخطاء واقترح المزايا في ", "بلاغات GitHub", ". البلاغات علنية، فلا تلصق فيها إجابات المجيبين أو بريدهم أو رموز الدخول. الشيفرة على ", "github.com/omar-Suleiman14/chaos", "."],
    securityTitle: "الأمان",
    security: ["أبلغ عن مشكلات الأمان بشكل خاص، لا في بلاغ عام أبدًا: استخدم ", "Report a vulnerability", " في تبويب Security بالمستودع، أو راسل ", ". اقرأ ", "سياسة الأمان", " و", "security.txt", "."],
    selfHostTitle: "النسخ المستضافة ذاتيًا",
    selfHost: ["إن كانت مؤسستك تشغّل نسختها الخاصة من Chaos فتواصل أولًا مع من يديرها. ولمشكلات البرنامج نفسه استخدم بلاغات GitHub. راجع ", "المصدر المفتوح والاستضافة الذاتية", "."],
  },
};

export default function SupportView() {
  const t = useCopy(copy);
  const mail = <a href={`mailto:${supportEmail}`}>{supportEmail}</a>;
  return (
    <LegalPage title={t.title}>
      <p>{t.intro}</p>

      <h2 id="contact">{t.contactTitle}</h2>
      <p>{t.contact[0]}{mail}{t.contact[1]}<strong>{t.contact[2]}</strong>{t.contact[3]}</p>
      <p>{t.dataNote}</p>

      <h2 id="docs">{t.docsTitle}</h2>
      <ul>{t.docs.map((doc) => <li key={doc.href}><Link href={doc.href}>{doc.label}</Link></li>)}</ul>

      {statusPageUrl && <>
        <h2 id="status">{t.statusTitle}</h2>
        <p>{t.status[0]}<a href={statusPageUrl}>{t.status[1]}</a>{t.status[2]}</p>
      </>}

      <h2 id="github">{t.githubTitle}</h2>
      <p>{t.github[0]}<a href={repoIssuesUrl}>{t.github[1]}</a>{t.github[2]}<a href={repoUrl} dir="ltr">{t.github[3]}</a>{t.github[4]}</p>

      <h2 id="security">{t.securityTitle}</h2>
      <p>
        {t.security[0]}<a href={`${repoUrl}/security`}>{t.security[1]}</a>{t.security[2]}{mail}{t.security[3]}
        <a href={securityPolicyUrl}>{t.security[4]}</a>{t.security[5]}<a href="/.well-known/security.txt" dir="ltr">{t.security[6]}</a>{t.security[7]}
      </p>

      <h2 id="self-hosted">{t.selfHostTitle}</h2>
      <p>{t.selfHost[0]}<Link href="/docs/self-hosting">{t.selfHost[1]}</Link>{t.selfHost[2]}</p>
    </LegalPage>
  );
}
