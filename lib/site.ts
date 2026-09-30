/** The public origin used for canonical URLs, the sitemap and robots.txt. */
export function siteOrigin(value: string): string {
  const url = new URL(value.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTP(S) origin without a path, credentials, query or fragment.");
  }
  return url.origin;
}

export const siteUrl = siteOrigin(process.env.NEXT_PUBLIC_APP_URL || "https://chaos.fail");

/** Contact address shown in the footer, legal pages and help rows. Self-hosted instances set NEXT_PUBLIC_SUPPORT_EMAIL. */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "khomod14@gmail.com";
