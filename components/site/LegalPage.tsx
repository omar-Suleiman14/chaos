"use client";

import "@/app/landing.css";
import { SiteFooter, SiteNav } from "./SiteChrome";
import { useCopy, useLocale } from "@/lib/i18n";

const legalCopy = {
  en: {
    lastUpdated: (date: string) => `Last updated ${date}`,
    draftNotice: "Draft: this page still needs review by a lawyer and isn’t final legal advice.",
  },
  ar: {
    lastUpdated: (date: string) => `آخر تحديث: ${date}`,
    draftNotice: "مسودة: هذه الصفحة لا تزال بحاجة إلى مراجعة قانونية وليست استشارة قانونية نهائية.",
  },
};

/** Shared layout for the privacy policy, terms and ChatGPT pages: the calm site look, readable line length. */
export default function LegalPage({
  title,
  updated,
  draft,
  children,
}: {
  title: string | { en: string; ar: string };
  updated?: string | { en: string; ar: string };
  draft?: boolean;
  children: React.ReactNode;
}) {
  const t = useCopy(legalCopy);
  const { locale } = useLocale();
  const pageTitle = typeof title === "string" ? title : title[locale];
  const updatedDate = updated ? (typeof updated === "string" ? updated : updated[locale]) : undefined;

  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1} className="site-legal" dir={locale === "ar" ? "rtl" : "ltr"}>
        <h1 className="site-h2">{pageTitle}</h1>
        {updatedDate && <p className="site-legal__updated">{t.lastUpdated(updatedDate)}</p>}
        {/* Not yet reviewed by a lawyer: say so plainly rather than present it as final. */}
        {draft && <p className="site-legal__draft">{t.draftNotice}</p>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

