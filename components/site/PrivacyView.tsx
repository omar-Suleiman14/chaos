"use client";

import Link from "@/components/site/SiteLink";
import LegalPage from "@/components/site/LegalPage";
import { useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

export default function PrivacyView() {
  const { locale } = useLocale();

  if (locale === "ar") {
    return (
      <LegalPage title="سياسة الخصوصية" updated="٧ أكتوبر ٢٠٢٦" draft>
        <p>
          يتيح Chaos للأشخاص إنشاء النماذج والاختبارات والدروس والدورات والبطاقات التعليمية («المنشئون»)، ويتيح للجميع الإجابة عن النماذج والاختبارات («المجيبون»)، وقراءة المواد المنشورة ودراستها («المتعلمون»). توضح هذه السياسة ما نجمعه من معلومات، وأسباب ذلك، والخيارات المتاحة لك. إذا كان أي بند غير واضح، يُرجى مراسلتنا عبر{" "}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>

        <h2>النسخة المختصرة</h2>
        <ul>
          <li>نحن لا نبيع بياناتك ولا نعرض أي إعلانات.</li>
          <li>لا نستخدم محتواك أو إجاباتك لتدريب نماذج الذكاء الاصطناعي، وChaos نفسه لا يشغّل أي ذكاء اصطناعي. إذا قمت بربط ChatGPT أو Claude، فلن يريا إلا ما تطلب منهما صراحةً التعامل معه (انظر أدناه).</li>
          <li>الإجابات والردود ملك لمنشئ النموذج. وهو من يحدد مدة الاحتفاظ بها ويمكنه حذفها في أي وقت.</li>
          <li>لا تحتاج إلى حساب للإجابة عن أي نموذج ما لم يشترط منشئ النموذج تسجيل الدخول.</li>
        </ul>

        <h2>المعلومات التي نجمعها</h2>
        <h3>إذا أنشأت حسابًا</h3>
        <ul>
          <li><strong>بيانات الحساب</strong>: اسمك، وعنوان بريدك الإلكتروني، واسم المستخدم، وصورة ملفك الشخصي، وتتم إدارتها عبر مزود تسجيل الدخول لدينا، Clerk.</li>
          <li><strong>محتواك</strong>: النماذج، والاختبارات، والدروس، والدورات، والبطاقات، والمظاهر، والقوالب، والتعليقات، والإعدادات التي تنشئها، وملفات المصادر التي ترفعها إلى الدروس، ومن تشاركهم إياها.</li>
          <li><strong>النسخ</strong>: عند نسخك لدرس أو اختبار عام، نسجل مصدره لضمان بقاء الإسناد للكاتب الأصلي.</li>
          <li><strong>النشاط</strong>: سجلات مثل تاريخ نشر النموذج أو تعديله، حتى يتمكن المتعاونون من متابعة سجل التغييرات.</li>
        </ul>
        <h3>إذا أجبت عن نموذج</h3>
        <ul>
          <li><strong>إجاباتك</strong>، بما فيها أي ملفات ترفعها، واللغة المستخدمة، وتوقيت بدء الإجابة وإرسالها.</li>
          <li>إذا كان النموذج يشترط تسجيل الدخول، يُربط <strong>معرّف حسابك</strong> بإجابتك، للسماح مثلًا برد واحد لكل شخص.</li>
          <li>إذا فعّل المنشئ حفظ الإجابات غير المكتملة، فقد <strong>تُحفظ إجاباتك قبل الإرسال النهائي</strong>. يُنبهك النموذج بوضوح عند تفعيل هذه الخاصية.</li>
          <li><strong>إشارات تقنية</strong> أساسية لمنع الرسائل المزعجة والاحتيال، مثل سرعة إكمال النموذج وعدادات الحد من المعدل قصيرة الأجل.</li>
        </ul>
        <h3>إذا كنت تتعلّم على Chaos</h3>
        <ul>
          <li>عند تسجيل دخولك، يُحفظ <strong>تقدّمك</strong> في الدروس والدورات، وإجاباتك على الاختبارات المرفقة، ومراجعات البطاقات، ونقاط الضعف المستخلصة منها. هذه البيانات خاصة بك وحدك.</li>
          <li>الدروس التي <strong>تحفظها</strong>، وأي <strong>بلاغات</strong> أو تعليقات تنشرها. تظهر التعليقات على الدروس العامة لجميع القراء الآخرين.</li>
          <li><strong>التظليلات والملاحظات</strong> تُحفظ محليًا على جهازك الخاص ولا تظهر لأي شخص آخر.</li>
          <li>طلبات <strong>التوثيق</strong> غير مفعلة بعد؛ ولا يتم جمع أي بيانات بشأنها حاليًا.</li>
        </ul>
        <h3>البيانات المخزنة على جهازك</h3>
        <p>
          يستخدم Chaos التخزين المحلي لمتصفحك (Local Storage) لحفظ تفضيلات المظهر الفاتح/الداكن، وتشغيل الأصوات أو كتمها، وتقدّمك في النموذج حتى لا تفقد إجاباتك إذا أغلقت الصفحة دون قصد. يستخدم Clerk ملفات تعريف الارتباط (Cookies) لإبقائك قيد تسجيل الدخول. نحن لا نستخدم إطلاقًا ملفات تعريف ارتباط إعلانية أو لتتبعك عبر المواقع.
        </p>

        <p>تعمل تحليلات PostHog الاختيارية فقط بعد السماح بها. يمكنك رفضها أو سحب الموافقة من إعدادات ملفات تعريف الارتباط. اقرأ <Link href="/cookies">سياسة ملفات تعريف الارتباط والتخزين</Link> للتفاصيل وخيارات التحكم.</p>
        <h2>كيف نستخدم المعلومات</h2>
        <ul>
          <li>لتشغيل Chaos: عرض النماذج، وتسجيل الإجابات، وحساب درجات الاختبارات، وعرض النتائج للمنشئين.</li>
          <li>للحفاظ على الأمان: منع الرسائل الاحتيالية والمزعجة، وتطبيق حدود الاستخدام، والتحقيق في أي إساءة استخدام.</li>
          <li>لإرسال إشعارات داخل التطبيق للمنشئين، مثل وصول رد جديد.</li>
          <li>للربط مع Max حين يختار المنشئ ذلك. لا يتلقى Max سوى هياكل النماذج التي يحددها المنشئ وأعداد ملخصة مصرح بها، ولا يتلقى إجابات فردية إطلاقًا.</li>
          <li>للعمل مع ChatGPT أو Claude أو أي مساعد متوافق عند قيامك بربطه (انظر أدناه).</li>
          <li>لإرسال أحداث Webhooks إلى العناوين التي يحددها المنشئ. توضح الأحداث ما حدث (مثل وصول رد جديد) وتتضمن أعدادًا وإحصائيات دون تفاصيل الإجابات.</li>
          <li>لإنشاء بطاقة Google Wallet لبطاقة عضويتك عند طلبك. تتضمن البطاقة ما يظهر على بطاقتك العامة وتتم معالجتها بعد ذلك لدى Google.</li>
        </ul>

        <h2>من يمكنه رؤية الإجابات</h2>
        <p>
          يستطيع مالك النموذج والمتعاونون الذين يدعوهم الاطلاع على الردود. المنشئون مسؤولون عن كيفية استخدام الإجابات التي يجمعونها، ويجب عليهم توضيح سبب الجمع للمجيبين. تُحجب المجموعات الصغيرة في الملخصات المرسلة إلى Max حتى لا يمكن تحديد هوية الأفراد.
        </p>

        <h2>استخدام Chaos من ChatGPT أو Claude</h2>
        <p>
          يمكنك ربط حسابك في Chaos بـ ChatGPT أو Claude أو أي مساعد يدعم بروتوكول MCP. تسجل الدخول بحسابك في Chaos وتوافق على الربط؛ ويمكنك إلغاء الاتصال في أي وقت من إعدادات المساعد أو عبر لوحة الاتصالات في Chaos.
        </p>
        <ul>
          <li>يستطيع المساعد إنشاء النماذج والاختبارات والدروس والدورات والبطاقات وتعديلها ونشرها، وقراءة محتواك ونتائجك وإجاباتك، ولكن فقط عند طلبك منه ذلك. تبدأ الأشياء الجديدة التي ينشئها مسودات خاصة، ولا تُنشر إلا عندما تطلب ذلك.</li>
          <li>ما يقرؤه المساعد (مثل ملخص النتائج أو الإجابات التي تطلب منه تحليلها) يُرسل إلى مزود المساعد ويخضع لسياسة الخصوصية الخاصة به، مثل سياسة <a href="https://openai.com/policies/privacy-policy">OpenAI</a> أو سياسة <a href="https://www.anthropic.com/legal/privacy">Anthropic</a>. لا تطلب منه قراءة إجابات فردية إلا إذا كان مصرحًا لك بمشاركتها.</li>
          <li>أزرار <strong>اسأل ChatGPT / اسأل Claude</strong> في الدروس تفتح المساعد مع نص الدرس أو الجزء المحدد منه. لا يُرسل أي شيء حتى تختار ذلك بنفسك.</li>
          <li>لا يرسل Chaos إجابات المجيبين تلقائيًا إلى أي مساعد، ولا تستطيع المساعدات حذف النماذج أو الإجابات.</li>
          <li>أي عنصر ينشئه المساعد يُسجل في تاريخ التعديلات على أنه أُنشئ عبر تطبيق متصل.</li>
        </ul>

        <h2>مزودو الخدمات</h2>
        <p>نعتمد على عدد محدود من مزودي الخدمات الموثوقين لتشغيل Chaos، والذين يعالجون البيانات نيابة عنا فقط وفق معايير مشددة:</p>
        <ul>
          <li><strong>Clerk</strong> لإدارة تسجيل الدخول والحسابات.</li>
          <li><strong>Convex</strong> لقاعدة البيانات وتخزين الملفات والدوال السحابية.</li>
          <li><strong>Vercel</strong> لاستضافة الموقع وتشغيله.</li>
          <li><strong>PostHog</strong> لتحليلات الاستخدام الاختيارية بعد موافقتك (عند تهيئتها): مثل الصفحات التي تتم زيارتها (مع حذف الروابط والأسماء والرموز من العنوان)، وبعض الأحداث البرمجية والأخطاء، دون تسجيل أي إجابات مطلقًا.</li>
          <li><strong>Vercel Speed Insights</strong> على chaos.fail بعد السماح بالتحليلات فقط: سرعة تحميل الصفحات (مؤشرات الويب الأساسية) مع نمط مسار الصفحة بدل عنوانها. بلا ملفات تعريف ارتباط أو تخزين في المتصفح.</li>
        </ul>

        <h2>مدة الاحتفاظ بالبيانات</h2>
        <ul>
          <li>يمكن للمنشئين تحديد مدة استبقاء الردود لكل نموذج؛ وتُحذف الردود الأقدم تلقائيًا عند انقضاء المدة.</li>
          <li>حذف أي نموذج يؤدي إلى حذف كامل إجاباته وملفاته المرفوعة وتاريخه.</li>
          <li>تنتهي صلاحية روابط متابعة الإجابات غير المكتملة بعد 30 يومًا. وتُحذف الملفات المرفوعة التي لم تُعتمد ضمن رد مُرسل تلقائيًا.</li>
          <li>لطلب إغلاق حسابك أو نسخة من بياناته، راسلنا من عنوان حسابك. تُراجع الطلبات يدويًا بعد التحقق من هويتك وتحديد البيانات المشمولة. قد يلزم الاحتفاظ ببعض السجلات لأسباب قانونية أو لارتباطها بمحتوى منشور؛ سنوضح لك نطاق الطلب قبل اتخاذ إجراء.</li>
        </ul>

        <h2>خياراتك وحقوقك</h2>
        <p>
          <a href={`mailto:${supportEmail}?subject=${encodeURIComponent("Chaos account data request")}`}>اطلب نسخة من بيانات حسابك</a>{" · "}
          <a href={`mailto:${supportEmail}?subject=${encodeURIComponent("Chaos account closure request")}`}>اطلب إغلاق حسابك</a>.
          {" "}هذه الروابط تفتح رسالة بريد؛ لا تحذف أي بيانات تلقائيًا. لطلبات إجابات نموذج يملكه شخص آخر، تواصل مع منشئه أولًا.
        </p>
        <p>
          يمكنك عرض نماذجك وإجاباتك وتعديلها وتصديرها وحذفها من لوحة التحكم في أي وقت. وبحسب محل إقامتك، قد تتمتع أيضًا بالحق في الوصول إلى بياناتك الشخصية، أو تصحيحها، أو حذفها، أو استلام نسخة منها، أو الاعتراض على كيفية معالجتها. إذا أجبت عن نموذج يملكه شخص آخر، يُرجى التواصل مع ذلك المنشئ أولًا لأنه المتحكم في تلك الإجابات؛ وسنساعدك في حال تعذر الوصول إليه. راسلنا عبر{" "}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a> لأي طلب أو استفسار.
        </p>

        <h2>الأطفال والطلاب</h2>
        <p>
          الحسابات مخصصة للأشخاص المؤهلين قانونًا للموافقة على هذه الشروط في بلدانهم. المعلمون وغيرهم ممن يجمعون إجابات من الأطفال يتحملون مسؤولية الحصول على الموافقات القانونية اللازمة من أولياء الأمور وعدم جمع أي بيانات تزيد عن الحاجة الفعلية.
        </p>

        <h2>الأمان</h2>
        <p>
          يتم تشفير كافة البيانات أثناء النقل (In Transit). تُحفظ الروابط الخاصة (مثل روابط التعديل والمتابعة) ورموز الاتصال فقط كقيم تجزئة آمنة مشفرة (Hashes). نظرًا لعدم وجود نظام آمن بنسبة مئة بالمئة، يُرجى عدم جمع بيانات حساسة مثل كلمات المرور أو أرقام بطاقات الدفع في النماذج.
        </p>

        <h2>التعديلات على السياسة</h2>
        <p>إذا أجرينا أي تعديلات جوهرية على هذه السياسة، فسنحدّث تاريخ التعديل أعلاه، وننبه أصحاب الحسابات عبر التطبيق عند الاقتضاء.</p>
      </LegalPage>
    );
  }

  return (
    <LegalPage title="Privacy policy" updated="October 7, 2026" draft>
      <p>
        Chaos lets people create forms, quizzes, lessons, courses and flashcards (&ldquo;creators&rdquo;), lets anyone answer forms and quizzes (&ldquo;respondents&rdquo;), and lets people read and study published material (&ldquo;learners&rdquo;).
        This policy explains what we collect, why, and the choices you have. If something here is unclear, email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>We don&rsquo;t sell your data and we don&rsquo;t show ads.</li>
        <li>We don&rsquo;t use your content or answers to train AI models, and Chaos runs no AI itself. If you connect ChatGPT or Claude, they see only what you ask them to work with (see below).</li>
        <li>Answers belong to the creator of the form. The creator decides how long they are kept and can delete them at any time.</li>
        <li>You don&rsquo;t need an account to answer a form unless its creator asks you to sign in.</li>
      </ul>

      <h2>Information we collect</h2>
      <h3>If you create an account</h3>
      <ul>
        <li><strong>Account details</strong>: your name, email address, username and profile picture, handled by our sign-in provider, Clerk.</li>
        <li><strong>Your content</strong>: the forms, quizzes, lessons, courses, flashcards, themes, templates, comments and settings you create, the source files you upload to lessons, and who you share them with.</li>
        <li><strong>Copies</strong>: when you copy a public lesson or quiz, we record where it came from so the original author stays credited.</li>
        <li><strong>Activity</strong>: records such as when a form was published or edited, so collaborators can see its history.</li>
      </ul>
      <h3>If you answer a form</h3>
      <ul>
        <li><strong>Your answers</strong>, including any files you upload, the language you used, and when you started and submitted.</li>
        <li>If the form requires sign-in, your <strong>account ID</strong> is linked to your answer, for example to allow one response per person.</li>
        <li>If the creator turns on unfinished answers, what you type may be <strong>saved before you submit</strong>. The form tells you when this is on.</li>
        <li>Basic <strong>technical signals</strong> used to prevent spam and abuse, such as how fast a form was completed and short-lived rate-limit counters.</li>
      </ul>
      <h3>If you learn on Chaos</h3>
      <ul>
        <li>When you&rsquo;re signed in, your <strong>progress</strong> through lessons and courses, your answers to attached quizzes, flashcard reviews and the weak areas worked out from them. These are private to you.</li>
        <li>Lessons you <strong>save</strong>, and any <strong>reports</strong> or comments you post. Comments on public lessons are visible to other readers.</li>
        <li><strong>Highlights and notes</strong> are kept on your own device and are not shown to anyone else.</li>
        <li><strong>Verification</strong> requests aren&rsquo;t open yet; nothing is collected for them.</li>
      </ul>
      <h3>Stored on your own device</h3>
      <p>
        Chaos uses your browser&rsquo;s local storage for your light/dark preference, whether sounds are on, and your progress on a form so you
        don&rsquo;t lose answers if you close the page. Clerk uses cookies to keep you signed in. We don&rsquo;t use advertising or cross-site tracking cookies.
      </p>

      <p>Optional PostHog analytics runs only after you choose Allow analytics. You can reject it or withdraw consent through Cookie settings. Read our <Link href="/cookies">cookie and browser storage policy</Link> for storage details and controls.</p>
      <h2>How we use information</h2>
      <ul>
        <li>To run Chaos: show forms, record answers, calculate quiz scores and show results to creators.</li>
        <li>To keep it safe: prevent spam, enforce limits and investigate abuse.</li>
        <li>To send in-app notifications to creators, for example when a response arrives.</li>
        <li>To connect with Max when a creator chooses to. Max receives only the form definitions the creator selects and permitted summary numbers, never individual answers.</li>
        <li>To work with ChatGPT, Claude or another assistant when you connect it (see below).</li>
        <li>To send webhook events to an address a creator sets up. Events say what happened (for example that a response arrived) and contain counts, not answers.</li>
        <li>To make a Google Wallet pass of your member card when you ask. The pass holds what your public card shows and is then handled by Google.</li>
      </ul>

      <h2>Who can see answers</h2>
      <p>
        The form&rsquo;s owner and the collaborators they invite can see responses. Creators are responsible for how they use the answers they collect,
        and should tell respondents why they are asking. Small groups are hidden in summaries sent to Max so individuals can&rsquo;t be singled out.
      </p>

      <h2>Using Chaos from ChatGPT or Claude</h2>
      <p>
        You can connect your Chaos account to ChatGPT, Claude or another assistant that supports MCP. You sign in with your Chaos account and approve the connection;
        you can disconnect it at any time in the assistant&rsquo;s settings, or ask us to revoke it.
      </p>
      <ul>
        <li>The assistant can create, edit and publish forms, quizzes, lessons, courses and flashcards, and read your content, results and responses, only when you ask it to. New things it creates start as private drafts and are published only when you ask.</li>
        <li>What the assistant reads (for example a results summary or the answers you ask it to look at) is sent to its provider and handled under their policy, such as{" "}
          <a href="https://openai.com/policies/privacy-policy">OpenAI&rsquo;s</a> or <a href="https://www.anthropic.com/legal/privacy">Anthropic&rsquo;s</a>. Only ask it to read individual answers when you are allowed to share them.</li>
        <li><strong>Ask ChatGPT / Ask Claude</strong> buttons in lessons open the assistant with the lesson text or your selection. Nothing is sent until you choose to.</li>
        <li>Chaos never sends respondents&rsquo; answers to an assistant on its own, and assistants cannot delete forms or responses.</li>
        <li>Anything an assistant creates is marked in its history as made by a connected app.</li>
      </ul>

      <h2>Service providers</h2>
      <p>We use a small number of providers to run Chaos. They process data only on our behalf:</p>
      <ul>
        <li><strong>Clerk</strong> for sign-in and account management.</li>
        <li><strong>Convex</strong> for the database, file storage and server functions.</li>
        <li><strong>Vercel</strong> for hosting the website.</li>
        <li><strong>PostHog</strong> for optional product analytics when configured and you consent: which pages are visited (with links, names and codes removed from the address, so a form link is recorded only as “a form”), a few named events and errors, never answers. It keeps an anonymous id in your browser’s local storage, not a cookie. When you are signed in, these are linked to your account id (not your email or name); people answering forms stay anonymous.</li>
        <li><strong>Vercel Speed Insights</strong> on chaos.fail, only after you allow analytics: page load speed (Core Web Vitals) with the page’s route pattern instead of its address. No cookies or browser storage.</li>
      </ul>

      <h2>How long we keep data</h2>
      <ul>
        <li>Creators can set a retention period on each form; older responses are then deleted automatically.</li>
        <li>Deleting a form deletes its responses, uploads and history.</li>
        <li>Unfinished resume links expire after 30 days. Uploads that are never attached to a submitted answer are removed automatically.</li>
        <li>To request account closure or a copy of account data, email us from your account address. Requests are handled manually after identity and scope checks. Some records may need preservation for legal reasons or because published content references them; we will explain the scope before taking action.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        <a href={`mailto:${supportEmail}?subject=${encodeURIComponent("Chaos account data request")}`}>Request a copy of account data</a>{" · "}
        <a href={`mailto:${supportEmail}?subject=${encodeURIComponent("Chaos account closure request")}`}>Request account closure</a>.
        {" "}These links open an email request and do not delete data automatically. For answers to another person&rsquo;s form, contact that creator first.
      </p>
      <p>
        You can view, edit, export and delete your forms and responses from your dashboard. Depending on where you live, you may also have the right to
        access, correct, delete or receive a copy of your personal data, or to object to how it is used. If you answered someone else&rsquo;s form, contact
        that creator first, since they control those answers; we will help if you can&rsquo;t reach them. Email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a> for any request.
      </p>

      <h2>Children</h2>
      <p>
        Accounts are for people old enough to agree to these terms where they live. Teachers and others who collect answers from children are responsible
        for getting any consent the law requires and for collecting no more than they need.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Private links (such as edit and resume links) and connection tokens are stored only as secure hashes. No system is
        perfectly secure, so please don&rsquo;t collect sensitive information like passwords or payment card numbers in a form.
      </p>

      <h2>Changes</h2>
      <p>If we make significant changes to this policy we&rsquo;ll update the date above and, where appropriate, let account holders know in the app.</p>
    </LegalPage>
  );
}
