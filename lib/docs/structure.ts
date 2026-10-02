import type { Locale } from "@/lib/locale";

/**
 * How the docs are grouped, by what people want to do. Articles live in content-en.ts / content-ar.ts and
 * articles-extra.ts; this file only orders them. Slugs never change, so old links keep working.
 * tests/unit/docs.test.ts checks that every article appears exactly once.
 */
export const docStructure: { id: string; title: Record<Locale, string>; slugs: string[] }[] = [
  { id: "start", title: { en: "Start", ar: "ابدأ" }, slugs: ["what-is-chaos", "first-form", "around-the-workspace"] },
  {
    id: "create", title: { en: "Create", ar: "أنشئ" },
    slugs: [
      "first-quiz", "lessons", "courses", "question-types", "logic", "endings", "file-uploads", "quizzes-and-scores",
      "publish", "links-and-embed", "access-and-limits", "respondent-experience", "results", "partial-responses",
      "themes", "customize-design", "answer-modes", "sounds", "team", "templates-and-import", "languages",
    ],
  },
  { id: "learn", title: { en: "Learn", ar: "تعلّم" }, slugs: ["community", "progress", "forking"] },
  { id: "play", title: { en: "Play", ar: "العب" }, slugs: ["live-games"] },
  { id: "connect", title: { en: "Connect", ar: "اربط" }, slugs: ["connections", "max", "chatgpt-app", "notion"] },
  { id: "developers", title: { en: "Developers", ar: "للمطورين" }, slugs: ["integration-api", "mcp", "webhooks", "self-hosting"] },
  {
    id: "account", title: { en: "Account", ar: "الحساب" },
    slugs: ["plans", "account", "app-settings", "library", "sidebar-and-pins", "archive", "undo-and-history", "export-responses", "keyboard-shortcuts", "get-help"],
  },
  { id: "legal", title: { en: "Legal", ar: "قانوني" }, slugs: ["legal"] },
];
