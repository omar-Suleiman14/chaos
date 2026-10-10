import ProductAnalytics, { AnalyticsIdentity } from "@/components/ProductAnalytics";
import CookieConsent from "@/components/CookieConsent";
import ConsentedSpeedInsights from "@/components/ConsentedSpeedInsights";
import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import { defaultOgImage, siteDescription } from "@/lib/seo";
import { notFound } from "next/navigation";
import { Cairo, Fraunces, IBM_Plex_Sans_Arabic, Instrument_Serif, Nunito, Roboto, Space_Grotesk, Space_Mono } from "next/font/google";
import { inter } from "@/components/fonts/inter";
import "@/app/globals.css";
import "@/app/workspace.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import FrameGuard from "@/components/FrameGuard";
import { ThemeProvider } from "@/components/ThemeProvider";
import Toaster from "@/components/Toaster";
import { AuthProvider } from "@/lib/auth/client";
import { themeInitScript } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";
import { isLocale, LOCALES, localeDir } from "@/lib/locale";

/* ── Fonts ─────────────────────────────────────────────── */
// Space Grotesk and Space Mono appear only in the form builder, some dashboard labels and one form
// theme, so they are not preloaded: browsers fetch them on the pages that use them.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
  preload: false,
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
  preload: false,
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
  title: { default: "Chaos · Turn what you know into lessons that stick", template: "%s · Chaos" },
  description: siteDescription,
  // No default canonical: pages render under an internal /en or /ar segment (proxy.ts), so a
  // relative "./" would point at that internal path. Indexable pages set their own.
  openGraph: {
    type: "website",
    siteName: "Chaos",
    // Title and description fall back to each page's own, so a shared form shows its name.
    images: [defaultOgImage],
  },
  twitter: { card: "summary_large_image", images: [defaultOgImage] },
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

/** Both languages prerender. Marketing pages stay static; app pages opt into request-time rendering in (app)/layout.tsx. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/* ── Root Layout ────────────────────────────────────────── */
/**
 * The language comes from the URL segment, never from cookies, so this layout can render
 * statically. proxy.ts maps /pricing to /en/pricing and /ar/pricing to itself, and gives
 * single-address pages (dashboard, forms, lessons) the segment of the chaos-lang cookie.
 */
export default async function RootLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale = lang;
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
          <CookieConsent />
          <AuthProvider locale={locale}>
            <ConvexClientProvider>
              <AnalyticsIdentity />
              {children}
            </ConvexClientProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
        </LocaleProvider>
        <ConsentedSpeedInsights enabled={!!process.env.VERCEL_ENV} />
      </body>
    </html>
  );
}
