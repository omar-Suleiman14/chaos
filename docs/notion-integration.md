# Notion ↔ Chaos

Connect Notion on **Dashboard → Connections → Apps → Notion**.

## Setup

1. Register a **public OAuth** integration in Notion: select **Installable in → Any workspace / Public**. Enable only **Read content** and **Insert content**. Disable **Update content**, comments capabilities and user-information access (choose **No user information**). Leave page duplication during OAuth off. Notion webhook subscriptions are **not required**. You do not need a Marketplace listing.
2. Configure **one production redirect URI** as `https://YOUR-CONVEX-SITE.convex.site/api/notion/oauth/callback`. Use the deployment's **HTTP Actions URL**, *not* the `.convex.cloud` URL or frontend domain. Add separate redirect URIs only if testing other deployments.
3. On the **Convex backend deployment**, set `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_ENCRYPTION_KEY` (32+ random characters), and `CHAOS_APP_URL` (Chaos's public HTTPS app origin). Do not put secrets in Vercel public variables.
4. Open Connections in Chaos, click **Connect Notion**, then authorize only the pages/databases you want Chaos to access. Copy your **Client ID** and **Client Secret** directly to Convex environment variables. Do not share the secret in chat or commit it to the repository.

The in-app end-user guide, in both English and Arabic, is available at `/docs/notion` after the feature is merged and deployed.

## Importing a lesson

Chaos has no standalone lesson list, so every import goes into one of your courses. In the course builder, use **Import from Notion** under **Add a lesson** (it files the lesson into that course and module and opens it). From Connections, choose a page and a course (or **New course**, named after the page) and click **Import as lesson draft**. The page is read at that moment, and a private Chaos lesson draft is created via the same lesson service used by Max. You review and publish it yourself. Supported text, heading, list, quote, code and callout blocks are converted; unsupported media and embeds are skipped. Up to 400 blocks are imported, including up to two nested levels. Importing the same page again returns the original lesson and adds it to the chosen course; it does not overwrite edits.

### Finding imported drafts and MCP access

Open **Dashboard → Connections → Notion → Imported lesson drafts** to reopen an imported draft at any time. It also appears in **Library**, at the root unless you move it into a folder. Imported drafts remain accessible after disconnecting Notion.

The **signed-in Chaos MCP** already supports imported lessons through its existing tools: `list_lessons({ scope: "owned", query: "<Notion page title>" })` and `get_lesson({ lessonId, view: "draft" })`. It can edit the same draft through revision-checked lesson tools. The MCP user must be the Chaos lesson owner; another user cannot read the draft. **Third-party bearer API connections** are separate and require the owner to select the lesson and grant suitable scopes. There is no automatic permission expansion on import.

## Sending form and quiz results

Choose a Notion **data source** using **Choose a results database**. New, non-spam completed submissions create a page in the selected data source. Each page contains the Chaos response ID, time and score (when it's a quiz). **Answers, emails, student identities, uploaded files and respondent names are never synced.** Existing submissions are not backfilled. The sync uses a bounded retry queue and a stable response ID to reduce duplicates. Disable sync from the same screen at any time. Disconnecting removes Chaos's stored token and stops future delivery.

The data source must be shared with the OAuth integration and include a title property. Errors and Notion API limits may prevent delivery; failed events remain visible in backend records and are not silently imported as complete.

## Privacy and operations

Tokens are encrypted with a stable dedicated Convex key. OAuth state is random, single-use and expires in ten minutes. No automatic publishing or Notion-originated overwrite of Chaos content. When rotating `NOTION_ENCRYPTION_KEY`, users must reconnect because existing ciphertext cannot be decrypted.

## العربية

من لوحة التحكم ← الاتصالات ← Notion، اربط مساحة عملك بواسطة OAuth واختر الصفحات وقواعد البيانات التي تريد مشاركتها. يمكنك استيراد صفحة كمسودة درس **خاصة** داخل إحدى دوراتك لمراجعتها قبل النشر. ويمكنك اختيار قاعدة بيانات Notion لإرسال الدرجات ووقت إكمال الاختبارات والنماذج الجديدة دون إرسال إجابات الطلاب أو أسمائهم. يمكن إيقاف المزامنة وفصل الربط من نفس الصفحة.
