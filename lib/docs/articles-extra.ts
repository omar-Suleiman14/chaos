import type { Locale } from "../locale";
import type { DocArticle } from "./types";

/** Articles added with the goal-based docs structure (lib/docs/structure.ts). Same slugs and heading ids in both languages. */
export const extraArticles: Record<Locale, DocArticle[]> = {
  en: [
    {
      slug: "what-is-chaos",
      title: "What is Chaos?",
      summary: "Turn what you know into something people can use.",
      blocks: [
        { type: "p", text: "Chaos is where you create, teach, learn and test. You make forms, quizzes and lessons, put lessons into courses, and run quizzes as live games. Everything is made by hand in the editor; nothing needs AI." },
        { type: "heading", id: "flow", text: "How it fits together" },
        { type: "list", items: ["Start from notes, a PDF or an idea.", "Write a **lesson**: a page with headings, images, video, equations, tables and cited sources.", "Turn it into a **quiz**, **flashcards** or part of a **course**.", "People practise on their own, or you run the quiz as a **live game**."] },
        { type: "heading", id: "areas", text: "Where things live" },
        { type: "list", items: ["**Library**: everything you own, with tabs for forms, quizzes, courses and games.", "**Learn**: courses, community lessons and your progress.", "**Play**: live games, started from a quiz.", "**Connections**: Max, ChatGPT and Claude, plus developer tools."] },
        { type: "p", text: "Next: [Make your first form](/docs/first-form) or [Write a lesson](/docs/lessons)." },
      ],
    },
    {
      slug: "lessons",
      title: "Write a lesson",
      summary: "A page like a document, for teaching one thing well.",
      blocks: [
        { type: "p", text: "A lesson is a page you write once and people read at their own pace. Press **New → Lesson**." },
        { type: "heading", id: "write", text: "Write" },
        { type: "list", items: ["Type **/** for blocks: headings, lists, tables, images, YouTube, equations, callouts, sources and citations.", "Select text to format it, or to ask ChatGPT or Claude about it. That opens your own assistant with the lesson as context; nothing in the lesson changes.", "Every lesson starts with its own cover. Use **Change cover** to pick from the gallery or paste any https image link, **Random** for another one, and **Reposition** to move it."] },
        { type: "heading", id: "sources", text: "Sources and citations" },
        { type: "p", text: "Add sources in the **Sources** panel, then cite them from any sentence. Readers see a small label and can open the source. Source files start private; you choose whether readers can see the title or open the file." },
        { type: "heading", id: "practice", text: "Practice" },
        { type: "p", text: "Attach published quizzes and flashcards in the **Practice** panel. Readers find them at the end of the lesson." },
        { type: "heading", id: "publish", text: "Publish" },
        { type: "p", text: "Press **Publish** and choose who can read it. Public lessons can appear in Learn search. Your draft stays separate: later edits go live only when you publish again, and **History** keeps every version." },
      ],
    },
    {
      slug: "courses",
      title: "Build a course",
      summary: "Lessons in a clear order, for people to take.",
      blocks: [
        { type: "p", text: "A course is an ordered list of your lessons with its own cover and description. Press **New → Course**." },
        { type: "steps", items: ["Give it a title and a one-line description.", "It starts with a random cover; use **Change cover** to pick another. Each lesson you add gets a different one.", "Press **Add a lesson** for each lesson, and use the arrows to reorder.", "Press **Publish**. Every lesson in the course is published with it."] },
        { type: "p", text: "Public courses are free for anyone to take and appear in [Learn](/learn). Private courses are part of Business. Archive a course to hide it; its lessons stay." },
      ],
    },
    {
      slug: "community",
      title: "Community lessons",
      summary: "Find, save and report public lessons and courses.",
      blocks: [
        { type: "p", text: "[Learn](/learn) lists public courses and lets you search public lessons by topic, without signing in." },
        { type: "list", items: ["**Save** a lesson to find it again in Saved.", "Highlights and notes are private to you.", "Check the author and sources for anything you rely on. Public doesn't mean checked or correct."] },
        { type: "heading", id: "report", text: "Report a problem" },
        { type: "p", text: "Use **Report** on a lesson or comment for mistakes, spam, abuse or copyright. Copyright reports follow the [copyright policy](/copyright). Chaos may hide material while a report is reviewed." },
      ],
    },
    {
      slug: "progress",
      title: "Progress and weak areas",
      summary: "See what you've finished and what still needs practice.",
      blocks: [
        { type: "p", text: "When you're signed in, Chaos keeps your progress through lessons and courses, and your answers to attached quizzes." },
        { type: "list", items: ["**Learn** shows lessons and courses you've started.", "**Weak areas** lists concepts you got wrong recently, with the quiz to practise them.", "Progress is private to you. Lesson authors don't see your individual answers unless you take one of their quizzes, which works like any form response."] },
      ],
    },
    {
      slug: "forking",
      title: "Copy and remix",
      summary: "Make your own editable copy, with the original author credited.",
      blocks: [
        { type: "p", text: "On a public lesson or quiz, choose **Copy to my library** to get an editable copy." },
        { type: "list", items: ["The copy remembers where it came from, and the original author stays credited.", "A copy of someone else's quiz doesn't include their answer key, explanations or hints. Add your own before you publish it.", "Only copy and republish material you have the right to share. See the [copyright policy](/copyright)."] },
      ],
    },
    {
      slug: "max",
      title: "Max",
      summary: "Turn Max pages into Chaos drafts.",
      blocks: [
        { type: "p", text: "Max and Chaos are separate apps that work together. From Max, pick a page and send it to Chaos; it arrives as a draft for you to review." },
        { type: "list", items: ["You choose what Max can reach in **Connections**.", "Only summaries (counts, never answers or names) go back to Max.", "Unlinking in Max never deletes anything in Chaos. Revoke the connection in Chaos to cut access at once."] },
      ],
    },
    {
      slug: "mcp",
      title: "MCP",
      summary: "Use Chaos directly from compatible assistants such as ChatGPT and Claude.",
      blocks: [
        { type: "p", text: "MCP (Model Context Protocol) is a standard way for an assistant to use an app. Chaos runs an MCP server at `https://chaos.fail/mcp`. You sign in with your Chaos account; the assistant can then do what you can do, and nothing more." },
        { type: "list", items: ["Create forms, quizzes, lessons, courses and flashcards. New things are published straight away unless you ask for a draft.", "Edit drafts, publish, and run live games.", "Read results, and read individual answers only when you ask."] },
        { type: "p", text: "Setup steps: [Claude](/docs/claude) and [ChatGPT](/docs/chatgpt). Chaos itself runs no AI; the assistant does the writing." },
      ],
    },
    {
      slug: "notion",
      title: "Notion (coming soon)",
      summary: "A Notion connection is planned. It isn't available yet.",
      blocks: [
        { type: "p", text: "There is no Notion connection yet, and nothing to set up. This page will explain it when it's ready." },
      ],
    },
    {
      slug: "legal",
      title: "Terms, privacy and copyright",
      summary: "The rules for using Chaos, and how your data and content are handled.",
      blocks: [
        { type: "list", items: ["[Terms](/terms): using Chaos, your content, Business use.", "[Privacy](/privacy): what Chaos stores and why.", "[Copyright](/copyright): sharing material, attribution, and reporting.", "Open-source licence: Chaos is AGPL-3.0. See [Self-hosting](/docs/self-hosting)."] },
        { type: "tip", text: "These pages are drafts that still need review by a lawyer." },
      ],
    },
  ],
  ar: [
    {
      slug: "what-is-chaos",
      title: "ما هو Chaos؟",
      summary: "حوّل ما تعرفه إلى شيء يستفيد منه الناس.",
      blocks: [
        { type: "p", text: "Chaos مكان للإنشاء والتعليم والتعلّم والاختبار. تُنشئ نماذج واختبارات ودروسًا، وتجمع الدروس في دورات، وتشغّل الاختبارات كألعاب مباشرة. كل شيء يُصنع يدويًا في المحرر؛ لا شيء يحتاج إلى ذكاء اصطناعي." },
        { type: "heading", id: "flow", text: "كيف يترابط كل شيء" },
        { type: "list", items: ["ابدأ من ملاحظات أو ملف PDF أو فكرة.", "اكتب **درسًا**: صفحة بعناوين وصور وفيديو ومعادلات وجداول ومصادر موثقة.", "حوّله إلى **اختبار** أو **بطاقات** أو جزء من **دورة**.", "يتدرّب الناس بأنفسهم، أو تشغّل الاختبار كـ**لعبة مباشرة**."] },
        { type: "heading", id: "areas", text: "أين تجد الأشياء" },
        { type: "list", items: ["**المكتبة**: كل ما تملكه، بتبويبات للنماذج والاختبارات والدورات والألعاب.", "**تعلّم**: الدورات ودروس المجتمع وتقدّمك.", "**العب**: الألعاب المباشرة، تبدأ من اختبار.", "**الاتصالات**: Max وChatGPT وClaude، وأدوات المطورين."] },
        { type: "p", text: "التالي: [أنشئ نموذجك الأول](/docs/first-form) أو [اكتب درسًا](/docs/lessons)." },
      ],
    },
    {
      slug: "lessons",
      title: "اكتب درسًا",
      summary: "صفحة كالمستند، لتعليم شيء واحد جيدًا.",
      blocks: [
        { type: "p", text: "الدرس صفحة تكتبها مرة ويقرؤها الناس بالسرعة المناسبة لهم. اضغط **جديد ← درس**." },
        { type: "heading", id: "write", text: "الكتابة" },
        { type: "list", items: ["اكتب **/** للكتل: عناوين وقوائم وجداول وصور ويوتيوب ومعادلات وتنبيهات ومصادر واستشهادات.", "حدّد نصًا لتنسيقه، أو لتسأل ChatGPT أو Claude عنه. يفتح ذلك مساعدك أنت مع الدرس كسياق؛ ولا يتغير شيء في الدرس.", "يبدأ كل درس بغلافه الخاص. استخدم **غيّر الغلاف** للاختيار من المعرض أو لصق أي رابط صورة https، و**عشوائي** لغلاف آخر، و**غيّر الموضع** لتحريكه."] },
        { type: "heading", id: "sources", text: "المصادر والاستشهادات" },
        { type: "p", text: "أضف المصادر في لوحة **المصادر**، ثم استشهد بها من أي جملة. يرى القراء علامة صغيرة ويمكنهم فتح المصدر. ملفات المصادر خاصة في البداية؛ وأنت تقرر إن كان القراء يرون العنوان أو يفتحون الملف." },
        { type: "heading", id: "practice", text: "التدريب" },
        { type: "p", text: "أرفق اختبارات وبطاقات منشورة من لوحة **التدريب**. يجدها القراء في نهاية الدرس." },
        { type: "heading", id: "publish", text: "النشر" },
        { type: "p", text: "اضغط **نشر** واختر من يستطيع القراءة. قد تظهر الدروس العامة في بحث تعلّم. تبقى مسودتك منفصلة: لا تُنشر التعديلات اللاحقة إلا حين تنشر مجددًا، ويحفظ **السجل** كل نسخة." },
      ],
    },
    {
      slug: "courses",
      title: "ابنِ دورة",
      summary: "دروس بترتيب واضح يأخذها الناس.",
      blocks: [
        { type: "p", text: "الدورة قائمة مرتبة من دروسك، لها غلاف ووصف. اضغط **جديد ← دورة**." },
        { type: "steps", items: ["اكتب عنوانًا ووصفًا من سطر واحد.", "تبدأ بغلاف عشوائي؛ استخدم **غيّر الغلاف** لاختيار غيره. ويحصل كل درس تضيفه على غلاف مختلف.", "اضغط **أضف درسًا** لكل درس، واستخدم الأسهم لإعادة الترتيب.", "اضغط **نشر**. يُنشر كل درس في الدورة معها."] },
        { type: "p", text: "الدورات العامة مجانية لأي أحد وتظهر في [تعلّم](/learn). الدورات الخاصة جزء من خطة الأعمال. أرشف دورة لإخفائها؛ وتبقى دروسها." },
      ],
    },
    {
      slug: "community",
      title: "دروس المجتمع",
      summary: "اعثر على الدروس والدورات العامة واحفظها وأبلغ عنها.",
      blocks: [
        { type: "p", text: "تعرض [تعلّم](/learn) الدورات العامة وتتيح البحث في الدروس العامة حسب الموضوع، دون تسجيل الدخول." },
        { type: "list", items: ["**احفظ** درسًا لتجده لاحقًا في المحفوظات.", "التظليلات والملاحظات خاصة بك.", "تحقّق من الكاتب والمصادر فيما تعتمد عليه. العام لا يعني أنه مُراجَع أو صحيح."] },
        { type: "heading", id: "report", text: "أبلغ عن مشكلة" },
        { type: "p", text: "استخدم **إبلاغ** على درس أو تعليق للأخطاء أو الرسائل المزعجة أو الإساءة أو حقوق النشر. تتبع بلاغات حقوق النشر [سياسة حقوق النشر](/copyright). قد يخفي Chaos المحتوى أثناء مراجعة البلاغ." },
      ],
    },
    {
      slug: "progress",
      title: "التقدّم ونقاط الضعف",
      summary: "اعرف ما أنهيته وما يحتاج إلى تدريب.",
      blocks: [
        { type: "p", text: "حين تسجّل الدخول، يحفظ Chaos تقدّمك في الدروس والدورات وإجاباتك عن الاختبارات المرفقة." },
        { type: "list", items: ["تعرض **تعلّم** الدروس والدورات التي بدأتها.", "تعرض **نقاط الضعف** المفاهيم التي أخطأت فيها مؤخرًا، مع الاختبار الذي تتدرّب به عليها.", "تقدّمك خاص بك. لا يرى كتّاب الدروس إجاباتك الفردية إلا إذا أجبت عن أحد اختباراتهم، وهي تعمل مثل أي رد على نموذج."] },
      ],
    },
    {
      slug: "forking",
      title: "انسخ وعدّل",
      summary: "أنشئ نسختك القابلة للتعديل مع بقاء اسم الكاتب الأصلي.",
      blocks: [
        { type: "p", text: "في درس أو اختبار عام، اختر **انسخ إلى مكتبتي** لتحصل على نسخة قابلة للتعديل." },
        { type: "list", items: ["تتذكر النسخة مصدرها، ويبقى اسم الكاتب الأصلي.", "نسخة اختبار شخص آخر لا تتضمن مفتاح إجاباته ولا شروحه ولا تلميحاته. أضف ما يخصك قبل نشرها.", "لا تنسخ وتعيد نشر إلا ما يحق لك مشاركته. راجع [سياسة حقوق النشر](/copyright)."] },
      ],
    },
    {
      slug: "max",
      title: "Max",
      summary: "حوّل صفحات Max إلى مسودات في Chaos.",
      blocks: [
        { type: "p", text: "Max وChaos تطبيقان منفصلان يعملان معًا. من Max، اختر صفحة وأرسلها إلى Chaos؛ تصل كمسودة لتراجعها." },
        { type: "list", items: ["تختار ما يصل إليه Max من **الاتصالات**.", "لا يعود إلى Max سوى الملخصات (أعداد، لا إجابات ولا أسماء).", "فك الربط في Max لا يحذف شيئًا في Chaos. ألغِ الاتصال في Chaos لقطع الوصول فورًا."] },
      ],
    },
    {
      slug: "mcp",
      title: "MCP",
      summary: "استخدم Chaos مباشرة من مساعدين متوافقين مثل ChatGPT وClaude.",
      blocks: [
        { type: "p", text: "MCP (بروتوكول سياق النماذج) طريقة قياسية ليستخدم المساعد تطبيقًا ما. يشغّل Chaos خادم MCP على `https://chaos.fail/mcp`. تسجّل الدخول بحسابك في Chaos؛ ثم يستطيع المساعد فعل ما تستطيعه أنت، لا أكثر." },
        { type: "list", items: ["إنشاء النماذج والاختبارات والدروس والدورات والبطاقات. تُنشر الأشياء الجديدة فورًا ما لم تطلب مسودة.", "تعديل المسودات والنشر وتشغيل الألعاب المباشرة.", "قراءة النتائج، وقراءة الإجابات الفردية فقط حين تطلب."] },
        { type: "p", text: "خطوات الإعداد: [Claude](/docs/claude) و[ChatGPT](/docs/chatgpt). Chaos نفسه لا يشغّل أي ذكاء اصطناعي؛ المساعد هو من يكتب." },
      ],
    },
    {
      slug: "notion",
      title: "Notion (قريبًا)",
      summary: "اتصال Notion مخطط له، وغير متاح بعد.",
      blocks: [
        { type: "p", text: "لا يوجد اتصال بـ Notion بعد، ولا شيء لإعداده. ستشرح هذه الصفحة الأمر حين يجهز." },
      ],
    },
    {
      slug: "legal",
      title: "الشروط والخصوصية وحقوق النشر",
      summary: "قواعد استخدام Chaos، وكيف تُعامَل بياناتك ومحتواك.",
      blocks: [
        { type: "list", items: ["[الشروط](/terms): استخدام Chaos ومحتواك واستخدام الأعمال.", "[الخصوصية](/privacy): ما يحفظه Chaos ولماذا.", "[حقوق النشر](/copyright): مشاركة المواد والإسناد والإبلاغ.", "رخصة المصدر المفتوح: Chaos برخصة AGPL-3.0. راجع [الاستضافة الذاتية](/docs/self-hosting)."] },
        { type: "tip", text: "هذه الصفحات مسودات تحتاج إلى مراجعة محامٍ." },
      ],
    },
  ],
};
