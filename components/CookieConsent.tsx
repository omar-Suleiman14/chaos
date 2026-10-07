"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie } from "lucide-react";
import { analyticsAllowed, cookieConsent, openCookieSettings, saveCookieConsent, SETTINGS_EVENT, subscribeCookieConsent } from "@/lib/cookieConsent";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import "./cookie-consent.css";

export function useAnalyticsConsent() { return useSyncExternalStore(subscribeCookieConsent, analyticsAllowed, () => false); }

/** The saved choice: true or false once chosen, null before, undefined while rendering on the server. */
export function useCookieChoice() { return useSyncExternalStore(subscribeCookieConsent, cookieConsent, () => undefined); }

export function CookieSettingsButton({ className }: { className?: string }) {
  const { locale } = useLocale();
  return <button type="button" className={className} onClick={openCookieSettings}>{locale === "ar" ? "إعدادات ملفات تعريف الارتباط" : "Cookie settings"}</button>;
}

/* Asks once, as a small card in the corner. Afterwards the choice is changed in Settings, the cookie policy or the footer. */
export default function CookieConsent() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const choice = useCookieChoice();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener(SETTINGS_EVENT, open);
    return () => window.removeEventListener(SETTINGS_EVENT, open);
  }, []);
  if (choice === undefined || (choice !== null && !editing)) return null;
  const choose = (analytics: boolean) => { saveCookieConsent(analytics); setEditing(false); };
  return <section className="workspace-ui ws-glass cookie-consent" role="region" aria-label={ar ? "خيارات الخصوصية" : "Privacy choices"} dir={ar ? "rtl" : "ltr"}>
    <h2><Cookie size={18} aria-hidden="true" />{ar ? "ملفات تعريف الارتباط" : "Cookies"}</h2>
    <p>{ar ? "نستخدم ملفات تعريف الارتباط لتسجيل الدخول واللغة وحفظ تقدّمك. التحليلات اختيارية ومتوقفة حتى تسمح بها، ولا نستخدم أي إعلانات." : "We use cookies for sign-in, language and saved progress. Analytics is optional and off until you allow it. No advertising, ever."}</p>
    <p className="cookie-consent__links"><Link href="/cookies">{ar ? "سياسة ملفات تعريف الارتباط" : "Cookie policy"}</Link><Link href="/privacy">{ar ? "الخصوصية" : "Privacy"}</Link></p>
    <div className="cookie-consent__actions">
      <button type="button" className="ws-btn" onClick={() => choose(false)}>{ar ? "رفض التحليلات" : "Reject analytics"}</button>
      <button type="button" className="ws-btn" onClick={() => choose(true)}>{ar ? "السماح بالتحليلات" : "Allow analytics"}</button>
    </div>
    {editing && choice !== null && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm cookie-consent__close" onClick={() => setEditing(false)}>{ar ? "إغلاق" : "Close"}</button>}
  </section>;
}
