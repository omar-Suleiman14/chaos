"use client";

import { SiteNav, SiteFooter } from "./SiteChrome";
import ExploreBrowser from "@/components/learn/ExploreBrowser";
import "@/app/landing.css";

export default function PublicExplore() {
  return <div className="site-ui">
    <SiteNav />
    <main id="main-content" tabIndex={-1} className="workspace-ui site-explore">
      <ExploreBrowser />
    </main>
    <SiteFooter />
  </div>;
}
