import "@/app/landing.css";
import { SiteFooter, SiteNav } from "./SiteChrome";

/** Shared layout for the privacy policy, terms and ChatGPT pages: the calm site look, readable line length. */
export default function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1} className="site-legal">
        <h1 className="site-h2">{title}</h1>
        {updated && <p className="site-legal__updated">Last updated {updated}</p>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
