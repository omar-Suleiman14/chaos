"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { analyticsAllowed, cookieConsent, openCookieSettings, saveCookieConsent, SETTINGS_EVENT, subscribeCookieConsent } from "@/lib/cookieConsent";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import "./cookie-consent.css";

export function useAnalyticsConsent() { return useSyncExternalStore(subscribeCookieConsent, analyticsAllowed, () => false); }

export function CookieSettingsButton() {
  const { locale } = useLocale();
  return <button type="button" onClick={openCookieSettings}>{locale === "ar" ? "إعدادات ملفات تعريف الارتباط" : "Cookie settings"}</button>;
}

export default function CookieConsent() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const choice = useSyncExternalStore(subscribeCookieConsent, cookieConsent, () => undefined);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener(SETTINGS_EVENT, open);
    return () => window.removeEventListener(SETTINGS_EVENT, open);
  }, []);
  if (choice === undefined) return null;
  const choose = (analytics: boolean) => { saveCookieConsent(analytics); setEditing(false); };
  if (choice !== null && !editing) return <div className="cookie-settings-trigger" dir={ar ? "rtl" : "ltr"}><CookieSettingsButton /></div>;
  return <section className="cookie-consent" role="region" aria-label={ar ? "خيارات الخصوصية" : "Privacy choices"} dir={ar ? "rtl" : "ltr"}>
    <h2>{ar ? "ملفات تعريف الارتباط والتخزين" : "Cookies and browser storage"}</h2>
    <p>{ar ? "نستخدم ملفات تعريف الارتباط لتسجيل الدخول وتذكّر اللغة، والتخزين لحفظ تفضيلاتك وتقدّمك. التحليلات اختيارية وتظل متوقفة حتى تسمح بها. لا نستخدم ملفات تعريف ارتباط إعلانية." : "We use cookies for sign-in and language, and browser storage for preferences and saved progress. Analytics is optional and stays off until you allow it. We do not use advertising cookies."}</p>
    <p><Link href="/cookies">{ar ? "سياسة ملفات تعريف الارتباط" : "Cookie policy"}</Link>{" · "}<Link href="/privacy">{ar ? "سياسة الخصوصية" : "Privacy policy"}</Link></p>
    <div className="cookie-consent__actions">
      <button type="button" onClick={() => choose(false)}>{ar ? "رفض التحليلات" : "Reject analytics"}</button>
      <button type="button" onClick={() => choose(true)}>{ar ? "السماح بالتحليلات" : "Allow analytics"}</button>
      {editing && choice !== null && <button type="button" onClick={() => setEditing(false)}>{ar ? "إغلاق" : "Close"}</button>}
    </div>
  </section>;
}
