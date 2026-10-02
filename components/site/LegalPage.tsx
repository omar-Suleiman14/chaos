import "@/app/landing.css";
import { SiteFooter, SiteNav } from "./SiteChrome";

/** Shared layout for the privacy policy, terms and ChatGPT pages: the calm site look, readable line length. */
export default function LegalPage({ title, updated, draft, children }: { title: string; updated?: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1} className="site-legal">
        <h1 className="site-h2">{title}</h1>
        {updated && <p className="site-legal__updated">Last updated {updated}</p>}
        {/* Not yet reviewed by a lawyer: say so plainly rather than present it as final. */}
        {draft && <p className="site-legal__draft">Draft: this page still needs review by a lawyer and isn&rsquo;t final legal advice.</p>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
