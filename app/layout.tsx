import type { Metadata } from "next";
import { Space_Grotesk, Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";

/* ── Fonts ─────────────────────────────────────────────── */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

/* ── Metadata ───────────────────────────────────────────── */
export const metadata: Metadata = {
  title: "chaos",
  description:
    "Create and share interactive quizzes. MCQ, true/false, multi-select, written — all with custom scoring. No sign-up needed to play.",
  icons: {
    icon: "/icon.svg",
  },
};

/* ── Root Layout ────────────────────────────────────────── */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="antialiased noise-bg">
        <ClerkProvider dynamic>
          <ConvexClientProvider>
              {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
