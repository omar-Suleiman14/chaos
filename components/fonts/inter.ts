import localFont from "next/font/local";

/**
 * Inter, served from the repository instead of fetched from Google Fonts at build time: the
 * Google loader intermittently got an Inter file URL it could not parse and failed the build.
 * One variable file (Latin, weights 100–900) covers the 400–700 the site uses. Inter 4 from
 * @fontsource-variable/inter 5.3.0, under the SIL Open Font License (OFL.txt).
 */
export const inter = localFont({
  src: "./inter/Inter-Latin-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
