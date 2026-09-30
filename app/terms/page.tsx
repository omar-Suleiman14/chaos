import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import LegalPage from "@/components/site/LegalPage";
import { supportEmail } from "@/lib/site";

export const metadata = pageMetadata("Terms and conditions", "Terms for creating forms and quizzes, answering questions and using the Chaos service.", "/terms");

export default function TermsPage() {
  return (
    <LegalPage title="Terms and conditions" updated="September 28, 2026">
      <p>
        These terms apply when you use Chaos, whether you create forms and quizzes or answer them. By using Chaos you agree to them. If you don&rsquo;t agree,
        please don&rsquo;t use the service. Questions: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>

      <h2>1. Your account</h2>
      <ul>
        <li>You need an account to create forms. Keep your sign-in details safe; you&rsquo;re responsible for what happens under your account.</li>
        <li>You must be old enough to agree to these terms where you live.</li>
        <li>Give accurate information and keep it up to date.</li>
      </ul>

      <h2>2. Your content</h2>
      <ul>
        <li>You own the forms, quizzes and themes you create, and the answers you collect.</li>
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

      <h2>5. Limits and availability</h2>
      <p>
        Chaos may set limits, such as the number of responses per form or the size of uploads. We work to keep Chaos available and your data safe, but the
        service is provided &ldquo;as is&rdquo; and may sometimes be unavailable or change. Export anything you can&rsquo;t afford to lose.
      </p>

      <h2>6. Liability</h2>
      <p>
        To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses, or for loss of data, profits or business, arising from your use
        of Chaos. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>7. Ending</h2>
      <p>
        You can stop using Chaos at any time and ask us to delete your account. We may suspend or end access if you seriously or repeatedly break these terms.
      </p>

      <h2>8. Privacy</h2>
      <p>Our <Link href="/privacy">privacy policy</Link> explains how we handle personal data.</p>

      <h2>9. Changes</h2>
      <p>We may update these terms. If a change is significant we&rsquo;ll update the date above and, where appropriate, let account holders know in the app.</p>
    </LegalPage>
  );
}
