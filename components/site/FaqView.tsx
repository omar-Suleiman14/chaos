"use client";

import LegalPage from "@/components/site/LegalPage";
import Link from "@/components/site/SiteLink";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    title: "Frequently asked questions",
    intro: "Sharing your first form, running a class quiz or trying to find an answer? Start here.",
    readMore: "Read more",
    helpTitle: "Still need help?",
    help: "Browse the guides or contact Support with your question.",
    docs: "Browse the docs", support: "Contact Support",
    questions: [
      { id: "account", question: "Can I send a survey to people who don't have a Chaos account?", answer: "Yes. In your form's Settings, set Who can respond to Anyone, then publish and share the public link. Choose With a code if you want to give people an access code instead. Anyone responses are anonymous; choose Signed in if you need responses linked to an account.", href: "/docs/access-and-limits" },
      { id: "publish", question: "I changed a question. Why does my shared link still show the old version?", answer: "Edits save to your draft. Press Publish changes to put the updated version on the public link. Until then, people keep seeing the last published version. Existing responses stay linked to the version they answered.", href: "/docs/publish" },
      { id: "closed", question: "People say my form is closed or full. How do I let them answer?", answer: "Check Settings for a closing date, opening date or response limit. Clear or adjust the setting that's stopping responses. If you closed the form manually, press Reopen. The form must also be published; a schedule cannot open a draft.", href: "/docs/access-and-limits" },
      { id: "duplicates", question: "How do I stop someone from submitting the same form twice?", answer: "Set Who can respond to Signed in, then turn on One response per person. With Anyone, responses are anonymous, so Chaos cannot reliably limit each person to one response. Sign-in is required for this restriction.", href: "/docs/access-and-limits" },
      { id: "resume", question: "If someone closes the form halfway through, do they lose their answers?", answer: "Answers are saved on their device until they submit. Returning on that device restores them. To let people continue on another device, enable Continue on another device in the response settings. It gives them a private resume link that lasts 30 days; anyone with that link can see and continue their answers.", href: "/docs/respondent-experience" },
      { id: "edit-response", question: "Someone submitted the wrong answer. Can they change it?", answer: "Enable Edit after submitting in the response settings before they submit. Their receipt will include a private edit link; anonymous respondents need that link to make changes. To keep edit links working after the form closes, also enable Allow edits after closing. Earlier versions remain available in Results.", href: "/docs/respondent-experience" },
      { id: "team", question: "I invited a colleague, but they didn't get an email. What should I do?", answer: "Create a free Business team in Teams & workspaces, then invite members by email or link. Chaos does not send invitation emails: send the link yourself or ask your colleague to sign in with the invited, verified address and open Teams & invitations. Links are single-use and expire in seven days. Share your forms, lessons, courses and folders in the team workspace so everyone can edit.", href: "/docs/team" },
      { id: "games", question: "How do I get my students into the same live quiz?", answer: "Start a live game from your quiz and share the room code or join link with the class. Students enter the code on the join page and choose a nickname. Wait for them to appear in the lobby, then start the game.", href: "/docs/live-games" },
      { id: "export", question: "Where do I download all the answers as an Excel file?", answer: "Open your form's Results, then the Export tab. Press Download next to Excel (.xlsx). CSV and JSON are available too. If you also need unfinished responses or responses flagged as spam, turn on those options before downloading.", href: "/docs/export-responses" },
      { id: "embed", question: "I pasted the embed code into my website. Why won't the form load?", answer: "First check that the form is published. In the Share tab, turn on Allow embedding and add your website's origin under Sites allowed to embed, for example https://example.com. Forms that require sign-in cannot be embedded; use Anyone or With a code instead.", href: "/docs/links-and-embed" },
      { id: "archive", question: "I archived a form by mistake. Have I lost its responses?", answer: "No. Open Archive and restore the form. Archiving is different from permanently deleting it. Permanent deletion removes the form, responses, uploaded files and history, and cannot be undone.", href: "/docs/archive" },
      { id: "pricing", question: "Can I use this for my class without paying for every student?", answer: "Students, respondents and live-game players use Chaos free. Personal use, including teaching, is free with no monthly caps on forms or responses. Personal is for one user without team sharing. Business teams include collaboration and cost 50 EGP per active seat per month, discounted 100% to 0 for a limited time. Create a team yourself; there is no checkout or charge. Rate limits and security checks still apply.", href: "/pricing" },
    ],
  },
  ar: {
    title: "الأسئلة الشائعة",
    intro: "تشارك نموذجك الأول، أو تجري اختبارًا لطلابك، أو تبحث عن رد؟ ابدأ هنا.",
    readMore: "اقرأ المزيد",
    helpTitle: "ما زلت تحتاج إلى مساعدة؟",
    help: "تصفّح الأدلة أو تواصل مع الدعم لطرح سؤالك.",
    docs: "تصفّح الدليل", support: "تواصل مع الدعم",
    questions: [
      { id: "account", question: "هل أستطيع إرسال استبيان لأشخاص ليس لديهم حساب في Chaos؟", answer: "نعم. من إعدادات النموذج، اختر الجميع تحت من يستطيع الإجابة، ثم انشر النموذج وشارك رابطه العام. اختر برمز إذا أردت منحهم رمز دخول بدلًا من ذلك. ردود الجميع مجهولة الهوية؛ اختر تسجيل الدخول إذا أردت ربط الردود بحسابات المجيبين.", href: "/docs/access-and-limits" },
      { id: "publish", question: "عدّلت سؤالًا. لماذا لا يزال الرابط يعرض النسخة القديمة؟", answer: "تُحفظ التعديلات في المسودة. اضغط على نشر التغييرات لتظهر النسخة المحدّثة في الرابط العام. حتى ذلك الحين يرى المجيبون آخر نسخة منشورة. وتبقى الردود السابقة مرتبطة بالنسخة التي أجابوا عنها.", href: "/docs/publish" },
      { id: "closed", question: "يقول المجيبون إن النموذج مغلق أو ممتلئ. كيف أسمح لهم بالإجابة؟", answer: "راجع موعد الإغلاق وموعد الفتح وحدّ الردود في الإعدادات. امسح أو عدّل الإعداد الذي يمنع استقبال الردود. إذا أغلقت النموذج يدويًا، اضغط على إعادة الفتح. يجب أن يكون النموذج منشورًا أيضًا؛ لا يفتح الجدول الزمني مسودة.", href: "/docs/access-and-limits" },
      { id: "duplicates", question: "كيف أمنع الشخص نفسه من إرسال النموذج مرتين؟", answer: "اختر تسجيل الدخول تحت من يستطيع الإجابة، ثم فعّل رد واحد لكل شخص. عند اختيار الجميع تكون الردود مجهولة الهوية، فلا يستطيع Chaos تقييد كل شخص برد واحد بشكل موثوق. هذا القيد يتطلب تسجيل الدخول.", href: "/docs/access-and-limits" },
      { id: "resume", question: "إذا أغلق شخص النموذج قبل إكماله، هل يفقد إجاباته؟", answer: "تُحفظ الإجابات على جهازه حتى الإرسال، وتعود عند فتح النموذج على الجهاز نفسه. للسماح بالمتابعة على جهاز آخر، فعّل المتابعة على جهاز آخر في إعدادات الردود. يحصل المجيب على رابط خاص صالح لمدة 30 يومًا؛ أي شخص يملك الرابط يستطيع رؤية الإجابات ومتابعتها.", href: "/docs/respondent-experience" },
      { id: "edit-response", question: "أرسل شخص إجابة خاطئة. هل يمكنه تعديلها؟", answer: "فعّل التعديل بعد الإرسال في إعدادات الردود قبل أن يرسل إجابته. سيحتوي إيصال الإرسال على رابط تعديل خاص؛ يحتاج المجيب المجهول إلى هذا الرابط للتعديل. لاستمرار عمل روابط التعديل بعد الإغلاق، فعّل السماح بالتعديل بعد الإغلاق أيضًا. تبقى النسخ السابقة متاحة في النتائج.", href: "/docs/respondent-experience" },
      { id: "team", question: "دعوت زميلًا ولم يصله بريد إلكتروني. ماذا أفعل؟", answer: "أنشئ فريق أعمال مجانًا من الفرق ومساحات العمل وادعُ الأعضاء بالبريد أو برابط. لا يرسل Chaos رسائل دعوة: أرسل الرابط بنفسك أو اطلب من زميلك تسجيل الدخول بالعنوان المدعو بعد التحقق منه وفتح الفرق والدعوات. تنتهي الروابط بعد سبعة أيام وتُستخدم مرة واحدة. شارك النماذج والدروس والدورات والمجلدات في مساحة الفريق لتعديلها معًا.", href: "/docs/team" },
      { id: "games", question: "كيف أجعل طلابي ينضمون إلى الاختبار المباشر نفسه؟", answer: "ابدأ لعبة مباشرة من اختبارك وشارك رمز الغرفة أو رابط الانضمام مع الطلاب. يدخل الطلاب الرمز في صفحة الانضمام ويختارون اسمًا مستعارًا. انتظر ظهورهم في غرفة الانتظار ثم ابدأ اللعبة.", href: "/docs/live-games" },
      { id: "export", question: "أين أحمّل كل الإجابات في ملف Excel؟", answer: "افتح نتائج النموذج ثم تبويب التصدير، واضغط على تنزيل بجانب Excel (.xlsx). تتوفر صيغتا CSV وJSON أيضًا. إذا أردت تضمين الردود غير المكتملة أو الردود المصنّفة كمزعجة، فعّل خياراتها قبل التنزيل.", href: "/docs/export-responses" },
      { id: "embed", question: "لصقت شيفرة التضمين في موقعي. لماذا لا يظهر النموذج؟", answer: "تأكد أولًا أن النموذج منشور. من تبويب المشاركة، فعّل السماح بالتضمين وأضف عنوان موقعك تحت المواقع المسموح لها بالتضمين، مثل https://example.com. لا يمكن تضمين النماذج التي تشترط تسجيل الدخول؛ اختر الجميع أو برمز بدلًا من ذلك.", href: "/docs/links-and-embed" },
      { id: "archive", question: "أرشفت نموذجًا بالخطأ. هل فقدت ردوده؟", answer: "لا. افتح الأرشيف واستعد النموذج. الأرشفة تختلف عن الحذف النهائي. يحذف الحذف النهائي النموذج وردوده وملفاته المرفوعة وسجلّه، ولا يمكن التراجع عنه.", href: "/docs/archive" },
      { id: "pricing", question: "هل يمكنني استخدام Chaos لفصلي دون الدفع لكل طالب؟", answer: "الطلاب والمجيبون ولاعبو الألعاب المباشرة مجانًا. الخطة الشخصية لمستخدم واحد دون مشاركة مع فريق. تشمل الأعمال فرقًا وتعاونًا بسعر 50 جنيهًا لكل مقعد نشط شهريًا، مخفّض بخصم ١٠٠٪ إلى 0 لفترة محدودة. يمكنك إنشاء فريق بنفسك دون دفع أو رسوم. تنطبق حدود المعدل وفحوص الأمان.", href: "/pricing" },
    ],
  },
};

export default function FaqView() {
  const t = useCopy(copy);
  return (
    <LegalPage title={t.title}>
      <p>{t.intro}</p>
      <div className="site-faq">
        {t.questions.map((item) => (
          <details key={item.id} id={item.id} className="site-faq__item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
            <p><Link href={item.href} aria-label={`${t.readMore}: ${item.question}`}>{t.readMore}</Link></p>
          </details>
        ))}
      </div>
      <h2>{t.helpTitle}</h2>
      <p>{t.help}</p>
      <p><Link href="/docs">{t.docs}</Link> · <Link href="/support">{t.support}</Link></p>
    </LegalPage>
  );
}
