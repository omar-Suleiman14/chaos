"use client";

import Link from "@/components/site/SiteLink";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import { useDocs } from "@/lib/docs/provider";
import DocsSearch from "./DocsSearch";
import { docsCopy } from "./copy";
import "@/app/landing.css";

/** Site header, a sidebar with search and every article, then the page. */
export default function DocsShell({ children }: { children: React.ReactNode }) {
  const t = useCopy(docsCopy);
  const { sections } = useDocs();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="site-ui docs-ui">
      <SiteNav links={false} />
      <div className="docs-layout">
        <aside className="docs-side">
          <DocsSearch global />
          <button type="button" className="docs-side__toggle" aria-expanded={menuOpen} aria-controls="docs-nav" onClick={() => setMenuOpen((v) => !v)}>
            <span>{t.guides}</span><ChevronDown size={16} aria-hidden="true" />
          </button>
          <nav id="docs-nav" className="docs-nav" data-open={menuOpen} aria-label={t.navLabel}>
            <Link href="/docs" className="docs-nav__home" aria-current={pathname === "/docs" ? "page" : undefined}>{t.indexTitle}</Link>
            {sections.map((section) => (
              <div key={section.id} className="docs-nav__group">
                <h2>{section.title}</h2>
                <ul>
                  {section.articles.map((article) => {
                    const href = `/docs/${article.slug}`;
                    return <li key={article.slug}><Link href={href} aria-current={pathname === href ? "page" : undefined}>{article.title}</Link></li>;
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <main id="main-content" tabIndex={-1} className="docs-main">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
