import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";
import { WorkspaceCache } from "@/components/workspace/CacheScope";
import "@/components/learn/learn.css";

export const metadata: Metadata = {
  title: { absolute: "Chaos" },
  robots: { index: false, follow: false },
};

/**
 * Runs before the server-rendered page paints: when this device has a cached workspace for the
 * current sign-in (lib/confirmedQuery.ts), skeletons stay hidden until the cached content renders.
 */
const warmScript = `try{var s=JSON.parse(localStorage.getItem("chaos.cache.scope")||"null"),m=/(?:^|; *)__client_uat(?:_[^=;]*)?=([^;]*)/.exec(document.cookie);if(s&&m&&m[1]!=="0"&&s.session===m[1])document.documentElement.setAttribute("data-ws-warm","")}catch(e){}`;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceCache><script dangerouslySetInnerHTML={{ __html: warmScript }} /><DashboardShell>{children}</DashboardShell></WorkspaceCache>;
}
