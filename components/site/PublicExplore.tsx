"use client";

import { SiteNav, SiteFooter } from "./SiteChrome";
import ExploreBrowser, { type DirectoryCourse } from "@/components/learn/ExploreBrowser";
import "@/app/landing.css";

export default function PublicExplore({ initial }: { initial?: DirectoryCourse[] }) {
  return <div className="site-ui">
    <SiteNav />
    <main id="main-content" tabIndex={-1} className="workspace-ui site-explore">
      <ExploreBrowser initial={initial} />
    </main>
    <SiteFooter />
  </div>;
}
