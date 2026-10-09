"use client";

import { FocusInput } from "@/components/InitialFocus";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { setFormStatusLocally, useOptimisticMutation } from "@/lib/optimistic";
import posthog from "@/lib/analytics";
import { Check, ChevronRight, Copy, Globe, KeyRound, Link2, Plus, UserRound, Users, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormDefinition, Rule } from "@/convex/formLogic";
import { newId } from "@/convex/formLogic";
import { formatScheduleTime, isValidTimeZone, localToUtc, utcToLocal } from "@/convex/formSchedule";
import type { FormSettings } from "@/convex/formModel";
import { defaultFormSettings } from "@/convex/formModel";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import { WsSwitch } from "@/components/workspace/primitives";
import FallbackBoundary from "@/components/FallbackBoundary";
import { HIDDEN_FIELD_LIMITS, hiddenFieldNameError } from "@/convex/formRespondent";
import DocHint from "@/components/forms/DocHint";
import { Select } from "@/components/workspace/Select";
import RuleEditor from "./RuleEditor";
import { linkOrigin } from "@/lib/hosts";

type EditableSettings = Omit<FormSettings, "accessCodeHash">;

function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}
function knownTimeZones(): string[] {
  try { return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; }
}
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

function ScheduleRows({ s, set }: { s: EditableSettings; set: <K extends keyof EditableSettings>(key: K, value: EditableSettings[K]) => void }) {
  const t = useCopy(copy);
  const [browserZone] = useState(browserTimeZone);
  const zones = useMemo(() => knownTimeZones(), []);
  const zone = s.timezone ?? browserZone;
  const [zoneDraft, setZoneDraft] = useState<string | null>(null);
  const hasSchedule = s.opensAt !== undefined || s.closesAt !== undefined;
  const legacy = hasSchedule && s.timezone === undefined;
  const setTime = (key: "opensAt" | "closesAt", value: string) => {
    const ms = value ? localToUtc(value, zone) : undefined;
    set(key, ms);
    if (ms !== undefined && s.timezone === undefined) set("timezone", zone);
  };
  const timeRow = (key: "opensAt" | "closesAt", label: string, clearLabel: string, summary: (d: string) => string) => (
    <Row label={label} help={s[key] !== undefined ? summary(formatScheduleTime(s[key]!, zone)) : undefined} isDefault={s[key] === undefined}>
      <input type="datetime-local" value={s[key] !== undefined ? utcToLocal(s[key]!, zone) : ""} onChange={(e) => setTime(key, e.target.value)} className="kb-input w-60" aria-label={`${label} (${zone})`} />
      {s[key] !== undefined && <button type="button" className="ws-icon-button" onClick={() => set(key, undefined)} aria-label={clearLabel} title={t.clear}><X size={15} /></button>}
    </Row>
  );
  const invalidZone = zoneDraft !== null && !isValidTimeZone(zoneDraft);
  return (
    <>
      <Row label={t.timezone} help={legacy ? t.timezoneLegacy(zone) : t.timezoneHelp} isDefault={s.timezone === undefined}>
        <input list="form-time-zones" value={zoneDraft ?? zone} dir="ltr" className="kb-input w-60" aria-label={t.timezone} aria-invalid={invalidZone}
          onChange={(e) => { setZoneDraft(e.target.value); if (isValidTimeZone(e.target.value)) set("timezone", e.target.value); }}
          onBlur={() => setZoneDraft(null)} />
        <datalist id="form-time-zones">{zones.map((z) => <option key={z} value={z}>{z}</option>)}</datalist>
      </Row>
      {invalidZone && <p role="alert" className="text-xs text-destructive px-1">{t.timezoneInvalid}</p>}
      {timeRow("opensAt", t.opens, t.clearOpening, t.scheduleOpens)}
      {timeRow("closesAt", t.closes, t.clearClosing, t.scheduleCloses)}
      {hasSchedule && <p className="text-xs text-muted-foreground px-1">{t.scheduleNote}</p>}
    </>
  );
}

/**
 * One setting per row, like a receipt: the name hard left, the control hard
 * right. Rows left at their default are quiet (gray); changed ones read in ink,
 * so what is unusual about this form is what you notice first.
 */
function Row({ label, help, isDefault, children, stack }: { label: string; help?: string; isDefault?: boolean; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={`ws-row ${stack ? "ws-row--stack" : ""}`} data-default={isDefault ? "true" : "false"}>
      <div className="ws-row__text">
        <span className="ws-row__label">{label}</span>
        {help && <span className="ws-row__help">{help}</span>}
      </div>
      <div className="ws-row__control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <WsSwitch checked={checked} onChange={onChange} label={label} hideLabel />;
}

const copy = {
  en: {
    statusWords: { draft: "Moved back to draft", live: "Reopened", closed: "Form closed", archived: "Archived" },
    statusText: { draft: "Draft", live: "Live", closed: "Closed", archived: "Archived" },
    copyFailed: "Could not copy the link.", copied: "Link copied", linkNow: (url: string) => `Link is now ${url}`, linkRemoved: "Custom link removed",
    link: "Link", copyLink: "Copy link", customLink: "Custom link", customLinkHelp: "An address with your name, like a profile link.",
    chooseUsername: "Choose your username", usernameHelp: "It appears in all your custom links. You can change it later.", usernamePlaceholder: "yourname",
    linkName: "Link name", linkNamePlaceholder: "my-form", saveLink: "Save link", cancel: "Cancel", change: "Change",
    ownerOnly: "Only the owner can change the link, collection, access and privacy settings.",
    anyone: "Anyone", anyoneRow: "Anyone with the link", anyoneHelp: "Anonymous. Chaos can't limit anonymous people to one response.",
    signedIn: "Signed in", signedInRow: "Signed-in people", signedInHelp: "People signed in to Chaos. Their responses are linked to their account.", team: "My team", teamRow: "Your team only", teamHelp: "Only signed-in members of your Business team can respond. Live games of this quiz are team-only too.", whichTeam: "Team",
    withCode: "With a code", withCodeRow: "People with a code", withCodeHelp: "People you give an access code to, for example invited guests.",
    sharing: "Sharing", publishForLink: "Publish to get a link people can open.", notPublished: "Not published", status: "Status", close: "Close", reopen: "Reopen", restore: "Restore",
    whoCanRespond: "Who can respond", accessCode: "Access code", keepCode: "Leave empty to keep the current code.", chooseCode: "Choose a code",
    onePerPerson: "One response per person", onePerPersonHelp: "They can still edit if editing is allowed.",
    limits: "Limits", responseLimit: "Response limit", responseLimitHelp: "The form says it's full and stops. Nothing is thrown away.", noLimit: "No limit",
    timezone: "Time zone", timezoneHelp: "Opening and closing times are read in this zone. It is saved with the schedule.", timezoneInvalid: "Enter a time zone name such as Asia/Riyadh or Europe/London.",
    timezoneLegacy: (zone: string) => `This schedule was saved without a time zone, so it is shown in your browser's zone (${zone}). Save to keep it in ${zone}.`,
    scheduleOpens: (d: string) => `Opens ${d}`, scheduleCloses: (d: string) => `Closes ${d}`,
    scheduleNote: "Answers after the closing time are refused.",
    editAfterClose: "Allow edits after closing", editAfterCloseHelp: "Edit links keep working after the form closes.",
    editNote: "People edit with the private link shown after they submit. Earlier versions are kept.",
    opens: "Opens", closes: "Closes", clearOpening: "Clear opening time", clearClosing: "Clear closing time", clear: "Clear",
    moreSettings: "More settings", responses: "Responses", resume: "Continue on another device", resumeHelp: "A private 30-day link. You can't see these unfinished copies.",
    partial: "Collect unfinished responses", partialHelp: "People are told you can see answers before they submit.", editAfter: "Edit after submitting", editAfterHelp: "A private edit link comes with the receipt.",
    receipt: "Receipt code", closedMessage: "Message when closed or full", closedPlaceholder: "This form is closed.",
    privacy: "Privacy", deleteAfter: "Delete responses after", deleteAfterHelp: "Files go with their response.", never: "Never", deleteAfterDays: "Delete responses after (days)", days: "days",
    indexing: "Show in search engines",
    privacyNote: "Connected apps see counts, never answers. Deleting the form removes everything.",
    notifTeam: "Notifications and team", everyResponse: "Every new response", everyResponseHelp: "Once per response, in Chaos.", notifyEvery: "Notify me about every new response",
    matching: "Responses that match", rule: (n: number) => `Rule ${n}`, ruleMessage: (n: number) => `Rule ${n} message`, notifText: "Notification text, e.g. Urgent request",
    removeRule: "Remove rule", addRule: "Add a rule", approval: "Editors need my approval to publish", folder: "Folder", none: "None",
    archive: "Archive", archiveHelp: "Hidden from people answering. Responses are kept.",
    unsaved: "Unsaved settings", unsavedChanges: "Unsaved changes", discard: "Discard", saving: "Saving…", save: "Save",
    saved: "Settings saved", savedCode: "Settings saved. The new access code is in use.",
    allowedEmails: "Allowed emails", allowedEmailsHelp: "One per line. Leave emails and domains empty to allow anyone signed in.",
    allowedDomains: "Allowed domains", allowedDomainsHelp: "For example school.edu. Exact match, verified emails only.", domainsPlaceholder: "school.edu",
    accessGuide: "How access, limits, schedules and retention fit together.",
    sumRestricted: "listed emails only", sumOne: "one response each", sumLimit: (n: number) => `up to ${n} responses`, sumScheduled: "scheduled",
    sumPartial: "unfinished answers saved", sumRetention: (n: number) => `deleted after ${n} days`, sumKept: "kept until you delete them",
    hiddenFields: "Hidden fields", hiddenFieldsHelp: "Capture link values such as ?source=instagram. Saved with each response and in exports, never as answers.",
    hiddenPlaceholder: "source, campaign", hiddenExample: (url: string) => `Example link: ${url}`,
    hiddenInvalid: (n: string) => `“${n}” can't be used. Start with a letter; use letters, digits, - or _ (up to 40). lang, embed, resume, edit and score are taken.`,
    hiddenDuplicate: (n: string) => `“${n}” is listed twice.`, hiddenTooMany: (n: number) => `Use at most ${n} hidden fields.`,
    partialNote: "Saved a few seconds after each answer, so Results can show where people stop. Retention applies to them too.",
    branding: "Branding", hideBranding: "Hide Chaos branding", hideBrandingHelp: "Removes the Chaos logo from your form. Privacy and Terms links stay.",
    hideBrandingPro: "Available with Pro.", hideBrandingLapsed: "Your plan no longer includes this, so respondents see the branding again.",
  },
  ar: {
    statusWords: { draft: "أُعيد النموذج إلى مسودة", live: "أُعيد فتح النموذج", closed: "أُغلق النموذج", archived: "أُرشف النموذج" },
    statusText: { draft: "مسودة", live: "منشور", closed: "مغلق", archived: "مؤرشف" },
    copyFailed: "تعذّر نسخ الرابط.", copied: "تم نسخ الرابط", linkNow: (url: string) => `الرابط الآن ${url}`, linkRemoved: "أُزيل الرابط المخصص",
    link: "الرابط", copyLink: "انسخ الرابط", customLink: "رابط مخصص", customLinkHelp: "عنوان يحمل اسمك، مثل رابط الملف الشخصي.",
    chooseUsername: "اختر اسم المستخدم", usernameHelp: "يظهر في كل روابطك المخصصة. يمكنك تغييره لاحقًا.", usernamePlaceholder: "اسمك",
    linkName: "اسم الرابط", linkNamePlaceholder: "نموذجي", saveLink: "احفظ الرابط", cancel: "إلغاء", change: "غيّر",
    ownerOnly: "المالك وحده يغيّر إعدادات الرابط والتجميع والوصول والخصوصية.",
    anyone: "أي شخص", anyoneRow: "أي شخص لديه الرابط", anyoneHelp: "مجهول الهوية. لا يستطيع Chaos حصر المجهولين بردّ واحد.",
    signedIn: "مسجّلو الدخول", signedInRow: "المسجّلون في Chaos", signedInHelp: "من سجّلوا الدخول إلى Chaos. تُربط ردودهم بحساباتهم.", team: "فريقي", teamRow: "فريقك فقط", teamHelp: "لا يرد إلا أعضاء فريق الأعمال المسجّلون. وتصبح الألعاب المباشرة لهذا الاختبار للفريق فقط أيضًا.", whichTeam: "الفريق",
    withCode: "برمز", withCodeRow: "من لديهم رمز", withCodeHelp: "من تعطيهم رمز وصول، مثل الضيوف المدعوين.",
    sharing: "المشاركة", publishForLink: "انشر النموذج لتحصل على رابط يفتحه الناس.", notPublished: "غير منشور", status: "الحالة", close: "أغلق", reopen: "أعد الفتح", restore: "استعد",
    whoCanRespond: "من يستطيع الرد", accessCode: "رمز الوصول", keepCode: "اتركه فارغًا للإبقاء على الرمز الحالي.", chooseCode: "اختر رمزًا",
    onePerPerson: "ردّ واحد لكل شخص", onePerPersonHelp: "يستطيعون التعديل إذا كان التعديل مسموحًا.",
    limits: "الحدود", responseLimit: "الحد الأقصى للردود", responseLimitHelp: "يعلن النموذج أنه ممتلئ ويتوقف. لا يُحذف شيء.", noLimit: "بلا حد",
    timezone: "المنطقة الزمنية", timezoneHelp: "تُقرأ أوقات الفتح والإغلاق بهذه المنطقة، وتُحفظ مع الجدول.", timezoneInvalid: "أدخل اسم منطقة زمنية مثل Asia/Riyadh أو Europe/London.",
    timezoneLegacy: (zone: string) => `حُفظ هذا الجدول دون منطقة زمنية، لذا يُعرض بمنطقة متصفحك (${zone}). احفظ ليبقى بمنطقة ${zone}.`,
    scheduleOpens: (d: string) => `يفتح ${d}`, scheduleCloses: (d: string) => `يُغلق ${d}`,
    scheduleNote: "تُرفض الإجابات بعد وقت الإغلاق.",
    editAfterClose: "السماح بالتعديل بعد الإغلاق", editAfterCloseHelp: "تبقى روابط التعديل تعمل بعد إغلاق النموذج.",
    editNote: "يعدّل المجيب عبر الرابط الخاص الذي يظهر بعد الإرسال. تُحفظ النسخ السابقة.",
    opens: "يفتح", closes: "يُغلق", clearOpening: "امسح وقت الفتح", clearClosing: "امسح وقت الإغلاق", clear: "امسح",
    moreSettings: "إعدادات أخرى", responses: "الردود", resume: "المتابعة من جهاز آخر", resumeHelp: "رابط خاص صالح 30 يومًا. لا تستطيع رؤية هذه النسخ غير المكتملة.",
    partial: "اجمع الردود غير المكتملة", partialHelp: "يُبلَّغ الناس بأنك ترى الإجابات قبل إرسالها.", editAfter: "التعديل بعد الإرسال", editAfterHelp: "يصل رابط تعديل خاص مع الإيصال.",
    receipt: "رمز الإيصال", closedMessage: "رسالة الإغلاق أو الامتلاء", closedPlaceholder: "هذا النموذج مغلق.",
    privacy: "الخصوصية", deleteAfter: "احذف الردود بعد", deleteAfterHelp: "تُحذف الملفات مع ردودها.", never: "أبدًا", deleteAfterDays: "احذف الردود بعد (بالأيام)", days: "يومًا",
    indexing: "الظهور في محركات البحث",
    privacyNote: "ترى التطبيقات المتصلة الأعداد فقط، لا الإجابات. حذف النموذج يزيل كل شيء.",
    notifTeam: "الإشعارات والفريق", everyResponse: "كل ردّ جديد", everyResponseHelp: "مرة لكل ردّ، داخل Chaos.", notifyEvery: "أشعرني بكل ردّ جديد",
    matching: "الردود المطابقة", rule: (n: number) => `القاعدة ${n}`, ruleMessage: (n: number) => `رسالة القاعدة ${n}`, notifText: "نص الإشعار، مثل: طلب عاجل",
    removeRule: "احذف القاعدة", addRule: "أضف قاعدة", approval: "يحتاج المحررون إلى موافقتي للنشر", folder: "المجلد", none: "بلا",
    archive: "الأرشيف", archiveHelp: "يُخفى عمّن يجيبون. تبقى الردود محفوظة.",
    unsaved: "إعدادات غير محفوظة", unsavedChanges: "تغييرات غير محفوظة", discard: "تجاهل", saving: "جارٍ الحفظ…", save: "احفظ",
    saved: "حُفظت الإعدادات", savedCode: "حُفظت الإعدادات. رمز الوصول الجديد قيد الاستخدام.",
    allowedEmails: "البريد المسموح", allowedEmailsHelp: "عنوان في كل سطر. اترك البريد والنطاقات فارغة للسماح لأي مسجّل.",
    allowedDomains: "النطاقات المسموحة", allowedDomainsHelp: "مثل school.edu. تطابق تام، وللبريد الموثّق فقط.", domainsPlaceholder: "school.edu",
    accessGuide: "كيف يعمل الوصول والحدود والجدولة ومدة الاحتفاظ معًا.",
    sumRestricted: "للعناوين المدرجة فقط", sumOne: "ردّ واحد لكل شخص", sumLimit: (n: number) => `حتى ${n} ردّ`, sumScheduled: "مجدول",
    sumPartial: "تُحفظ الإجابات غير المكتملة", sumRetention: (n: number) => `تُحذف بعد ${n} يومًا`, sumKept: "تبقى حتى تحذفها",
    hiddenFields: "حقول مخفية", hiddenFieldsHelp: "التقط قيمًا من الرابط مثل ‎?source=instagram. تُحفظ مع كل رد وفي التصدير، ولا تُعد إجابات.",
    hiddenPlaceholder: "source, campaign", hiddenExample: (url: string) => `رابط مثال: ${url}`,
    hiddenInvalid: (n: string) => `لا يمكن استخدام «${n}». ابدأ بحرف واستخدم حروفًا لاتينية أو أرقامًا أو - أو _ (حتى 40). الأسماء lang وembed وresume وedit وscore محجوزة.`,
    hiddenDuplicate: (n: string) => `«${n}» مكرر.`, hiddenTooMany: (n: number) => `استخدم ${n} حقلًا مخفيًا على الأكثر.`,
    partialNote: "تُحفظ بعد كل إجابة بثوانٍ لتُظهر النتائج أين يتوقف الناس. تنطبق عليها مدة الاحتفاظ أيضًا.",
    branding: "العلامة التجارية", hideBranding: "إخفاء علامة Chaos", hideBrandingHelp: "يزيل شعار Chaos من نموذجك. تبقى روابط الخصوصية والشروط.",
    hideBrandingPro: "متاح مع Pro.", hideBrandingLapsed: "لم تعد خطتك تشمل هذا، لذا يرى المجيبون العلامة مجددًا.",
  },
};

/** A comma, space or newline separated list. The typed text is kept while focused; otherwise it shows the parsed list. */
function ListInput({ value, onChange, label, placeholder, multiline, invalid }: {
  value: string[] | undefined; onChange: (next: string[] | undefined) => void; label: string; placeholder?: string; multiline?: boolean; invalid?: boolean;
}) {
  const joined = (value ?? []).join(multiline ? "\n" : ", ");
  const [draft, setDraft] = useState<string | null>(null);
  const change = (raw: string) => { setDraft(raw); const list = raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean); onChange(list.length ? list : undefined); };
  const common = {
    value: draft ?? joined, placeholder, "aria-label": label, "aria-invalid": invalid || undefined, dir: "ltr" as const, spellCheck: false,
    onFocus: () => setDraft(joined), onBlur: () => setDraft(null),
  };
  return multiline
    ? <textarea {...common} rows={3} className="kb-input text-sm font-mono" onChange={(e) => change(e.target.value)} />
    : <input {...common} className="kb-input text-sm font-mono" onChange={(e) => change(e.target.value)} />;
}

/** Custom link: chaos.fail/<username>/<slug>. Asks for a username only when someone first wants one. */
function CustomLink({ formId, slug, shareId, title, announce }: {
  formId: Id<"forms">; slug: string | null; shareId: string; title: string;
  announce?: (text: string, undo: (() => void) | null) => void;
}) {
  const t = useCopy(copy);
  const me = useQuery(api.links.getMyLinkIdentity);
  const chooseUsername = useMutation(api.links.chooseUsername);
  const setFormSlug = useMutation(api.links.setFormSlug);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [draft, setDraft] = useState(slug ?? slugify(title));
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const origin = linkOrigin("main");
  const host = origin.replace(/^https?:\/\//, "");
  const needsUsername = !!me && !me.chosen;
  const live = slug && me ? `${origin}/${me.username}/${slug}` : `${origin}/f/${shareId}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(live); setCopied(true); setTimeout(() => setCopied(false), 1600); toast.success(t.copied, { id: "copy-link" }); } catch { toast.error(t.copyFailed, { id: "copy-link" }); }
  };
  const save = async () => {
    setError("");
    try {
      if (needsUsername) await chooseUsername({ username });
      const before = slug;
      const saved = await setFormSlug({ formId, slug: draft });
      setEditing(false);
      announce?.(t.linkNow(`${host}/${me?.chosen ? me.username : username.toLowerCase()}/${saved}`), () => { setFormSlug({ formId, slug: before }).catch((e) => toast.error(e)); });
    } catch (e) { setError(errorMessage(e)); }
  };
  const turnOff = async () => {
    const before = slug;
    try {
      await setFormSlug({ formId, slug: null });
      setEditing(false);
      announce?.(t.linkRemoved, () => { if (before) setFormSlug({ formId, slug: before }).catch((e) => toast.error(e)); });
    } catch (e) { toast.error(e); }
  };

  return (
    <>
      <Row label={t.link} isDefault={!slug}>
        <a href={live} target="_blank" rel="noreferrer" className="ws-row__value ws-row__value--link truncate max-w-[22rem]">{live.replace(/^https?:\/\//, "")}</a>
        <button type="button" className="ws-icon-button" onClick={() => void copyLink()} aria-label={t.copyLink} title={t.copyLink}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
      </Row>
      <Row label={t.customLink} help={slug || editing ? undefined : t.customLinkHelp} isDefault={!slug && !editing}>
        <Switch label={t.customLink} checked={!!slug || editing} onChange={(on) => { setError(""); if (on) { setDraft(slug ?? slugify(title)); setEditing(true); } else if (slug) void turnOff(); else setEditing(false); }} />
      </Row>
      {editing && (
        <div className="ws-row ws-row--stack">
          {needsUsername && (
            <label className="grid gap-1.5">
              <span className="ws-row__label flex items-center gap-2"><UserRound size={16} aria-hidden="true" /> {t.chooseUsername}</span>
              <span className="ws-row__help">{t.usernameHelp}</span>
              <FocusInput className="kb-input max-w-sm" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.usernamePlaceholder} autoComplete="username" focusOnMount />
            </label>
          )}
          <label className="grid gap-1.5">
            <span className="ws-row__label flex items-center gap-2"><Link2 size={16} aria-hidden="true" /> {t.linkName}</span>
            <span className="ws-link-field" dir="ltr">
              <span className="ws-link-field__prefix">{host}/{needsUsername ? (username.trim().toLowerCase() || t.usernamePlaceholder) : me?.username ?? "…"}/</span>
              <FocusInput value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setDraft(slugify(draft))} placeholder={t.linkNamePlaceholder} focusOnMount={!needsUsername} aria-label={t.linkName} />
            </span>
          </label>
          {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="ws-btn ws-btn--primary" onClick={() => void save()} disabled={!me || !slugify(draft) || (needsUsername && username.trim().length < 3)}>{t.saveLink}</button>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => { setEditing(false); setError(""); }}>{t.cancel}</button>
          </div>
        </div>
      )}
      {slug && !editing && (
        <Row label={t.linkName} isDefault={false}>
          <button type="button" className="ws-link-quiet" onClick={() => { setDraft(slug); setEditing(true); }}>{t.change}</button>
        </Row>
      )}
    </>
  );
}

export default function SettingsTab({ formId, settings, hasAccessCode, groupName, status, published, def, isOwner, announce, slug, shareId, canHideBranding = false }: {
  formId: Id<"forms">;
  settings: EditableSettings;
  hasAccessCode: boolean;
  groupName?: string;
  status: "draft" | "live" | "closed" | "archived";
  published: boolean;
  def: FormDefinition;
  isOwner: boolean;
  announce?: (text: string, undo: (() => void) | null) => void;
  slug: string | null;
  shareId: string;
  /** From the server: the owner's plan allows hiding branding. */
  canHideBranding?: boolean;
}) {
  const t = useCopy(copy);
  const update = useMutation(api.forms.updateFormSettings);
  const setStatus = useOptimisticMutation(api.forms.setFormStatus, setFormStatusLocally);
  const [s, setS] = useState<EditableSettings>(settings);
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const [group, setGroup] = useState(groupName ?? "");
  const [code, setCode] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const serverJson = JSON.stringify(settings);
  const previousServer = useRef(serverJson);
  useEffect(() => {
    const previous = previousServer.current;
    previousServer.current = serverJson;
    setS((local) => JSON.stringify(local) === previous ? JSON.parse(serverJson) : local);
  }, [serverJson]);
  const previousGroup = useRef(groupName ?? "");
  useEffect(() => {
    const previous = previousGroup.current;
    previousGroup.current = groupName ?? "";
    setGroup((local) => local === previous ? groupName ?? "" : local);
  }, [groupName]);
  const dirty = JSON.stringify(s) !== serverJson || group !== (groupName ?? "") || code !== undefined;
  const set = <K extends keyof EditableSettings>(key: K, value: EditableSettings[K]) => setS((prev) => {
    const next = { ...prev, [key]: value };
    if (value === undefined) delete next[key];
    return next;
  });

  const fail = (e: unknown) => { toast.error(e); };
  const changeStatus = (next: typeof status) => {
    const before = status;
    setStatus({ formId, status: next })
      .then(() => { posthog.capture("form_status_changed", { status: next }); announce?.(t.statusWords[next], () => { setStatus({ formId, status: before }).catch(fail); }); })
      .catch(fail);
  };
  const discard = () => { setS(JSON.parse(serverJson)); setGroup(groupName ?? ""); setCode(undefined); };

  const save = async () => {
    setSaving(true);
    // What was saved before, so the save can be undone (an access code can't be read back).
    const before = { settings: JSON.parse(serverJson) as EditableSettings, group: groupName ?? "" };
    const codeChanged = code !== undefined;
    try {
      // Rules without conditions or text would notify on every response; drop them.
      const notifyRules = s.notifyRules?.filter((r) => r.rule.conditions.length && r.message.trim());
      const settingsToSave = { ...s, notifyRules: notifyRules?.length ? notifyRules : undefined };
      if (!settingsToSave.notifyRules) delete settingsToSave.notifyRules;
      await update({ formId, settings: settingsToSave, accessCode: code, groupName: group });
      posthog.capture("form_settings_saved", { access: settingsToSave.access, access_code_changed: codeChanged });
      setCode((local) => local === code ? undefined : local);
      announce?.(codeChanged ? t.savedCode : t.saved,
        codeChanged ? null : () => { update({ formId, settings: before.settings, groupName: before.group }).catch(fail); });
    } catch (err) {
      toast.error(err, { id: "form-settings" });
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return <p className="text-sm text-muted-foreground max-w-2xl">{t.ownerOnly}</p>;
  }

  // "team" is signed-in access limited to one Business team (team-only forms, quizzes and games).
  const accessOptions = [
    { id: "public" as const, label: t.anyone, row: t.anyoneRow, icon: Globe, help: t.anyoneHelp },
    { id: "signed_in" as const, label: t.signedIn, row: t.signedInRow, icon: UserRound, help: t.signedInHelp },
    ...(teams?.length || s.audienceTeamId ? [{ id: "team" as const, label: t.team, row: t.teamRow, icon: Users, help: t.teamHelp }] : []),
    { id: "code" as const, label: t.withCode, row: t.withCodeRow, icon: KeyRound, help: t.withCodeHelp },
  ];
  const accessId = s.access === "signed_in" && s.audienceTeamId ? "team" : s.access;
  const access = accessOptions.find((a) => a.id === accessId) ?? accessOptions[0];
  // Same rules as the server (convex/formRespondent.ts), shown before saving.
  const hiddenError = (() => {
    const names = s.hiddenFields ?? [];
    if (names.length > HIDDEN_FIELD_LIMITS.count) return t.hiddenTooMany(HIDDEN_FIELD_LIMITS.count);
    const bad = names.find((n) => hiddenFieldNameError(n));
    if (bad) return t.hiddenInvalid(bad);
    const dupe = names.find((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i);
    return dupe ? t.hiddenDuplicate(dupe) : null;
  })();

  return (
    <div className="max-w-2xl w-full mx-auto pb-24">
      <section aria-labelledby="settings-link" className="ws-rows">
        <h2 id="settings-link" className="ws-rows__title">{t.sharing}</h2>
        {published || status !== "draft"
          ? <FallbackBoundary fallback={<Row label={t.link} isDefault><span className="ws-row__value" dir="ltr">/f/{shareId}</span></Row>}><CustomLink formId={formId} slug={slug} shareId={shareId} title={def.title} announce={announce} /></FallbackBoundary>
          : <Row label={t.link} help={t.publishForLink} isDefault><span className="ws-row__value">{t.notPublished}</span></Row>}
        <Row label={t.status} isDefault={status === "draft"}>
          <span className="ws-row__value ws-status-text" data-status={status}>{t.statusText[status]}</span>
          {status === "live" && <button type="button" className="ws-btn ws-btn--sm" onClick={() => changeStatus("closed")}>{t.close}</button>}
          {status === "closed" && <button type="button" className="ws-btn ws-btn--sm" onClick={() => changeStatus("live")}>{t.reopen}</button>}
          {status === "archived" && <button type="button" className="ws-btn ws-btn--sm" onClick={() => changeStatus(published ? "closed" : "draft")}>{t.restore}</button>}
        </Row>
      </section>

      <section aria-labelledby="settings-access" className="ws-rows">
        <h2 id="settings-access" className="ws-rows__title">{t.whoCanRespond}</h2>
        <p className="ws-row__help py-2" data-testid="controls-summary">{[
          access.row,
          s.access === "signed_in" && (s.allowedEmails?.length || s.allowedDomains?.length) ? t.sumRestricted : "",
          s.onePerPerson ? t.sumOne : "",
          s.responseLimit !== undefined ? t.sumLimit(s.responseLimit) : "",
          s.opensAt !== undefined || s.closesAt !== undefined ? t.sumScheduled : "",
          s.collectPartial ? t.sumPartial : "",
          s.retentionDays !== undefined ? t.sumRetention(s.retentionDays) : t.sumKept,
        ].filter(Boolean).join(" · ")}</p>
        <Row label={access.row} help={access.help} isDefault={s.access === "public"}>
          <fieldset className="ws-segmented"  aria-label={t.whoCanRespond}>
            {accessOptions.map((a) => (
              <button key={a.id} type="button" aria-pressed={accessId === a.id} title={a.help}
                onClick={() => {
                  set("access", a.id === "team" ? "signed_in" : a.id);
                  set("audienceTeamId", a.id === "team" ? s.audienceTeamId ?? teams?.[0]?.team._id : undefined);
                  if (a.id !== "signed_in" && a.id !== "team") { set("onePerPerson", false); set("allowedEmails", undefined); set("allowedDomains", undefined); }
                }}>
                <a.icon size={14} aria-hidden="true" /> {a.label}
              </button>
            ))}
          </fieldset>
        </Row>
        {accessId === "team" && teams && teams.length > 1 && (
          <Row label={t.whichTeam} isDefault={false}>
            <Select label={t.whichTeam} value={s.audienceTeamId ?? ""} onChange={(v) => set("audienceTeamId", v as Id<"businessTeams">)} options={teams.map((row) => ({ value: row.team._id, label: row.team.name }))} />
          </Row>
        )}
        {s.access === "code" && (
          <Row label={t.accessCode} help={hasAccessCode ? t.keepCode : undefined} isDefault={false}>
            <input value={code ?? ""} onChange={(e) => setCode(e.target.value || undefined)} className="kb-input w-48" minLength={6} maxLength={100} autoComplete="off"
              placeholder={hasAccessCode ? "••••••" : t.chooseCode} aria-label={t.accessCode} />
          </Row>
        )}
        {s.access === "signed_in" && (
          <Row label={t.onePerPerson} help={t.onePerPersonHelp} isDefault={s.onePerPerson === defaultFormSettings.onePerPerson}>
            <Switch label={t.onePerPerson} checked={s.onePerPerson} onChange={(v) => set("onePerPerson", v)} />
          </Row>
        )}
        {s.access === "signed_in" && (
          <>
            <Row label={t.allowedEmails} help={t.allowedEmailsHelp} isDefault={!s.allowedEmails?.length} stack>
              <ListInput multiline value={s.allowedEmails} onChange={(v) => set("allowedEmails", v)} label={t.allowedEmails} placeholder="name@example.com" />
            </Row>
            <Row label={t.allowedDomains} help={t.allowedDomainsHelp} isDefault={!s.allowedDomains?.length}>
              <ListInput value={s.allowedDomains} onChange={(v) => set("allowedDomains", v)} label={t.allowedDomains} placeholder={t.domainsPlaceholder} />
            </Row>
          </>
        )}
        <DocHint slug="access-and-limits" className="px-1 pt-2">{t.accessGuide}</DocHint>
      </section>

      <section aria-labelledby="settings-limits" className="ws-rows">
        <h2 id="settings-limits" className="ws-rows__title">{t.limits}</h2>
        <Row label={t.responseLimit} help={t.responseLimitHelp} isDefault={s.responseLimit === undefined}>
          <input type="number" min={1} value={s.responseLimit ?? ""} onChange={(e) => set("responseLimit", e.target.value ? Number(e.target.value) : undefined)}
            className="kb-input w-32 text-end tabular-nums" placeholder={t.noLimit} aria-label={t.responseLimit} />
        </Row>
        <ScheduleRows s={s} set={set} />
      </section>

      <details className="ws-disclosure mt-8">
        <summary><ChevronRight size={18} className="rtl:rotate-180" /> {t.moreSettings}</summary>
        <section aria-labelledby="settings-responses" className="ws-rows">
          <h2 id="settings-responses" className="ws-rows__title">{t.responses}</h2>
          <Row label={t.resume} help={t.resumeHelp} isDefault={s.allowResumeLink === defaultFormSettings.allowResumeLink}>
            <Switch label={t.resume} checked={s.allowResumeLink} onChange={(v) => set("allowResumeLink", v)} />
          </Row>
          <Row label={t.partial} help={t.partialHelp} isDefault={s.collectPartial === defaultFormSettings.collectPartial}>
            <Switch label={t.partial} checked={s.collectPartial} onChange={(v) => set("collectPartial", v)} />
          </Row>
          {s.collectPartial && <DocHint slug="results" className="px-1">{t.partialNote}</DocHint>}
          <Row label={t.editAfter} help={t.editAfterHelp} isDefault={s.allowEditAfterSubmit === defaultFormSettings.allowEditAfterSubmit}>
            <Switch label={t.editAfter} checked={s.allowEditAfterSubmit} onChange={(v) => { set("allowEditAfterSubmit", v); if (!v) set("allowEditAfterClose", undefined); }} />
          </Row>
          {s.allowEditAfterSubmit && (
            <>
              <Row label={t.editAfterClose} help={t.editAfterCloseHelp} isDefault={!s.allowEditAfterClose}>
                <Switch label={t.editAfterClose} checked={!!s.allowEditAfterClose} onChange={(v) => set("allowEditAfterClose", v || undefined)} />
              </Row>
              <p className="text-xs text-muted-foreground px-1">{t.editNote}</p>
            </>
          )}
          <Row label={t.receipt} isDefault={s.showReceipt === defaultFormSettings.showReceipt}>
            <Switch label={t.receipt} checked={s.showReceipt} onChange={(v) => set("showReceipt", v)} />
          </Row>
          <Row label={t.closedMessage} isDefault={!s.closedMessage} stack>
            <textarea value={s.closedMessage ?? ""} onChange={(e) => set("closedMessage", e.target.value || undefined)} className="kb-input" rows={2} maxLength={2000}
              placeholder={t.closedPlaceholder} aria-label={t.closedMessage} />
          </Row>
          <Row label={t.hiddenFields} help={t.hiddenFieldsHelp} isDefault={!s.hiddenFields?.length} stack>
            <ListInput value={s.hiddenFields} onChange={(v) => set("hiddenFields", v)} label={t.hiddenFields} placeholder={t.hiddenPlaceholder} invalid={!!hiddenError} />
            {hiddenError && <p role="alert" className="text-xs text-[var(--error)]">{hiddenError}</p>}
            {!!s.hiddenFields?.length && !hiddenError && (
              <p className="text-xs text-muted-foreground break-all" dir="ltr">{t.hiddenExample(`/f/${shareId}?${s.hiddenFields.map((n) => `${n}=…`).join("&")}`)}</p>
            )}
          </Row>
        </section>

        <section aria-labelledby="settings-branding" className="ws-rows">
          <h2 id="settings-branding" className="ws-rows__title">{t.branding}</h2>
          <Row label={t.hideBranding} help={!canHideBranding ? (s.hideBranding ? t.hideBrandingLapsed : t.hideBrandingPro) : t.hideBrandingHelp} isDefault={!s.hideBranding}>
            <WsSwitch label={t.hideBranding} hideLabel checked={!!s.hideBranding && canHideBranding} disabled={!canHideBranding && !s.hideBranding}
              onChange={(v) => set("hideBranding", v || undefined)} />
          </Row>
          {!canHideBranding && <DocHint slug="plans" className="px-1 pt-2" />}
        </section>

        <section aria-labelledby="settings-privacy" className="ws-rows">
          <h2 id="settings-privacy" className="ws-rows__title">{t.privacy}</h2>
          <Row label={t.deleteAfter} help={t.deleteAfterHelp} isDefault={s.retentionDays === undefined}>
            <input type="number" min={1} max={3650} value={s.retentionDays ?? ""} onChange={(e) => set("retentionDays", e.target.value ? Number(e.target.value) : undefined)}
              className="kb-input w-28 text-end tabular-nums" placeholder={t.never} aria-label={t.deleteAfterDays} />
            <span className="ws-row__value">{t.days}</span>
          </Row>
          <Row label={t.indexing} isDefault={s.allowIndexing === defaultFormSettings.allowIndexing}>
            <Switch label={t.indexing} checked={s.allowIndexing} onChange={(v) => set("allowIndexing", v)} />
          </Row>
          <p className="ws-row__help py-3">{t.privacyNote}</p>
        </section>

        <section aria-labelledby="settings-team" className="ws-rows">
          <h2 id="settings-team" className="ws-rows__title">{t.notifTeam}</h2>
          <Row label={t.everyResponse} help={t.everyResponseHelp} isDefault={s.notifyOnResponse === defaultFormSettings.notifyOnResponse}>
            <Switch label={t.notifyEvery} checked={s.notifyOnResponse} onChange={(v) => set("notifyOnResponse", v)} />
          </Row>
          <Row label={t.matching} isDefault={!(s.notifyRules?.length)} stack>
            <div className="space-y-3">
              {(s.notifyRules ?? []).map((r, i) => (
                <div key={r.id} className="rounded-lg border border-[var(--ws-line)] p-3 space-y-2">
                  <RuleEditor def={def} rule={r.rule} before={def.fields.length} allowScore label={t.rule(i + 1)}
                    onChange={(rule: Rule | undefined) => set("notifyRules", (s.notifyRules ?? []).map((x) => (x.id === r.id ? { ...x, rule: rule ?? { match: "all", conditions: [] } } : x)))} />
                  <div className="flex gap-2">
                    <input value={r.message} onChange={(e) => set("notifyRules", (s.notifyRules ?? []).map((x) => (x.id === r.id ? { ...x, message: e.target.value } : x)))} className="kb-input text-sm" placeholder={t.notifText} aria-label={t.ruleMessage(i + 1)} />
                    <button type="button" className="ws-icon-button" onClick={() => set("notifyRules", (s.notifyRules ?? []).filter((x) => x.id !== r.id))} aria-label={t.removeRule} title={t.removeRule}><X size={16} /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="ws-link-quiet flex items-center gap-1" onClick={() => set("notifyRules", [...(s.notifyRules ?? []), { id: newId("n"), rule: { match: "all", conditions: [] }, message: "" }])}>
                <Plus size={14} /> {t.addRule}
              </button>
            </div>
          </Row>
          <Row label={t.approval} isDefault={s.requireApproval === defaultFormSettings.requireApproval}>
            <Switch label={t.approval} checked={s.requireApproval} onChange={(v) => set("requireApproval", v)} />
          </Row>
          <Row label={t.folder} isDefault={!group}>
            <input value={group} onChange={(e) => setGroup(e.target.value)} className="kb-input w-48" maxLength={200} placeholder={t.none} aria-label={t.folder} />
          </Row>
          {status !== "archived" && (
            <Row label={t.archive} help={t.archiveHelp} isDefault>
              <button type="button" className="ws-btn ws-btn--sm" onClick={() => changeStatus("archived")}>{t.archive}</button>
            </Row>
          )}
        </section>
      </details>

      {dirty && (
        <section className="ws-savebar"  aria-label={t.unsaved}>
          <span className="text-sm text-muted-foreground">{t.unsavedChanges}</span>
          <span className="ms-auto flex gap-2">
            {dirty && !saving && <button type="button" onClick={discard} className="ws-btn ws-btn--ghost">{t.discard}</button>}
            <button type="button" onClick={save} disabled={!dirty || saving || !!hiddenError} className="ws-btn ws-btn--primary">{saving ? t.saving : t.save}</button>
          </span>
        </section>
      )}
    </div>
  );
}
