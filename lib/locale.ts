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
