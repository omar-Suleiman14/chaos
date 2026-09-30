import { pageMetadata } from "@/lib/seo";
import { DocsIndex } from "./DocsViews";

export const metadata = pageMetadata("Documentation", "Guides to creating forms, sharing quizzes, hosting live games and reading results in Chaos.", "/docs");

export default function DocsPage() {
  return <DocsIndex />;
}
