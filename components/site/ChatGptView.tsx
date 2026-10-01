"use client";

import Link from "next/link";
import LegalPage from "@/components/site/LegalPage";
import { ChatGptMark } from "@/components/site/marks";
import { useCopy } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

const email = supportEmail;

const copy = {
  en: {
    title: "Chaos in ChatGPT",
    intro: "The Chaos app lets ChatGPT work in your Chaos account. Ask it to turn a conversation into a quiz, draft a survey, check how a form is doing, or publish it when you’re ready. It’s included with Chaos Pro.",
    tryTitle: "Things to try",
    tries: [
      "“Make a 10-question quiz about what we just discussed, using Chaos.”",
      "“Create a Chaos feedback form for tonight’s workshop with a 1–5 rating and one open question.”",
      "“How is my Chaos form ‘Team lunch’ doing? Summarize the results.”",
      "“Add a question about dietary needs to my Team lunch form, then publish it.”",
      "“Close my Chaos quiz ‘Chapter 3 review’.”",
    ],
    howTitle: "How it works",
    how: [
      "You connect once by signing in with your Chaos account. If you’re new, the account is created for you.",
      "Everything ChatGPT creates starts as a draft in your library. Nothing is shared until you ask it to publish.",
      "ChatGPT can read your forms, results and responses, but only when you ask. It can close, reopen and archive forms, but it cannot delete anything.",
      "Quizzes use Chaos’s quiz mode: right answers, points and a short explanation for each question.",
    ],
    plan: ["Chaos in ChatGPT is included on ", "every plan", ", including free Personal accounts. See ", "pricing", "."],
    privacyTitle: "Privacy",
    privacy: ["What ChatGPT reads is sent to OpenAI. Only ask it to read individual answers when you’re allowed to share them. See the ", "privacy policy", " for details."],
    helpTitle: "Help",
    help: ["Something not working? Email ", ". To disconnect, remove Chaos from your apps in ChatGPT’s settings."],
  },
  ar: {
    title: "Chaos في ChatGPT",
    intro: "يتيح تطبيق Chaos لـ ChatGPT أن يعمل داخل حسابك في Chaos. اطلب منه تحويل محادثة إلى اختبار، أو صياغة استطلاع، أو معرفة حال نموذج، أو نشره حين تكون جاهزًا. التطبيق مضمَّن في باقة Chaos Pro.",
    tryTitle: "جرّب هذه الطلبات",
    tries: [
      "«اصنع اختبارًا من 10 أسئلة عمّا ناقشناه للتو، باستخدام Chaos.»",
      "«أنشئ نموذج ملاحظات في Chaos لورشة الليلة، بتقييم من 1 إلى 5 وسؤال مفتوح واحد.»",
      "«كيف حال نموذج ‹غداء الفريق› في Chaos؟ لخّص لي النتائج.»",
      "«أضف سؤالًا عن الاحتياجات الغذائية إلى نموذج غداء الفريق، ثم انشره.»",
      "«أغلق اختبار ‹مراجعة الفصل الثالث› في Chaos.»",
    ],
    howTitle: "كيف يعمل",
    how: [
      "تربط حسابك مرة واحدة بتسجيل الدخول إلى حسابك في Chaos. وإن كنت جديدًا يُنشأ لك حساب تلقائيًا.",
      "كل ما ينشئه ChatGPT يبدأ مسودة في مكتبتك، ولا يُشارَك شيء حتى تطلب منه النشر.",
      "يستطيع ChatGPT قراءة نماذجك ونتائجها وإجاباتها، لكن عند طلبك فقط. ويستطيع إغلاق النماذج وإعادة فتحها وأرشفتها، لكنه لا يستطيع حذف أي شيء.",
      "الاختبارات تستخدم وضع الاختبار في Chaos: إجابات صحيحة ودرجات وشرح قصير لكل سؤال.",
    ],
    plan: ["Chaos في ChatGPT متاح في ", "كل الخطط", "، ومنها الحسابات الشخصية المجانية. راجع ", "الأسعار", "."],
    privacyTitle: "الخصوصية",
    privacy: ["ما يقرؤه ChatGPT يُرسَل إلى OpenAI. لا تطلب منه قراءة إجابات أفراد إلا إذا كان مسموحًا لك بمشاركتها. راجع ", "سياسة الخصوصية", " لمعرفة التفاصيل."],
    helpTitle: "المساعدة",
    help: ["هل هناك ما لا يعمل؟ راسلنا على ", ". ولفصل الاتصال، أزل Chaos من تطبيقاتك في إعدادات ChatGPT."],
  },
};

export default function ChatGptView() {
  const t = useCopy(copy);
  return (
    <LegalPage title={t.title}>
      <ChatGptMark size={40} className="site-chatgpt-mark" />
      <p>{t.intro}</p>

      <h2>{t.tryTitle}</h2>
      <ul>{t.tries.map((item) => <li key={item}>{item}</li>)}</ul>

      <h2>{t.howTitle}</h2>
      <ul>
        {t.how.map((item) => <li key={item}>{item}</li>)}
        <li>{t.plan[0]}<strong>{t.plan[1]}</strong>{t.plan[2]}<Link href="/pricing">{t.plan[3]}</Link>{t.plan[4]}</li>
      </ul>

      <h2>{t.privacyTitle}</h2>
      <p>{t.privacy[0]}<Link href="/privacy">{t.privacy[1]}</Link>{t.privacy[2]}</p>

      <h2>{t.helpTitle}</h2>
      <p>{t.help[0]}<a href={`mailto:${email}`}>{email}</a>{t.help[1]}</p>
    </LegalPage>
  );
}
