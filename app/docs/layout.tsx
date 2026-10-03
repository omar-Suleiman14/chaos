import { Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import { getDocsCatalog } from "@/lib/docs/server";
import { SeededDocs } from "@/lib/docs/provider";
import { isLocale, LOCALE_COOKIE } from "@/lib/locale";
import DocsShell from "./DocsShell";
import "./docs.css";

// Free stand-in for Anthropic Serif, used only when the reader does not have Anthropic's faces installed.
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-docs-serif", display: "swap" });

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : "en";
  const rows = await getDocsCatalog(locale).catch(() => []);
  return <div className={sourceSerif.variable}><SeededDocs seed={{ locale, rows }}><DocsShell>{children}</DocsShell></SeededDocs></div>;
}
