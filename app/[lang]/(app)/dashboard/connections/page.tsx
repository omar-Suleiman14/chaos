"use client";

import { copyText } from "@/lib/clipboard";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import posthog from "@/lib/analytics";
import { Copy, KeyRound, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import LoadingState from "@/components/LoadingState";
import { learnIntegrationScopes, legacyIntegrationScopes } from "@/convex/integrationModel";
import type { IntegrationScope, LegacyIntegrationScope } from "@/convex/integrationModel";
import { learnScopeLabel } from "@/lib/integrationScopeLabels";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useCopy, useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { WsConfirm } from "@/components/workspace/primitives";
import ConnectionAccessList from "@/components/connections/ConnectionAccessList";
import ConnectionActivity from "@/components/connections/ConnectionActivity";
import ConnectedLessonComparison from "@/components/connections/ConnectedLessonComparison";
import PendingLessonChanges, { ReviewModeSwitch } from "@/components/connections/PendingLessonChanges";
import SharePicker from "@/components/connections/SharePicker";
import { isItemRef, lessonIdsFromRefs, lessonRef, sourceIdsFromRefs } from "@/components/connections/learnShare";
import { canSelectLessons, connectionAppName, describeConnectionAccess } from "@/components/connections/permissionText";
import WebhooksSection from "./WebhooksSection";
import ConnectedApps from "@/components/connections/ConnectedApps";
import FallbackBoundary from "@/components/FallbackBoundary";

type ScopeText = Record<LegacyIntegrationScope, { label: string; help: string }>;
const LESSON_PAGE = { numItems: 200, cursor: null };

const copy = {
  en: {
    scopes: {
      "items:read": { label: "See titles and status", help: "Title, status, revision and links of shared items." },
      "summaries:read": { label: "See privacy-safe summaries", help: "Counts only, hidden below 5 responses. Never answer text, names, emails or files." },
      "drafts:create": { label: "Create drafts", help: "New forms and quizzes arrive as drafts for you to review. Nothing is published for you." },
      "drafts:update": { label: "Update drafts", help: "Replace the draft of items it can reach. Live versions and responses are never changed." },
      "definitions:read": { label: "Copy questions", help: "Read questions so you can reuse them as a template elsewhere." },
      "webhooks:manage": { label: "Receive updates (webhooks)", help: "Register a webhook that tells the app when shared items change. Counts only, never answers. Optional: the app works without it." },
    } as ScopeText,
    title: "Connections", intro: "Connect Chaos to the apps you use. You decide what each one can reach.", newConnection: "New connection",
    developer: "Developer", developerLead: "For your own apps and scripts: API tokens with scoped permissions, and webhooks that tell another app when something happens. Assistants connect through MCP with your sign-in, without a token.", mcpDocs: "MCP guide", apiDocs: "API guide",
    howLabel: "How connections work", howTitle: "What a connected app can and cannot do",
    how1: "It reaches only the items you select (or all of your forms and quizzes, if you choose), plus drafts it created.",
    how2: "Summaries contain counts only and are hidden until at least 5 people responded. Answer text, names, emails and uploaded files never leave Chaos.",
    how3a: "It creates and updates ", how3b: "drafts", how3c: ". You review and publish in Chaos.",
    how4: "Responses keep arriving while the app is closed. It refreshes when opened. Webhooks are optional: with the webhook permission it can also be told about changes.",
    how5: "Unlinking in the app never deletes anything here. Revoke the connection below to cut access immediately.",
    howLearn: "Select current lessons individually or from a curriculum module. Collection sharing is not available yet. Save to share those lessons only; future members are never included automatically.",
    apiAddress: "API address for the app:",
    rateLimits: (read: number, write: number) => `Each connection can make up to ${read} reads and ${write} changes a minute.`,
    tokenLabel: "New connection token", copyNow: "Copy this token now",
    tokenHelp: "Paste it into the other app’s connection settings. Chaos stores only a fingerprint, so it cannot show the token again.",
    tokenField: "Connection token", copied: "Copied", copy: "Copy", saved: "I have saved it",
    cancel: "Cancel", name: "Name of the app", namePlaceholder: "For example, the app you are connecting",
    permissions: "Permissions", formPermissions: "Forms and quizzes", learnPermissions: "Lessons and study",
    whichItems: "Which items", onlyChosen: "Only what I choose",
    allItems: "All my forms and quizzes, including future ones", expires: "Expires after (days, optional)", createConnection: "Create connection",
    willAllow: (app: string) => `In plain words: what ${app} will be able to do`,
    whatItCanDo: (app: string) => `What ${app} can and cannot do`,
    lessonsNotSaved: (message: string) => `The connection was created, but its lessons were not shared: ${message} Choose “Change what it can reach” to try again.`,
    loadingConnections: "Loading connections...", none: "No connections yet.",
    created: (ago: string) => `Created ${ago}`, lastUsed: (ago: string) => `last used ${ago}`, neverUsed: "never used", revoked: "revoked", expired: "expired", expiresIn: (ago: string) => `expires ${ago}`,
    revoke: "Revoke",
    confirmRevoke: (label: string) => `Revoke “${label}”? Right away the app can no longer read your items, create or update drafts, read summaries or receive webhooks. Its token stops working for good. Drafts and items it created stay in Chaos.`,
    rotate: "New token",
    confirmRotate: (label: string) => `Make a new token for “${label}”?\n\nThe current token keeps working for 24 hours so you can update the app. After that only the new token works.`,
    rotatedHelp: (when: string) => `Paste it into the other app now. The old token stops working ${when}.`,
    oldTokenUntil: (when: string) => `old token works until ${when}`,
    stopOldToken: "Stop old token now", accessSaved: "Access updated", rotatedToast: "New token created", oldStopped: "Old token stopped", revokedToast: "Connection revoked",
    confirmStopOld: "Stop the old token now? Any app still using it loses access immediately.",
    ownItemsOnly: "A connection reaches only items you own. Forms and quizzes that others share with you are not included; their owner has to connect them.",
    allYours: "All your forms and quizzes.", shared: (titles: string) => `Shared: ${titles}`, deletedItem: "Deleted item", noItems: "No forms or quizzes selected (only drafts it creates).",
    lessons: (titles: string) => `Lessons: ${titles}`, missingLesson: "Lesson not found", sources: (n: number) => (n === 1 ? "1 source shared" : `${n} sources shared`),
    save: "Save", change: "Change what it can reach", sep: ", ",
  },
  ar: {
    scopes: {
      "items:read": { label: "عرض العناوين والحالة", help: "العنوان والحالة والمراجعة وروابط العناصر المشاركة." },
      "summaries:read": { label: "عرض ملخصات تحفظ الخصوصية", help: "أعداد فقط، وتُخفى إن قلّت الردود عن 5. لا نصوص إجابات ولا أسماء ولا بريد إلكتروني ولا ملفات أبدًا." },
      "drafts:create": { label: "إنشاء مسودات", help: "تصلك النماذج والاختبارات الجديدة كمسودات لتراجعها. لا يُنشر شيء نيابةً عنك." },
      "drafts:update": { label: "تحديث المسودات", help: "استبدال مسودة العناصر التي يصل إليها. لا تتغير النسخ المنشورة ولا الردود أبدًا." },
      "definitions:read": { label: "نسخ الأسئلة", help: "قراءة الأسئلة لتعيد استخدامها كقالب في مكان آخر." },
      "webhooks:manage": { label: "تلقي التحديثات (webhooks)", help: "تسجيل webhook يخبر التطبيق عند تغيّر العناصر المشاركة. أعداد فقط، بلا إجابات أبدًا. اختياري: يعمل التطبيق بدونه." },
    } as ScopeText,
    title: "الاتصالات", intro: "اربط Chaos بالتطبيقات التي تستخدمها. أنت تقرر ما يصل إليه كل منها.", newConnection: "اتصال جديد",
    developer: "للمطورين", developerLead: "لتطبيقاتك وبرامجك: رموز API بصلاحيات محددة، وwebhooks تخبر تطبيقًا آخر حين يحدث شيء. يتصل المساعدون عبر MCP بتسجيل دخولك، دون رمز.", mcpDocs: "دليل MCP", apiDocs: "دليل الـ API",
    howLabel: "كيف تعمل الاتصالات", howTitle: "ما يستطيعه التطبيق المتصل وما لا يستطيعه",
    how1: "يصل فقط إلى العناصر التي تحددها (أو إلى كل نماذجك واختباراتك إن اخترت ذلك)، إضافةً إلى المسودات التي أنشأها.",
    how2: "تحتوي الملخصات على أعداد فقط، وتُخفى حتى يجيب 5 أشخاص على الأقل. لا تغادر نصوص الإجابات والأسماء والبريد الإلكتروني والملفات المرفوعة Chaos أبدًا.",
    how3a: "ينشئ ", how3b: "المسودات", how3c: " ويحدّثها. تراجعها وتنشرها أنت في Chaos.",
    how4: "تستمر الردود بالوصول والتطبيق مغلق. يتحدث عند فتحه. الـ webhooks اختيارية: بصلاحية webhooks يمكن إبلاغه بالتغييرات أيضًا.",
    how5: "إلغاء الربط داخل التطبيق لا يحذف شيئًا هنا. اسحب الاتصال أدناه لقطع الوصول فورًا.",
    howLearn: "اختر دروسك الحالية بشكل فردي أو من وحدة منهج، ثم احفظ. مشاركة المجموعات غير متاحة بعد. لا تُضاف الدروس المستقبلية تلقائياً.",
    apiAddress: "عنوان API للتطبيق:",
    rateLimits: (read: number, write: number) => `يستطيع كل اتصال إجراء ما يصل إلى ${read} قراءة و${write} تغييرًا في الدقيقة.`,
    tokenLabel: "رمز الاتصال الجديد", copyNow: "انسخ هذا الرمز الآن",
    tokenHelp: "الصقه في إعدادات الاتصال بالتطبيق الآخر. يحفظ Chaos بصمة الرمز فقط، فلا يستطيع عرضه مرة ثانية.",
    tokenField: "رمز الاتصال", copied: "تم النسخ", copy: "انسخ", saved: "حفظته",
    cancel: "إلغاء", name: "اسم التطبيق", namePlaceholder: "مثلًا، التطبيق الذي تربطه",
    permissions: "الصلاحيات", formPermissions: "النماذج والاختبارات", learnPermissions: "الدروس والدراسة",
    whichItems: "أي النماذج والاختبارات", onlyChosen: "ما أختاره فقط",
    allItems: "كل نماذجي واختباراتي، بما فيها المستقبلية", expires: "ينتهي بعد (أيام، اختياري)", createConnection: "أنشئ الاتصال",
    willAllow: (app: string) => `بكلمات بسيطة: ما سيستطيع ${app} فعله`,
    whatItCanDo: (app: string) => `ما يستطيعه ${app} وما لا يستطيعه`,
    lessonsNotSaved: (message: string) => `أُنشئ الاتصال، لكن دروسه لم تُشارَك: ${message} اختر «غيّر ما يصل إليه» لتحاول مجددًا.`,
    loadingConnections: "جارٍ تحميل الاتصالات...", none: "لا اتصالات بعد.",
    created: (ago: string) => `أُنشئ ${ago}`, lastUsed: (ago: string) => `آخر استخدام ${ago}`, neverUsed: "لم يُستخدم", revoked: "مسحوب", expired: "منتهي", expiresIn: (ago: string) => `ينتهي ${ago}`,
    revoke: "اسحب",
    confirmRevoke: (label: string) => `سحب «${label}»؟ فورًا لن يستطيع التطبيق قراءة عناصرك ولا إنشاء المسودات أو تحديثها ولا قراءة الملخصات ولا تلقي الـ webhooks. يتوقف رمزه نهائيًا. تبقى في Chaos المسودات والعناصر التي أنشأها.`,
    rotate: "رمز جديد",
    confirmRotate: (label: string) => `إنشاء رمز جديد لـ «${label}»؟\n\nيبقى الرمز الحالي صالحًا 24 ساعة لتحدّث التطبيق. بعدها يعمل الرمز الجديد فقط.`,
    rotatedHelp: (when: string) => `الصقه في التطبيق الآخر الآن. يتوقف الرمز القديم ${when}.`,
    oldTokenUntil: (when: string) => `الرمز القديم صالح حتى ${when}`,
    stopOldToken: "أوقف الرمز القديم الآن", accessSaved: "حُدّث الوصول", rotatedToast: "أُنشئ رمز جديد", oldStopped: "أُوقف الرمز القديم", revokedToast: "أُلغي الاتصال",
    confirmStopOld: "إيقاف الرمز القديم الآن؟ أي تطبيق ما زال يستخدمه يفقد الوصول فورًا.",
    ownItemsOnly: "يصل الاتصال فقط إلى العناصر التي تملكها. النماذج والاختبارات التي يشاركها معك آخرون غير مشمولة؛ على مالكها أن يربطها.",
    allYours: "كل نماذجك واختباراتك.", shared: (titles: string) => `المشارَك: ${titles}`, deletedItem: "عنصر محذوف", noItems: "لم يُحدد أي نموذج أو اختبار (المسودات التي ينشئها فقط).",
    lessons: (titles: string) => `الدروس: ${titles}`, missingLesson: "درس غير موجود", sources: (n: number) => (n === 1 ? "مصدر واحد مشارَك" : `${n} مصادر مشارَكة`),
    save: "احفظ", change: "غيّر ما يصل إليه", sep: "، ",
  },
};

/** Label for any scope: this page's copy for v1 scopes, lib/integrationScopeLabels for Learn scopes (the scope id when it has no label yet). */
function scopeLabel(scope: IntegrationScope, labels: ScopeText, locale: Locale): string {
  if (scope in labels) return labels[scope as LegacyIntegrationScope].label;
  const label = learnScopeLabel(scope, locale);
  return label === learnScopeLabel("items:read", locale) ? scope : label;
}

type ConnectionItems = { items: { ref: string; title: string | null }[] };

/** Titles for activity lines and shared-lesson lists. */
function useItemTitles(connections: ConnectionItems[] | undefined, lessonTitles: Map<string, string>): Map<string, string> {
  const shareable = useQuery(api.integrations.listShareableItems);
  return useMemo(() => {
    const map = new Map<string, string>(lessonTitles);
    for (const i of shareable ?? []) map.set(i.ref, i.title);
    for (const c of connections ?? []) for (const i of c.items) if (i.title !== null) map.set(i.ref, i.title);
    return map;
  }, [shareable, connections, lessonTitles]);
}

export default function ConnectionsPage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const connections = useQuery(api.integrations.listConnections);
  const limits = useQuery(api.integrations.apiLimits);
  const ownedLessons = useQuery(api.lessons.listOwned, { paginationOpts: LESSON_PAGE });
  const create = useMutation(api.integrations.createConnection);
  const updateConnection = useMutation(api.integrations.updateConnection);
  const setLessonSelection = useMutation(api.learnIntegrations.setLessonSelection);
  const setCollectionSelection = useMutation(api.learnIntegrations.setCollectionSelection);
  const collectionIds = (refs: string[]) => refs.filter(r => r.startsWith("collection_")).map(r => r.slice(11) as Id<"learnCollections">);
  const setSourceSelection = useMutation(api.learnIntegrations.setSourceSelection);
  const revoke = useMutation(api.integrations.revokeConnection);
  const rotate = useMutation(api.integrations.rotateConnection);
  const stopOld = useMutation(api.integrations.endRotationGrace);
  const lessonTitles = useMemo(() => new Map((ownedLessons?.page ?? []).map((l) => [lessonRef(l._id), l.metadata.title])), [ownedLessons]);
  const titles = useItemTitles(connections, lessonTitles);
  const [secretNote, setSecretNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<IntegrationScope[]>(["items:read"]);
  const [access, setAccess] = useState<"selected" | "all">("selected");
  const [refs, setRefs] = useState<string[]>([]);
  const [lessonRefs, setLessonRefs] = useState<string[]>([]);
  const [expires, setExpires] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<Id<"integrationTokens"> | null>(null);
  const [editRefs, setEditRefs] = useState<string[]>([]);
  const [editLessonRefs, setEditLessonRefs] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<{ id: Id<"integrationTokens">; label: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.cloud(\/)?$/, ".site");
    setApiBase(site ? `${site.replace(/\/$/, "")}/api/integrations/v1` : "");
  }, []);

  const toggleScope = (s: IntegrationScope, on: boolean) => setScopes(on ? [...scopes, s] : scopes.filter((x) => x !== s));
  const lessonIds = (refs: string[]) => lessonIdsFromRefs(refs) as Id<"lessons">[];

  const submit = async () => {
    if (saving) return;
    setError("");
    if ((access === "selected" ? refs.length : 0) + (canSelectLessons(scopes) ? lessonRefs.length : 0) > 500) { setError(locale === "ar" ? "\u0627\u062e\u062a\u0631 500 \u0639\u0646\u0635\u0631 \u0639\u0644\u0649 \u0627\u0644\u0623\u0643\u062b\u0631." : "Select at most 500 items."); return; }
    setSaving(true);
    let result: { tokenId: Id<"integrationTokens">; token: string };
    try {
      result = await create({ label: label.trim(), scopes, access, itemRefs: access === "selected" ? refs : [], expiresInDays: expires ? Number(expires) : undefined });
      posthog.capture("integration_connection_created", { access, scope_count: scopes.length, has_expiration: Boolean(expires), lesson_count: lessonRefs.length });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
      return;
    }
    setSecret(result.token);
    setSecretNote(null);
    setCreating(false);
    setRefs([]);
    // Lessons are a separate, explicit grant (convex/learnIntegrations.ts). The token already exists, so a failure here is reported, not rolled back.
    if (lessonRefs.length && canSelectLessons(scopes)) {
      try { await setLessonSelection({ tokenId: result.tokenId, lessonIds: lessonIds(lessonRefs) }); } catch (err) { toast.error(t.lessonsNotSaved(errorMessage(err))); }
    }
    if (scopes.includes("collections:read") && collectionIds(lessonRefs).length) {
      try { await setCollectionSelection({ tokenId: result.tokenId, collectionIds: collectionIds(lessonRefs) }); } catch (err) { toast.error(t.lessonsNotSaved(errorMessage(err))); }
    }
    setLessonRefs([]);
    setSaving(false);
  };

  const saveEdit = async (c: { _id: Id<"integrationTokens">; access: "all" | "selected"; scopes: IntegrationScope[]; items: { ref: string }[] }) => {
    if (saving) return;
    setSaving(true);
    try {
      if (editRefs.length + editLessonRefs.length + sourceIdsFromRefs(c.items.map(item => item.ref)).length > 500) throw new Error("Select at most 500 items.");
      // updateConnection replaces itemRefs with forms and quizzes only, so lesson and source grants are written again right after.
      if (c.access === "selected") await updateConnection({ tokenId: c._id, itemRefs: editRefs });
      if (canSelectLessons(c.scopes)) await setLessonSelection({ tokenId: c._id, lessonIds: lessonIds(editLessonRefs) });
      if (c.scopes.includes("collections:read")) await setCollectionSelection({ tokenId: c._id, collectionIds: collectionIds(editLessonRefs) });
      const sourceIds = sourceIdsFromRefs(c.items.map((i) => i.ref));
      if (c.access === "selected" && sourceIds.length && c.scopes.includes("sources:read")) {
        await setSourceSelection({ tokenId: c._id, sourceIds: sourceIds as Id<"learnSources">[] });
      }
      setEditing(null);
      toast.success(t.accessSaved);
    } catch (err) {
      toast.error(err);
    } finally { setSaving(false); }
  };

  // One in-app confirm for rotate and stop-old-token (revoke has its own dialog below).
  const [confirming, setConfirming] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);

  const rotateToken = async (tokenId: Id<"integrationTokens">) => {
    try {
      const result = await rotate({ tokenId });
      posthog.capture("integration_token_rotated");
      setSecret(result.token);
      setSecretNote(t.rotatedHelp(timeAgo(locale, result.previousTokenExpiresAt)));
      setCopied(false);
      toast.success(t.rotatedToast);
    } catch (err) {
      toast.error(err);
    }
  };

  const draftApp = connectionAppName(label, locale);
  const scopeRow = (s: IntegrationScope, help: string) => (
    <label key={s} className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={scopes.includes(s)} onChange={(e) => toggleScope(s, e.target.checked)} />
      <span>{scopeLabel(s, t.scopes, locale)}<span className="block text-xs text-muted-foreground">{help}</span></span>
    </label>
  );

  return (
    <div className="space-y-8 font-sans max-w-4xl">
      <div className="ws-page-header !mb-0">
        <div>
          <h1 className="ws-page-title">{t.title}</h1>
          <p className="ws-page-subtitle">{t.intro}</p>
        </div>
      </div>

      <ConnectedApps />

      <div className="cx-dev flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="cx-dev__title">{t.developer}</h2>
          <p className="cx-dev__lead">{t.developerLead} <a className="underline" href="/docs/integration-api" target="_blank" rel="noopener">{t.apiDocs}</a> · <a className="underline" href="/docs/chatgpt-app" target="_blank" rel="noopener">{t.mcpDocs}</a></p>
        </div>
        {!creating && <button type="button" onClick={() => { setCreating(true); setSecret(null); }} className="ws-btn ws-btn--primary"><Plus size={16} /> {t.newConnection}</button>}
      </div>

      <section className="chaos-card bg-card p-5 text-sm space-y-2" aria-label={t.howLabel}>
        <h2 className="font-bold">{t.howTitle}</h2>
        <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
          <li>{t.how1}</li>
          <li>{t.how2}</li>
          <li>{t.how3a}<strong>{t.how3b}</strong>{t.how3c}</li>
          <li>{t.how4}</li>
          <li>{t.how5}</li>
          <li>{t.ownItemsOnly}</li>
          <li>{t.howLearn}</li>
        </ul>
        {apiBase && <p className="text-xs text-muted-foreground pt-2">{t.apiAddress} <code dir="ltr" className="break-all">{apiBase}</code></p>}
        {limits && <p className="text-xs text-muted-foreground">{t.rateLimits(limits.read, limits.write)}</p>}
      </section>

      {secret && (
        <section className="chaos-card border-primary p-5 space-y-3" role="alert" aria-label={t.tokenLabel}>
          <h2 className="font-bold text-sm flex items-center gap-2"><KeyRound size={16} /> {t.copyNow}</h2>
          <p className="text-sm text-muted-foreground">{secretNote ?? t.tokenHelp}</p>
          <div className="flex gap-2">
            <input readOnly dir="ltr" value={secret} className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={t.tokenField} />
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => void copyText(secret).then((ok) => { if (ok) setCopied(true); })}><Copy size={14} /> {copied ? t.copied : t.copy}</button>
          </div>
          <button type="button" className="text-xs underline" onClick={() => { setSecret(null); setSecretNote(null); setCopied(false); }}>{t.saved}</button>
        </section>
      )}

      {creating && (
        <section className="chaos-card bg-card p-5 space-y-5" aria-label={t.newConnection}>
          <div className="flex justify-between items-center">
            <h2 className="font-bold">{t.newConnection}</h2>
            <button type="button" className="ws-icon-button" onClick={() => setCreating(false)} aria-label={t.cancel}><X size={16} /></button>
          </div>
          <label className="block text-sm">{t.name}<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.namePlaceholder} className="kb-input mt-1" maxLength={80} /></label>
          <fieldset disabled={saving} className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.permissions}: {t.formPermissions}</legend>
            {legacyIntegrationScopes.map((s) => scopeRow(s, t.scopes[s].help))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.permissions}: {t.learnPermissions}</legend>
            {learnIntegrationScopes.map((s) => scopeRow(s, describeConnectionAccess({ appName: label, scopes: [s], access, lessonCount: lessonRefs.length }, locale).learn[0]?.text ?? ""))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.whichItems}</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={access === "selected"} onChange={() => setAccess("selected")} /> {t.onlyChosen}</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={access === "all"} onChange={() => setAccess("all")} /> {t.allItems}</label>
            <SharePicker value={refs} onChange={setRefs} allItems={access === "all"}
              lessonValue={lessonRefs} onLessonChange={setLessonRefs} lessonsAllowed={canSelectLessons(scopes)} collectionsAllowed={scopes.includes("collections:read")} />
          </fieldset>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t.willAllow(draftApp)}</h3>
            <ConnectionAccessList appName={label} scopes={scopes} access={access} selectedCount={refs.length}
              lessonCount={canSelectLessons(scopes) ? lessonRefs.length : 0} />
          </div>
          <label className="block text-sm">{t.expires}<input type="number" min={1} max={3650} value={expires} onChange={(e) => setExpires(e.target.value)} className="kb-input mt-1 w-32" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={submit} disabled={saving || !scopes.length || !label.trim()} className="ws-btn ws-btn--primary disabled:opacity-50">{t.createConnection}</button>
        </section>
      )}

      <FallbackBoundary fallback={null}><PendingLessonChanges /></FallbackBoundary>
      {connections === undefined ? <LoadingState label={t.loadingConnections} /> : connections.length === 0 ? (
        <p className="chaos-card bg-card p-8 text-sm text-muted-foreground text-center">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => {
            const expired = c.expiresAt !== null && c.expiresAt < now;
            const inactive = !!c.revokedAt || expired;
            const app = connectionAppName(c.label, locale);
            const formItems = c.items.filter((i) => isItemRef(i.ref));
            const liveItems = formItems.filter((i) => i.title !== null);
            const sharedLessons = c.items.filter((i) => i.ref.startsWith("lesson_"));
            const sharedSources = c.items.filter((i) => i.ref.startsWith("source_"));
            const editable = !inactive && (c.access === "selected" || canSelectLessons(c.scopes));
            return (
              <li key={c._id} className={`chaos-card bg-card p-5 space-y-3 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold">{c.label} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{c.tokenHint}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {t.created(timeAgo(locale, c.createdAt))} · {c.lastUsedAt ? t.lastUsed(timeAgo(locale, c.lastUsedAt)) : t.neverUsed}
                      {c.revokedAt ? ` · ${t.revoked}` : expired ? ` · ${t.expired}` : c.expiresAt ? ` · ${t.expiresIn(timeAgo(locale, c.expiresAt))}` : ""}
                      {!inactive && c.previousTokenExpiresAt ? ` · ${t.oldTokenUntil(timeAgo(locale, c.previousTokenExpiresAt))}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!inactive && (
                      <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => setConfirming({ title: t.rotate, body: t.confirmRotate(c.label), label: t.rotate, run: () => void rotateToken(c._id) })}>{t.rotate}</button>
                    )}
                    {!inactive && c.previousTokenExpiresAt && (
                      <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => setConfirming({ title: t.stopOldToken, body: t.confirmStopOld, label: t.stopOldToken, run: () => { stopOld({ tokenId: c._id }).then(() => toast.success(t.oldStopped), (e) => toast.error(e)); } })}>{t.stopOldToken}</button>
                    )}
                    {!c.revokedAt && (
                      <button type="button" className="ws-btn ws-btn--danger ws-btn--sm" onClick={() => setRevoking({ id: c._id, label: c.label })}>{t.revoke}</button>
                    )}
                  </div>
                </div>
                <p className="text-xs">{c.scopes.map((s) => scopeLabel(s, t.scopes, locale)).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">
                  {c.access === "all" ? t.allYours : formItems.length ? t.shared(formItems.map((i) => i.title ?? t.deletedItem).join(t.sep)) : t.noItems}
                </p>
                {sharedLessons.length > 0 && (
                  <p className="text-xs text-muted-foreground">{t.lessons(sharedLessons.map((i) => titles.get(i.ref) ?? t.missingLesson).join(t.sep))}</p>
                )}
                {sharedSources.length > 0 && <p className="text-xs text-muted-foreground">{t.sources(sharedSources.length)}</p>}
                {!inactive && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">{t.whatItCanDo(app)}</summary>
                    <div className="mt-2">
                      <ConnectionAccessList appName={c.label} scopes={c.scopes} access={c.access} selectedCount={liveItems.length} lessonCount={sharedLessons.length} />
                    </div>
                  </details>
                )}
                {editable && (editing === c._id ? (
                  <div className="space-y-2">
                    <SharePicker value={editRefs} onChange={setEditRefs} allItems={c.access === "all"}
                      lessonValue={editLessonRefs} onLessonChange={setEditLessonRefs} lessonsAllowed={canSelectLessons(c.scopes)} collectionsAllowed={c.scopes.includes("collections:read")} />
                    <div className="flex gap-2">
                      <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" disabled={saving} onClick={() => void saveEdit(c)}>{t.save}</button>
                      <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={saving} onClick={() => setEditing(null)}>{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="text-xs underline" onClick={() => {
                    setEditing(c._id);
                    setEditRefs(liveItems.map((i) => i.ref));
                    setEditLessonRefs(sharedLessons.map((i) => i.ref));
                  }}>{t.change}</button>
                ))}
                {!c.revokedAt && c.scopes.includes("lessons:update") && <ReviewModeSwitch tokenId={c._id} value={c.reviewLessonUpdates} />}
                {sharedLessons.length > 0 && <FallbackBoundary fallback={null}><ConnectedLessonComparison lessons={sharedLessons.map(item => ({ id: item.ref.slice(7) as Id<"lessons">, title: titles.get(item.ref) ?? t.missingLesson }))} /></FallbackBoundary>}
                {!c.revokedAt && <ConnectionActivity rows={c.activity} appName={app} titles={titles} />}
              </li>
            );
          })}
        </ul>
      )}

      {confirming && (
        <WsConfirm title={confirming.title} body={confirming.body} confirmLabel={confirming.label} onClose={() => setConfirming(null)} onConfirm={confirming.run} />
      )}

      {revoking && (
        <WsConfirm
          title={t.revoke}
          body={t.confirmRevoke(revoking.label)}
          confirmLabel={t.revoke}
          onClose={() => setRevoking(null)}
          onConfirm={() => { revoke({ tokenId: revoking.id }).then(() => { posthog.capture("integration_connection_revoked"); toast.success(t.revokedToast); }).catch((e) => toast.error(e)); }}
        />
      )}

      <FallbackBoundary fallback={null}><WebhooksSection /></FallbackBoundary>
    </div>
  );
}
