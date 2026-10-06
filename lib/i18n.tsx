"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isLocale, isSitePath, LOCALE_COOKIE, localeDir, localePath, splitLocale } from "./locale";
import type { Locale } from "./locale";
import { sharedCookieDomain } from "./hosts";

const cookieDomain = sharedCookieDomain();

export { dateLocale, formatDate, formatDateTime, formatNumber, isLocale, LOCALE_COOKIE, localeDir, localePath, pluralForm } from "./locale";
export type { Locale, PluralForms } from "./locale";

interface LocaleContext { locale: Locale; dir: "ltr" | "rtl"; setLocale: (locale: Locale) => void }

const Context = createContext<LocaleContext>({ locale: "en", dir: "ltr", setLocale: () => {} });

function cookieLocale(): Locale | null {
  const value = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
  return isLocale(value) ? value : null;
}

/**
 * `initial` is the app/[lang] segment, so the first paint is already in the right language and direction.
 * Marketing pages have an address per language, so switching there loads the other address
 * (/pricing ↔ /ar/pricing). Other pages switch in place; the cookie picks their segment from then on.
 */
export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const [segment, setSegment] = useState<Locale>(initial);
  // A navigation re-rendered the root layout with another segment. The cookie wins, because a page
  // kept in the router cache may predate the last switch.
  if (initial !== segment) { setSegment(initial); setState(cookieLocale() ?? initial); }
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    setState(next);
    // With the sections on their own hosts the cookie lives on the parent domain (proxy.ts does the same).
    if (cookieDomain) document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${cookieDomain ? `; domain=${cookieDomain}` : ""}`;
    document.documentElement.lang = next;
    document.documentElement.dir = localeDir(next);
    const { path } = splitLocale(window.location.pathname);
    // A full load, so the other language's static page and its <html lang dir> arrive together.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate document navigation
    if (isSitePath(path)) window.location.assign(`${localePath(path, next)}${window.location.search}${window.location.hash}`);
  }, []);
  return <Context.Provider value={{ locale, dir: localeDir(locale), setLocale }}>{children}</Context.Provider>;
}

export const useLocale = () => useContext(Context);

/**
 * Picks the copy for the current language. Keep each area's strings next to its component:
 *   const copy = { en: { title: "Pricing" }, ar: { title: "الأسعار" } };
 *   const t = useCopy(copy);
 */
export function useCopy<T>(copy: Record<Locale, T>): T {
  return copy[useLocale().locale];
}
