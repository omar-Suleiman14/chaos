import { Source_Serif_4 } from "next/font/google";
import DocsShell from "./DocsShell";
import "./docs.css";

// Free stand-in for Anthropic Serif, used only when the reader does not have Anthropic's faces installed.
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-docs-serif", display: "swap" });

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <div className={sourceSerif.variable}><DocsShell>{children}</DocsShell></div>;
}
