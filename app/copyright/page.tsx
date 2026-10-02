import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/site/LegalPage";
import { supportEmail } from "@/lib/site";

export const metadata = pageMetadata("Copyright policy", "How sharing, attribution, copying and copyright reports work for lessons, courses, quizzes and other content on Chaos.", "/copyright");

export default function CopyrightPage() {
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
