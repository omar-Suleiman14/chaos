// Pure: turns a connection's technical scopes into plain sentences a person can check
// ("Max can read your 3 selected lessons but cannot publish them.").
// No React, no Convex runtime, so it is unit-tested directly (tests/unit/connectionText.test.ts).
//
// Product-neutral: the app name is whatever the owner called the connection. Nothing here
// assumes the other side is Max. Sentences follow what convex/integrations.ts (v1) and the
// v2 Learn handlers (convex/learnIntegrations.ts, learnOrganizationIntegrations.ts,
// learnStudyIntegrations.ts, learnCommunityHttp.ts) enforce.

import type { IntegrationScope, LegacyIntegrationScope } from "@/convex/integrationModel";
import type { Locale } from "@/lib/locale";

type LearnScope = Exclude<IntegrationScope, LegacyIntegrationScope>;

export interface PermissionSentence {
  /** Stable key for React lists and tests. */
  key: string;
  text: string;
  /** True when the sentence describes a choice Chaos cannot store yet. */
  pending?: boolean;
}

export interface ConnectionAccessInput {
  /** The connection's label. Empty falls back to "This app". */
  appName: string;
  scopes: readonly IntegrationScope[];
  /** Forms and quizzes only. Learn never inherits "all". */
  access: "all" | "selected";
  /** How many forms and quizzes are selected (ignored for `access: "all"`). */
  selectedCount?: number;
  /** How many lessons are selected for this connection (stored). */
  lessonCount?: number;
  /** Collections and curricula picked in the UI. Chaos cannot store these grants yet. */
  pendingSelected?: { collections: number; curricula: number };
}

export interface ConnectionAccessText {
  can: PermissionSentence[];
  cannot: PermissionSentence[];
  /** Lessons, folders, curricula, study progress and community. */
  learn: PermissionSentence[];
}

type Words = {
  fallbackApp: string;
  reach: (all: boolean, n: number) => string;
  lessonReach: (n: number) => string;
  can: Record<LegacyIntegrationScope, (app: string, reach: string) => string>;
  learn: Record<LearnScope, (app: string, lessons: string) => string>;
  cannot: {
    publish: (app: string) => string;
    private: (app: string) => string;
    delete: (app: string) => string;
    noCreate: (app: string) => string;
    noUpdate: (app: string) => string;
    noSummaries: (app: string) => string;
    noDefinitions: (app: string) => string;
    noRead: (app: string) => string;
    noLessons: (app: string) => string;
  };
  pending: (collections: number, curricula: number) => string;
};

const en: Words = {
  fallbackApp: "This app",
  reach: (all, n) => (all
    ? "all your forms and quizzes, including future ones"
    : n === 0 ? "only the drafts it creates" : `the ${n === 1 ? "form or quiz" : `${n} forms and quizzes`} you selected and the drafts it creates`),
  lessonReach: (n) => (n === 0 ? "only the lessons it creates" : n === 1 ? "your selected lesson and the lessons it creates" : `your ${n} selected lessons and the lessons it creates`),
  can: {
    "items:read": (app, reach) => `${app} can see the title, status and links of ${reach}.`,
    "summaries:read": (app, reach) => `${app} can see response counts for ${reach}. Counts stay hidden until at least 5 people have responded.`,
    "drafts:create": (app) => `${app} can create new form and quiz drafts. You review and publish them in Chaos.`,
    "drafts:update": (app, reach) => `${app} can change the drafts of ${reach}, but not the published versions.`,
    "definitions:read": (app, reach) => `${app} can copy the questions of ${reach} to reuse them.`,
    "webhooks:manage": (app, reach) => `${app} can ask to be told when ${reach} change. It gets counts, never answers.`,
  },
  learn: {
    "lessons:read": (app, lessons) => `${app} can read ${lessons} but cannot publish them.`,
    "lessons:create": (app) => `${app} can create lesson drafts for you to review. It cannot publish them.`,
    "lessons:update": (app, lessons) => `${app} can change the drafts of ${lessons}. Published lessons stay as they are.`,
    "sources:read": (app) => `${app} can see the details (title, author, link) of sources you select, never the files.`,
    "folders:read": (app) => `${app} can see the names and layout of all your folders, and the selected lessons inside them.`,
    "folders:update": (app) => `${app} can create and move folders and put lessons it can reach into them.`,
    "curricula:read": (app) => `${app} can browse the curriculum directory.`,
    "curricula:map": (app, lessons) => `${app} can link ${lessons} to curriculum modules.`,
    "community:read": (app) => `${app} can search community lessons.`,
    "community:save": (app) => `${app} can save community lessons to your library.`,
    "community:fork": (app) => `${app} can make your own copy of a community lesson.`,
    "progress:read": (app, lessons) => `${app} can see your own study progress on ${lessons}.`,
    "progress:write": (app, lessons) => `${app} can record your study progress on ${lessons}.`,
    "tutor:context": (app, lessons) => `${app} can collect the text of ${lessons} to help you study elsewhere.`,
  },
  cannot: {
    publish: (app) => `${app} cannot publish, close or share anything for you.`,
    private: (app) => `${app} never sees answer text, names, emails or uploaded files.`,
    delete: (app) => `${app} cannot delete anything. Revoking the connection keeps everything it created.`,
    noCreate: (app) => `${app} cannot create form or quiz drafts.`,
    noUpdate: (app) => `${app} cannot change any of your forms or quizzes.`,
    noSummaries: (app) => `${app} cannot see how many people responded.`,
    noDefinitions: (app) => `${app} cannot copy your questions.`,
    noRead: (app) => `${app} cannot list your forms and quizzes.`,
    noLessons: (app) => `${app} cannot read or change your lessons.`,
  },
  pending: (collections, curricula) => {
    const parts = [];
    if (collections) parts.push(collections === 1 ? "1 collection" : `${collections} collections`);
    if (curricula) parts.push(curricula === 1 ? "1 curriculum module" : `${curricula} curriculum modules`);
    return `Not shared: the ${parts.join(" and ")} you picked. Chaos cannot save collection or curriculum sharing yet, so share their lessons instead.`;
  },
};

const ar: Words = {
  fallbackApp: "هذا التطبيق",
  reach: (all, n) => (all
    ? "كل نماذجك واختباراتك، بما فيها المستقبلية"
    : n === 0 ? "المسودات التي ينشئها فقط" : n === 1 ? "النموذج أو الاختبار الذي حددته والمسودات التي ينشئها" : `${n} من النماذج والاختبارات التي حددتها والمسودات التي ينشئها`),
  lessonReach: (n) => (n === 0 ? "الدروس التي ينشئها فقط" : n === 1 ? "الدرس الذي حددته والدروس التي ينشئها" : `${n} من الدروس التي حددتها والدروس التي ينشئها`),
  can: {
    "items:read": (app, reach) => `يستطيع ${app} رؤية عنوان وحالة وروابط ${reach}.`,
    "summaries:read": (app, reach) => `يستطيع ${app} رؤية أعداد الردود على ${reach}. تبقى الأعداد مخفية حتى يجيب 5 أشخاص على الأقل.`,
    "drafts:create": (app) => `يستطيع ${app} إنشاء مسودات نماذج واختبارات جديدة. تراجعها وتنشرها أنت في Chaos.`,
    "drafts:update": (app, reach) => `يستطيع ${app} تعديل مسودات ${reach}، لكن ليس النسخ المنشورة.`,
    "definitions:read": (app, reach) => `يستطيع ${app} نسخ أسئلة ${reach} لإعادة استخدامها.`,
    "webhooks:manage": (app, reach) => `يستطيع ${app} طلب إشعاره عند تغيّر ${reach}. يصله عدد الردود فقط، لا الإجابات أبدًا.`,
  },
  learn: {
    "lessons:read": (app, lessons) => `يستطيع ${app} قراءة ${lessons} لكنه لا يستطيع نشرها.`,
    "lessons:create": (app) => `يستطيع ${app} إنشاء مسودات دروس لتراجعها. لا يستطيع نشرها.`,
    "lessons:update": (app, lessons) => `يستطيع ${app} تعديل مسودات ${lessons}. تبقى الدروس المنشورة كما هي.`,
    "sources:read": (app) => `يستطيع ${app} رؤية تفاصيل المصادر التي تحددها (العنوان والمؤلف والرابط)، لا الملفات أبدًا.`,
    "folders:read": (app) => `يستطيع ${app} رؤية أسماء كل مجلداتك وترتيبها، والدروس المحددة داخلها.`,
    "folders:update": (app) => `يستطيع ${app} إنشاء المجلدات ونقلها ووضع الدروس التي يصل إليها فيها.`,
    "curricula:read": (app) => `يستطيع ${app} تصفح دليل المناهج.`,
    "curricula:map": (app, lessons) => `يستطيع ${app} ربط ${lessons} بوحدات المناهج.`,
    "community:read": (app) => `يستطيع ${app} البحث في دروس المجتمع.`,
    "community:save": (app) => `يستطيع ${app} حفظ دروس المجتمع في مكتبتك.`,
    "community:fork": (app) => `يستطيع ${app} إنشاء نسختك الخاصة من درس في المجتمع.`,
    "progress:read": (app, lessons) => `يستطيع ${app} رؤية تقدمك الدراسي في ${lessons}.`,
    "progress:write": (app, lessons) => `يستطيع ${app} تسجيل تقدمك الدراسي في ${lessons}.`,
    "tutor:context": (app, lessons) => `يستطيع ${app} جمع نص ${lessons} لمساعدتك على الدراسة في مكان آخر.`,
  },
  cannot: {
    publish: (app) => `لا يستطيع ${app} نشر أي شيء أو إغلاقه أو مشاركته نيابةً عنك.`,
    private: (app) => `لا يرى ${app} أبدًا نصوص الإجابات ولا الأسماء ولا البريد الإلكتروني ولا الملفات المرفوعة.`,
    delete: (app) => `لا يستطيع ${app} حذف أي شيء. سحب الاتصال يُبقي كل ما أنشأه.`,
    noCreate: (app) => `لا يستطيع ${app} إنشاء مسودات نماذج أو اختبارات.`,
    noUpdate: (app) => `لا يستطيع ${app} تعديل أي من نماذجك أو اختباراتك.`,
    noSummaries: (app) => `لا يستطيع ${app} معرفة عدد من أجابوا.`,
    noDefinitions: (app) => `لا يستطيع ${app} نسخ أسئلتك.`,
    noRead: (app) => `لا يستطيع ${app} عرض قائمة نماذجك واختباراتك.`,
    noLessons: (app) => `لا يستطيع ${app} قراءة دروسك أو تعديلها.`,
  },
  pending: (collections, curricula) => {
    const parts = [];
    if (collections) parts.push(collections === 1 ? "المجموعة" : `${collections} من المجموعات`);
    if (curricula) parts.push(curricula === 1 ? "وحدة المنهج" : `${curricula} من وحدات المناهج`);
    return `غير مشارَك: ${parts.join(" و")} التي اخترتها. لا يستطيع Chaos حفظ مشاركة المجموعات والمناهج بعد، فشارك دروسها بدلًا من ذلك.`;
  },
};

const words: Record<Locale, Words> = { en, ar };

const LEGACY_ORDER: LegacyIntegrationScope[] = ["items:read", "summaries:read", "drafts:create", "drafts:update", "definitions:read", "webhooks:manage"];
const LEARN_ORDER: LearnScope[] = [
  "lessons:read", "lessons:create", "lessons:update", "sources:read", "folders:read", "folders:update", "curricula:read", "curricula:map",
  "progress:read", "progress:write", "tutor:context", "community:read", "community:save", "community:fork",
];

/** Display name for a connection: the owner's label, or a neutral fallback. */
export function connectionAppName(label: string | undefined | null, locale: Locale): string {
  const name = (label ?? "").trim();
  return name || words[locale].fallbackApp;
}

/** Whether the owner can pick lessons for a connection with these scopes (convex/learnIntegrations.ts setLessonSelection). */
export function canSelectLessons(scopes: readonly IntegrationScope[]): boolean {
  return scopes.includes("lessons:read") || scopes.includes("lessons:update");
}

/**
 * What a connection can and cannot do, as sentences. `can` covers forms and quizzes,
 * `learn` covers Learn scopes; `cannot` lists the guarantees Chaos enforces for every
 * connection, then what the missing scopes rule out.
 */
export function describeConnectionAccess(input: ConnectionAccessInput, locale: Locale): ConnectionAccessText {
  const w = words[locale];
  const app = connectionAppName(input.appName, locale);
  const has = (s: IntegrationScope) => input.scopes.includes(s);
  const reach = w.reach(input.access === "all", input.selectedCount ?? 0);
  const lessons = w.lessonReach(input.lessonCount ?? 0);
  const can = LEGACY_ORDER.filter(has).map((s) => ({ key: s, text: w.can[s](app, reach) }));
  const learn: PermissionSentence[] = LEARN_ORDER.filter(has).map((s) => ({ key: s, text: w.learn[s](app, lessons) }));

  const cannot: PermissionSentence[] = [
    { key: "publish", text: w.cannot.publish(app) },
    { key: "private", text: w.cannot.private(app) },
    { key: "delete", text: w.cannot.delete(app) },
  ];
  if (!has("items:read")) cannot.push({ key: "noRead", text: w.cannot.noRead(app) });
  if (!has("drafts:create")) cannot.push({ key: "noCreate", text: w.cannot.noCreate(app) });
  if (!has("drafts:update")) cannot.push({ key: "noUpdate", text: w.cannot.noUpdate(app) });
  if (!has("summaries:read")) cannot.push({ key: "noSummaries", text: w.cannot.noSummaries(app) });
  if (!has("definitions:read")) cannot.push({ key: "noDefinitions", text: w.cannot.noDefinitions(app) });
  if (!has("lessons:read") && !has("lessons:create") && !has("lessons:update")) cannot.push({ key: "noLessons", text: w.cannot.noLessons(app) });

  const p = input.pendingSelected;
  if (p && (p.collections || p.curricula)) learn.push({ key: "learn.pending", text: w.pending(p.collections, p.curricula), pending: true });
  return { can, cannot, learn };
}
