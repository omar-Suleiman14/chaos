import { pageMetadata } from "@/lib/seo";
import ChatGptView from "@/components/site/ChatGptView";

export const metadata = pageMetadata("Chaos in ChatGPT", "Optionally connect Chaos to ChatGPT to create draft forms, quizzes, lessons and courses. Review before publishing. Available on every Chaos plan; Chaos also works on its own.", "/chatgpt");

export default function ChatGptPage() {
  return <ChatGptView />;
}
