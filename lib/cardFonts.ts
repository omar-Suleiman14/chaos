import { Aref_Ruqaa } from "next/font/google";

// Loaded only by card surfaces, self-hosted, and never preloaded on unrelated pages.
export const cardRuqaa = Aref_Ruqaa({ weight: ["400", "700"], subsets: ["arabic"], variable: "--font-ruqaa", display: "swap", preload: false });
