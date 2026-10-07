/** Languages the Chaos site and workspace are written in. Forms have their own language setting. */
export type Locale = "en" | "ar";
export const LOCALE_COOKIE = "chaos-lang";
export const isLocale = (value: unknown): value is Locale => value === "en" || value === "ar";
export const localeDir = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

/** The Intl locale for dates and numbers. Arabic keeps 0-9 digits, which read better in a product UI. */
export const dateLocale = (locale: Locale): string | undefined => (locale === "ar" ? "ar-EG-u-nu-latn" : undefined);

export function formatDate(locale: Locale, value: number | Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleDateString(dateLocale(locale), options);
}

export function formatDateTime(locale: Locale, value: number | Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleString(dateLocale(locale), options);
}

export function formatNumber(locale: Locale, value: number): string {
  return value.toLocaleString(dateLocale(locale));
}

/** Plural forms. English uses one/other; Arabic also has zero, two, few (3-10) and many (11-99). Missing forms fall back to `other`. */
export interface PluralForms { zero?: string; one: string; two?: string; few?: string; many?: string; other: string }

export function pluralForm(locale: Locale, count: number, forms: PluralForms): string {
  if (locale !== "ar") return count === 1 ? forms.one : forms.other;
  const n = Math.abs(count);
  if (n === 0) return forms.zero ?? forms.other;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two ?? forms.other;
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return forms.few ?? forms.other;
  if (rest >= 11) return forms.many ?? forms.other;
  return forms.other;
}

export const LOCALES: readonly Locale[] = ["en", "ar"];

/**
 * Public marketing pages with a URL per language: English unprefixed (/pricing), Arabic under
 * /ar (/ar/pricing). They render statically for each language. Every other page keeps one
 * address and takes its language from the chaos-lang cookie (proxy.ts, lib/localeRouting.ts).
 */
const SITE_PATHS = new Set(["/", "/pricing", "/compare", "/docs", "/learn", "/chatgpt", "/claude", "/connect", "/support", "/faq", "/privacy", "/cookies", "/terms", "/copyright", "/sitemap"]);

/** True for a marketing page path without a language prefix, such as "/" or "/docs/first-form". */
export function isSitePath(path: string): boolean {
  return SITE_PATHS.has(path) || /^\/docs\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}

/** The address of a page in a language: "/pricing" becomes "/ar/pricing" in Arabic. Other links are returned unchanged. */
export function localePath(href: string, locale: Locale): string {
  if (locale !== "ar" || !href.startsWith("/") || href.startsWith("//")) return href;
  const end = href.search(/[?#]/);
  const path = end === -1 ? href : href.slice(0, end);
  if (!isSitePath(path)) return href;
  return `/ar${path === "/" ? "" : path}${end === -1 ? "" : href.slice(end)}`;
}

/** Splits a leading /en or /ar off a pathname: "/ar/docs" is { locale: "ar", path: "/docs" }. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/(en|ar)(?=\/|$)/.exec(pathname);
  if (!match) return { locale: null, path: pathname };
  return { locale: match[1] as Locale, path: pathname.slice(match[0].length) || "/" };
}
