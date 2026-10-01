// Pure: turns a connection's activity rows (convex/integrations.ts listConnections → activity)
// into sentences such as: Max created draft “Portal Hypertension”.
// Consecutive identical rows collapse into one event with a count, so twenty reads of the
// same item read as one line. Unit-tested in tests/unit/connectionText.test.ts.

import { pluralForm } from "@/lib/locale";
import type { Locale } from "@/lib/locale";

export interface ActivityRow { at: number; action: string; itemRef: string | null }

export type ActivityCategory = "change" | "read" | "security";

export interface ActivityEvent {
  key: string;
  /** Time of the most recent row in the group. */
  at: number;
  /** Time of the oldest row in the group. */
  firstAt: number;
  action: string;
  itemRef: string | null;
  count: number;
  category: ActivityCategory;
  text: string;
}

/** Item kind from an opaque reference. `lesson_` and `folder_` are proposed (docs/learn-integration.md). */
export type RefKind = "form" | "quiz" | "lesson" | "collection" | "item";
export function refKind(ref: string | null | undefined): RefKind {
  const prefix = ref?.split("_", 1)[0];
  return prefix === "form" ? "form" : prefix === "quiz" ? "quiz" : prefix === "lesson" ? "lesson" : prefix === "folder" ? "collection" : "item";
}

const CHANGES = new Set(["draft.created", "draft.updated", "lesson.draft_created", "lesson.draft_updated", "lesson.update_proposed", "lesson.unlinked", "folder.created"]);
const SECURITY = new Set(["token.rotated", "token.previous_revoked", "webhook.created", "webhook.deleted", "webhook.rotated", "lesson.selection_updated", "source.selection_updated"]);

/** v2 read operations are logged as "v2.<resource>.<method>" or "v2.<scope>" (convex/learn*Integrations.ts). */
const V2_ALIASES: Record<string, string> = {
  "v2.lessons.get": "lesson.read", "v2.items.get": "lesson.read", "v2.capabilities.get": "connection.read", "v2.connection.get": "connection.read",
  "v2.sources.get": "source.read", "v2.progress:read": "progress.read", "v2.tutor:context": "context.read", "v2.community.search": "community.search",
};
export function normalizeAction(action: string): string {
  if (V2_ALIASES[action]) return V2_ALIASES[action];
  if (action.startsWith("v2.organization.")) return ["folders", "contents"].includes(action.slice(16)) ? "folders.read" : "curricula.read";
  return action;
}

export function activityCategory(action: string): ActivityCategory {
  const a = normalizeAction(action);
  return CHANGES.has(a) ? "change" : SECURITY.has(a) ? "security" : "read";
}

type Words = {
  q: (title: string) => string;
  noun: Record<RefKind, string>;
  deleted: (kind: RefKind) => string;
  times: (n: number) => string;
  actions: Record<string, (app: string, item: string, kind: RefKind) => string>;
  unknown: (app: string, action: string) => string;
};

const en: Words = {
  q: (title) => `“${title}”`,
  noun: { form: "form", quiz: "quiz", lesson: "lesson", collection: "collection", item: "item" },
  deleted: (kind) => `a deleted ${en.noun[kind]}`,
  times: (n) => ` (${n} times)`,
  actions: {
    "draft.created": (app, item) => `${app} created draft ${item}`,
    "draft.updated": (app, item) => `${app} updated draft ${item}`,
    "lesson.draft_created": (app, item) => `${app} created lesson draft ${item}`,
    "lesson.draft_updated": (app, item) => `${app} updated lesson draft ${item}`,
    "lesson.update_proposed": (app, item) => `${app} sent changes to ${item} for your review`,
    "folder.created": (app, item) => `${app} created collection ${item}`,
    "lesson.unlinked": (app, item) => `${app} unlinked lesson ${item}. The lesson stays in Chaos`,
    "lesson.selection_updated": (app) => `The lessons ${app} can reach were changed`,
    "source.selection_updated": (app) => `The sources ${app} can reach were changed`,
    "lesson.read": (app, item) => `${app} read lesson ${item}`,
    "source.read": (app) => `${app} read the details of a source`,
    "progress.read": (app, item) => `${app} checked your progress on ${item}`,
    "context.read": (app) => `${app} collected lesson text for study`,
    "folders.read": (app) => `${app} looked at your folders`,
    "curricula.read": (app) => `${app} browsed the curriculum directory`,
    "community.search": (app) => `${app} searched community lessons`,
    "token.rotated": (app) => `A new token was made for ${app}`,
    "token.previous_revoked": (app) => `The old token for ${app} was stopped`,
    "webhook.created": (app) => `${app} added a webhook`,
    "webhook.deleted": (app) => `${app} deleted a webhook`,
    "webhook.rotated": (app) => `${app} replaced a webhook secret`,
    "webhook.tested": (app) => `${app} sent a test webhook`,
    "items.list": (app) => `${app} listed the items it can reach`,
    "item.read": (app, item) => `${app} checked the status of ${item}`,
    "summary.read": (app, item) => `${app} read the response counts of ${item}`,
    "definition.read": (app, item) => `${app} copied the questions of ${item}`,
    "connection.read": (app) => `${app} checked its connection`,
    "webhooks.read": (app) => `${app} listed its webhooks`,
  },
  unknown: (app, action) => `${app}: ${action}`,
};

const arNoun: Record<RefKind, string> = { form: "نموذج", quiz: "اختبار", lesson: "درس", collection: "مجموعة", item: "عنصر" };
const ar: Words = {
  q: (title) => `«${title}»`,
  noun: arNoun,
  deleted: (kind) => (kind === "collection" ? "مجموعة محذوفة" : `${arNoun[kind]} محذوف`),
  times: (n) => (n === 2 ? " (مرتان)" : ` (${n} ${pluralForm("ar", n, { one: "مرة", few: "مرات", other: "مرة" })})`),
  actions: {
    "draft.created": (app, item) => `أنشأ ${app} المسودة ${item}`,
    "draft.updated": (app, item) => `حدّث ${app} المسودة ${item}`,
    "lesson.draft_created": (app, item) => `أنشأ ${app} مسودة الدرس ${item}`,
    "lesson.draft_updated": (app, item) => `حدّث ${app} مسودة الدرس ${item}`,
    "lesson.update_proposed": (app, item) => `أرسل ${app} تغييرات على ${item} لمراجعتك`,
    "folder.created": (app, item) => `أنشأ ${app} المجموعة ${item}`,
    "lesson.unlinked": (app, item) => `ألغى ${app} ربط الدرس ${item}. يبقى الدرس في Chaos`,
    "lesson.selection_updated": (app) => `تغيّرت الدروس التي يصل إليها ${app}`,
    "source.selection_updated": (app) => `تغيّرت المصادر التي يصل إليها ${app}`,
    "lesson.read": (app, item) => `قرأ ${app} الدرس ${item}`,
    "source.read": (app) => `قرأ ${app} تفاصيل مصدر`,
    "progress.read": (app, item) => `تحقق ${app} من تقدمك في ${item}`,
    "context.read": (app) => `جمع ${app} نص درس للدراسة`,
    "folders.read": (app) => `اطّلع ${app} على مجلداتك`,
    "curricula.read": (app) => `تصفّح ${app} دليل المناهج`,
    "community.search": (app) => `بحث ${app} في دروس المجتمع`,
    "token.rotated": (app) => `أُنشئ رمز جديد لـ ${app}`,
    "token.previous_revoked": (app) => `أُوقف الرمز القديم لـ ${app}`,
    "webhook.created": (app) => `أضاف ${app} webhook`,
    "webhook.deleted": (app) => `حذف ${app} webhook`,
    "webhook.rotated": (app) => `استبدل ${app} سر webhook`,
    "webhook.tested": (app) => `أرسل ${app} webhook تجريبيًا`,
    "items.list": (app) => `عرض ${app} العناصر التي يصل إليها`,
    "item.read": (app, item) => `تحقق ${app} من حالة ${item}`,
    "summary.read": (app, item) => `قرأ ${app} أعداد الردود على ${item}`,
    "definition.read": (app, item) => `نسخ ${app} أسئلة ${item}`,
    "connection.read": (app) => `تحقق ${app} من اتصاله`,
    "webhooks.read": (app) => `عرض ${app} الـ webhooks الخاصة به`,
  },
  unknown: (app, action) => `${app}: ${action}`,
};

const words: Record<Locale, Words> = { en, ar };

/**
 * Group and phrase activity rows. `rows` are newest first, as listConnections returns them.
 * `titles` maps item references to current titles; a missing title reads as a deleted item.
 */
export function formatActivity(
  rows: readonly ActivityRow[],
  opts: { appName: string; titles: ReadonlyMap<string, string> | Record<string, string>; locale: Locale },
): ActivityEvent[] {
  const w = words[opts.locale];
  const lookup = (ref: string) => (opts.titles instanceof Map ? opts.titles.get(ref) : (opts.titles as Record<string, string>)[ref]);
  const groups: { rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1)?.rows[0];
    if (last && last.action === row.action && last.itemRef === row.itemRef) groups.at(-1)!.rows.push(row);
    else groups.push({ rows: [row] });
  }
  return groups.map(({ rows: group }) => {
    const first = group[0];
    const kind = refKind(first.itemRef);
    const title = first.itemRef ? lookup(first.itemRef) : undefined;
    const item = title !== undefined ? w.q(title) : w.deleted(kind);
    const phrase = w.actions[normalizeAction(first.action)];
    const base = phrase ? phrase(opts.appName, item, kind) : w.unknown(opts.appName, first.action);
    return {
      key: `${first.at}-${first.action}-${first.itemRef ?? ""}`,
      at: first.at,
      firstAt: group[group.length - 1].at,
      action: first.action,
      itemRef: first.itemRef,
      count: group.length,
      category: activityCategory(first.action),
      text: group.length > 1 ? base + w.times(group.length) : base,
    };
  });
}
