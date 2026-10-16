import type { Block } from "@/lib/learn/doc";

const p = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }], children: [], ...extra });

/** A short mixed lesson: every interaction test can find its targets by id. */
export function harnessFixture(language: "en" | "ar"): Block[] {
  const ar = language === "ar";
  return [
    { ...p("h1", ar ? "مقدمة الدورة الدموية" : "Introduction to circulation"), type: "heading", props: { level: 1 } },
    p("p1", ar ? "القلب مضخة عضلية تدفع الدم عبر الجسم. ضغط 120/80 طبيعي." : "The heart is a muscular pump that moves blood through the body, and a reading of 120/80 is typical for a healthy adult at rest."),
    p("p2", ar ? "الفقرة الثانية." : "Second paragraph."),
    { ...p("t1", ar ? "تفاصيل" : "Details toggle"), type: "toggleListItem", children: [p("t1c1", ar ? "طفل أول" : "First child"), p("t1c2", ar ? "طفل ثان" : "Second child")] },
    { ...p("b1", ar ? "نقطة أولى" : "First bullet"), type: "bulletListItem", children: [{ ...p("b1c", ar ? "نقطة متداخلة" : "Nested bullet"), type: "bulletListItem" }] },
    { ...p("b2", ar ? "نقطة ثانية" : "Second bullet"), type: "bulletListItem" },
    { id: "img1", type: "image", props: { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='240'><rect width='640' height='240' fill='%233595e3'/></svg>", caption: ar ? "رسم" : "Heart diagram", alt: "Heart", credit: "Chaos", figureKind: "photo", previewWidth: 480 }, children: [] },
    { ...p("c1", ar ? "ملاحظة مهمة" : "Remember to warm up before measuring."), type: "callout", props: { tone: "tip" } },
    { id: "q1", type: "lessonQuiz", props: { assetKind: "form", assetId: "form_123", required: true }, children: [] },
    p("p3", ar ? "الفقرة الأخيرة." : "Last paragraph."),
  ];
}
