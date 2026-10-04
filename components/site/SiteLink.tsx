"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/locale";

/** next/link that points marketing pages at the reader's language: "/pricing" becomes "/ar/pricing" in Arabic. */
export default function SiteLink({ href, ...props }: ComponentProps<typeof Link>) {
  const { locale } = useLocale();
  return <Link {...props} href={typeof href === "string" ? localePath(href, locale) : href} />;
}
