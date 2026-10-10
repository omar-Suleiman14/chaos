"use client";

import LegalPage from "./LegalPage";
import Link from "./SiteLink";
import { CookieSettingsButton } from "@/components/CookieConsent";
import { useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

export default function CookiesView() {
  const { locale } = useLocale();
  if (locale === "ar") return <LegalPage title="سياسة ملفات تعريف الارتباط والتخزين" updated="٧ أكتوبر ٢٠٢٦" draft>
    <p>توضح هذه السياسة استخدام Chaos لملفات تعريف الارتباط والتخزين المحلي وتخزين الجلسة في متصفحك. يمكنك استخدام الخدمة دون السماح بالتحليلات الاختيارية.</p>
    <h2>التخزين اللازم للخدمة التي تطلبها</h2>
    <ul>
      <li><strong>تسجيل الدخول والأمان:</strong> يستخدم Clerk، أو Better Auth في النسخ التي تختاره، ملفات تعريف ارتباط للجلسة والتحقق من تسجيل الدخول. تحدد خدمة تسجيل الدخول مدة صلاحيتها، وقد تنتهي بتسجيل الخروج أو انتهاء الجلسة.</li>
      <li><strong>اللغة:</strong> يتذكر ملف <code>chaos-lang</code> اللغة التي تختارها لمدة تصل إلى سنة.</li>
      <li><strong>اختيار الخصوصية:</strong> يحفظ ملف <code>chaos-consent</code> السماح بالتحليلات أو رفضها، ووقت الاختيار ونسخة إعداداته، لمدة 180 يومًا. لا يحتوي على اسمك أو إجاباتك. عند انتهاء المدة نطلب اختيارك مجددًا وتظل التحليلات متوقفة.</li>
      <li><strong>التفضيلات والعمل المحفوظ:</strong> يحفظ التخزين المحلي المظهر والصوت ومسودات الإجابات وتقدم التعلم على الجهاز ونسخًا مؤقتة من مساحة العمل. يُستخدم تخزين الجلسة لبعض حالات النماذج. تبقى بعض هذه البيانات حتى تعيد ضبطها أو تمسح تخزين المتصفح؛ وتُمسح نسخ مساحة العمل المرتبطة بالحساب عند تسجيل الخروج.</li>
    </ul>
    <h2>تحليلات PostHog الاختيارية</h2>
    <p>إذا كانت التحليلات مهيأة وسمحت بها، نستخدم PostHog لفهم زيارات الصفحات وبعض أحداث الاستخدام والأخطاء وأوقات التحميل. تُنقّح عناوين الصفحات لإزالة الروابط الخاصة والأسماء والرموز. لا نرسل إجابات النماذج أو نصوص الأسئلة ضمن هذه التحليلات، ولا نفعّل التسجيل المرئي للجلسات أو الالتقاط التلقائي للنقرات والمدخلات.</p>
    <p>يستخدم PostHog التخزين المحلي، بما في ذلك مفاتيح تبدأ بـ <code>ph_</code>، لحفظ معرّفات الزيارة والجهاز والجلسة. نربط أحداث الحساب بمعرّف الحساب عند تسجيل الدخول، دون الاسم أو البريد الإلكتروني. لا تُحمّل مكتبة PostHog ولا تُرسل أحداث قبل السماح، ولا نعيد إرسال أحداث حدثت قبل اختيارك. عند الرفض أو سحب الموافقة تتوقف التحليلات وتُزال معرّفات هذا المشروع من متصفحك. لا يحذف ذلك أحداثًا أُرسلت بالفعل.</p>
    <p>على chaos.fail (المستضاف على Vercel)، يؤدي السماح بالتحليلات أيضًا إلى تفعيل Vercel Speed Insights لقياس سرعة تحميل الصفحات (مؤشرات الويب الأساسية). يسجّل نمط مسار الصفحة، مثل «نموذج»، وليس العنوان الحقيقي، ولا يضع ملفات تعريف ارتباط أو بيانات في تخزين المتصفح. لا يُحمّل قبل السماح بالتحليلات، ولا تحمّله نسخ Chaos المستضافة ذاتيًا.</p>
    <h2>إدارة اختيارك</h2>
    <p>زرّا السماح والرفض متاحان في إشعار الخصوصية. يمكنك تغيير اختيارك في أي وقت من «إعدادات ملفات تعريف الارتباط» في تذييل الموقع، أو من «ملفات تعريف الارتباط والتحليلات» في إعدادات لوحة التحكم، أو من الزر أدناه. نحترم إشارة عدم التتبع وGlobal Privacy Control بإبقاء التحليلات متوقفة. إذا حظر المتصفح حفظ الاختيار، فقد نطلبه مجددًا في الزيارة التالية.</p>
    <p><CookieSettingsButton className="ws-btn ws-btn--sm" /></p>
    <p>يمكن مشاركة ملف الاختيار بين نطاقات Chaos الفرعية المهيأة. يظل التخزين المحلي خاصًا بكل نطاق؛ افتح إعدادات الملفات على النطاق المعني لمسح معرّفات التحليلات فيه. يمكنك أيضًا حذفها عبر إعدادات المتصفح. حذف بيانات المتصفح قد يزيل مسودات الإجابات والتقدم المحفوظ على الجهاز ويسجّلك خارج الحساب.</p>
    <h2>الإعلانات والخدمات الخارجية</h2>
    <p>لا نستخدم ملفات تعريف ارتباط إعلانية أو شبكات تتبع إعلاني. إذا فتحت خدمة خارجية أو محتوى مضمنًا تابعًا لها، تحكم سياسة تلك الخدمة تخزينها؛ لا تسمح موافقتك هنا بتحليلات أي موقع خارجي.</p>
    <p>للمزيد اقرأ <Link href="/privacy">سياسة الخصوصية</Link>. للاستفسار أو طلب التعامل مع بيانات أُرسلت سابقًا، تواصل عبر <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
  </LegalPage>;
  return <LegalPage title="Cookie and browser storage policy" updated="October 7, 2026" draft>
    <p>This policy explains how Chaos uses cookies, local storage and session storage in your browser. You can use the service without allowing optional analytics.</p>
    <h2>Storage for the service you request</h2>
    <ul>
      <li><strong>Sign-in and security:</strong> Clerk, or Better Auth on deployments that choose it, uses cookies to maintain and verify your session. The sign-in provider controls their lifetime; they may expire on sign-out or when the session ends.</li>
      <li><strong>Language:</strong> <code>chaos-lang</code> remembers your chosen language for up to one year.</li>
      <li><strong>Privacy choice:</strong> <code>chaos-consent</code> stores your analytics choice, the time you chose and the settings version for 180 days. It contains no name or answers. After expiry, we ask again and analytics stays off.</li>
      <li><strong>Preferences and saved work:</strong> local storage holds appearance and sound preferences, answer drafts, device learning progress and cached workspace results. Session storage holds some form state. Some data remains until you reset it or clear browser storage; account workspace caches are cleared on sign-out.</li>
    </ul>
    <h2>Optional PostHog analytics</h2>
    <p>When analytics is configured and you allow it, PostHog measures page visits, selected usage events, errors and loading times. Page addresses are cleaned to remove private links, names and codes. We do not send form answers or question text in these analytics, and session replay and automatic capture of clicks and inputs are disabled.</p>
    <p>PostHog uses local storage, including keys beginning <code>ph_</code>, for visitor, device and session identifiers. Signed-in account events are linked to your account ID, without your name or email. We do not load PostHog or send events before you allow it, and we do not replay events from before your choice. Rejecting or withdrawing consent stops analytics and removes this project’s browser identifiers. It does not delete events already sent.</p>
    <p>On chaos.fail (hosted on Vercel), allowing analytics also turns on Vercel Speed Insights, which measures how fast pages load (Core Web Vitals). It records the page’s route pattern, such as “a form”, never the real address, and sets no cookies or browser storage. It does not load before you allow analytics, and self-hosted Chaos never loads it.</p>
    <h2>Control your choice</h2>
    <p>The privacy notice offers both Allow analytics and Reject analytics. Change your choice at any time using Cookie settings in the site footer, Cookies and analytics in dashboard Settings, or the button below. Do Not Track and Global Privacy Control signals keep analytics off. If your browser blocks saving the choice, we may ask again on your next visit.</p>
    <p><CookieSettingsButton className="ws-btn ws-btn--sm" /></p>
    <p>The choice cookie may be shared across configured Chaos subdomains. Local storage belongs to each origin; open Cookie settings on the relevant origin to remove analytics identifiers there, or clear them in your browser. Clearing browser data can also remove answer drafts and device progress and sign you out.</p>
    <h2>Advertising and external services</h2>
    <p>We do not use advertising cookies or advertising tracking networks. If you open an external service or its embedded content, that service’s policy governs its storage. Your choice here does not grant analytics consent to an external site.</p>
    <p>Read our <Link href="/privacy">privacy policy</Link> for other data practices. For questions or requests about previously sent data, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
  </LegalPage>;
}
