# Notion ↔ Chaos

Connect Notion on **Dashboard → Connections → Apps → Notion**.

## Setup

1. Register a **public OAuth** integration in Notion and give it read-content and insert-content capabilities.
2. Configure its redirect URL as `https://YOUR-CONVEX-SITE.convex.site/api/notion/oauth/callback`.
3. On the **Convex backend deployment**, set `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_ENCRYPTION_KEY` (32+ random characters), and `CHAOS_APP_URL` (Chaos's public HTTPS app origin). Do not put secrets in Vercel public variables.
4. Open Connections in Chaos, click **Connect Notion**, then authorize only the pages/databases you want Chaos to access.

## Importing a lesson

Select **Choose a page to import**, select a shared page, and click **Import as lesson draft**. The page is read at that moment, and a private Chaos lesson draft is created via the same lesson service used by Max. You review and publish it yourself. Supported text, heading, list, quote, code and callout blocks are converted; unsupported media and embeds are skipped. Up to 400 blocks are imported, including up to two nested levels. Importing the same page again returns the original lesson; it does not overwrite edits.

## Sending form and quiz results

Choose a Notion **data source** using **Choose a results database**. New, non-spam completed submissions create a page in the selected data source. Each page contains the Chaos response ID, time and score (when it's a quiz). **Answers, emails, student identities, uploaded files and respondent names are never synced.** Existing submissions are not backfilled. The sync uses a bounded retry queue and a stable response ID to reduce duplicates. Disable sync from the same screen at any time. Disconnecting removes Chaos's stored token and stops future delivery.

The data source must be shared with the OAuth integration and include a title property. Errors and Notion API limits may prevent delivery; failed events remain visible in backend records and are not silently imported as complete.

## Privacy and operations

Tokens are encrypted with a stable dedicated Convex key. OAuth state is random, single-use and expires in ten minutes. No automatic publishing or Notion-originated overwrite of Chaos content. When rotating `NOTION_ENCRYPTION_KEY`, users must reconnect because existing ciphertext cannot be decrypted.

## العربية

من لوحة التحكم ← الاتصالات ← Notion، اربط مساحة عملك بواسطة OAuth واختر الصفحات وقواعد البيانات التي تريد مشاركتها. يمكنك استيراد صفحة كمسودة درس **خاصة** لمراجعتها قبل النشر. ويمكنك اختيار قاعدة بيانات Notion لإرسال الدرجات ووقت إكمال الاختبارات والنماذج الجديدة دون إرسال إجابات الطلاب أو أسمائهم. يمكن إيقاف المزامنة وفصل الربط من نفس الصفحة.
