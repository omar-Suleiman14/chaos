/**
 * "Ask ChatGPT" / "Ask Claude": hand selected lesson material to an external assistant.
 *
 * Nothing is sent by Chaos. The person sees and edits the exact text first; we then open
 * the assistant with the text pre-filled when it fits in a link, or copy it and open an
 * empty chat when it does not. Only the parts the person keeps ticked are included.
 */

export type HandoffTarget = "chatgpt" | "claude";
export type HandoffAction = "explain" | "simplify" | "example" | "quiz" | "ask";

export interface HandoffInput {
  action: HandoffAction;
  language: "en" | "ar";
  lessonTitle: string;
  selection: string;
  /** The heading the selection sits under, when the person includes it. */
  section?: string;
  /** Nearby text, only when the person includes it. */
  context?: string;
  /** "Lecture 8 · page 23"-style references for the selection. */
  sources?: string[];
  /** Public lesson link; only included for public lessons and when ticked. */
  url?: string;
  /** Image description, for image selections (images themselves cannot travel in a link). */
  imageNote?: string;
  question?: string;
}

const ask: Record<"en" | "ar", Record<HandoffAction, string>> = {
  en: {
    explain: "Explain this clearly, step by step.",
    simplify: "Explain this in simpler words, as if to a first-year student.",
    example: "Give me a concrete example that illustrates this.",
    quiz: "Quiz me on this with 3 short questions, one at a time. Wait for my answer before revealing each.",
    ask: "Help me understand this.",
  },
  ar: {
    explain: "اشرح هذا بوضوح وخطوة بخطوة.",
    simplify: "اشرح هذا بكلمات أبسط، كأنك تشرحه لطالب في السنة الأولى.",
    example: "أعطني مثالًا ملموسًا يوضح هذا.",
    quiz: "اختبرني في هذا بثلاثة أسئلة قصيرة، سؤالًا بعد سؤال، وانتظر إجابتي قبل أن تكشف كل إجابة.",
    ask: "ساعدني على فهم هذا.",
  },
};

const labels = {
  en: { from: "From my lesson", section: "Section", text: "Text", context: "Around it", sources: "Sources", link: "Lesson", image: "Image", q: "My question" },
  ar: { from: "من درسي", section: "القسم", text: "النص", context: "ما حوله", sources: "المصادر", link: "الدرس", image: "الصورة", q: "سؤالي" },
};

export const HANDOFF_MAX_SELECTION = 6000;

export function buildHandoffPrompt(input: HandoffInput): string {
  const l = labels[input.language];
  const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`).join("\n");
  const parts = [
    input.question?.trim() ? `${l.q}: ${input.question.trim()}` : ask[input.language][input.action],
    "",
    `${l.from}: "${input.lessonTitle.trim()}"`,
  ];
  if (input.section?.trim()) parts.push(`${l.section}: ${input.section.trim()}`);
  if (input.selection.trim()) parts.push("", `${l.text}:`, quote(input.selection.slice(0, HANDOFF_MAX_SELECTION)));
  if (input.imageNote?.trim()) parts.push("", `${l.image}: ${input.imageNote.trim()}`);
  if (input.context?.trim()) parts.push("", `${l.context}:`, quote(input.context.slice(0, 2000)));
  if (input.sources?.length) parts.push("", `${l.sources}: ${input.sources.join("; ")}`);
  if (input.url) parts.push("", `${l.link}: ${input.url}`);
  return parts.join("\n");
}

/** Longest encoded link we open directly; past this the text goes through the clipboard. */
export const HANDOFF_URL_LIMIT = 7000;

export function handoffUrl(target: HandoffTarget, prompt: string): { url: string; prefilled: boolean } {
  const base = target === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/new";
  const url = `${base}?q=${encodeURIComponent(prompt)}`;
  return url.length <= HANDOFF_URL_LIMIT ? { url, prefilled: true } : { url: base, prefilled: false };
}

export const handoffName: Record<HandoffTarget, string> = { chatgpt: "ChatGPT", claude: "Claude" };
