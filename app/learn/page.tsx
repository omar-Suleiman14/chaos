import { pageMetadata } from "@/lib/seo";
import PublicExplore from "@/components/site/PublicExplore";

export const metadata = pageMetadata("Chaos Learn · Free courses and lessons", "Browse free public courses and search community lessons in Chaos Learn. No sign-in needed to explore published content.", "/learn");

export default function LearnPage() { return <PublicExplore />; }
