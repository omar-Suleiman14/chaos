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

/** A docs header (brand, Docs label, centered search), the guide list on the left of every page, then the page. */
export default function DocsShell({ children }: { children: React.ReactNode }) {
  const t = useCopy(docsCopy);
  const { sections } = useDocs();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="site-ui docs-ui">
      <SiteNav links={false} tag={<Link href="/docs" className="docs-tag">{t.docs}</Link>} center={<div className="docs-header-search"><DocsSearch /></div>} />
      <div className="docs-layout">
        <aside className="docs-side">
          <button type="button" className="docs-side__toggle" aria-expanded={menuOpen} aria-controls="docs-nav" onClick={() => setMenuOpen((v) => !v)}>
            <span>{t.guides}</span><ChevronDown size={16} aria-hidden="true" />
          </button>
          <nav id="docs-nav" className="docs-nav" data-open={menuOpen} aria-label={t.navLabel}>
            {sections.map((section) => (
              <div key={section.id} className="docs-nav__group">
                <h2>{section.title}</h2>
                <ul>
                  {section.articles.map((article) => {
                    const href = `/docs/${article.slug}`;
                    return <li key={article.slug}><Link href={href} aria-current={pathname.endsWith(href) ? "page" : undefined}>{article.title}</Link></li>;
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
