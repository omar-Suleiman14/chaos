/*
 * The comparison shown on the landing page (first `landingRows` rows) and in full on /compare.
 *
 * Every Chaos cell maps to code, checked on the "as of" date:
 * - answer modes: convex/formLogic.ts `Presentation` (page, sections, conversational, swipe)
 * - live games and player caps: convex/live.ts, convex/liveLogic.ts (500 players on every plan)
 * - 18 themes: components/forms/formThemes.ts `themePresets`
 * - ChatGPT app (MCP): convex/mcp.ts, app/mcp (every plan, drafts first)
 * - integration API and webhooks: convex/http.ts, convex/integrations.ts, convex/webhooks.ts
 * - exports: components/forms/results/Export.tsx (CSV, XLSX, JSON)
 * - open source: LICENSE (AGPL-3.0-or-later), docs/self-hosting.md (not yet tested end to end)
 * Competitor cells stick to long-standing, documented features. Re-check them when editing.
 */
export const compareAsOf = { en: "30 September 2026", ar: "30 سبتمبر 2026", iso: "2026-09-30" };

export const compareSources = [
  { label: "Google Forms", href: "https://support.google.com/docs/answer/145737" },
  { label: "Microsoft Forms", href: "https://support.microsoft.com/en-us/forms/change-a-form-theme" },
  { label: "Typeform", href: "https://help.typeform.com/hc/en-us/articles/41381686182292--Your-complete-guide-to-designing-a-typeform" },
  { label: "Kahoot!", href: "https://support.kahoot.com/hc/en-us/articles/4433531677715-How-to-use-themes" },
];

export const landingRows = 6;

export const compareCopy = {
  en: {
    cols: ["Chaos", "Google Forms", "Microsoft Forms", "Typeform", "Kahoot!"],
    rows: [
      ["Main use", "Forms, surveys, quizzes and live games", "Forms and quizzes", "Forms and quizzes", "Conversational forms and quizzes", "Live quizzes and learning games"],
      ["Ways to answer", "Page, sections, one at a time or swipe", "Page and sections", "Page and sections", "One question at a time", "Hosted rounds and self-paced play"],
      ["Live game with PIN and leaderboard", "Yes, up to 500 players", "Not a live-game host", "Presentation mode", "Not a live-game host", "Yes"],
      ["Design controls", "18 themes, colours, fonts and backdrops", "Colours, fonts and header", "Themes and backgrounds", "Themes, media and question layouts", "Game themes, branding by plan"],
      ["Motion and feedback", "Question transitions, sounds and live reveals", "Page flow", "Page flow", "Conversational question flow", "Timers, reveals and podium"],
      ["Open source and self-hostable", "Yes (AGPL)", "No", "No", "No", "No"],
      ["Operated from ChatGPT", "Chaos app (MCP): drafts, publish on request, live games, results", "Not compared", "Not compared", "Not compared", "Not compared"],
      ["API and webhooks", "Draft API, webhooks, count-only summaries", "Forms API", "Through Power Automate", "APIs and webhooks", "Not compared"],
      ["Response export", "CSV, Excel and JSON", "Google Sheets and CSV", "Excel", "CSV and Excel", "Excel reports"],
      ["Price", "Free for personal use, no caps. Business planned at 20 EGP per active seat/month; checkout unavailable", "Free with a Google account", "Free with a Microsoft account", "Free plan with limits, paid plans", "Free basic plan, paid plans"],
    ],
    notCompared: "“Not compared” means we did not check that product for this row.",
  },
  ar: {
    cols: ["Chaos", "Google Forms", "Microsoft Forms", "Typeform", "Kahoot!"],
    rows: [
      ["الاستخدام الأساسي", "نماذج واستطلاعات واختبارات وألعاب مباشرة", "نماذج واختبارات", "نماذج واختبارات", "نماذج محادثة واختبارات", "اختبارات وألعاب تعليمية مباشرة"],
      ["طرق الإجابة", "صفحة أو أقسام أو سؤال في كل مرة أو سحب", "صفحة وأقسام", "صفحة وأقسام", "سؤال في كل مرة", "جولات مباشرة ولعب فردي"],
      ["لعبة مباشرة برمز ولوحة متصدرين", "نعم، حتى 500 لاعب", "ليس مضيف ألعاب", "وضع عرض تقديمي", "ليس مضيف ألعاب", "نعم"],
      ["خيارات التصميم", "18 مظهرًا وألوان وخطوط وخلفيات", "ألوان وخطوط وترويسة", "مظاهر وخلفيات", "مظاهر ووسائط وتخطيطات", "مظاهر وهوية حسب الخطة"],
      ["الحركة والتفاعل", "انتقالات وأصوات وكشف الإجابات", "صفحات", "صفحات", "تدفق أسئلة المحادثة", "مؤقت وكشف النتائج ومنصة"],
      ["مفتوح المصدر ويمكن استضافته", "نعم (AGPL)", "لا", "لا", "لا", "لا"],
      ["التشغيل من ChatGPT", "تطبيق Chaos ‏(MCP): مسودات، ونشر عند الطلب، وألعاب مباشرة، ونتائج", "لم نقارن", "لم نقارن", "لم نقارن", "لم نقارن"],
      ["API وWebhooks", "API للمسودات وWebhooks وملخصات بالأعداد فقط", "Forms API", "عبر Power Automate", "APIs وWebhooks", "لم نقارن"],
      ["تصدير الردود", "CSV وExcel وJSON", "Google Sheets وCSV", "Excel", "CSV وExcel", "تقارير Excel"],
      ["السعر", "مجاني للاستخدام الشخصي بلا حدود. السعر المخطط للأعمال 20 جنيهًا لكل مقعد نشط شهريًا؛ الدفع غير متاح", "مجاني بحساب Google", "مجاني بحساب Microsoft", "خطة مجانية محدودة وخطط مدفوعة", "خطة أساسية مجانية وخطط مدفوعة"],
    ],
    notCompared: "«لم نقارن» تعني أننا لم نتحقق من هذا المنتج في هذا الصف.",
  },
};
