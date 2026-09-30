import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale/ar";
import type { Locale } from "@/lib/locale";

/** "3 days ago" or "قبل 3 أيام"; Arabic keeps 0-9 digits. */
export function timeAgo(locale: Locale, timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: locale === "ar" ? ar : undefined });
}
