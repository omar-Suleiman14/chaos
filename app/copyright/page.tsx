import { pageMetadata } from "@/lib/seo";
import CopyrightView from "@/components/site/CopyrightView";

export const metadata = pageMetadata("Copyright policy", "How sharing, attribution, copying and copyright reports work for lessons, courses, quizzes and other content on Chaos.", "/copyright");

export default function CopyrightPage() {
  return <CopyrightView />;
}

