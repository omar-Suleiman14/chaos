import { pageMetadata } from "@/lib/seo";
import LegalPage from "@/components/site/LegalPage";
import { supportEmail } from "@/lib/site";

export const metadata = pageMetadata("Privacy policy", "How Chaos handles accounts, responses, lessons, learning progress, connections and your choices about data.", "/privacy");

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 2, 2026" draft>
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
        <li>The assistant can create, edit and publish forms, quizzes, lessons, courses and flashcards, and read your content, results and responses, only when you ask it to. New things it creates are published straight away unless you ask for a draft.</li>
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
        <li><strong>PostHog</strong> for product analytics when analytics is configured: which pages are visited (with links, names and codes removed from the address, so a form link is recorded only as “a form”), a few named events and errors, never answers. It keeps an anonymous id in your browser’s local storage, not a cookie. When you are signed in, these are linked to your account id (not your email or name); people answering forms stay anonymous.</li>
      </ul>

      <h2>How long we keep data</h2>
      <ul>
        <li>Creators can set a retention period on each form; older responses are then deleted automatically.</li>
        <li>Deleting a form deletes its responses, uploads and history.</li>
        <li>Unfinished resume links expire after 30 days. Uploads that are never attached to a submitted answer are removed automatically.</li>
        <li>To close your account, email us and we will delete your account and content, except where we must keep something to meet a legal obligation.</li>
      </ul>

      <h2>Your choices and rights</h2>
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
