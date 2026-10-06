import type { Locale } from "../locale";
import type { DocArticle, DocBlock } from "./types";

/**
 * One guide per assistant (/docs/claude and /docs/chatgpt). They replaced the combined "chatgpt-app" guide,
 * whose address now redirects to /docs/chatgpt (next.config.ts). The setup steps match the /claude and
 * /chatgpt pages and lib/integrations.
 */

const can: Record<Locale, DocBlock[]> = {
  en: [
    { type: "heading", id: "can", text: "What it can do" },
    {
      type: "list",
      items: [
        "Find your forms, quizzes, lessons and courses.",
        "Create a form, survey, quiz, lesson, course or flashcard set with all its content, published straight away unless you ask for a draft. Quizzes get correct answers, points and explanations.",
        "Edit a draft: title, introduction, quiz mode, layout, questions and lesson blocks.",
        "Change a form's theme and sounds, and a course or lesson cover.",
        "Publish when you ask, and give you the link.",
        "Close, reopen, archive and restore a form.",
        "Make a live game, open a lobby for a published quiz, and move the game on when you say so.",
        "Summarize results, and read individual responses only when you ask.",
      ],
    },
    { type: "heading", id: "cannot", text: "What it cannot do" },
    { type: "list", items: ["Delete anything. Deleting happens only in the Archive, in Chaos.", "Change the live version without publishing.", "Edit classic quizzes from the old editor; they are read-only.", "Create file upload questions or custom endings. Existing ones are kept when it edits."] },
    { type: "heading", id: "drafts", text: "Publishing and drafts" },
    { type: "p", text: "New things your assistant creates publish straight away so links work, unless you ask for a draft or private work. Content imported from Google Forms, Microsoft Forms, spreadsheets or Max always starts as a private draft. Later edits to published content stay drafts until you publish them." },
  ],
  ar: [
    { type: "heading", id: "can", text: "ما يستطيع فعله" },
    {
      type: "list",
      items: [
        "البحث عن نماذجك واختباراتك ودروسك ودوراتك.",
        "إنشاء نموذج أو استبيان أو اختبار أو درس أو دورة أو مجموعة بطاقات بكل محتوياتها، وتُنشر فورًا ما لم تطلب مسودة. وفي الاختبار يضبط الإجابات الصحيحة والدرجات والشروح.",
        "تعديل مسودة: العنوان والمقدمة ووضع الاختبار والتخطيط والأسئلة وكتل الدرس.",
        "تغيير سمة النموذج وأصواته، وغلاف الدورة أو الدرس.",
        "النشر حين تطلب، وإعطاؤك الرابط.",
        "إغلاق النموذج وإعادة فتحه وأرشفته واستعادته.",
        "إنشاء لعبة مباشرة، وفتح غرفة لاختبار منشور، وتقديم اللعبة حين تطلب.",
        "تلخيص النتائج، وقراءة الردود الفردية فقط حين تطلب.",
      ],
    },
    { type: "heading", id: "cannot", text: "ما لا يستطيع فعله" },
    { type: "list", items: ["حذف أي شيء. الحذف في الأرشيف فقط، داخل Chaos.", "تغيير النسخة المنشورة دون نشر.", "تعديل الاختبارات الكلاسيكية من المحرّر القديم؛ فهي للقراءة فقط.", "إنشاء أسئلة رفع الملفات أو الخواتم المخصصة. تبقى الموجودة منها كما هي عند التعديل."] },
    { type: "heading", id: "drafts", text: "النشر والمسودات" },
    { type: "p", text: "يُنشر ما ينشئه مساعدك فورًا لتعمل الروابط، ما لم تطلب مسودة أو عملًا خاصًا. ويبدأ المحتوى المستورد من Google Forms أو Microsoft Forms أو جداول البيانات أو Max دائمًا كمسودة خاصة. والتعديلات اللاحقة على المحتوى المنشور تبقى مسودات حتى تنشرها." },
  ],
};

const tries: Record<Locale, DocBlock[]> = {
  en: [
    { type: "heading", id: "try", text: "Things to try" },
    { type: "list", items: ["\"Create a 50-question quiz from this PDF and publish it in Chaos.\"", "\"Turn these notes into a Chaos lesson.\"", "\"Create a Chaos course containing these lectures.\"", "\"Show me the results from my latest Chaos quiz.\""] },
  ],
  ar: [
    { type: "heading", id: "try", text: "جرّب أن تطلب" },
    { type: "list", items: ["«أنشئ اختبارًا من 50 سؤالًا من ملف PDF هذا وانشره في Chaos.»", "«حوّل هذه الملاحظات إلى درس في Chaos.»", "«أنشئ دورة في Chaos تضم هذه المحاضرات.»", "«اعرض لي نتائج آخر اختبار لي في Chaos.»"] },
  ],
};

export const assistantArticles: Record<Locale, DocArticle[]> = {
  en: [
    {
      slug: "claude",
      title: "Claude",
      summary: "Use Chaos from Claude on the web, desktop, phone and Claude Code.",
      blocks: [
        { type: "p", text: "Connect Chaos once and Claude can make and manage your forms, quizzes, lessons and courses, check results and run live games, right from the conversation. It's optional and free on every plan. Chaos itself runs no AI; Claude does the writing." },
        { type: "heading", id: "connect", text: "Connect it" },
        {
          type: "steps",
          items: [
            "Open [Chaos in Claude](/claude) and choose **Add Chaos to Claude**. Claude opens **Add custom connector** with the name **Chaos** and the address **https://chaos.fail/mcp** filled in.",
            "Check the details and choose **Add**.",
            "Choose **Connect** and sign in to Chaos. Chaos then appears in your connectors on claude.ai, Claude Desktop and the mobile apps.",
          ],
        },
        { type: "tip", text: "On Team and Enterprise plans an owner adds the connector in organization settings first; members then choose Connect." },
        { type: "heading", id: "plugin", text: "Install the plugin instead" },
        { type: "p", text: "**Download Chaos for Claude** on [the Claude page](/claude) gives a plugin ZIP with the connector, the Chaos logo and a short guide for Claude. Upload it in Claude's plugin settings, or unzip it and start Claude Code with `claude --plugin-dir <folder>`. It holds no keys or passwords; you still sign in with your Chaos account." },
        { type: "heading", id: "claude-code", text: "Claude Code" },
        { type: "p", text: "Run `claude mcp add --transport http chaos https://chaos.fail/mcp`, then `/mcp` to sign in. Chaos uses Streamable HTTP, not SSE. Claude Desktop needs no separate extension: connectors you add in Claude show up there too." },
        ...can.en,
        ...tries.en,
        { type: "heading", id: "privacy", text: "Privacy" },
        { type: "p", text: "What Claude reads is sent to Anthropic. Ask it to read individual answers only when you're allowed to share them. Claude acts as you: it can only see and change what your Chaos account can. To disconnect, remove Chaos from Claude's connector settings or from [Connections](/dashboard/connections) in Chaos." },
      ],
    },
    {
      slug: "chatgpt",
      title: "ChatGPT",
      summary: "Use Chaos from ChatGPT, or from Codex with the Chaos plugin.",
      blocks: [
        { type: "p", text: "Connect Chaos once and ChatGPT can make and manage your forms, quizzes, lessons and courses, check results and run live games. It's optional and free on every plan. Chaos itself runs no AI; ChatGPT does the writing." },
        { type: "heading", id: "connect", text: "Connect it" },
        {
          type: "steps",
          items: [
            "Copy **https://chaos.fail/mcp** from [Chaos in ChatGPT](/chatgpt).",
            "In ChatGPT, open **Settings → Apps → Advanced settings** and turn on **Developer mode** (Plus, Pro, Business, Enterprise and Education).",
            "Choose **Create**. Name it **Chaos**, paste the address, pick **OAuth** and choose **Create**.",
            "Sign in to Chaos when asked, then add Chaos from the tools menu in a new chat.",
          ],
        },
        { type: "tip", text: "ChatGPT's labels change between releases. If a step looks different, follow [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)." },
        { type: "heading", id: "plugin", text: "Codex plugin" },
        { type: "p", text: "**Download Chaos for ChatGPT** on [the ChatGPT page](/chatgpt) gives an OpenAI plugin ZIP for Codex with the Chaos logo, the connector and a short guide. Unzip it to `~/plugins/chaos` and add it to your Codex plugin marketplace as its README shows. It holds no keys or passwords; you sign in with your Chaos account." },
        ...can.en,
        ...tries.en,
        { type: "heading", id: "privacy", text: "Privacy" },
        { type: "p", text: "What ChatGPT reads is sent to OpenAI. Ask it to read individual answers only when you're allowed to share them. ChatGPT acts as you: it can only see and change what your Chaos account can. To disconnect, remove Chaos from your apps in ChatGPT's settings or from [Connections](/dashboard/connections) in Chaos." },
      ],
    },
  ],
  ar: [
    {
      slug: "claude",
      title: "Claude",
      summary: "استخدم Chaos من Claude على الويب وسطح المكتب والهاتف وClaude Code.",
      blocks: [
        { type: "p", text: "اربط Chaos مرة واحدة، وسيتمكن Claude من إنشاء نماذجك واختباراتك ودروسك ودوراتك وإدارتها، ومتابعة النتائج وتشغيل الألعاب المباشرة، من داخل المحادثة. الربط اختياري ومجاني في كل الخطط. Chaos نفسه لا يشغّل أي ذكاء اصطناعي؛ Claude هو من يكتب." },
        { type: "heading", id: "connect", text: "اربطه" },
        {
          type: "steps",
          items: [
            "افتح [Chaos في Claude](/claude) واختر **أضف Chaos إلى Claude**. يفتح Claude نافذة **إضافة موصّل مخصص** وفيها الاسم **Chaos** والعنوان **https://chaos.fail/mcp**.",
            "راجع البيانات واختر **إضافة**.",
            "اختر **اتصال** وسجّل الدخول إلى Chaos. يظهر Chaos بعدها في موصّلاتك على claude.ai وClaude Desktop وتطبيقات الهاتف.",
          ],
        },
        { type: "tip", text: "في خطط Team وEnterprise يضيف المالك الموصّل أولًا من إعدادات المؤسسة، ثم يختار الأعضاء اتصال." },
        { type: "heading", id: "plugin", text: "أو ثبّت الإضافة" },
        { type: "p", text: "زر **نزّل Chaos لـ Claude** في [صفحة Claude](/claude) يعطيك ملف ZIP لإضافة فيها الموصّل وشعار Chaos ودليل قصير لـ Claude. ارفعه من إعدادات الإضافات في Claude، أو فك ضغطه وشغّل Claude Code عبر `claude --plugin-dir <folder>`. لا يحتوي على مفاتيح أو كلمات مرور؛ ما زلت تسجّل الدخول بحسابك في Chaos." },
        { type: "heading", id: "claude-code", text: "Claude Code" },
        { type: "p", text: "شغّل `claude mcp add --transport http chaos https://chaos.fail/mcp` ثم `/mcp` لتسجيل الدخول. يستخدم Chaos بروتوكول Streamable HTTP وليس SSE. ولا يحتاج Claude Desktop إلى امتداد منفصل؛ فالموصّلات التي تضيفها في Claude تظهر فيه أيضًا." },
        ...can.ar,
        ...tries.ar,
        { type: "heading", id: "privacy", text: "الخصوصية" },
        { type: "p", text: "ما يقرؤه Claude يُرسل إلى Anthropic. اطلب منه قراءة الإجابات الفردية فقط إن كان مسموحًا لك بمشاركتها. يعمل Claude باسمك: لا يرى ولا يغيّر إلا ما يسمح به حسابك. لفصل الاتصال أزل Chaos من إعدادات الموصّلات في Claude أو من [الاتصالات](/dashboard/connections) في Chaos." },
      ],
    },
    {
      slug: "chatgpt",
      title: "ChatGPT",
      summary: "استخدم Chaos من ChatGPT، أو من Codex بإضافة Chaos.",
      blocks: [
        { type: "p", text: "اربط Chaos مرة واحدة، وسيتمكن ChatGPT من إنشاء نماذجك واختباراتك ودروسك ودوراتك وإدارتها، ومتابعة النتائج وتشغيل الألعاب المباشرة. الربط اختياري ومجاني في كل الخطط. Chaos نفسه لا يشغّل أي ذكاء اصطناعي؛ ChatGPT هو من يكتب." },
        { type: "heading", id: "connect", text: "اربطه" },
        {
          type: "steps",
          items: [
            "انسخ **https://chaos.fail/mcp** من [Chaos في ChatGPT](/chatgpt).",
            "في ChatGPT افتح **الإعدادات ← التطبيقات ← الإعدادات المتقدمة** وفعّل **وضع المطوّر** (Plus وPro وBusiness وEnterprise وEducation).",
            "اختر **إنشاء**. سمّه **Chaos**، والصق العنوان، واختر **OAuth**، ثم **إنشاء**.",
            "سجّل الدخول إلى Chaos عند الطلب، ثم أضف Chaos من قائمة الأدوات في محادثة جديدة.",
          ],
        },
        { type: "tip", text: "تتغير أسماء الواجهة في ChatGPT بين الإصدارات. إن بدت خطوة مختلفة، فاتبع [دليل OpenAI للربط](https://developers.openai.com/plugins/deploy/connect-chatgpt)." },
        { type: "heading", id: "plugin", text: "إضافة Codex" },
        { type: "p", text: "زر **نزّل Chaos لـ ChatGPT** في [صفحة ChatGPT](/chatgpt) يعطيك ملف ZIP لإضافة OpenAI في Codex فيها شعار Chaos والموصّل ودليل قصير. فك ضغطه إلى `~/plugins/chaos` وأضفه إلى سوق إضافات Codex كما يشرح ملف README داخله. لا يحتوي على مفاتيح أو كلمات مرور؛ تسجّل الدخول بحسابك في Chaos." },
        ...can.ar,
        ...tries.ar,
        { type: "heading", id: "privacy", text: "الخصوصية" },
        { type: "p", text: "ما يقرؤه ChatGPT يُرسل إلى OpenAI. اطلب منه قراءة الإجابات الفردية فقط إن كان مسموحًا لك بمشاركتها. يعمل ChatGPT باسمك: لا يرى ولا يغيّر إلا ما يسمح به حسابك. لفصل الاتصال أزل Chaos من تطبيقاتك في إعدادات ChatGPT أو من [الاتصالات](/dashboard/connections) في Chaos." },
      ],
    },
  ],
};
