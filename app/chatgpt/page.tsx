import { pageMetadata } from "@/lib/seo";
import ChatGptView from "@/components/site/ChatGptView";

export const metadata = pageMetadata("Chaos in ChatGPT", "Connect your Chaos account to ChatGPT to create draft forms and quizzes, host games and check results. Free on every plan.", "/chatgpt");

export default function ChatGptPage() {
  return <ChatGptView />;
}
