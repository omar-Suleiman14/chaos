"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/site/SiteLink";
import { SignInButton, SignUpButton, useUser } from "@/lib/auth/client";
import { Languages, LogIn, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeModeSwitch } from "@/components/ThemeModeSwitch";
import { CookieSettingsButton } from "@/components/CookieConsent";
import { useCopy, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { repoIssuesUrl, repoUrl } from "@/lib/site";

const copy = {
  en: {
    getFree: "Get Chaos free", open: "Open Chaos", logIn: "Log in", skip: "Skip to content", main: "Main", footer: "Footer",
    explore: "Explore", modes: "Modes", themes: "Themes", features: "Features", docs: "Docs", pricing: "Pricing", play: "Join a game",
    menu: "Menu", closeMenu: "Close menu", language: "Language",
    tagline: "Forms, quizzes, live games and Learn. One open-source workspace.",
    product: "Product", ways: "Ways to answer", chatgpt: "Chaos in ChatGPT", claude: "Chaos in Claude", connect: "Connect Claude or ChatGPT", compare: "Compare",
    openSource: "Build and connect", source: "Source code", selfHost: "Self-hosting", api: "API and connections", webhooks: "Webhooks",
    start: "Get started", help: "Support", faq: "FAQ", status: "Status", issues: "Report an issue",
    legal: "Legal", privacy: "Privacy policy", terms: "Terms and conditions", copyright: "Copyright", security: "Security", siteMap: "Site map",
  },
  ar: {
    getFree: "ابدأ مجانًا", open: "افتح Chaos", logIn: "تسجيل الدخول", skip: "انتقل إلى المحتوى", main: "التنقل الرئيسي", footer: "التذييل",
    explore: "استكشف", modes: "طرق العرض", themes: "المظاهر", features: "المزايا", docs: "الدليل", pricing: "الأسعار", play: "انضم إلى لعبة",
    menu: "القائمة", closeMenu: "إغلاق القائمة", language: "اللغة",
    tagline: "نماذج واختبارات وألعاب مباشرة وLearn. مساحة عمل واحدة مفتوحة المصدر.",
    product: "المنتج", ways: "طرق الإجابة", chatgpt: "Chaos في ChatGPT", claude: "Chaos في Claude", connect: "اربط Claude أو ChatGPT", compare: "المقارنة",
    openSource: "البناء والربط", source: "الشيفرة المصدرية", selfHost: "الاستضافة الذاتية", api: "API والاتصالات", webhooks: "Webhooks",
    start: "ابدأ الآن", help: "الدعم", faq: "الأسئلة الشائعة", status: "حالة الخدمة", issues: "أبلغ عن مشكلة",
    legal: "قانوني", privacy: "سياسة الخصوصية", terms: "الشروط والأحكام", copyright: "حقوق النشر", security: "الأمان", siteMap: "خريطة الموقع",
  },
};

/** "Get Chaos free" for visitors, "Open Chaos" once signed in. */
export function PrimaryCta({ large = false, label, href = "/dashboard", className: extra = "" }: { large?: boolean; label?: string; href?: string; className?: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const t = useCopy(copy);
  const className = `site-btn site-btn--primary ${large ? "site-btn--lg" : ""} ${extra}`;
  if (isLoaded && isSignedIn) return <Link href={href} className={`${className} site-btn--open`}>{label ?? t.open}</Link>;
  return <SignUpButton mode="modal" forceRedirectUrl={href} signInForceRedirectUrl={href}><button type="button" className={className}>{label ?? t.getFree}</button></SignUpButton>;
}

const languages: { id: Locale; label: string }[] = [{ id: "en", label: "English" }, { id: "ar", label: "العربية" }];

/** Header button: shows the language you would switch to. */
function LanguageButton() {
  const { locale, setLocale } = useLocale();
  const t = useCopy(copy);
  const other = languages.find((l) => l.id !== locale)!;
  return (
    <button type="button" className="site-btn site-btn--ghost site-lang-btn" onClick={() => setLocale(other.id)} lang={other.id} aria-label={`${t.language}: ${other.label}`} title={other.label}>
      <Languages size={17} aria-hidden="true" /><span>{other.label}</span>
    </button>
  );
}

/** Footer and menu: both languages, current one marked. */
function LanguageChoice() {
  const { locale, setLocale } = useLocale();
  const t = useCopy(copy);
  return (
    <div className="mode-switch site-lang-choice" role="radiogroup" aria-label={t.language}>
      {languages.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={locale === l.id} lang={l.id} onClick={() => setLocale(l.id)}>{l.label}</button>
      ))}
    </div>
  );
}

/** `tag` sits beside the brand (the docs label); `center` replaces the page links (the docs search). */
export function SiteNav({ tag, center }: { links?: boolean; tag?: React.ReactNode; center?: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const t = useCopy(copy);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const { locale } = useLocale();
  const items = [
    { href: "/learn", label: locale === "ar" ? "تعلّم" : "Learn" },
    { href: "/docs", label: t.docs },
    { href: "/pricing", label: t.pricing },
    { href: "/faq", label: t.faq },
  ];

  return (
    <header className="site-nav-wrap">
      <a href="#main-content" className="skip-link">{t.skip}</a>
      <nav className="site-nav" aria-label={t.main}>
        {tag ? <div className="site-nav__brand"><Link href="/" className="site-brand"><Logo size={30} />chaos</Link>{tag}</div> : <Link href="/" className="site-brand"><Logo size={30} />chaos</Link>}
        {center ?? <div className="site-nav__links">
          {items.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </div>}
        <div className="site-nav__actions">
          <ThemeToggle className="site-icon-btn" />
          <LanguageButton />
          {isLoaded && !isSignedIn && (
            <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
              <button type="button" className="site-btn site-btn--ghost site-login" aria-label={t.logIn}>
                <span className="site-login__text">{t.logIn}</span><LogIn size={18} className="site-login__icon" aria-hidden="true" />
              </button>
            </SignInButton>
          )}
          <PrimaryCta />
          <div className="site-menu" ref={wrap}>
            <button type="button" className="site-icon-btn site-menu__button" aria-expanded={open} aria-haspopup="true" aria-controls="site-menu-panel"
              aria-label={open ? t.closeMenu : t.menu} onClick={() => setOpen((v) => !v)}>
              {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            {open && (
              <div id="site-menu-panel" className="site-menu__panel">
                {items.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}
                <div className="site-menu__row"><LanguageChoice /><PrimaryCta className="site-menu__cta" /></div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const t = useCopy(copy);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link href="/" className="site-brand"><Logo size={30} />chaos</Link>
          <p>{t.tagline}</p>
          <ThemeModeSwitch />
          <LanguageChoice />
        </div>
        <nav className="site-footer__cols" aria-label={t.footer}>
          <div>
            <h2>{t.product}</h2>
            <Link href="/#modes">{t.ways}</Link>
            <Link href="/#themes">{t.themes}</Link>
            <Link href="/#features">{t.features}</Link>
            <Link href="/learn">{t.explore}</Link>
            <Link href="/compare">{t.compare}</Link>
            <Link href="/pricing">{t.pricing}</Link>
          </div>
          <div>
            <h2>{t.openSource}</h2>
            <Link href="/claude">{t.claude}</Link>
            <Link href="/chatgpt">{t.chatgpt}</Link>
            <Link href="/connect">{t.connect}</Link>
            <a href={repoUrl}>{t.source}</a>
            <Link href="/docs/self-hosting">{t.selfHost}</Link>
            <Link href="/docs/integration-api">{t.api}</Link>
            <Link href="/docs/webhooks">{t.webhooks}</Link>
          </div>
          <div>
            <h2>{t.start}</h2>
            <Link href="/dashboard">{t.open}</Link>
            <Link href="/play">{t.play}</Link>
            <Link href="/docs">{t.docs}</Link>
            <Link href="/support">{t.help}</Link>
            <Link href="/faq">{t.faq}</Link>
            <Link href="/status">{t.status}</Link><Link href="/changelog">{t.docs === "Docs" ? "Changelog" : "سجل التغييرات"}</Link>
            <a href={repoIssuesUrl}>{t.issues}</a>
          </div>
          <div>
            <h2>{t.legal}</h2>
            <Link href="/privacy">{t.privacy}</Link>
            <Link href="/cookies">{t.privacy === "Privacy policy" ? "Cookie policy" : "سياسة ملفات تعريف الارتباط"}</Link>
            <CookieSettingsButton />
            <Link href="/terms">{t.terms}</Link>
            <Link href="/copyright">{t.copyright}</Link>
            <Link href="/support#security">{t.security}</Link>
          </div>
        </nav>
      </div>
      <p className="site-footer__legal">© {new Date().getFullYear()} chaos · <Link href="/sitemap">{t.siteMap}</Link></p>
    </footer>
  );
}
