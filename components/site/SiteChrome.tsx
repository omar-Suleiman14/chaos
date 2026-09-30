"use client";

import { useEffect, useRef, useState } from "react";
import { IntentLink as Link } from "@/components/IntentLink";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { Languages, LogIn, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeModeSwitch } from "@/components/ThemeModeSwitch";
import { useCopy, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

const copy = {
  en: {
    getFree: "Get Chaos free", open: "Open Chaos", logIn: "Log in", skip: "Skip to content", main: "Main", footer: "Footer",
    modes: "Modes", themes: "Themes", features: "Features", docs: "Docs", pricing: "Pricing", play: "Join a game",
    menu: "Menu", closeMenu: "Close menu", language: "Language",
    tagline: "Forms, surveys and live quizzes.",
    product: "Product", ways: "Ways to answer", chatgpt: "Chaos in ChatGPT",
    start: "Get started", help: "Help", legal: "Legal", privacy: "Privacy policy", terms: "Terms and conditions", contact: "Contact",
  },
  ar: {
    getFree: "ابدأ مجانًا", open: "افتح Chaos", logIn: "تسجيل الدخول", skip: "انتقل إلى المحتوى", main: "التنقل الرئيسي", footer: "التذييل",
    modes: "طرق العرض", themes: "المظاهر", features: "المزايا", docs: "الدليل", pricing: "الأسعار", play: "انضم إلى لعبة",
    menu: "القائمة", closeMenu: "إغلاق القائمة", language: "اللغة",
    tagline: "نماذج واستطلاعات واختبارات مباشرة.",
    product: "المنتج", ways: "طرق الإجابة", chatgpt: "Chaos في ChatGPT",
    start: "ابدأ الآن", help: "المساعدة", legal: "قانوني", privacy: "سياسة الخصوصية", terms: "الشروط والأحكام", contact: "تواصل معنا",
  },
};

/** "Get Chaos free" for visitors, "Open Chaos" once signed in. */
export function PrimaryCta({ large = false, label, href = "/dashboard", className: extra = "" }: { large?: boolean; label?: string; href?: string; className?: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const t = useCopy(copy);
  const className = `site-btn site-btn--primary ${large ? "site-btn--lg" : ""} ${extra}`;
  if (isLoaded && isSignedIn) return <Link href={href} className={className}>{label ?? t.open}</Link>;
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

export function SiteNav({ links: _links = true }: { links?: boolean }) {
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

  const items = [
    { href: "/docs", label: t.docs },
    { href: "/pricing", label: t.pricing },
    { href: "/play", label: t.play },
  ];

  return (
    <header className="site-nav-wrap">
      <a href="#main-content" className="skip-link">{t.skip}</a>
      <nav className="site-nav" aria-label={t.main}>
        <Link href="/" className="site-brand"><Logo size={30} />chaos</Link>
        <div className="site-nav__links">
          {items.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </div>
        <div className="site-nav__actions">
          <LanguageButton />
          <ThemeToggle className="site-icon-btn" />
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
              <div id="site-menu-panel" className="site-glass site-menu__panel">
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
            <Link href="/chatgpt">{t.chatgpt}</Link>
            <Link href="/pricing">{t.pricing}</Link>
            <Link href="/docs">{t.docs}</Link>
          </div>
          <div>
            <h2>{t.start}</h2>
            <Link href="/dashboard">{t.open}</Link>
            <a href={`mailto:${supportEmail}`}>{t.help}</a>
          </div>
          <div>
            <h2>{t.legal}</h2>
            <Link href="/privacy">{t.privacy}</Link>
            <Link href="/terms">{t.terms}</Link>
            <a href={`mailto:${supportEmail}`}>{t.contact}</a>
          </div>
        </nav>
      </div>
      <p className="site-footer__legal">© {new Date().getFullYear()} chaos</p>
    </footer>
  );
}
