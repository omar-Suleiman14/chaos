"use client";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { useLocale } from "@/lib/i18n";
const examples = {
 en: [
  ["Make a course from your notes", "Use my attached notes to create a Chaos course draft with three lessons, inline flashcards and one checkpoint quiz per lesson. Add outcomes and modules. Leave everything unpublished for review."],
  ["Build a quiz that teaches", "Create a Chaos quiz draft with 10 questions from this discussion, plausible distractors and short explanations. Attach it to my selected lesson without copying the quiz."],
  ["Prepare a live class", "Find my published Chapter 3 quiz and open a live lobby. Give me the host link and join PIN. Wait for me to start the game."],
  ["Review what needs practice", "Read my weak-area actions in Chaos. Suggest which lesson section and related flashcards I should review, then link the original quiz. Do not read anyone else’s answers."],
 ],
 ar: [
  ["حوّل ملاحظاتك إلى دورة", "استخدم ملاحظاتي المرفقة لإنشاء مسودة دورة في Chaos من ثلاثة دروس مع بطاقات واختبار قصير داخل كل درس. أضف المخرجات والوحدات واترك كل شيء غير منشور للمراجعة."],
  ["أنشئ اختبارًا يساعد على التعلّم", "أنشئ مسودة اختبار Chaos من عشرة أسئلة عن نقاشنا مع بدائل معقولة وتفسيرات قصيرة. أرفقه بدرسي المحدد دون نسخ الاختبار."],
  ["جهّز حصة مباشرة", "ابحث عن اختبار الفصل الثالث المنشور وافتح غرفة مباشرة. أعطني رابط المعلّم ورمز الانضمام وانتظر حتى أبدأ اللعبة."],
  ["راجع ما يحتاج تدريبًا", "اقرأ إجراءات مراجعة نقاط ضعفي في Chaos واقترح فقرة وبطاقات مرتبطة للمراجعة ثم رابط الاختبار الأصلي. لا تقرأ إجابات الآخرين."],
 ],
};
export default function McpOutcomes() {
 const { locale } = useLocale(), ar = locale === "ar", [copied, setCopied] = useState(-1);
 return <section><h2>{ar ? "ما الذي يمكنك إنجازه؟" : "What can you make?"}</h2><p>{ar ? "طلبات جاهزة لـ ChatGPT وClaude بعد ربط حسابك. هذه أمثلة لتجربتها." : "Copy a prompt into ChatGPT or Claude after connecting your account. These are examples to try."}</p>{examples[ar ? "ar" : "en"].map(([title,prompt],i) => <article className="lx-panel" key={title}><h3>{title}</h3><p>{prompt}</p><button className="site-connect-btn" type="button" onClick={() => void copyText(prompt).then((ok) => { if (ok) setCopied(i); })}>{copied === i ? (ar ? "تم النسخ" : "Copied") : (ar ? "انسخ الطلب" : "Copy prompt")}</button></article>)}</section>;
}
