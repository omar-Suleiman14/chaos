"use client";

import { useEffect, useState } from "react";
import { ChevronRight, CircleUser, SunMoon } from "lucide-react";
import { useClerk, useUser } from "@/lib/auth/client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { sfx } from "@/lib/sfx";
import { siteUrl } from "@/lib/site";
import { memberTitle } from "@/lib/memberCard";
import { defaultPreferences, popupOpacityRange, usePreferences } from "@/lib/preferences";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeModeSwitch } from "@/components/ThemeModeSwitch";
import { WsSwitch } from "@/components/workspace/primitives";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { Row, Section, Segmented, useScrollToHash } from "@/components/workspace/settingsUi";
import type { Locale } from "@/lib/locale";
import MemberCardView from "@/components/card/MemberCardView";
import UsernameEditor from "@/components/card/UsernameEditor";
import "@/components/card/card.css";

/* Profile: your card and identity, plus app-wide settings. Content settings stay in /dashboard/settings. */

const copy = {
  en: {
    loading: "Loading your profile…", missing: "Your profile appears once your account finishes setting up. Refresh in a moment.",
    title: "Profile", cardHelp: "Your public card shows your name, username, avatar, join date and colours. Forms, responses and scores stay private.",
    account: "Account", accountAbout: "Who you are in Chaos.", yourAccount: "Your account", manage: "Manage account", open: "Open",
    security: "Password and security", securityHelp: "Password, sign-in methods and devices.",
    signOut: "Sign out", signOutHelp: "You can sign back in any time.",
    appearanceSection: "Appearance", appearanceAbout: "How Chaos looks for you on this device. Forms keep their own look for the people answering.",
    appearance: "Appearance", appearanceHelp: "System follows your device.",
    glass: "Glass", glassHelp: "How see-through menus and popups are. 100% is solid.", glassLabel: "Menu transparency", opaque: (n: number) => `${n}% opaque`, reset: "Reset",
    motion: "Reduce motion", motionHelp: "Fewer animations across the workspace.",
    language: "Language", languageHelp: "The language of Chaos menus and pages on this device.",
  },
  ar: {
    loading: "جارٍ تحميل ملفك…", missing: "يظهر ملفك بعد إكمال إعداد حسابك. حدّث الصفحة بعد قليل.",
    title: "الملف الشخصي", cardHelp: "تعرض بطاقتك العامة اسمك واسم المستخدم وصورتك وتاريخ الانضمام والألوان. تبقى النماذج والردود والدرجات خاصة.",
    account: "الحساب", accountAbout: "من أنت في Chaos.", yourAccount: "حسابك", manage: "إدارة الحساب", open: "افتح",
    security: "كلمة المرور والأمان", securityHelp: "كلمة المرور وطرق تسجيل الدخول والأجهزة.",
    signOut: "تسجيل الخروج", signOutHelp: "يمكنك تسجيل الدخول مجددًا في أي وقت.",
    appearanceSection: "المظهر", appearanceAbout: "كيف يبدو Chaos لك على هذا الجهاز. النماذج تحتفظ بمظهرها الخاص لمن يجيب عنها.",
    appearance: "الوضع", appearanceHelp: "وضع النظام يتبع جهازك.",
    glass: "الزجاج", glassHelp: "مدى شفافية القوائم والنوافذ المنبثقة. 100% تعني معتمة تمامًا.", glassLabel: "شفافية القوائم", opaque: (n: number) => `معتمة بنسبة ${n}%`, reset: "إعادة الضبط",
    motion: "تقليل الحركة", motionHelp: "رسوم متحركة أقل في مساحة العمل.",
    language: "اللغة", languageHelp: "لغة قوائم Chaos وصفحاته على هذا الجهاز.",
  },
};

export default function ProfilePage() {
  const t = useCopy(copy);
  const { locale, setLocale } = useLocale();
  const { user } = useUser();
  const clerk = useClerk();
  const { mode } = useTheme();
  const { preferences: p, set } = usePreferences();
  const card = useQuery(api.memberCards.mine);
  const [draft, setDraft] = useState("");
  const [sound, setSound] = useState(false);
  useEffect(() => { const sync = () => setSound(sfx.isEnabled()); sync(); window.addEventListener("chaos-sfx-change", sync); return () => window.removeEventListener("chaos-sfx-change", sync); }, []);
  const setStyle = useMutation(api.memberCards.setStyle).withOptimisticUpdate((store, { style }) => {
    const current = store.getQuery(api.memberCards.mine, {});
    if (current) store.setQuery(api.memberCards.mine, {}, { ...current, style });
  });
  useScrollToHash(card !== undefined);
  if (card === undefined) return <PageSkeleton label={t.loading} />;
  if (card === null) return <p className="ws-empty p-8">{t.missing}</p>;

  return (
    <div className="max-w-3xl w-full mx-auto pb-16 font-sans">
      <div className="ws-page-header"><h1 className="ws-page-title">{t.title}</h1></div>

      <section className="mc-profile" aria-label={card.name}>
        <MemberCardView data={{ ...card, username: draft.trim().toLowerCase() || card.username, url: `${siteUrl}/card/${card.username}` }} onStyle={(style) => setStyle({ style })} framed={false} />
        <div className="mc-profile__about">
          <h2>{card.name || `@${card.username}`}</h2>
          <p className="mc-profile__title">{memberTitle(card.seed, locale)}</p>
          <p className="mc-help">{t.cardHelp}</p>
          <div id="settings-username"><UsernameEditor key={card.username} username={card.username} onDraft={setDraft} /></div>
          <a className="mc-url" href={`/card/${encodeURIComponent(card.username)}`} dir="ltr">{siteUrl}/card/{card.username}</a>
        </div>
      </section>

      <Section id="account" icon={CircleUser} title={t.account} description={t.accountAbout}>
        <Row id="settings-account" label={user?.fullName || card.name || t.yourAccount} help={user?.primaryEmailAddress?.emailAddress}>
          <button type="button" className="ws-btn ws-btn--sm" onClick={() => clerk.openUserProfile()}>{t.manage}</button>
        </Row>
        <Row id="settings-password" label={t.security} help={t.securityHelp}>
          <button type="button" className="ws-btn ws-btn--sm" onClick={() => clerk.openUserProfile()} aria-label={t.security}>{t.open} <ChevronRight size={14} className="rtl:-scale-x-100" /></button>
        </Row>
        <Row id="settings-sign-out" label={t.signOut} help={t.signOutHelp}>
          <button type="button" className="ws-btn ws-btn--sm ws-btn--danger" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>{t.signOut}</button>
        </Row>
      </Section>

      <Section id="appearance" icon={SunMoon} title={t.appearanceSection} description={t.appearanceAbout}>
        <Row id="settings-appearance" label={t.appearance} help={t.appearanceHelp} isDefault={mode === "system"}>
          <ThemeModeSwitch showLabels />
        </Row>
        <Row id="settings-sounds" label={locale === "ar" ? "أصوات الواجهة" : "Interface sounds"} help={locale === "ar" ? "إعداد مشترك للدروس والاختبارات والألعاب." : "Shared across lessons, quizzes and live games."}><WsSwitch checked={sound} onChange={value => sfx.setEnabled(value)} label={locale === "ar" ? "أصوات الواجهة" : "Interface sounds"} /></Row>
        <Row id="settings-language" label={t.language} help={t.languageHelp}>
          <Segmented<Locale> label={t.language} value={locale} onChange={setLocale} options={[{ id: "en", label: "English" }, { id: "ar", label: "العربية" }]} />
        </Row>
        <Row id="settings-glass" label={t.glass} help={t.glassHelp} isDefault={p.popupOpacity === defaultPreferences.popupOpacity}>
          <div className="ws-slider">
            <input type="range" aria-label={t.glassLabel} min={popupOpacityRange.min} max={popupOpacityRange.max} step={5} value={p.popupOpacity}
              aria-valuetext={t.opaque(p.popupOpacity)} onChange={(e) => set("popupOpacity", Number(e.target.value))} />
            <output>{p.popupOpacity}%</output>
            {p.popupOpacity !== defaultPreferences.popupOpacity && <button type="button" className="ws-btn ws-btn--sm" onClick={() => set("popupOpacity", defaultPreferences.popupOpacity)}>{t.reset}</button>}
          </div>
        </Row>
        <Row id="settings-reduce-motion" label={t.motion} help={t.motionHelp} isDefault={!p.reduceMotion}>
          <WsSwitch label={t.motion} hideLabel checked={p.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
        </Row>
      </Section>
    </div>
  );
}
