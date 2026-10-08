import { pluralForm, type Locale } from "@/lib/locale";

/**
 * Arabic versions of the English messages produced outside React components
 * (convex/formLogic.ts, activity log and
 * server errors). The English source strings stay untouched because other code
 * matches them; translation happens only at display time. Unknown messages
 * fall back to the English text.
 */

type Forms = [one: string, two: string, few: string, many: string];

/** "N noun" with Arabic number agreement (accusative dual, singular after 11). */
const num = (n: string, f: Forms): string => {
  const k = Number(n);
  return pluralForm("ar", k, { one: f[0], two: f[1], few: `${k} ${f[2]}`, many: `${k} ${f[3]}`, other: `${k} ${f[3]}` });
};

const FIELD: Forms = ["حقل واحد", "حقلين", "حقول", "حقلًا"];
const CHAR: Forms = ["حرف واحد", "حرفين", "أحرف", "حرفًا"];
const OPTION: Forms = ["خيار واحد", "خيارين", "خيارات", "خيارًا"];
const ROW: Forms = ["صف واحد", "صفين", "صفوف", "صفًا"];
const ENDING: Forms = ["شاشة نهاية واحدة", "شاشتي نهاية", "شاشات نهاية", "شاشة نهاية"];
const CONDITION: Forms = ["شرط واحد", "شرطين", "شروط", "شرطًا"];
const FILE: Forms = ["ملف واحد", "ملفين", "ملفات", "ملفًا"];
const ITEM: Forms = ["عنصر واحد", "عنصرين", "عناصر", "عنصرًا"];
const RESPONSE: Forms = ["ردّ واحد", "ردّين", "ردود", "ردًّا"];
const SECOND: Forms = ["ثانية واحدة", "ثانيتين", "ثوانٍ", "ثانية"];
const RULE: Forms = ["قاعدة واحدة", "قاعدتين", "قواعد", "قاعدة"];
const COLLABORATOR: Forms = ["متعاون واحد", "متعاونين", "متعاونين", "متعاونًا"];
const POINT: Forms = ["نقطة واحدة", "نقطتين", "نقاط", "نقطة"];
const TEMPLATE: Forms = ["قالب واحد", "قالبين", "قوالب", "قالبًا"];
const THEME: Forms = ["مظهر واحد", "مظهرين", "مظاهر", "مظهرًا"];
const CONNECTION: Forms = ["اتصال واحد", "اتصالين", "اتصالات", "اتصالًا"];
const VIEW: Forms = ["عرض واحد", "عرضين", "عروض", "عرضًا"];
const DAY: Forms = ["يوم واحد", "يومين", "أيام", "يومًا"];

const lang = (l: string) => (l === "Arabic" ? "العربية" : "الإنجليزية");
const langText = (l: string) => (l === "Arabic" ? "العربي" : "الإنجليزي");

type Entry = [RegExp, (m: string[]) => string];

/** Messages that follow a "Field 3 (“Label”): ", "Ending 2: " or "Question 1: " owner prefix. */
const bodies: Entry[] = [
  // rules
  [/^invalid rule\.$/, () => "القاعدة غير صالحة."],
  [/^use at most (\d+) conditions\.$/, (m) => `استخدم ${num(m[1], CONDITION)} على الأكثر.`],
  [/^score conditions need a number\.$/, () => "شروط الدرجة تحتاج إلى رقم."],
  [/^a condition refers to a question that comes later\.$/, () => "أحد الشروط يشير إلى سؤال يأتي لاحقًا."],
  [/^a condition refers to a missing question\.$/, () => "أحد الشروط يشير إلى سؤال غير موجود."],
  [/^conditions cannot refer to text blocks or sections\.$/, () => "لا يمكن أن تشير الشروط إلى كتل نصية أو أقسام."],
  [/^a condition is missing its value\.$/, () => "أحد الشروط بلا قيمة."],
  [/^comparisons need a numeric question and a number\.$/, () => "المقارنات تحتاج إلى سؤال رقمي ورقم."],
  [/^a condition refers to an option that no longer exists\.$/, () => "أحد الشروط يشير إلى خيار لم يعد موجودًا."],
  [/^branching on matrix questions is not supported\.$/, () => "التفرع حسب أسئلة المصفوفة غير مدعوم."],
  [/^can never be shown because “([\s\S]*)” cannot equal two answers at once\.$/, (m) => `لا يمكن عرضه أبدًا لأن “${m[1]}” لا يمكن أن يساوي إجابتين في الوقت نفسه.`],
  // fields
  [/^invalid identifier\.$/, () => "المعرّف غير صالح."],
  [/^duplicate identifier ([\s\S]*)\.$/, (m) => `المعرّف ${m[1]} مكرر.`],
  [/^unsupported type\.$/, () => "النوع غير مدعوم."],
  [/^enter a label\.$/, () => "أدخل تسمية."],
  [/^add some text\.$/, () => "أضف نصًا."],
  [/^the label is too long\.$/, () => "التسمية طويلة جدًا."],
  [/^the description is too long\.$/, () => "الوصف طويل جدًا."],
  [/^images need an https:\/\/ address and alternative text\.$/, () => "الصور تحتاج إلى عنوان https:// ونص بديل."],
  [/^add at least (\d+) options\.$/, (m) => `أضف ${num(m[1], OPTION)} على الأقل.`],
  [/^use at most (\d+) options\.$/, (m) => `استخدم ${num(m[1], OPTION)} على الأكثر.`],
  [/^options cannot be empty\.$/, () => "لا يمكن ترك الخيارات فارغة."],
  [/^option identifiers must be unique\.$/, () => "يجب أن تكون معرّفات الخيارات فريدة."],
  [/^two options have the same text\.$/, () => "خياران لهما النص نفسه."],
  [/^option scores must be numbers\.$/, () => "يجب أن تكون درجات الخيارات أرقامًا."],
  [/^quiz branching cannot reveal a calculated score before submission\.$/, () => "لا يمكن للتفرع في الاختبار أن يكشف الدرجة المحسوبة قبل الإرسال."],
  [/^remove calculated option scores when using quiz mode; use the answer key instead\.$/, () => "أزل درجات الخيارات المحسوبة عند استخدام وضع الاختبار، واستخدم مفتاح الإجابة بدلًا منها."],
  [/^only choice questions can have an answer key\.$/, () => "مفتاح الإجابة متاح لأسئلة الاختيار فقط."],
  [/^points must be between (\d+) and (\d+)\.$/, (m) => `يجب أن تكون النقاط بين ${m[1]} و${m[2]}.`],
  [/^choose at least one correct answer\.$/, () => "اختر إجابة صحيحة واحدة على الأقل."],
  [/^choose one correct answer\.$/, () => "اختر إجابة صحيحة واحدة."],
  [/^the answer key refers to a missing option\.$/, () => "مفتاح الإجابة يشير إلى خيار غير موجود."],
  [/^the explanation is too long\.$/, () => "الشرح طويل جدًا."],
  [/^add at least one row\.$/, () => "أضف صفًا واحدًا على الأقل."],
  [/^use at most (\d+) rows\.$/, (m) => `استخدم ${num(m[1], ROW)} على الأكثر.`],
  [/^rows cannot be empty\.$/, () => "لا يمكن ترك الصفوف فارغة."],
  [/^row identifiers must be unique\.$/, () => "يجب أن تكون معرّفات الصفوف فريدة."],
  [/^minimum must be a number\.$/, () => "يجب أن يكون الحد الأدنى رقمًا."],
  [/^maximum must be a number\.$/, () => "يجب أن يكون الحد الأقصى رقمًا."],
  [/^minimum is greater than maximum\.$/, () => "الحد الأدنى أكبر من الحد الأقصى."],
  [/^rating must use (\d+)–(\d+) steps\.$/, (m) => `يجب أن يستخدم التقييم من ${m[1]} إلى ${m[2]} خطوات.`],
  [/^a scale starts at (\d+) or (\d+) and ends between (\d+) and (\d+)\.$/, (m) => `يبدأ المقياس من ${m[1]} أو ${m[2]} وينتهي بين ${m[3]} و${m[4]}.`],
  [/^allow (\d+)–(\d+) files\.$/, (m) => `اسمح بعدد ملفات من ${m[1]} إلى ${m[2]}.`],
  [/^the selection limit exceeds the number of options\.$/, () => "حد الاختيار أكبر من عدد الخيارات."],
  [/^text blocks and sections cannot be required\.$/, () => "لا يمكن جعل الكتل النصية والأقسام إلزامية."],
  [/^unsupported translation language ([\s\S]*)\.$/, (m) => `لغة الترجمة ${m[1]} غير مدعومة.`],
  [/^a translation is too long\.$/, () => "الترجمة طويلة جدًا."],
  // endings
  [/^add a title or message\.$/, () => "أضف عنوانًا أو رسالة."],
  [/^the message is too long\.$/, () => "الرسالة طويلة جدًا."],
  [/^quiz endings cannot use calculated option scores\.$/, () => "لا يمكن لشاشات نهاية الاختبار استخدام درجات الخيارات المحسوبة."],
];

const ownerPrefix = /^(Field (\d+)(?: \((“[\s\S]*”)\))?|Ending (\d+)|Question (\d+)): ([\s\S]*)$/;

function withOwner(message: string): string | null {
  const m = message.match(ownerPrefix);
  if (!m) return null;
  const owner = m[2] ? `الحقل ${m[2]}${m[3] ? ` (${m[3]})` : ""}` : m[4] ? `شاشة النهاية ${m[4]}` : `السؤال ${m[5]}`;
  for (const [re, fn] of bodies) {
    const b = m[6].match(re);
    if (b) return `${owner}: ${fn(b)}`;
  }
  return null;
}

/** Complete messages with no owner prefix. */
const whole: Entry[] = [
  // formLogic.checkDefinition
  [/^Enter a form title\.$/, () => "أدخل عنوان النموذج."],
  [/^The title can have at most (\d+) characters\.$/, (m) => `يمكن أن يصل العنوان إلى ${num(m[1], CHAR)} على الأكثر.`],
  [/^The description is too long\.$/, () => "الوصف طويل جدًا."],
  [/^The default language must be enabled\.$/, () => "يجب تفعيل اللغة الافتراضية."],
  [/^A form can contain at most (\d+) fields\.$/, (m) => `يمكن أن يحتوي النموذج على ${num(m[1], FIELD)} على الأكثر.`],
  [/^Add at least one question\.$/, () => "أضف سؤالًا واحدًا على الأقل."],
  [/^Add an answer key to at least one choice question\.$/, () => "أضف مفتاح إجابة إلى سؤال اختيار واحد على الأقل."],
  [/^Use at most (\d+) endings\.$/, (m) => `استخدم ${num(m[1], ENDING)} على الأكثر.`],
  [/^Choose a valid accent colour\.$/, () => "اختر لونًا مميزًا صالحًا."],
  [/^(Page|Surface|Text) colour must be a six-digit hex value\.$/, (m) => `يجب أن يكون لون ${{ Page: "الصفحة", Surface: "السطح", Text: "النص" }[m[1] as "Page"]} قيمة hex من ست خانات.`],
  [/^The logo must be an https:\/\/ image address\.$/, () => "يجب أن يكون الشعار عنوان صورة يبدأ بـ https://."],
  [/^Every ending has conditions; respondents who match none see the default confirmation\.$/, () => "لكل شاشة نهاية شروط؛ المجيبون الذين لا ينطبق عليهم أي شرط يرون رسالة التأكيد الافتراضية."],
  [/^(English|Arabic) translation is incomplete \((\d+) items?\); the (English|Arabic) text is shown instead\.$/, (m) => `الترجمة ${lang(m[1])} غير مكتملة (${num(m[2], ITEM)})؛ يُعرض النص ${langText(m[3])} بدلًا منها.`],
  // explainVisibility
  [/^Always shown\.$/, () => "يظهر دائمًا."],
  [/^Hidden because section “([\s\S]*)” is hidden\.$/, (m) => `مخفي لأن القسم “${m[1]}” مخفي.`],
  [/^(Shown|Hidden): requires ([\s\S]*)\.$/, (m) => `${m[1] === "Shown" ? "ظاهر" : "مخفي"}: يتطلب ${describeRuleText(m[2])}.`],
  // respondent-side answer checks (also returned by formLogic)
  [/^This question is required\.$/, () => "هذا السؤال إلزامي."],
  [/^Enter a number\.$/, () => "أدخل رقمًا."],
  [/^Choose a rating\.$/, () => "اختر تقييمًا."],
  [/^Choose a value on the scale\.$/, () => "اختر قيمة على المقياس."],
  [/^Enter ([\s\S]+) or more\.$/, (m) => `أدخل ${m[1]} أو أكثر.`],
  [/^Enter ([\s\S]+) or less\.$/, (m) => `أدخل ${m[1]} أو أقل.`],
  [/^Choose one of the options\.$/, () => "اختر أحد الخيارات."],
  [/^Choose from the options\.$/, () => "اختر من الخيارات المتاحة."],
  [/^Choose at least (\d+)\.$/, (m) => `اختر ${m[1]} على الأقل.`],
  [/^Choose at most (\d+)\.$/, (m) => `اختر ${m[1]} على الأكثر.`],
  [/^Rank every option\.$/, () => "رتّب كل الخيارات."],
  [/^Answer each row\.$/, () => "أجب عن كل صف."],
  [/^Answer every row\.$/, () => "أجب عن كل صف."],
  [/^Upload a file\.$/, () => "ارفع ملفًا."],
  [/^Upload at most (\d+) files?\.$/, (m) => `ارفع ${num(m[1], FILE)} على الأكثر.`],
  [/^An uploaded file is missing\. Upload it again\.$/, () => "ملف مرفوع مفقود. ارفعه مرة أخرى."],
  [/^Enter text\.$/, () => "أدخل نصًا."],
  [/^Use at most (\d+) characters\.$/, (m) => `استخدم ${num(m[1], CHAR)} على الأكثر.`],
  [/^Use at least (\d+) characters\.$/, (m) => `استخدم ${num(m[1], CHAR)} على الأقل.`],
  [/^Enter a valid email address\.$/, () => "أدخل بريدًا إلكترونيًا صالحًا."],
  [/^Enter a valid phone number\.$/, () => "أدخل رقم هاتف صالحًا."],
  [/^Enter a web address starting with https:\/\/\.$/, () => "أدخل عنوان ويب يبدأ بـ https://."],
  [/^Enter a valid date\.$/, () => "أدخل تاريخًا صالحًا."],
  [/^Enter a valid time\.$/, () => "أدخل وقتًا صالحًا."],
  [/^Other \(fewer than (\d+)\)$/, (m) => `أخرى (أقل من ${m[1]})`],
  // client
  [/^Something went wrong\. Please try again\.$/, () => "حدث خطأ. حاول مرة أخرى."],
  [/^You appear to be offline\. Your work is kept here; try again when connected\.$/, () => "يبدو أنك غير متصل. عملك محفوظ هنا؛ حاول مرة أخرى عند عودة الاتصال."],
  // forms.ts
  [/^This form was made with an unsupported format version\.$/, () => "أُنشئ هذا النموذج بصيغة غير مدعومة."],
  [/^The title is too long\.$/, () => "العنوان طويل جدًا."],
  [/^Too many options\.$/, () => "عدد الخيارات كبير جدًا."],
  [/^This form is too large to save\.$/, () => "هذا النموذج أكبر من أن يُحفظ."],
  [/^Choose each language once\.$/, () => "اختر كل لغة مرة واحدة فقط."],
  [/^Please try again\.$/, () => "حاول مرة أخرى."],
  [/^That template does not exist\.$/, () => "هذا القالب غير موجود."],
  [/^This form changed elsewhere\. Your version is kept in this browser\.$/, () => "تغيّر هذا النموذج في مكان آخر. نسختك محفوظة في هذا المتصفح."],
  [/^This form changed elsewhere\. Reload before publishing\.$/, () => "تغيّر هذا النموذج في مكان آخر. أعد التحميل قبل النشر."],
  [/^This form changed elsewhere\. Reload first\.$/, () => "تغيّر هذا النموذج في مكان آخر. أعد التحميل أولًا."],
  [/^The response limit must be a whole number\.$/, () => "يجب أن يكون حد الردود عددًا صحيحًا."],
  [/^Retention must be (\d+)–(\d+) days\.$/, (m) => `يجب أن تكون مدة الاحتفاظ بين ${m[1]} و${num(m[2], DAY)}.`],
  [/^The closing time must be after the opening time\.$/, () => "يجب أن يكون وقت الإغلاق بعد وقت الفتح."],
  [/^The closed message is too long\.$/, () => "رسالة الإغلاق طويلة جدًا."],
  [/^Use at most (\d+) notification rules\.$/, (m) => `استخدم ${num(m[1], RULE)} للإشعارات على الأكثر.`],
  [/^One response per person can only be enforced when respondents sign in\.$/, () => "لا يمكن تطبيق ردّ واحد لكل شخص إلا عند تسجيل دخول المجيبين."],
  [/^Access codes need (\d+)–(\d+) characters\.$/, (m) => `يجب أن يتراوح رمز الوصول بين ${m[1]} و${num(m[2], CHAR)}.`],
  [/^Set an access code\.$/, () => "حدّد رمز وصول."],
  [/^Contact (\S+@[^\s.]+(?:\.[^\s.]+)+) before republishing\.$/, (m) => `تواصل مع ${m[1]} قبل إعادة النشر.`],
  [/^Restore this form before publishing\.$/, () => "استعد هذا النموذج قبل نشره."],
  [/^Restore this form before editing\.$/, () => "استعد هذا النموذج قبل تعديله."],
  [/^This form is held by an administrator\.$/, () => "هذا النموذج محجوب من قِبل المشرف."],
  [/^Publish the form first\.$/, () => "انشر النموذج أولًا."],
  [/^That version does not exist\.$/, () => "هذه النسخة غير موجودة."],
  [/^Archive the form before deleting it\.$/, () => "أرشِف النموذج قبل حذفه."],
  [/^You already own this form\.$/, () => "أنت مالك هذا النموذج بالفعل."],
  [/^A form can have at most (\d+) collaborators\.$/, (m) => `يمكن أن يضم النموذج ${num(m[1], COLLABORATOR)} على الأكثر.`],
  [/^Comments need (\d+)–(\d+) characters\.$/, (m) => `يجب أن يتراوح التعليق بين ${m[1]} و${num(m[2], CHAR)}.`],
  [/^Template names need (\d+)–(\d+) characters\.$/, (m) => `يجب أن يتراوح اسم القالب بين ${m[1]} و${num(m[2], CHAR)}.`],
  [/^You can keep at most (\d+) templates\.$/, (m) => `يمكنك الاحتفاظ بـ${num(m[1], TEMPLATE)} على الأكثر.`],
  [/^Enter a name of at most (\d+) characters\.$/, (m) => `أدخل اسمًا لا يزيد على ${num(m[1], CHAR)}.`],
  [/^Use six-digit hex colours\.$/, () => "استخدم ألوانًا بصيغة hex من ست خانات."],
  [/^Logo addresses must use HTTPS\.$/, () => "يجب أن تبدأ عناوين الشعار بـ HTTPS."],
  [/^You can keep at most (\d+) saved themes\.$/, (m) => `يمكنك الاحتفاظ بـ${num(m[1], THEME)} محفوظًا على الأكثر.`],
  // integrations, admin, authz
  [/^Name the connection \(up to (\d+) characters\)\.$/, (m) => `سمِّ الاتصال (حتى ${num(m[1], CHAR)}).`],
  [/^Keep at most (\d+) active connections\.$/, (m) => `احتفظ بـ${num(m[1], CONNECTION)} نشطًا على الأكثر.`],
  [/^Expiry must be (\d+)–(\d+) days\.$/, (m) => `يجب أن تكون مدة الصلاحية بين ${m[1]} و${num(m[2], DAY)}.`],
  [/^Connection not found\.$/, () => "الاتصال غير موجود."],
  [/^This connection was revoked\.$/, () => "تم إلغاء هذا الاتصال."],
  [/^Share at most (\d+) items with one connection\.$/, (m) => `شارك ${num(m[1], ITEM)} على الأكثر مع اتصال واحد.`],
  [/^One of the selected items is not yours\.$/, () => "أحد العناصر المحددة ليس ملكك."],
  [/^Choose at least one permission\.$/, () => "اختر صلاحية واحدة على الأقل."],
  [/^Not authenticated$/, () => "لم تسجّل الدخول."],
  [/^Form not found or you do not have access\.$/, () => "النموذج غير موجود أو لا تملك صلاحية الوصول إليه."],
  [/^Quiz not found or unauthorized$/, () => "الاختبار غير موجود أو لا تملك صلاحية الوصول إليه."],
  [/^Question not found( or unauthorized)?$/, (m) => (m[1] ? "السؤال غير موجود أو لا تملك صلاحية الوصول إليه." : "السؤال غير موجود.")],
  [/^Session not found( or unauthorized)?$/, (m) => (m[1] ? "الجلسة غير موجودة أو لا تملك صلاحية الوصول إليها." : "الجلسة غير موجودة.")],
  [/^This account is temporarily read-only\. Contact (\S+@[^\s.]+(?:\.[^\s.]+)+)\.$/, (m) => `هذا الحساب للقراءة فقط مؤقتًا. تواصل مع ${m[1]}.`],
  [/^This account is read-only due to moderation\.$/, () => "هذا الحساب للقراءة فقط بسبب الإشراف."],
  // plans.ts
  [/^Finish signing in before creating content\.$/, () => "أكمل تسجيل الدخول قبل إنشاء محتوى."],
  [/^Contact (\S+@[^\s.]+(?:\.[^\s.]+)+)\.$/, (m) => `تواصل مع ${m[1]}.`],
  [/^Free includes (\d+) forms or quizzes per calendar month \(UTC\)\. Contact (\S+@[^\s.]+(?:\.[^\s.]+)+) for Pro\.$/, (m) => `تتيح الخطة المجانية ${m[1]} نماذج أو اختبارات في الشهر الميلادي (بتوقيت UTC). تواصل مع ${m[2]} للحصول على Pro.`],
  // links.ts
  [/^Sign in again and retry\.$/, () => "سجّل الدخول مرة أخرى وأعد المحاولة."],
  [/^Use 3–30 letters, numbers, dots, dashes or underscores, starting with a letter or number\.$/, () => "استخدم من 3 إلى 30 حرفًا أو رقمًا أو نقطة أو شرطة أو شرطة سفلية، على أن يبدأ اسم المستخدم بحرف أو رقم."],
  [/^That username is reserved\. Try another\.$/, () => "اسم المستخدم هذا محجوز. جرّب اسمًا آخر."],
  [/^Someone already has that username\.$/, () => "اسم المستخدم هذا مستخدم بالفعل."],
  [/^Choose your username first\.$/, () => "اختر اسم المستخدم أولًا."],
  [/^Use letters, numbers and dashes\.$/, () => "استخدم أحرفًا وأرقامًا وشرطات."],
  [/^Another of your forms already uses that link\.$/, () => "أحد نماذجك الأخرى يستخدم هذا الرابط بالفعل."],
  [/^One of your older quizzes already uses that link\.$/, () => "أحد اختباراتك القديمة يستخدم هذا الرابط بالفعل."],
  // quizFunctions.ts
  [/^This attempt no longer exists\.$/, () => "هذه المحاولة لم تعد موجودة."],
  [/^This attempt is already completed\.$/, () => "اكتملت هذه المحاولة بالفعل."],
  [/^That question no longer exists\.$/, () => "هذا السؤال لم يعد موجودًا."],
  [/^That question is not part of this quiz\.$/, () => "هذا السؤال ليس ضمن هذا الاختبار."],
  [/^That answer is too long to submit\.$/, () => "هذه الإجابة أطول من أن تُرسل."],
  [/^This attempt has submitted too many answers\.$/, () => "أرسلت هذه المحاولة إجابات أكثر من الحد المسموح."],
  [/^QUIZ_UNAVAILABLE$/, () => "الاختبار غير متاح."],
  [/^Award between (\d+) and (\d+) marks\.$/, (m) => `امنح بين ${m[1]} و${num(m[2], POINT)}.`],
  [/^This respondent did not answer that question\.$/, () => "لم يجب هذا المجيب عن هذا السؤال."],
  [/^The form response limit must be a whole number of at least 1\.$/, () => "يجب أن يكون حد ردود النموذج عددًا صحيحًا لا يقل عن 1."],
  [/^This quiz is held by an administrator\.$/, () => "هذا الاختبار محجوب من قِبل المشرف."],
  [/^Archive size requires maintenance before editing\.$/, () => "حجم الأرشيف يتطلب صيانة قبل التعديل."],
  [/^Use lowercase letters, numbers and single hyphens\.$/, () => "استخدم أحرفًا لاتينية صغيرة وأرقامًا وشرطات مفردة."],
  [/^That URL is already used by another quiz\.$/, () => "هذا الرابط مستخدم في اختبار آخر."],
  [/^Slug already taken$/, () => "هذا الرابط مستخدم بالفعل."],
  [/^This quiz changed elsewhere\. Your local draft is preserved; reload before overwriting\.$/, () => "تغيّر هذا الاختبار في مكان آخر. مسودتك المحلية محفوظة؛ أعد التحميل قبل الاستبدال."],
  [/^This quiz changed elsewhere\. Reload before publishing\.$/, () => "تغيّر هذا الاختبار في مكان آخر. أعد التحميل قبل النشر."],
  [/^Quiz exceeds the supported size\.$/, () => "الاختبار أكبر من الحجم المدعوم."],
  [/^Group name is too long\.$/, () => "اسم المجموعة طويل جدًا."],
  [/^Pool size must be a whole number up to (\d+)\.$/, (m) => `يجب أن يكون حجم المجموعة عددًا صحيحًا حتى ${m[1]}.`],
  [/^Invalid question size or points\.$/, () => "حجم السؤال أو نقاطه غير صالح."],
  [/^Question does not belong to this draft or is duplicated\.$/, () => "السؤال لا ينتمي إلى هذه المسودة أو مكرر."],
  [/^Points must be finite\.$/, () => "يجب أن تكون النقاط رقمًا محدودًا."],
  [/^Questions must be worth at least 1 mark\.$/, () => "يجب ألا تقل نقاط السؤال عن 1."],
  [/^User not found$/, () => "المستخدم غير موجود."],
  [/^Username too short$/, () => "اسم المستخدم قصير جدًا."],
  [/^Username already taken$/, () => "اسم المستخدم مستخدم بالفعل."],
  [/^Enter a name to start\.$/, () => "أدخل اسمك للبدء."],
  [/^This quiz no longer exists\.$/, () => "هذا الاختبار لم يعد موجودًا."],
  [/^This quiz is unavailable\.$/, () => "هذا الاختبار غير متاح."],
  [/^This quiz is not accepting responses right now\.$/, () => "هذا الاختبار لا يقبل ردودًا حاليًا."],
  [/^This quiz has reached its maximum number of players\.$/, () => "بلغ هذا الاختبار الحد الأقصى من المشاركين."],
  [/^Too many people are starting this quiz at once\. Wait a moment and try again\.$/, () => "عدد كبير من الأشخاص يبدؤون هذا الاختبار في وقت واحد. انتظر قليلًا ثم حاول مرة أخرى."],
  [/^Too many requests\. Try again in (\d+) seconds\.$/, (m) => `طلبات كثيرة. حاول مرة أخرى بعد ${num(m[1], SECOND)}.`],
  // respond.ts
  [/^This form is not available\.$/, () => "هذا النموذج غير متاح."],
  [/^This form is no longer accepting responses\.$/, () => "هذا النموذج لم يعد يقبل ردودًا."],
  [/^This form is not open yet\.$/, () => "هذا النموذج لم يُفتح بعد."],
  [/^This form closed and is no longer accepting responses\.$/, () => "أُغلق هذا النموذج ولم يعد يقبل ردودًا."],
  [/^Sign in to respond to this form\.$/, () => "سجّل الدخول للرد على هذا النموذج."],
  [/^Enter the access code for this form\.$/, () => "أدخل رمز الوصول لهذا النموذج."],
  [/^Missing submission key\.$/, () => "مفتاح الإرسال مفقود."],
  [/^Invalid edit token\.$/, () => "رمز التعديل غير صالح."],
  [/^These answers are too large\.$/, () => "هذه الإجابات كبيرة جدًا."],
  [/^This form does not store unfinished answers\.$/, () => "هذا النموذج لا يحفظ الإجابات غير المكتملة."],
  [/^This form has reached its response limit\. Your answers were not submitted; the organiser has been told the form is full\.$/, () => "بلغ هذا النموذج حد الردود. لم تُرسل إجاباتك؛ تم إبلاغ منظّم النموذج بأنه ممتلئ."],
  [/^You have already responded to this form\.$/, () => "سبق أن رددت على هذا النموذج."],
  [/^This form does not allow editing responses\.$/, () => "هذا النموذج لا يسمح بتعديل الردود."],
  [/^This edit link is no longer valid\.$/, () => "رابط التعديل هذا لم يعد صالحًا."],
  [/^Invalid resume token\.$/, () => "رمز الاستئناف غير صالح."],
  [/^This form does not offer resume links\.$/, () => "هذا النموذج لا يوفر روابط للاستئناف."],
  [/^This question does not accept files\.$/, () => "هذا السؤال لا يقبل ملفات."],
  [/^The upload did not complete\. Try again\.$/, () => "لم يكتمل الرفع. حاول مرة أخرى."],
  [/^Files can be at most (\d+) MB\.$/, (m) => `الحد الأقصى لحجم الملف ${m[1]} ميغابايت.`],
  [/^Upload a PDF, image, text, CSV, Word or Excel file\.$/, () => "ارفع ملف PDF أو صورة أو نص أو CSV أو Word أو Excel."],
  // formResults.ts
  [/^Select at most (\d+) responses at a time\.$/, (m) => `حدد ${num(m[1], RESPONSE)} على الأكثر في المرة الواحدة.`],
  [/^View names need (\d+)–(\d+) characters\.$/, (m) => `يجب أن يتراوح اسم العرض بين ${m[1]} و${num(m[2], CHAR)}.`],
  [/^Keep at most (\d+) saved views per form\.$/, (m) => `احتفظ بـ${num(m[1], VIEW)} محفوظًا على الأكثر لكل نموذج.`],
];

const opLabels: Entry[] = [
  [/^is$/, () => "يساوي"],
  [/^is not$/, () => "لا يساوي"],
  [/^includes$/, () => "يشمل"],
  [/^does not include$/, () => "لا يشمل"],
  [/^is answered$/, () => "تمت الإجابة عنه"],
  [/^is not answered$/, () => "لم تتم الإجابة عنه"],
  [/^is greater than$/, () => "أكبر من"],
  [/^is at least$/, () => "لا يقل عن"],
  [/^is less than$/, () => "أقل من"],
  [/^is at most$/, () => "لا يزيد على"],
];
const opAlternatives = "is greater than|is at least|is less than|is at most|is not answered|is answered|does not include|includes|is not|is";

function opText(op: string): string {
  for (const [re, fn] of opLabels) if (re.test(op)) return fn([]);
  return op;
}

/** One describeRule condition: `“Name” op “value”`, `unknown field id op “value”` or `score op value`. */
const conditionRe = new RegExp(`^(?:(“[\\s\\S]*?”)|unknown field (\\S+)|score) (${opAlternatives})(?: (“[\\s\\S]*”|[^“]*))?$`);

function conditionText(part: string): string | null {
  const m = part.match(conditionRe);
  if (!m) return null;
  const subject = m[1] ?? (m[2] ? `حقل غير معروف ${m[2]}` : "الدرجة");
  return `${subject} ${opText(m[3])}${m[4] ? ` ${m[4]}` : ""}`;
}

/** describeRule output: conditions joined with " and " / " or ". */
function describeRuleText(text: string): string {
  for (const [sep, ar] of [[" and ", " و"], [" or ", " أو "]] as const) {
    if (!text.includes(sep)) continue;
    const parts = text.split(sep).map(conditionText);
    if (parts.every((p): p is string => p !== null)) return parts.join(ar);
  }
  return conditionText(text) ?? text;
}

/** Activity log `action` and `detail` strings (builder Team tab). */
const actions: Record<string, string> = {
  created: "أنشأ النموذج",
  edited: "عدّل النموذج",
  "changed settings": "غيّر الإعدادات",
  published: "نشر النموذج",
  "requested publication": "طلب النشر",
  "declined publication": "رفض طلب النشر",
  reopened: "أعاد فتح النموذج",
  closed: "أغلق النموذج",
  archived: "أرشف النموذج",
  restored: "استعاد النموذج",
  "restored version": "استعاد نسخة",
  shared: "شارك النموذج",
  "removed access": "أزال صلاحية الوصول",
  "marked as spam": "علّم الردود كرسائل مزعجة",
  "restored from spam": "أعاد الردود من الرسائل المزعجة",
  "deleted responses": "حذف ردودًا",
};

const detailEntries: Entry[] = [
  [/^Version (\d+) copied into the draft$/, (m) => `نُسخت النسخة ${m[1]} إلى المسودة`],
  [/^Version (\d+)$/, (m) => `النسخة ${m[1]}`],
  [/^(\S+@\S+) as (editor|viewer)$/, (m) => `${m[1]} بصفة ${m[2] === "editor" ? "محرر" : "مشاهد"}`],
  [/^(\d+) responses?$/, (m) => num(m[1], RESPONSE)],
];

export function localizeActivityAction(locale: Locale, action: string): string {
  return locale === "ar" ? (actions[action] ?? action) : action;
}

export function localizeActivityDetail(locale: Locale, detail: string): string {
  if (locale !== "ar") return detail;
  for (const [re, fn] of detailEntries) {
    const m = detail.match(re);
    if (m) return fn(m);
  }
  return detail;
}

function localizeLine(message: string): string {
  const coded = message.match(/^[A-Z][A-Z_]{2,}: ([\s\S]+)$/);
  if (coded) {
    const inner = localizeLine(coded[1]);
    return inner === coded[1] ? message : inner;
  }
  const owned = withOwner(message);
  if (owned) return owned;
  for (const [re, fn] of whole) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  // describeRule output shown on its own.
  const rule = describeRuleText(message);
  return rule !== message ? rule : message;
}

/**
 * Arabic text for a generated English message; English is returned unchanged.
 * Dynamic parts (titles, numbers, names) are kept as they are. Multi-line
 * messages (a publication-blocked list) are translated line by line.
 */
export function localizeMessage(locale: Locale, message: string): string {
  if (locale !== "ar") return message;
  if (message.includes("\n")) return message.split("\n").map((line) => (line.trim() ? localizeLine(line) : line)).join("\n");
  return localizeLine(message);
}
