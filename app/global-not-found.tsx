import type { Metadata } from "next";
import { inter } from "./fonts/inter";
import ErrorScreen from "@/components/site/ErrorScreen";
import { siteUrl } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = { metadataBase: new URL(siteUrl), title: "Page not found · Chaos", robots: { index: false } };

/**
 * Addresses that match no page. The root layout lives under app/[lang], so unmatched URLs
 * have no layout to borrow; this page brings its own document (next.config.ts globalNotFound).
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased noise-bg">
        <ErrorScreen title="Nothing here" body="This page doesn't exist or isn't available to you." primary={{ label: "Go home", href: "/" }} />
      </body>
    </html>
  );
}
