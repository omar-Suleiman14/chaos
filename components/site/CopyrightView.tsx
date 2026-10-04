"use client";

import Link from "@/components/site/SiteLink";
import LegalPage from "@/components/site/LegalPage";
import { useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

export default function CopyrightView() {
  const { locale } = useLocale();

  if (locale === "ar") {
    return (
      <LegalPage title="سياسة حقوق النشر" updated="٢ أكتوبر ٢٠٢٦" draft>
        <p>
          يتيح Chaos للأشخاص مشاركة الدروس والدورات والاختبارات والبطاقات التعليمية والملفات. توضح هذه الصفحة ما يحق لك مشاركته، وكيفية الإسناد وحفظ الحقوق، وما يحدث عند الإبلاغ عن مشكلة متعلقة بحقوق النشر. لأي استفسارات: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>

        <h2>١. شارك فقط ما يحق لك مشاركته</h2>
        <ul>
          <li>لا ترفع أو تنشر أي مادة إلا إذا كنت أنت من أنشأها، أو حصلت على إذن رسمي من صاحب الحقوق، أو كان القانون أو رخصة الاستخدام تتيح لك مشاركتها.</li>
          <li>رفع مادة إلى Chaos لا يعني نقل حقوق ملكيتها الفكرية. أنت تحتفظ بكامل حقوقك، ويحتفظ المالك الأصلي بحقوقه كاملة.</li>
          <li>المحتوى المتاح للعامة على الإنترنت لا يعني بالضرورة أنه في الملك العام (Public Domain)؛ فالصفحات والشرائح ومقاطع الفيديو التي تجدها على الشبكة تعود في الغالب لملكية أصحابها.</li>
          <li>الدروس الخاصة وملفات المصادر تخضع أيضًا لضوابط حقوق النشر؛ فالوضع الخاص يقتصر فقط على تحديد من يمكنه رؤيتها.</li>
        </ul>

        <h2>٢. الإسناد وحفظ الحقوق</h2>
        <ul>
          <li>احرص دائمًا على ذكر المصدر ومؤلفه عند استخدام أعمال الآخرين. توفر الدروس لوحة مخصصة للمصادر والاستشهادات لهذا الغرض.</li>
          <li>عندما تنسخ درسًا أو اختبارًا عامًا إلى مكتبتك، يسجل Chaos مصدر المادة ويضمن بقاء اسم الكاتب الأصلي بارزًا. لا تحذف أو تخفِ هذا الإسناد.</li>
          <li>نسخ اختبار شخص آخر لا يتضمن مفتاح إجاباته الخاصة. إذا أعدت نشر نسخة منسوخة، فيجب أن تكون المواد الواردة فيها مصرحًا لك بمشاركتها قانونًا.</li>
        </ul>

        <h2>٣. الإبلاغ عن مشكلة في حقوق النشر</h2>
        <p>إذا كنت تعتقد أن مادة منشورة على Chaos تنتهك حقوق النشر الخاصة بك:</p>
        <ul>
          <li>استخدم زر <strong>إبلاغ</strong> على الدرس أو الدورة أو التعليق واختر <strong>حقوق النشر</strong>، أو راسلنا عبر <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</li>
          <li>ضمّن في البلاغ رابط المادة المعنية، والعمل الأصلي المنتهك، ومعلومات الاتصال بك. وبيّن ما إذا كنت مالك الحقوق أو وكيلًا مفوضًا عنه.</li>
          <li>لا تبلغ إلا عن المواد التي تعتقد بحسن نية أنها منتهكة للحقوق. البلاغات الكيدية أو غير الصحيحة قد تؤدي إلى تقييد حساب المبلّغ.</li>
        </ul>

        <h2>٤. الإجراءات التالية للبلاغ</h2>
        <ul>
          <li>نقوم بمراجعة كل بلاغ بعناية. وأثناء المراجعة، قد نقوم بإخفاء المادة أو تقييد الوصول إليها مؤقتًا.</li>
          <li>نخطر المنشئ بما تم الإبلاغ عنه، دون مشاركة بيانات الاتصال الخاصة بالمبلّغ ما لم يفرض القانون خلاف ذلك.</li>
          <li>إذا ثبتت صحة البلاغ، تظل المادة محجوبة أو تُحذف نهائيًا. وإن لم تثبت صحته، نعيد إتاحتها للمشاهدة.</li>
        </ul>

        <h2>٥. إذا قُيّد المحتوى الخاص بك</h2>
        <p>
          يمكن للمنشئين الرد أو الاستئناف بالرد على رسالتنا أو مراسلتنا عبر <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. وضّح في رسالتك سبب أحقيتك في مشاركة المحتوى، كأن يكون من عملك الخاص، أو بموجب رخصة صريحة، أو بإذن كتابي. سنراجع الاستئناف ونخطرك بالقرار.
        </p>

        <h2>٦. التكرار والمخالفات المستمرة</h2>
        <p>
          الحسابات التي تكرر مشاركة مواد لا تملك حق نشرها قد يُحذف محتواها، أو يُقيّد حقها في النشر، أو يتم تعليق الحساب نهائيًا.
        </p>

        <h2>٧. معلومات ذات صلة</h2>
        <p>
          يُرجى مراجعة <Link href="/terms">الشروط والأحكام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>. الشيفرة المصدرية لمنصة Chaos مفتوحة المصدر بموجب رخصة AGPL-3.0؛ وتنطبق هذه الرخصة على البرمجيات ذاتها، وليس على المحتوى الذي ينشره وينشره المستخدمون عليها.
        </p>
      </LegalPage>
    );
  }

  return (
    <LegalPage title="Copyright policy" updated="October 2, 2026" draft>
      <p>
        Chaos lets people share lessons, courses, quizzes, flashcards and files. This page explains what you may share, how credit works, and what happens
        when someone reports a copyright problem. Questions: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>

      <h2>1. Share only what you have the right to share</h2>
      <ul>
        <li>Upload or publish material only if you made it, you have permission, or the law or its licence allows you to share it.</li>
        <li>Uploading something to Chaos doesn&rsquo;t transfer its copyright. You keep whatever rights you had, and so does the original owner.</li>
        <li>Publicly available doesn&rsquo;t mean public domain. A page, slide deck or video you found online usually still belongs to someone.</li>
        <li>Private lessons and source files still need to respect copyright; private only limits who can see them.</li>
      </ul>

      <h2>2. Credit and attribution</h2>
      <ul>
        <li>Keep the source and its author when you use someone else&rsquo;s work. Lessons have a Sources panel and citations for this.</li>
        <li>When you copy a public lesson or quiz to your library, Chaos records where it came from and keeps the original author credited. Don&rsquo;t remove or hide that credit.</li>
        <li>A copy of someone else&rsquo;s quiz doesn&rsquo;t include their answer key. If you republish a copy, the material in it must still be yours to share.</li>
      </ul>

      <h2>3. Reporting a copyright problem</h2>
      <p>If you believe material on Chaos infringes your copyright:</p>
      <ul>
        <li>Use <strong>Report</strong> on the lesson, course or comment and choose <strong>Copyright</strong>, or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</li>
        <li>Include a link to the material, what work you believe it copies, and how we can contact you. Say whether you own the rights or act for the owner.</li>
        <li>Only report material you believe in good faith is infringing. False reports can lead to restrictions on the reporting account.</li>
      </ul>

      <h2>4. What happens next</h2>
      <ul>
        <li>We review each report. While we do, we may temporarily hide or restrict the material.</li>
        <li>We tell the creator what was reported, without sharing the reporter&rsquo;s private contact details unless the law requires it.</li>
        <li>If the report holds up, the material stays hidden or is removed. If it doesn&rsquo;t, we restore it.</li>
      </ul>

      <h2>5. If your material was restricted</h2>
      <p>
        Creators can respond or appeal by replying to our message or emailing <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Explain why you have the
        right to share it, for example your own work, a licence or permission. We&rsquo;ll review the appeal and tell you the outcome.
      </p>

      <h2>6. Repeated problems</h2>
      <p>Accounts that repeatedly share material they don&rsquo;t have the right to share may have content removed, publishing limited, or the account suspended.</p>

      <h2>7. Related</h2>
      <p>
        See the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>. Chaos&rsquo;s own source code is open source under the
        AGPL-3.0 licence; that licence covers the software, not the content people publish with it.
      </p>
    </LegalPage>
  );
}
