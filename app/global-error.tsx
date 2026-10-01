"use client";

import posthog from "@/lib/analytics";
import { useEffect } from "react";
import Logo from "@/components/Logo";
import { statusPageUrl } from "@/lib/site";

/**
 * Replaces the root layout when it fails, so it carries its own styles:
 * the workspace colours and Cairo-first font stack, light and dark.
 */
const css = `
  :root { color-scheme: light dark; --bg: #fbfaf9; --text: #37352f; --muted: #787774; --accent: #3595e3; --accent-hover: #2384d6; --hover: rgba(55,53,47,0.06); }
  @media (prefers-color-scheme: dark) { :root { --bg: #121212; --text: #e6e6e6; --muted: #9b9a97; --hover: rgba(255,255,255,0.06); } }
  html, body { margin: 0; background: var(--bg); color: var(--text); font-family: Cairo, "IBM Plex Sans Arabic", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  .ge-main { min-height: 100dvh; display: grid; place-items: center; padding: 64px 24px; box-sizing: border-box; }
  .ge-box { display: grid; justify-items: center; gap: 16px; max-width: 28rem; text-align: center; }
  .ge-box h1 { margin: 8px 0 0; font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.02em; }
  .ge-box p { margin: 0; font-size: 17px; line-height: 1.6; color: var(--muted); }
  .ge-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px; }
  .ge-btn { display: inline-flex; align-items: center; text-decoration: none; box-sizing: border-box; min-height: 46px; padding: 0 20px; border-radius: 8px; border: 1px solid transparent; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; background: transparent; color: var(--muted); }
  .ge-btn:hover { background: var(--hover); color: var(--text); }
  .ge-btn--primary { background: var(--accent); color: #fff; }
  .ge-btn--primary:hover { background: var(--accent-hover); color: #fff; }
  .ge-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 40%, transparent); outline-offset: 2px; }
  .ge-ref { margin-top: 16px !important; font-size: 13px !important; user-select: all; }
  .ge-status { color: var(--muted); text-underline-offset: 4px; }
  .ge-status:hover { color: var(--text); }
`;

export default function GlobalError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Chaos</title>
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="ge-main">
          <div className="ge-box">
            <Logo size={44} />
            <h1>Something went wrong</h1>
            <p>Chaos didn&apos;t load. Try again, or go back to the home page.</p>
            <div className="ge-actions">
              {/* A full page load: the app shell itself failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="ge-btn" href="/">Go home</a>
              <button type="button" className="ge-btn ge-btn--primary" onClick={retry ?? reset}>Try again</button>
            </div>
            {statusPageUrl && <p><a className="ge-status" href={statusPageUrl}>Check service status</a></p>}
            {error.digest && <p className="ge-ref">Reference: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
