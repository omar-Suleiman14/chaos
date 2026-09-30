"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import { Copy, KeyRound, Plus, Webhook, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WsConfirm } from "@/components/workspace/primitives";
import LoadingState from "@/components/LoadingState";
import { webhookEventTypes } from "@/convex/webhookModel";
import type { AttemptOutcome, WebhookEventType, WebhookSentEvent } from "@/convex/webhookModel";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

type Health = "healthy" | "new" | "failing" | "paused" | "disabled";
type DeliveryStatus = "pending" | "retrying" | "succeeded" | "failed" | "cancelled";

const copy = {
  en: {
    title: "Webhooks",
    intro: "Chaos can call your server when something happens, for example when someone submits a response. Optional: everything else works without them.",
    newWebhook: "New webhook",
    how: [
      "Each delivery is signed with a secret only you and your server know, so your server can check it came from Chaos.",
      "Failed deliveries are retried for about 15 hours with growing gaps. After 25 failures in a row the webhook is switched off and you get a notification.",
      "By default a delivery contains ids, counts, scores and times, not what people answered. Answers are sent only if you turn that on.",
      "Chaos only calls public https addresses.",
    ],
    guide: "How to check signatures",
    events: {
      "response.completed": { label: "Response submitted", help: "Someone finished a form or quiz." },
      "response.graded": { label: "Response graded", help: "You changed the marks of a quiz answer." },
      "form.published": { label: "Published", help: "A form or quiz was published." },
      "form.closed": { label: "Closed", help: "A form or quiz stopped accepting responses." },
      "form.reopened": { label: "Reopened", help: "A closed form accepts responses again." },
      "webhook.test": { label: "Test", help: "" },
    } as Record<WebhookSentEvent, { label: string; help: string }>,
    url: "Address (https)", urlHelp: "For example https://example.com/hooks/chaos", description: "Name (optional)",
    whichEvents: "Events", whichItems: "Which forms and quizzes", allItems: "All my forms and quizzes, including future ones", onlyChosen: "Only the ones I choose",
    filter: "Filter", nothing: "Nothing here yet.", includeAnswers: "Include answers and respondent names",
    includeAnswersHelp: "Only turn this on if your server may store personal data. Chaos keeps these deliveries for 24 hours so you can resend them, then erases the content.",
    create: "Create webhook", cancel: "Cancel",
    secretTitle: "Copy the signing secret now", secretHelp: "Put it in your server's settings. Chaos stores it encrypted and cannot show it again.",
    rotatedHelp: (until: string) => `The old secret also signs deliveries until ${until}, so you can switch without missing any.`,
    secretField: "Signing secret", copy: "Copy", copied: "Copied", saved: "I have saved it",
    loading: "Loading webhooks...", none: "No webhooks yet.",
    health: { healthy: "Working", new: "Not used yet", failing: "Failing", paused: "Paused", disabled: "Switched off" } as Record<Health, string>,
    switchedOff: "Switched off after repeated failures. Fix your server, then resume.",
    connectionRevoked: "Its connection was revoked, so it no longer sends anything.",
    failingNote: (n: number) => `${n} failed attempts in a row.`,
    byConnection: (label: string) => `Created by the connected app ${label}. It sends counts only, for the items that app can reach.`,
    all: "All forms and quizzes", some: (titles: string) => `Only: ${titles}`, deleted: "Deleted item", sep: ", ",
    withAnswers: "Includes answers",
    lastOk: (ago: string) => `last delivered ${ago}`, lastFail: (ago: string) => `last failed ${ago}`,
    graceUntil: (at: string) => `Old secret still valid until ${at}.`,
    sendTest: "Send test", testQueued: "Test queued.", rotate: "New secret", confirmRotate: "Create a new secret? The old one keeps working for 24 hours.",
    pause: "Pause", resume: "Resume", remove: "Delete", confirmDelete: (url: string) => `Delete the webhook to ${url}? Its history is deleted too.`,
    history: "Delivery history", hideHistory: "Hide history",
    noDeliveries: "Nothing sent yet. Press Send test to try it.",
    status: { pending: "Sending", retrying: "Will retry", succeeded: "Delivered", failed: "Failed", cancelled: "Not sent" } as Record<DeliveryStatus, string>,
    outcome: {
      success: "OK", http_error: "Error from your server", redirect: "Redirect (not followed)", timeout: "No answer within 10 seconds",
      network_error: "Could not connect", dns_error: "Address not found", blocked_address: "Private or internal address, not allowed",
      invalid_url: "Address not allowed", internal_error: "Chaos could not send it",
    } as Record<AttemptOutcome, string>,
    attempts: (n: number) => (n === 1 ? "1 attempt" : `${n} attempts`), nextRetry: (at: string) => `next try ${at}`,
    resend: "Resend", expired: "Too old to resend", ms: (n: number) => `${n} ms`, attemptN: (n: number) => `#${n}`,
    retention: "History is kept for 30 days. Delivery contents are erased after 7 days, or 24 hours if they contain answers.",
  },
  ar: {
    title: "Webhooks",
    intro: "يستطيع Chaos أن يتصل بخادمك عند حدوث شيء، مثل إرسال أحدهم ردًّا. هذا اختياري: كل شيء آخر يعمل بدونه.",
    newWebhook: "Webhook جديد",
    how: [
      "كل إرسال موقَّع بسرّ لا يعرفه إلا أنت وخادمك، ليتحقق خادمك أنه من Chaos.",
      "يُعاد الإرسال الفاشل نحو 15 ساعة بفواصل تزداد. بعد 25 محاولة فاشلة متتالية يتوقف الـ webhook ويصلك إشعار.",
      "افتراضيًا يحتوي الإرسال على معرّفات وأعداد ودرجات وأوقات، لا على ما أجاب به الناس. لا تُرسل الإجابات إلا إن فعّلت ذلك.",
      "لا يتصل Chaos إلا بعناوين https عامة.",
    ],
    guide: "كيف تتحقق من التوقيع",
    events: {
      "response.completed": { label: "إرسال ردّ", help: "أنهى أحدهم نموذجًا أو اختبارًا." },
      "response.graded": { label: "تصحيح ردّ", help: "غيّرت درجة إجابة في اختبار." },
      "form.published": { label: "النشر", help: "نُشر نموذج أو اختبار." },
      "form.closed": { label: "الإغلاق", help: "توقف نموذج أو اختبار عن استقبال الردود." },
      "form.reopened": { label: "إعادة الفتح", help: "عاد نموذج مغلق يستقبل الردود." },
      "webhook.test": { label: "تجربة", help: "" },
    } as Record<WebhookSentEvent, { label: string; help: string }>,
    url: "العنوان (https)", urlHelp: "مثل https://example.com/hooks/chaos", description: "الاسم (اختياري)",
    whichEvents: "الأحداث", whichItems: "أي النماذج والاختبارات", allItems: "كل نماذجي واختباراتي، بما فيها المستقبلية", onlyChosen: "التي أختارها فقط",
    filter: "تصفية", nothing: "لا شيء هنا بعد.", includeAnswers: "أرسل الإجابات وأسماء المجيبين",
    includeAnswersHelp: "لا تفعّل هذا إلا إن كان مسموحًا لخادمك حفظ بيانات شخصية. يحتفظ Chaos بهذه الإرسالات 24 ساعة لتتمكن من إعادة إرسالها، ثم يمحو محتواها.",
    create: "أنشئ الـ webhook", cancel: "إلغاء",
    secretTitle: "انسخ سرّ التوقيع الآن", secretHelp: "ضعه في إعدادات خادمك. يحفظه Chaos مشفّرًا ولا يستطيع عرضه مرة ثانية.",
    rotatedHelp: (until: string) => `يبقى السرّ القديم يوقّع الإرسالات حتى ${until}، لتنتقل دون أن يفوتك شيء.`,
    secretField: "سرّ التوقيع", copy: "انسخ", copied: "تم النسخ", saved: "حفظته",
    loading: "جارٍ تحميل الـ webhooks...", none: "لا webhooks بعد.",
    health: { healthy: "يعمل", new: "لم يُستخدم بعد", failing: "يفشل", paused: "متوقف مؤقتًا", disabled: "متوقف" } as Record<Health, string>,
    switchedOff: "توقف بعد فشل متكرر. أصلح خادمك ثم استأنفه.",
    connectionRevoked: "سُحب اتصاله، فلم يعد يرسل شيئًا.",
    failingNote: (n: number) => `${n} محاولات فاشلة متتالية.`,
    byConnection: (label: string) => `أنشأه التطبيق المتصل ${label}. يرسل أعدادًا فقط، للعناصر التي يصل إليها ذلك التطبيق.`,
    all: "كل النماذج والاختبارات", some: (titles: string) => `فقط: ${titles}`, deleted: "عنصر محذوف", sep: "، ",
    withAnswers: "يتضمن الإجابات",
    lastOk: (ago: string) => `آخر إرسال ناجح ${ago}`, lastFail: (ago: string) => `آخر فشل ${ago}`,
    graceUntil: (at: string) => `السرّ القديم صالح حتى ${at}.`,
    sendTest: "أرسل تجربة", testQueued: "أُرسلت التجربة إلى الطابور.", rotate: "سرّ جديد", confirmRotate: "إنشاء سرّ جديد؟ يبقى القديم صالحًا 24 ساعة.",
    pause: "أوقف مؤقتًا", resume: "استأنف", remove: "احذف", confirmDelete: (url: string) => `حذف الـ webhook إلى ${url}؟ يُحذف سجله أيضًا.`,
    history: "سجل الإرسال", hideHistory: "أخفِ السجل",
    noDeliveries: "لم يُرسل شيء بعد. اضغط «أرسل تجربة» لتجربته.",
    status: { pending: "يُرسل", retrying: "ستُعاد المحاولة", succeeded: "وصل", failed: "فشل", cancelled: "لم يُرسل" } as Record<DeliveryStatus, string>,
    outcome: {
      success: "تم", http_error: "خطأ من خادمك", redirect: "تحويل (لا يُتبع)", timeout: "لا ردّ خلال 10 ثوانٍ",
      network_error: "تعذّر الاتصال", dns_error: "العنوان غير موجود", blocked_address: "عنوان خاص أو داخلي، غير مسموح",
      invalid_url: "العنوان غير مسموح", internal_error: "تعذّر على Chaos الإرسال",
    } as Record<AttemptOutcome, string>,
    attempts: (n: number) => (n === 1 ? "محاولة واحدة" : n === 2 ? "محاولتان" : `${n} محاولات`), nextRetry: (at: string) => `المحاولة التالية ${at}`,
    resend: "أعد الإرسال", expired: "أقدم من أن يُعاد", ms: (n: number) => `${n} ملّي ثانية`, attemptN: (n: number) => `#${n}`,
    retention: "يُحفظ السجل 30 يومًا. يُمحى محتوى الإرسال بعد 7 أيام، أو بعد 24 ساعة إن احتوى إجابات.",
  },
};

const badge: Record<Health, string> = {
  healthy: "text-green-700 dark:text-green-400",
  new: "text-muted-foreground",
  failing: "text-destructive",
  paused: "text-muted-foreground",
  disabled: "text-destructive",
};

function ItemChooser({ value, onChange }: { value: string[]; onChange: (refs: string[]) => void }) {
  const t = useCopy(copy);
  const items = useQuery(api.integrations.listShareableItems);
  const [filter, setFilter] = useState("");
  if (items === undefined) return <LoadingState label={t.loading} />;
  const shown = items.filter((i) => i.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-2">
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} aria-label={t.filter} className="kb-input text-sm" />
      <ul className="max-h-48 overflow-y-auto border-2 border-foreground/10 divide-y divide-foreground/5">
        {shown.map((i) => (
          <li key={i.ref}>
            <label className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={value.includes(i.ref)} onChange={(e) => onChange(e.target.checked ? [...value, i.ref] : value.filter((r) => r !== i.ref))} />
              <span className="flex-1 truncate">{i.title}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t.nothing}</li>}
      </ul>
    </div>
  );
}

function SecretBox({ secret, note, onDone }: { secret: string; note?: string; onDone: () => void }) {
  const t = useCopy(copy);
  const [copied, setCopied] = useState(false);
  return (
    <section className="chaos-card border-primary p-5 space-y-3" role="alert" aria-label={t.secretTitle}>
      <h3 className="chaos-heading text-sm flex items-center gap-2"><KeyRound size={16} /> {t.secretTitle}</h3>
      <p className="text-sm text-muted-foreground">{t.secretHelp}{note ? ` ${note}` : ""}</p>
      <div className="flex gap-2">
        <input readOnly dir="ltr" value={secret} className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={t.secretField} />
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => navigator.clipboard?.writeText(secret).then(() => setCopied(true))}><Copy size={14} /> {copied ? t.copied : t.copy}</button>
      </div>
      <button type="button" className="text-xs underline" onClick={onDone}>{t.saved}</button>
    </section>
  );
}

function DeliveryHistory({ subscriptionId, active, now }: { subscriptionId: Id<"webhookSubscriptions">; active: boolean; now: number }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const rows = useQuery(api.webhooks.listDeliveries, { subscriptionId });
  const resend = useMutation(api.webhooks.resendDelivery);
  const [error, setError] = useState("");
  if (rows === undefined) return <LoadingState label={t.loading} />;
  if (!rows.length) return <p className="text-xs text-muted-foreground">{t.noDeliveries}</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-foreground/10 border-2 border-foreground/10 text-xs">
        {rows.map((d) => {
          const finished = d.status !== "pending" && d.status !== "retrying";
          const canResend = active && finished && d.payloadAvailable && d.payloadExpiresAt > now;
          return (
            <li key={d._id} className="px-3 py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold">{t.events[d.event].label}</span>
                <span className={d.status === "failed" ? "text-destructive" : d.status === "succeeded" ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>{t.status[d.status]}</span>
                <span className="text-muted-foreground">{formatDateTime(locale, d.createdAt)}</span>
                <span className="text-muted-foreground">{t.attempts(d.attempts)}</span>
                {d.lastStatusCode !== null && <span dir="ltr" className="font-mono">HTTP {d.lastStatusCode}</span>}
                {d.nextAttemptAt !== null && <span className="text-muted-foreground">{t.nextRetry(timeAgo(locale, d.nextAttemptAt))}</span>}
                {d.containsAnswers && <span className="text-muted-foreground">{t.withAnswers}</span>}
                <span className="ms-auto">
                  {finished && (canResend
                    ? <button type="button" className="underline" onClick={() => resend({ deliveryId: d._id }).catch((e) => setError(errorMessage(e)))}>{t.resend}</button>
                    : !d.payloadAvailable || d.payloadExpiresAt <= now ? <span className="text-muted-foreground">{t.expired}</span> : null)}
                </span>
              </div>
              {d.attemptLog.length > 0 && (
                <ul className="text-muted-foreground space-y-0.5">
                  {d.attemptLog.map((a) => (
                    <li key={a.attempt} className="flex flex-wrap gap-x-3">
                      <span dir="ltr">{t.attemptN(a.attempt)}</span>
                      <span>{formatDateTime(locale, a.at)}</span>
                      <span>{t.outcome[a.outcome]}</span>
                      {a.statusCode !== null && <span dir="ltr" className="font-mono">{a.statusCode}</span>}
                      <span>{t.ms(a.durationMs)}</span>
                      {a.detail && <span dir="ltr" className="font-mono">{a.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">{t.retention}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function WebhooksSection() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const hooks = useQuery(api.webhooks.listWebhooks);
  const create = useMutation(api.webhooks.createWebhook);
  const setPaused = useMutation(api.webhooks.setWebhookPaused);
  const remove = useMutation(api.webhooks.deleteWebhook);
  const rotate = useMutation(api.webhooks.rotateWebhookSecret);
  const sendTest = useMutation(api.webhooks.sendTestWebhook);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>(["response.completed"]);
  const [target, setTarget] = useState<"all" | "selected">("all");
  const [refs, setRefs] = useState<string[]>([]);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [secret, setSecret] = useState<{ value: string; note?: string } | null>(null);
  const [open, setOpen] = useState<Id<"webhookSubscriptions"> | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ kind: "rotate" | "delete"; id: Id<"webhookSubscriptions">; url: string } | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  const run = (action: Promise<unknown>, done?: string) => {
    setError("");
    setNotice("");
    action.then(() => done && setNotice(done)).catch((e) => setError(errorMessage(e)));
  };

  const submit = async () => {
    setError("");
    try {
      const result = await create({ url, description, events, target, itemRefs: target === "selected" ? refs : [], includeAnswers });
      setSecret({ value: result.secret });
      setCreating(false);
      setUrl("");
      setDescription("");
      setRefs([]);
      setIncludeAnswers(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="webhooks-title">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 id="webhooks-title" className="chaos-display text-2xl mb-1 flex items-center gap-2"><Webhook size={20} /> {t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.intro}</p>
        </div>
        {!creating && <button type="button" onClick={() => { setCreating(true); setSecret(null); }} className="kb-btn kb-btn-primary flex items-center gap-2"><Plus size={16} /> {t.newWebhook}</button>}
      </div>

      <div className="chaos-card bg-card p-5 text-sm space-y-2">
        <ul className="list-disc ps-5 space-y-1 text-muted-foreground">{t.how.map((line) => <li key={line}>{line}</li>)}</ul>
        <Link href="/docs/webhooks" className="text-xs underline">{t.guide}</Link>
      </div>

      {secret && <SecretBox secret={secret.value} note={secret.note} onDone={() => setSecret(null)} />}

      {creating && (
        <div className="chaos-card bg-card p-5 space-y-4" role="group" aria-label={t.newWebhook}>
          <div className="flex justify-between items-center">
            <h3 className="chaos-heading text-sm">{t.newWebhook}</h3>
            <button type="button" onClick={() => setCreating(false)} aria-label={t.cancel}><X size={16} /></button>
          </div>
          <label className="block text-sm">{t.url}
            <input dir="ltr" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.urlHelp} className="kb-input mt-1" maxLength={2048} />
          </label>
          <label className="block text-sm">{t.description}<input value={description} onChange={(e) => setDescription(e.target.value)} className="kb-input mt-1" maxLength={80} /></label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.whichEvents}</legend>
            {webhookEventTypes.map((e) => (
              <label key={e} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={events.includes(e)} onChange={(ev) => setEvents(ev.target.checked ? [...events, e] : events.filter((x) => x !== e))} />
                <span>{t.events[e].label} <code dir="ltr" className="text-[11px] text-muted-foreground">{e}</code><span className="block text-xs text-muted-foreground">{t.events[e].help}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t.whichItems}</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={target === "all"} onChange={() => setTarget("all")} /> {t.allItems}</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={target === "selected"} onChange={() => setTarget("selected")} /> {t.onlyChosen}</label>
            {target === "selected" && <ItemChooser value={refs} onChange={setRefs} />}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={includeAnswers} onChange={(e) => setIncludeAnswers(e.target.checked)} />
            <span>{t.includeAnswers}<span className="block text-xs text-muted-foreground">{t.includeAnswersHelp}</span></span>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={submit} disabled={!url.trim() || !events.length || (target === "selected" && !refs.length)} className="kb-btn kb-btn-primary disabled:opacity-50">{t.create}</button>
        </div>
      )}

      {hooks === undefined ? <LoadingState label={t.loading} /> : hooks.length === 0 ? (
        <p className="chaos-card bg-card p-6 text-sm text-muted-foreground text-center">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {hooks.map((h) => {
            const active = h.status === "active";
            return (
              <li key={h._id} className={`chaos-card bg-card p-5 space-y-2 ${h.status === "paused" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold break-all"><span dir="ltr">{h.url}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {h.description && <>{h.description} · </>}
                      <span className={`font-bold ${badge[h.health]}`}>{t.health[h.health]}</span>
                      {h.lastSuccessAt !== null && <> · {t.lastOk(timeAgo(locale, h.lastSuccessAt))}</>}
                      {h.lastFailureAt !== null && <> · {t.lastFail(timeAgo(locale, h.lastFailureAt))}</>}
                      {" · "}<span dir="ltr" className="font-mono">{h.secretHint}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {active && <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => run(sendTest({ subscriptionId: h._id }).then(() => setOpen(h._id)), t.testQueued)}>{t.sendTest}</button>}
                    <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => setPending({ kind: "rotate", id: h._id, url: h.url })}>{t.rotate}</button>
                    {h.disabledReason !== "connection_revoked" && (
                      <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => run(setPaused({ subscriptionId: h._id, paused: active }))}>{active ? t.pause : t.resume}</button>
                    )}
                    <button type="button" className="kb-btn kb-btn-danger text-xs" onClick={() => setPending({ kind: "delete", id: h._id, url: h.url })}>{t.remove}</button>
                  </div>
                </div>
                {h.status === "disabled" && <p className="text-xs text-destructive">{h.disabledReason === "connection_revoked" ? t.connectionRevoked : t.switchedOff}</p>}
                {h.health === "failing" && <p className="text-xs text-destructive">{t.failingNote(h.consecutiveFailures)}</p>}
                <p className="text-xs">{h.events.map((e) => t.events[e].label).join(" · ")}{h.includeAnswers ? ` · ${t.withAnswers}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {h.connection ? t.byConnection(h.connection.label ?? "") : h.target === "all" ? t.all : t.some(h.items.map((i) => i.title ?? t.deleted).join(t.sep))}
                </p>
                {h.previousSecretExpiresAt !== null && h.previousSecretExpiresAt > now && <p className="text-xs text-muted-foreground">{t.graceUntil(formatDateTime(locale, h.previousSecretExpiresAt))}</p>}
                <button type="button" className="text-xs underline" aria-expanded={open === h._id} onClick={() => setOpen(open === h._id ? null : h._id)}>{open === h._id ? t.hideHistory : t.history}</button>
                {open === h._id && <DeliveryHistory subscriptionId={h._id} active={active} now={now} />}
              </li>
            );
          })}
        </ul>
      )}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {error && !creating && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && (
        <WsConfirm
          title={pending.kind === "rotate" ? t.rotate : t.remove}
          body={pending.kind === "rotate" ? t.confirmRotate : t.confirmDelete(pending.url)}
          confirmLabel={pending.kind === "rotate" ? t.rotate : t.remove}
          danger={pending.kind === "delete"}
          onClose={() => setPending(null)}
          onConfirm={() => {
            if (pending.kind === "delete") run(remove({ subscriptionId: pending.id }));
            else run(rotate({ subscriptionId: pending.id }).then((r) => setSecret({ value: r.secret, note: t.rotatedHelp(formatDateTime(locale, r.previousSecretExpiresAt)) })));
          }}
        />
      )}
    </section>
  );
}
