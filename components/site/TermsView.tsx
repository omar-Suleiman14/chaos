"use client";

import Link from "@/components/site/SiteLink";
import LegalPage from "@/components/site/LegalPage";
import { useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

export default function TermsView() {
  const { locale } = useLocale();

  if (locale === "ar") {
    return (
      <LegalPage
        title="الشروط والأحكام"
        updated="٢ أكتوبر ٢٠٢٦"
        draft
      >
        <p>
          تنطبق هذه الشروط عند استخدامك لـ Chaos، سواء كنت تُنشئ نماذج أو اختبارات أو دروسًا أو دورات، أو تجيب عنها، أو تتعلّم منها. باستخدامك لـ Chaos، فإنك توافق على هذه الشروط. إذا كنت لا توافق عليها، يُرجى عدم استخدام الخدمة. لأي استفسارات: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>

        <h2>١. حسابك</h2>
        <ul>
          <li>تحتاج إلى حساب لإنشاء المحتوى. حافظ على أمان بيانات تسجيل دخولك؛ أنت مسؤول عما يحدث تحت حسابك.</li>
          <li>يجب أن تكون في سن قانونية تتيح لك الموافقة على هذه الشروط في مكان إقامتك.</li>
          <li>احرص على تقديم معلومات صحيحة ودقيقة والعمل على تحديثها باستمرار.</li>
        </ul>

        <h2>٢. محتواك</h2>
        <ul>
          <li>أنت تملك النماذج والاختبارات والدروس والدورات والبطاقات والمظاهر التي تنشئها، بالإضافة إلى الإجابات التي تجمعها.</li>
          <li>عندما تنشر محتوى للعامة، فإنك تسمح للآخرين بقراءته والاستفادة منه ونسخه إلى مكتباتهم الخاصة مع الإشارة إليك ككاتب أصلي. احتفظ بالوضع الخاص لأي محتوى لا ترغب في مشاركته أو نسخه.</li>
          <li>لا ترفع أو تشارك إلا المواد التي تملك حق مشاركتها قانونًا. توضح <Link href="/copyright">سياسة حقوق النشر</Link> لدينا كيفية حفظ الحقوق والإسناد وآلية تقديم البلاغات.</li>
          <li>تمنحنا إذنًا بتخزين هذا المحتوى ونسخه وعرضه فقط بالقدر اللازم لتشغيل Chaos من أجلك، مثل إظهار نموذجك للمجيبين.</li>
          <li>إذا أجبت عن نموذج، فإن إجاباتك تذهب إلى منشئ ذلك النموذج، وهو المسؤول الوحيد عن كيفية استخدامها.</li>
        </ul>

        <h2>٣. جمع الإجابات بمسؤولية</h2>
        <p>إذا قمت بإنشاء نماذج، فإنك توافق على ما يلي:</p>
        <ul>
          <li>إخبار المجيبين بهويتك والغرض من جمع البيانات، والالتزام بجميع قوانين الخصوصية المنطبقة عليك.</li>
          <li>الحصول على أي موافقة يفرضها القانون، بما في ذلك موافقة أولياء الأمور أو الأوصياء عند جمع إجابات من الأطفال.</li>
          <li>عدم جمع كلمات المرور أو أرقام بطاقات الدفع أو البيانات شديدة الحساسية إلا بمسوغ قانوني وضمانات كافية ومناسبة.</li>
        </ul>

        <h2>٤. محظورات الاستخدام</h2>
        <ul>
          <li>استخدام Chaos في التصيد الاحتيالي، أو الخداع، أو إرسال الرسائل المزعجة (سبام)، أو انتحال شخصية الآخرين.</li>
          <li>رفع أو جمع محتوى غير قانوني، أو برمجيات خبيثة، أو أي محتوى ينطوي على مضايقة أو تهديد أو استغلال للآخرين.</li>
          <li>محاولة اختراق الخدمة أو زيادة التحميل عليها أو التحايل على تدابير الأمان والحدود المفروضة، أو الوصول إلى بيانات لا تخصك.</li>
          <li>إعادة بيع الخدمة أو نسخها واستغلالها تجاريًا دون إذن صريح منا.</li>
        </ul>
        <p>يجوز لنا إزالة أي محتوى أو تعليق الحسابات التي تخالف هذه القواعد، وسنعمل على إخطارك بذلك متى أمكننا ذلك بصورة معقولة.</p>

        <h2>٥. التطبيقات المتصلة</h2>
        <p>
          يمكنك ربط Max، والمساعدين الأذكياء مثل ChatGPT وClaude، وتطبيقاتك الخاصة عبر واجهة برمجة التطبيقات (API)، وWebhooks. يعمل التطبيق المتصل في حدود الصلاحيات الممنوحة له، وتتحمل أنت مسؤولية الأوامر التي تطلب منه تنفيذها. يبدأ المحتوى الجديد الذي ينشئه المساعد مسودةً خاصة، ولا يُنشر إلا عندما تطلب ذلك. يمكنك إلغاء الربط في أي وقت من صفحة الاتصالات.
        </p>

        <h2>٦. استخدام الأعمال</h2>
        <p>
          الاستخدام الشخصي مجاني تمامًا. الاستخدام للشركات والأعمال مخطط له بسعر 50 جنيهًا مصريًا شهريًا لكل مستخدم ينشئ المحتوى أو يديره؛ ولا يحتاج المجيبون والطلاب ولاعبو المباريات المباشرة إلى حسابات مدفوعة. الدفع الإلكتروني غير متاح بعد ولا يتم خصم أي مبالغ تلقائيًا؛ ويمكن للشركات إعداد حسابات فريقها بالاتصال بالدعم.
        </p>

        <h2>٧. الحدود وتوافر الخدمة</h2>
        <p>
          قد يضع Chaos حدودًا للاستخدام، مثل عدد الردود لكل نموذج أو سعة الملفات المرفوعة. نبذل كل جهد لضمان توافر Chaos وسلامة بياناتك، ولكن الخدمة تُقدَّم «كما هي» وقد تخضع للانقطاع العارض أو التغيير. احرص دائمًا على تصدير نسخ احتياطية من بياناتك التي لا تستغني عنها.
        </p>

        <h2>٨. حدود المسؤولية</h2>
        <p>
          بالقدر الذي يجيزه القانون، لا نتحمل المسؤولية عن أي أضرار غير مباشرة أو تبعية، أو فقدان للبيانات أو الأرباح أو الأعمال، الناشئة عن استخدامك لـ Chaos. لا يوجد في هذه الشروط ما يحد من أي مسؤولية لا يمكن تقييدها قانونًا.
        </p>

        <h2>٩. إنهاء الاستخدام</h2>
        <p>
          يمكنك التوقف عن استخدام Chaos في أي وقت وطلب حذف حسابك. ويجوز لنا تعليق وصولك أو إنهائه في حال مخالفتك الجسيمة أو المتكررة لهذه الشروط.
        </p>

        <h2>١٠. الخصوصية</h2>
        <p>توضح <Link href="/privacy">سياسة الخصوصية</Link> بالتفصيل كيفية تعاملنا مع البيانات الشخصية وحمايتها.</p>

        <h2>١١. التعديلات على الشروط</h2>
        <p>قد نقوم بتحديث هذه الشروط من حين لآخر. إذا كان التغيير جوهريًا فسنحدث تاريخ التعديل أعلاه، وننبه أصحاب الحسابات عبر التطبيق عند الاقتضاء.</p>
      </LegalPage>
    );
  }

  return (
    <LegalPage title="Terms and conditions" updated="October 2, 2026" draft>
      <p>
        These terms apply when you use Chaos, whether you create forms, quizzes, lessons or courses, answer them, or learn from them. By using Chaos you agree to them. If you don&rsquo;t agree,
        please don&rsquo;t use the service. Questions: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>

      <h2>1. Your account</h2>
      <ul>
        <li>You need an account to create content. Keep your sign-in details safe; you&rsquo;re responsible for what happens under your account.</li>
        <li>You must be old enough to agree to these terms where you live.</li>
        <li>Give accurate information and keep it up to date.</li>
      </ul>

      <h2>2. Your content</h2>
      <ul>
        <li>You own the forms, quizzes, lessons, courses, flashcards and themes you create, and the answers you collect.</li>
        <li>When you publish something publicly, you let other people read it, take it, and copy it to their own library with you credited as the original author. Keep anything you don&rsquo;t want copied private.</li>
        <li>Only upload or share material you have the right to share. Our <Link href="/copyright">copyright policy</Link> explains attribution, copies and how reports work.</li>
        <li>You give us permission to store, copy and display that content only as needed to run Chaos for you, for example to show your form to respondents.</li>
        <li>If you answer a form, the answers go to that form&rsquo;s creator, who is responsible for how they are used.</li>
      </ul>

      <h2>3. Collecting answers responsibly</h2>
      <p>If you create forms, you agree to:</p>
      <ul>
        <li>Tell respondents who you are and why you&rsquo;re asking, and follow the privacy laws that apply to you.</li>
        <li>Get any consent the law requires, including from parents or guardians when collecting answers from children.</li>
        <li>Not collect passwords, payment card numbers or other highly sensitive data unless you have a lawful reason and appropriate safeguards.</li>
      </ul>

      <h2>4. Things you must not do</h2>
      <ul>
        <li>Use Chaos for phishing, scams, spam or to impersonate someone else.</li>
        <li>Upload or collect illegal content, malware, or content that harasses, threatens or exploits others.</li>
        <li>Try to break, overload or get around the security or limits of the service, or access data that isn&rsquo;t yours.</li>
        <li>Resell or copy the service without our permission.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules, and we&rsquo;ll tell you when we reasonably can.</p>

      <h2>5. Connected apps</h2>
      <p>
        You can connect Max, assistants such as ChatGPT and Claude, your own apps through the API, and webhooks. A connected app acts with the permissions
        you give it, and you&rsquo;re responsible for what you ask it to do. New content an assistant creates for you starts as a private draft and is published only when you
        ask for it. You can revoke a connection at any time in Connections.
      </p>

      <h2>6. Business use</h2>
      <p>
        Personal use is free. Using Chaos for a business is planned to cost 50 EGP per person who creates or manages content per month; respondents, students and live players
        don&rsquo;t need paid accounts. Checkout isn&rsquo;t available yet and nothing is charged automatically; businesses can set up their team through Support.
      </p>

      <h2>7. Limits and availability</h2>
      <p>
        Chaos may set limits, such as the number of responses per form or the size of uploads. We work to keep Chaos available and your data safe, but the
        service is provided &ldquo;as is&rdquo; and may sometimes be unavailable or change. Export anything you can&rsquo;t afford to lose.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses, or for loss of data, profits or business, arising from your use
        of Chaos. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>9. Ending</h2>
      <p>
        You can stop using Chaos at any time and ask us to delete your account. We may suspend or end access if you seriously or repeatedly break these terms.
      </p>

      <h2>10. Privacy</h2>
      <p>Our <Link href="/privacy">privacy policy</Link> explains how we handle personal data.</p>

      <h2>11. Changes</h2>
      <p>We may update these terms. If a change is significant we&rsquo;ll update the date above and, where appropriate, let account holders know in the app.</p>
    </LegalPage>
  );
}
