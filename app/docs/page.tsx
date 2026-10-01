import { pageMetadata } from "@/lib/seo";
import { DocsIndex } from "./DocsViews";

export const metadata = pageMetadata("Documentation", "Guides to Chaos: forms, quizzes, live games, results and exports, file uploads, the integration API, webhooks and self-hosting.", "/docs");

export default function DocsPage() {
  return <DocsIndex />;
}
