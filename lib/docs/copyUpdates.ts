/** Exact old UI phrases only: real Google/Microsoft import instructions stay intact. */
export const docCopyReplacements: ReadonlyArray<readonly [string, string]> = [
  ["Pick a theme. New forms start with **Google Forms style**, a look that resembles Google Forms.", "Pick a theme. New forms start with **Lilac**, a lilac page with separate white question cards."],
  ["اختر سمة. تبدأ النماذج الجديدة بسمة **بأسلوب Google Forms**، وهي تشبه نماذج Google.", "اختر سمة. تبدأ النماذج الجديدة بسمة **ليلكي**، بصفحة بنفسجية فاتحة وبطاقات بيضاء مستقلة للأسئلة."],
  ["Google Forms and Microsoft Forms styles", "Lilac and Banner themes"],
  ["أسلوب Google Forms وأسلوب Microsoft Forms", "سمتا ليلكي وشريط"],
  ["بأسلوب Google Forms", "ليلكي"],
  ["بأسلوب Microsoft Forms", "شريط"],
  ["بسمة أسلوب Google Forms", "بسمة ليلكي"],
  ["يصبح العنوان **Google Forms style · edited**", "يصبح العنوان **ليلكي · معدّل**"],
  ["Google Forms style", "Lilac"],
  ["Microsoft Forms style", "Banner"],
  ["Personal is free; Business pays per seat.", "Personal use is free. Business pricing is per person."],
  ["50 EGP per active creator seat per month; respondents, students and Live players never need seats.", "50 EGP per person per month for people who create or manage content; respondents, students and Live players use it free."],
  ["50 EGP per active creator seat per month: only people who create or manage content.", "50 EGP per person per month, only for people who create or manage content."],
  ["Businesses can request seats through Support until checkout is available.", "Businesses can contact Support to get started until checkout is available."],
  ["الخطة الشخصية مجانية؛ والأعمال تدفع لكل مقعد.", "الاستخدام الشخصي مجاني. اشتراك الأعمال لكل شخص."],
  ["50 جنيهًا مصريًا لكل مقعد إنشاء نشط شهريًا؛ ولا يحتاج المجيبون والطلاب ولاعبو الألعاب المباشرة إلى مقاعد.", "50 جنيهًا مصريًا شهريًا لكل شخص ينشئ المحتوى أو يديره؛ والاستخدام مجاني للمجيبين والطلاب ولاعبي الألعاب المباشرة."],
  ["50 جنيهًا لكل مقعد إنشاء نشط شهريًا: فقط لمن ينشئ المحتوى أو يديره.", "50 جنيهًا شهريًا لكل شخص ينشئ المحتوى أو يديره."],
  ["يمكن للأعمال طلب المقاعد من الدعم حتى يتوفر الدفع.", "يمكن للأعمال التواصل مع الدعم للاشتراك حتى يتوفر الدفع."],
];

export function updateDocCopy(text: string): string {
  return docCopyReplacements.reduce((value, [from, to]) => value.replaceAll(from, to), text);
}
