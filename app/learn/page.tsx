import { pageMetadata } from "@/lib/seo";
import PublicExplore from "@/components/site/PublicExplore";

export const metadata = pageMetadata("Chaos Learn · Free courses", "Browse free public courses in Chaos Learn. No sign-in needed to explore published content.", "/learn");

export default function LearnPage() { return <PublicExplore />; }
