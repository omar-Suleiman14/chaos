"use client";

import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { title: "Nothing here", body: "This page doesn't exist or isn't available to you.", home: "Go home" },
  ar: { title: "لا شيء هنا", body: "هذه الصفحة غير موجودة أو غير متاحة لك.", home: "الصفحة الرئيسية" },
};

/** The site-wide 404 in the visitor's language (English outside a locale, as in app/global-not-found.tsx). */
export default function NotFoundScreen() {
  const t = useCopy(copy);
  return <ErrorScreen illustration="not-found" title={t.title} body={t.body} primary={{ label: t.home, href: "/" }} />;
}
