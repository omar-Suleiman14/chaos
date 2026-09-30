"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import posthog from "@/lib/analytics";
import { Copy, KeyRound, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import LoadingState from "@/components/LoadingState";
import { integrationScopes } from "@/convex/integrationModel";
import type { IntegrationScope } from "@/convex/integrationModel";
import { errorMessage } from "@/lib/errors";
import { useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { WsConfirm } from "@/components/workspace/primitives";
import WebhooksSection from "./WebhooksSection";
import FallbackBoundary from "@/components/FallbackBoundary";

type ScopeText = Record<IntegrationScope, { label: string; help: string }>;

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
    loadingItems: "Loading items...", filterPlaceholder: "Filter forms and quizzes", filterLabel: "Filter items", nothingToShare: "Nothing to share yet.",
    selected: (n: number) => `${n} selected. Drafts the app creates are always shared with it.`,
    title: "Connections", intro: "Let another app, such as Max, create drafts here and show the status of forms and quizzes you choose.", newConnection: "New connection",
    howLabel: "How connections work", howTitle: "What a connected app can and cannot do",
    how1: "It reaches only the items you select (or all of your items, if you choose), plus drafts it created.",
    how2: "Summaries contain counts only and are hidden until at least 5 people responded. Answer text, names, emails and uploaded files never leave Chaos.",
    how3a: "It creates and updates ", how3b: "drafts", how3c: ". You review and publish in Chaos.",
    how4: "Responses keep arriving while the app is closed. It refreshes when opened. Webhooks are optional: with the webhook permission it can also be told about changes.",
    how5: "Unlinking in the app never deletes anything here. Revoke the connection below to cut access immediately.",
    apiAddress: "API address for the app:",
    rateLimits: (read: number, write: number) => `Each connection can make up to ${read} reads and ${write} changes a minute.`,
    tokenLabel: "New connection token", copyNow: "Copy this token now",
    tokenHelp: "Paste it into the other app’s connection settings. Chaos stores only a fingerprint, so it cannot show the token again.",
    tokenField: "Connection token", copied: "Copied", copy: "Copy", saved: "I have saved it",
    cancel: "Cancel", name: "Name", permissions: "Permissions", whichItems: "Which items", onlyChosen: "Only items I choose",
    allItems: "All my forms and quizzes, including future ones", expires: "Expires after (days, optional)", createConnection: "Create connection",
    loadingConnections: "Loading connections...", none: "No connections yet.",
    created: (ago: string) => `Created ${ago}`, lastUsed: (ago: string) => `last used ${ago}`, neverUsed: "never used", revoked: "revoked", expired: "expired", expiresIn: (ago: string) => `expires ${ago}`,
    revoke: "Revoke",
    confirmRevoke: (label: string) => `Revoke “${label}”? Right away the app can no longer read your items, create or update drafts, read summaries or receive webhooks. Its token stops working for good. Drafts and items it created stay in Chaos.`,
    rotate: "New token",
    confirmRotate: (label: string) => `Make a new token for “${label}”?\n\nThe current token keeps working for 24 hours so you can update the app. After that only the new token works.`,
    rotatedHelp: (when: string) => `Paste it into the other app now. The old token stops working ${when}.`,
    oldTokenUntil: (when: string) => `old token works until ${when}`,
    stopOldToken: "Stop old token now",
    confirmStopOld: "Stop the old token now? Any app still using it loses access immediately.",
    activity: "Recent activity", noActivity: "No activity yet.",
    actions: {
      "draft.created": "Created a draft", "draft.updated": "Updated a draft", "token.rotated": "Token replaced",
      "token.previous_revoked": "Old token stopped", "webhook.created": "Added a webhook", "webhook.deleted": "Deleted a webhook",
      "webhook.rotated": "Replaced a webhook secret", "webhook.tested": "Sent a test webhook",
      "items.list": "Listed items", "item.read": "Read an item", "summary.read": "Read a summary",
      "definition.read": "Copied questions", "connection.read": "Checked the connection", "webhooks.read": "Listed webhooks",
    } as Record<string, string>,
    ownItemsOnly: "A connection reaches only items you own. Forms and quizzes that others share with you are not included; their owner has to connect them.",
    allYours: "All your forms and quizzes.", shared: (titles: string) => `Shared: ${titles}`, deletedItem: "Deleted item", noItems: "No items selected (only drafts it creates).",
    save: "Save", change: "Change shared items", sep: ", ",
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
    loadingItems: "جارٍ تحميل العناصر...", filterPlaceholder: "صفِّ النماذج والاختبارات", filterLabel: "تصفية العناصر", nothingToShare: "لا شيء للمشاركة بعد.",
    selected: (n: number) => `${n} محدد. المسودات التي ينشئها التطبيق تُشارَك معه دائمًا.`,
    title: "الاتصالات", intro: "اسمح لتطبيق آخر، مثل Max، بإنشاء مسودات هنا وعرض حالة النماذج والاختبارات التي تختارها.", newConnection: "اتصال جديد",
    howLabel: "كيف تعمل الاتصالات", howTitle: "ما يستطيعه التطبيق المتصل وما لا يستطيعه",
    how1: "يصل فقط إلى العناصر التي تحددها (أو إلى كل عناصرك إن اخترت ذلك)، إضافةً إلى المسودات التي أنشأها.",
    how2: "تحتوي الملخصات على أعداد فقط، وتُخفى حتى يجيب 5 أشخاص على الأقل. لا تغادر نصوص الإجابات والأسماء والبريد الإلكتروني والملفات المرفوعة Chaos أبدًا.",
    how3a: "ينشئ ", how3b: "المسودات", how3c: " ويحدّثها. تراجعها وتنشرها أنت في Chaos.",
    how4: "تستمر الردود بالوصول والتطبيق مغلق. يتحدث عند فتحه. الـ webhooks اختيارية: بصلاحية webhooks يمكن إبلاغه بالتغييرات أيضًا.",
    how5: "إلغاء الربط داخل التطبيق لا يحذف شيئًا هنا. اسحب الاتصال أدناه لقطع الوصول فورًا.",
    apiAddress: "عنوان API للتطبيق:",
    rateLimits: (read: number, write: number) => `يستطيع كل اتصال إجراء ما يصل إلى ${read} قراءة و${write} تغييرًا في الدقيقة.`,
    tokenLabel: "رمز الاتصال الجديد", copyNow: "انسخ هذا الرمز الآن",
    tokenHelp: "الصقه في إعدادات الاتصال بالتطبيق الآخر. يحفظ Chaos بصمة الرمز فقط، فلا يستطيع عرضه مرة ثانية.",
    tokenField: "رمز الاتصال", copied: "تم النسخ", copy: "انسخ", saved: "حفظته",
    cancel: "إلغاء", name: "الاسم", permissions: "الصلاحيات", whichItems: "أي العناصر", onlyChosen: "العناصر التي أختارها فقط",
    allItems: "كل نماذجي واختباراتي، بما فيها المستقبلية", expires: "ينتهي بعد (أيام، اختياري)", createConnection: "أنشئ الاتصال",
    loadingConnections: "جارٍ تحميل الاتصالات...", none: "لا اتصالات بعد.",
    created: (ago: string) => `أُنشئ ${ago}`, lastUsed: (ago: string) => `آخر استخدام ${ago}`, neverUsed: "لم يُستخدم", revoked: "مسحوب", expired: "منتهي", expiresIn: (ago: string) => `ينتهي ${ago}`,
    revoke: "اسحب",
    confirmRevoke: (label: string) => `سحب «${label}»؟ فورًا لن يستطيع التطبيق قراءة عناصرك ولا إنشاء المسودات أو تحديثها ولا قراءة الملخصات ولا تلقي الـ webhooks. يتوقف رمزه نهائيًا. تبقى في Chaos المسودات والعناصر التي أنشأها.`,
    rotate: "رمز جديد",
    confirmRotate: (label: string) => `إنشاء رمز جديد لـ «${label}»؟\n\nيبقى الرمز الحالي صالحًا 24 ساعة لتحدّث التطبيق. بعدها يعمل الرمز الجديد فقط.`,
    rotatedHelp: (when: string) => `الصقه في التطبيق الآخر الآن. يتوقف الرمز القديم ${when}.`,
    oldTokenUntil: (when: string) => `الرمز القديم صالح حتى ${when}`,
    stopOldToken: "أوقف الرمز القديم الآن",
    confirmStopOld: "إيقاف الرمز القديم الآن؟ أي تطبيق ما زال يستخدمه يفقد الوصول فورًا.",
    activity: "النشاط الأخير", noActivity: "لا نشاط بعد.",
    actions: {
      "draft.created": "أنشأ مسودة", "draft.updated": "حدّث مسودة", "token.rotated": "استُبدل الرمز",
      "token.previous_revoked": "أُوقف الرمز القديم", "webhook.created": "أضاف webhook", "webhook.deleted": "حذف webhook",
      "webhook.rotated": "استبدل سر webhook", "webhook.tested": "أرسل webhook تجريبيًا",
      "items.list": "عرض العناصر", "item.read": "قرأ عنصرًا", "summary.read": "قرأ ملخصًا",
      "definition.read": "نسخ الأسئلة", "connection.read": "فحص الاتصال", "webhooks.read": "عرض الـ webhooks",
    } as Record<string, string>,
    ownItemsOnly: "يصل الاتصال فقط إلى العناصر التي تملكها. النماذج والاختبارات التي يشاركها معك آخرون غير مشمولة؛ على مالكها أن يربطها.",
    allYours: "كل نماذجك واختباراتك.", shared: (titles: string) => `المشارَك: ${titles}`, deletedItem: "عنصر محذوف", noItems: "لم يُحدد أي عنصر (المسودات التي ينشئها فقط).",
    save: "احفظ", change: "غيّر العناصر المشاركة", sep: "، ",
  },
};

function ItemPicker({ value, onChange }: { value: string[]; onChange: (refs: string[]) => void }) {
  const t = useCopy(copy);
  const items = useQuery(api.integrations.listShareableItems);
  const [filter, setFilter] = useState("");
  if (items === undefined) return <LoadingState label={t.loadingItems} />;
  const shown = items.filter((i) => i.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-2">
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filterPlaceholder} className="kb-input text-sm" aria-label={t.filterLabel} />
      <ul className="max-h-56 overflow-y-auto border-2 border-foreground/10 divide-y divide-foreground/5">
        {shown.map((i) => (
          <li key={i.ref}>
            <label className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={value.includes(i.ref)} onChange={(e) => onChange(e.target.checked ? [...value, i.ref] : value.filter((r) => r !== i.ref))} />
              <span className="flex-1 truncate">{i.title}</span>
              <span className="text-[10px] chaos-heading text-muted-foreground">{i.kind.toUpperCase()}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t.nothingToShare}</li>}
      </ul>
      <p className="text-[11px] text-muted-foreground">{t.selected(value.length)}</p>
    </div>
  );
}

export default function ConnectionsPage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const connections = useQuery(api.integrations.listConnections);
  const limits = useQuery(api.integrations.apiLimits);
  const create = useMutation(api.integrations.createConnection);
  const updateConnection = useMutation(api.integrations.updateConnection);
  const revoke = useMutation(api.integrations.revokeConnection);
  const rotate = useMutation(api.integrations.rotateConnection);
  const stopOld = useMutation(api.integrations.endRotationGrace);
  const [secretNote, setSecretNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("Max");
  const [scopes, setScopes] = useState<IntegrationScope[]>(["items:read", "summaries:read", "drafts:create", "drafts:update"]);
  const [access, setAccess] = useState<"selected" | "all">("selected");
  const [refs, setRefs] = useState<string[]>([]);
  const [expires, setExpires] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<Id<"integrationTokens"> | null>(null);
  const [editRefs, setEditRefs] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<{ id: Id<"integrationTokens">; label: string } | null>(null);
  const [error, setError] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.cloud(\/)?$/, ".site");
    setApiBase(site ? `${site.replace(/\/$/, "")}/api/integrations/v1` : "");
  }, []);

  const submit = async () => {
    setError("");
    try {
      const result = await create({ label, scopes, access, itemRefs: access === "selected" ? refs : [], expiresInDays: expires ? Number(expires) : undefined });
      posthog.capture("integration_connection_created", { access, scope_count: scopes.length, has_expiration: Boolean(expires) });
      setSecret(result.token);
      setSecretNote(null);
      setCreating(false);
      setRefs([]);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // One in-app confirm for rotate and stop-old-token (revoke has its own dialog below).
  const [confirming, setConfirming] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);

  const rotateToken = async (tokenId: Id<"integrationTokens">) => {
    setError("");
    try {
      const result = await rotate({ tokenId });
      posthog.capture("integration_token_rotated");
      setSecret(result.token);
      setSecretNote(t.rotatedHelp(timeAgo(locale, result.previousTokenExpiresAt)));
      setCopied(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-8 font-sans max-w-4xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="chaos-display text-4xl mb-1">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.intro}</p>
        </div>
        {!creating && <button onClick={() => { setCreating(true); setSecret(null); }} className="kb-btn kb-btn-primary flex items-center gap-2"><Plus size={16} /> {t.newConnection}</button>}
      </div>

      <section className="chaos-card bg-card p-5 text-sm space-y-2" aria-label={t.howLabel}>
        <h2 className="chaos-heading text-xs">{t.howTitle}</h2>
        <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
          <li>{t.how1}</li>
          <li>{t.how2}</li>
          <li>{t.how3a}<strong>{t.how3b}</strong>{t.how3c}</li>
          <li>{t.how4}</li>
          <li>{t.how5}</li>
          <li>{t.ownItemsOnly}</li>
        </ul>
        {apiBase && <p className="text-xs text-muted-foreground pt-2">{t.apiAddress} <code dir="ltr" className="break-all">{apiBase}</code></p>}
        {limits && <p className="text-xs text-muted-foreground">{t.rateLimits(limits.read, limits.write)}</p>}
      </section>

      {secret && (
        <section className="chaos-card border-primary p-5 space-y-3" role="alert" aria-label={t.tokenLabel}>
          <h2 className="chaos-heading text-sm flex items-center gap-2"><KeyRound size={16} /> {t.copyNow}</h2>
          <p className="text-sm text-muted-foreground">{secretNote ?? t.tokenHelp}</p>
          <div className="flex gap-2">
            <input readOnly value={secret} className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={t.tokenField} />
            <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => navigator.clipboard?.writeText(secret).then(() => setCopied(true))}><Copy size={14} /> {copied ? t.copied : t.copy}</button>
          </div>
          <button type="button" className="text-xs underline" onClick={() => { setSecret(null); setSecretNote(null); setCopied(false); }}>{t.saved}</button>
        </section>
      )}

      {creating && (
        <section className="chaos-card bg-card p-5 space-y-4" aria-label={t.newConnection}>
          <div className="flex justify-between items-center">
            <h2 className="chaos-heading text-sm">{t.newConnection}</h2>
            <button type="button" onClick={() => setCreating(false)} aria-label={t.cancel}><X size={16} /></button>
          </div>
          <label className="block text-sm">{t.name}<input value={label} onChange={(e) => setLabel(e.target.value)} className="kb-input mt-1" maxLength={80} /></label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.permissions}</legend>
            {integrationScopes.map((s) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                <span>{t.scopes[s].label}<span className="block text-xs text-muted-foreground">{t.scopes[s].help}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.whichItems}</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={access === "selected"} onChange={() => setAccess("selected")} /> {t.onlyChosen}</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={access === "all"} onChange={() => setAccess("all")} /> {t.allItems}</label>
            {access === "selected" && <ItemPicker value={refs} onChange={setRefs} />}
          </fieldset>
          <label className="block text-sm">{t.expires}<input type="number" min={1} max={3650} value={expires} onChange={(e) => setExpires(e.target.value)} className="kb-input mt-1 w-32" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={submit} disabled={!scopes.length || !label.trim()} className="kb-btn kb-btn-primary disabled:opacity-50">{t.createConnection}</button>
        </section>
      )}

      {connections === undefined ? <LoadingState label={t.loadingConnections} /> : connections.length === 0 ? (
        <p className="chaos-card bg-card p-8 text-sm text-muted-foreground text-center">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => {
            const expired = c.expiresAt !== null && c.expiresAt < now;
            const inactive = !!c.revokedAt || expired;
            return (
              <li key={c._id} className={`chaos-card bg-card p-5 space-y-2 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold">{c.label} <span className="font-mono text-xs text-muted-foreground">{c.tokenHint}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {t.created(timeAgo(locale, c.createdAt))} · {c.lastUsedAt ? t.lastUsed(timeAgo(locale, c.lastUsedAt)) : t.neverUsed}
                      {c.revokedAt ? ` · ${t.revoked}` : expired ? ` · ${t.expired}` : c.expiresAt ? ` · ${t.expiresIn(timeAgo(locale, c.expiresAt))}` : ""}
                      {!inactive && c.previousTokenExpiresAt ? ` · ${t.oldTokenUntil(timeAgo(locale, c.previousTokenExpiresAt))}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!inactive && (
                      <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => setConfirming({ title: t.rotate, body: t.confirmRotate(c.label), label: t.rotate, run: () => void rotateToken(c._id) })}>{t.rotate}</button>
                    )}
                    {!inactive && c.previousTokenExpiresAt && (
                      <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => setConfirming({ title: t.stopOldToken, body: t.confirmStopOld, label: t.stopOldToken, run: () => { stopOld({ tokenId: c._id }).catch((e) => setError(errorMessage(e))); } })}>{t.stopOldToken}</button>
                    )}
                    {!c.revokedAt && (
                      <button type="button" className="kb-btn kb-btn-danger text-xs" onClick={() => setRevoking({ id: c._id, label: c.label })}>{t.revoke}</button>
                    )}
                  </div>
                </div>
                <p className="text-xs">{c.scopes.map((s) => t.scopes[s].label).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">
                  {c.access === "all" ? t.allYours : c.items.length ? t.shared(c.items.map((i) => i.title ?? t.deletedItem).join(t.sep)) : t.noItems}
                </p>
                {!inactive && c.access === "selected" && (editing === c._id ? (
                  <div className="space-y-2">
                    <ItemPicker value={editRefs} onChange={setEditRefs} />
                    <div className="flex gap-2">
                      <button type="button" className="kb-btn kb-btn-primary text-xs" onClick={() => updateConnection({ tokenId: c._id, itemRefs: editRefs }).then(() => setEditing(null)).catch((e) => setError(errorMessage(e)))}>{t.save}</button>
                      <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => setEditing(null)}>{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="text-xs underline" onClick={() => { setEditing(c._id); setEditRefs(c.items.filter((i) => i.title !== null).map((i) => i.ref)); }}>{t.change}</button>
                ))}
                {!c.revokedAt && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">{t.activity}</summary>
                    {c.activity.length === 0 ? <p className="mt-1 text-muted-foreground">{t.noActivity}</p> : (
                      <ul className="mt-1 space-y-0.5">
                        {c.activity.map((a) => (
                          <li key={`${a.at}-${a.action}`} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">{timeAgo(locale, a.at)}</span>
                            <span>{t.actions[a.action] ?? a.action}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && !creating && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {confirming && (
        <WsConfirm title={confirming.title} body={confirming.body} confirmLabel={confirming.label} onClose={() => setConfirming(null)} onConfirm={confirming.run} />
      )}

      {revoking && (
        <WsConfirm
          title={t.revoke}
          body={t.confirmRevoke(revoking.label)}
          confirmLabel={t.revoke}
          onClose={() => setRevoking(null)}
          onConfirm={() => { revoke({ tokenId: revoking.id }).then(() => posthog.capture("integration_connection_revoked")).catch((e) => setError(errorMessage(e))); }}
        />
      )}

      <FallbackBoundary fallback={null}><WebhooksSection /></FallbackBoundary>
    </div>
  );
}
