import ProductAnalytics, { AnalyticsIdentity } from "@/components/ProductAnalytics";
import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import { siteDescription } from "@/lib/seo";
import { cookies } from "next/headers";
import { Cairo, Fraunces, IBM_Plex_Sans_Arabic, Instrument_Serif, Inter, Nunito, Roboto, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import FrameGuard from "@/components/FrameGuard";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/lib/auth/client";
import { themeInitScript } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";
import { isLocale, LOCALE_COOKIE, localeDir } from "@/lib/locale";

/* ── Fonts ─────────────────────────────────────────────── */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

// Max's typeface: the creator workspace uses it so Chaos reads as part of Max,
// and every form theme falls back to it for Arabic.
const cairo = Cairo({
  subsets: ["latin", "arabic"],
  variable: "--font-cairo",
  display: "swap",
});

// Max's second Arabic face, used after Cairo in Arabic text.
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap", preload: false });

// Theme-only faces. Not preloaded: they download only when a form uses them.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
// Roboto is for the Google Forms style theme only, so it is not preloaded either.
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap", preload: false });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument", display: "swap", preload: false });

/* ── Metadata ───────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Chaos",
  title: { default: "Chaos · Forms, quizzes, live games and Learn", template: "%s · Chaos" },
  description: siteDescription,
  // "./" resolves to each page's own path, so no page points its canonical at the home page.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: "Chaos",
    url: "./",
    locale: "en_US",
    alternateLocale: ["ar_EG"],
    // Title and description fall back to each page's own, so a shared form shows its name.
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#171716" },
  ],
  colorScheme: "light dark",
};

/* ── Root Layout ────────────────────────────────────────── */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : "en";
  return (
    <html
      data-scroll-behavior="smooth"
      lang={locale}
      dir={localeDir(locale)}
      suppressHydrationWarning
      className={[spaceGrotesk, inter, spaceMono, cairo, plexArabic, fraunces, nunito, instrumentSerif, roboto].map((font) => font.variable).join(" ")}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased noise-bg">
        <LocaleProvider initial={locale}>
        <ThemeProvider>
          <FrameGuard />
          <ProductAnalytics />
          <AuthProvider locale={locale}>
            <AnalyticsIdentity />
            <ConvexClientProvider>
              {children}
            </ConvexClientProvider>
          </AuthProvider>
        </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
