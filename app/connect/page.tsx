import { pageMetadata } from "@/lib/seo";
import ConnectView from "@/components/site/ConnectView";

export const metadata = pageMetadata("Connect Chaos to Claude or ChatGPT", "Add Chaos to Claude in one click, or to ChatGPT in a few steps. Optional, on every Chaos plan.", "/connect");

export default function ConnectPage() {
  return <ConnectView />;
}
