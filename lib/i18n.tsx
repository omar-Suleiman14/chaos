"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { LOCALE_COOKIE, localeDir } from "./locale";
import type { Locale } from "./locale";

export { dateLocale, formatDate, formatDateTime, formatNumber, isLocale, LOCALE_COOKIE, localeDir, pluralForm } from "./locale";
export type { Locale, PluralForms } from "./locale";

interface LocaleContext { locale: Locale; dir: "ltr" | "rtl"; setLocale: (locale: Locale) => void }

const Context = createContext<LocaleContext>({ locale: "en", dir: "ltr", setLocale: () => {} });

/** The server reads the cookie so the first paint is already in the right language and direction. */
export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const setLocale = useCallback((next: Locale) => {
    setState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = localeDir(next);
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
