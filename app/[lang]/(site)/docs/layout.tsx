import localFont from "next/font/local";
import { getDocsCatalog } from "@/lib/docs/server";
import { SeededDocs } from "@/lib/docs/provider";
import { isLocale } from "@/lib/locale";
import DocsShell from "./DocsShell";
import "./docs.css";

// Self-host the project's OFL serif so documentation builds do not rely on external font requests.
const sourceSerif = localFont({
  src: [
    { path: "../../../../components/learn/fonts/libron/Libron-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../../../components/learn/fonts/libron/Libron-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-docs-serif",
  display: "swap",
});

/** Static per language, refreshed every five minutes; the live subscription in SeededDocs shows edits sooner. */
export const revalidate = 300;

export default async function DocsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : "en";
  const rows = await getDocsCatalog(locale).catch(() => []);
  return <div className={sourceSerif.variable}><SeededDocs seed={{ locale, rows }}><DocsShell>{children}</DocsShell></SeededDocs></div>;
}
