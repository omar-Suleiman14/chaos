import { Source_Serif_4 } from "next/font/google";
import { getDocsCatalog } from "@/lib/docs/server";
import { SeededDocs } from "@/lib/docs/provider";
import { isLocale } from "@/lib/locale";
import DocsShell from "./DocsShell";
import "./docs.css";

// Free stand-in for Anthropic Serif, used only when the reader does not have Anthropic's faces installed.
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-docs-serif", display: "swap" });

/** Static per language, refreshed every five minutes; the live subscription in SeededDocs shows edits sooner. */
export const revalidate = 300;

export default async function DocsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : "en";
  const rows = await getDocsCatalog(locale).catch(() => []);
  return <div className={sourceSerif.variable}><SeededDocs seed={{ locale, rows }}><DocsShell>{children}</DocsShell></SeededDocs></div>;
}
