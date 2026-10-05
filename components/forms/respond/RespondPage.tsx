"use client";

import { copyText } from "@/lib/clipboard";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import Link from "@/components/site/SiteLink";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import posthog from "@/lib/analytics";
import { SignInButton, SignOutButton } from "@/lib/auth/client";
import { Copy, Download, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { api } from "@/convex/_generated/api";
import FormRenderer, { EndingView, formUi, themeClass, themeStyle } from "@/components/forms/FormRenderer";
import type { UploadedFile } from "@/components/forms/FormRenderer";
import { themeFollowsAppearance, themeSound } from "@/components/forms/formThemes";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { emptyDefinition, isRtl, languageNames, localizedMeta, selectEnding } from "@/convex/formLogic";
import type { AnswerValue, Answers, FormDefinition, FormField, Language } from "@/convex/formLogic";
import { parseError } from "@/lib/errors";
import { sfx } from "@/lib/sfx";
import { EMBED_HEIGHT_MESSAGE } from "@/lib/embed";
import type { EmbedHeightMessage } from "@/lib/embed";
import { useInitialTheme } from "./initial-theme";
import { formatScheduleTime } from "@/convex/formSchedule";
import type { Id } from "@/convex/_generated/dataModel";
import { StudyProgressOptIn } from "./StudyProgressOptIn";

function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const text = {
  en: {
    unavailable: "This form is not available.", closed: "This form is closed.", full: "This form has reached its response limit.",
    signIn: "Sign in to respond", signInHelp: "The organiser asked respondents to sign in.", code: "Enter the access code", codeWrong: "That code is not right.", codeLocked: "Too many tries. Wait a few minutes, then try again.",
    continue: "Continue", opens: (d: string) => `This form opens ${d}.`, closes: (d: string) => `Closes ${d}.`, already: "You have already responded to this form.",
    savedHere: "Your answers are saved on this device until you submit.", partial: "The organiser can see unfinished answers to this form.",
    startOver: "Start over", resume: "Continue on another device", resumeHelp: "Anyone with this private link can see and continue your answers for 30 days.",
    copy: "Copy link", copied: "Copied", receipt: "Receipt", editLink: "Edit your response later with this private link:", download: "Save receipt",
    retry: "Try again", sending: "Sending…", restored: "We restored the answers you started earlier.", editing: "You are editing a submitted response.",
    saved: "Saved", update: "Update response", notOpen: "Not open yet",
    notOpenYet: (d: string) => `This form is not open yet. It opens ${d}.`, closedOn: (d: string) => `This form closed ${d}.`,
    inFlight: "Answers sent after the closing time are not accepted.",
    restricted: "This form only accepts certain email addresses.", signedInAs: (email: string) => `You're signed in as ${email}.`,
    unverified: "Sign in with a verified email address to respond. Verify your email in your account, then try again.",
    otherAccount: "Use another account",
  },
  ar: {
    unavailable: "هذا النموذج غير متاح.", closed: "هذا النموذج مغلق.", full: "وصل هذا النموذج إلى الحد الأقصى من الردود.",
    signIn: "سجّل الدخول للإجابة", signInHelp: "طلب المنظم تسجيل الدخول قبل الإجابة.", code: "أدخل رمز الوصول", codeWrong: "الرمز غير صحيح.", codeLocked: "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.",
    continue: "متابعة", opens: (d: string) => `يفتح هذا النموذج ${d}.`, closes: (d: string) => `يغلق ${d}.`, already: "لقد أجبت على هذا النموذج بالفعل.",
    savedHere: "تُحفظ إجاباتك على هذا الجهاز حتى ترسلها.", partial: "يمكن للمنظم رؤية الإجابات غير المكتملة في هذا النموذج.",
    startOver: "البدء من جديد", resume: "المتابعة على جهاز آخر", resumeHelp: "يمكن لأي شخص لديه هذا الرابط الخاص رؤية إجاباتك ومتابعتها لمدة 30 يومًا.",
    copy: "نسخ الرابط", copied: "تم النسخ", receipt: "الإيصال", editLink: "يمكنك تعديل ردك لاحقًا عبر هذا الرابط الخاص:", download: "حفظ الإيصال",
    retry: "حاول مرة أخرى", sending: "جارٍ الإرسال…", restored: "استعدنا الإجابات التي بدأتها سابقًا.", editing: "أنت تعدّل ردًا تم إرساله.",
    saved: "تم الحفظ", update: "تحديث الرد", notOpen: "لم يفتح بعد",
    notOpenYet: (d: string) => `لم يفتح هذا النموذج بعد. يفتح ${d}.`, closedOn: (d: string) => `أُغلق هذا النموذج ${d}.`,
    inFlight: "لا تُقبل الإجابات المرسلة بعد وقت الإغلاق.",
    restricted: "يقبل هذا النموذج عناوين بريد محددة فقط.", signedInAs: (email: string) => `أنت مسجّل الدخول باسم ${email}.`,
    unverified: "سجّل الدخول ببريد موثّق للإجابة. وثّق بريدك من حسابك ثم حاول مجددًا.",
    otherAccount: "استخدم حسابًا آخر",
  },
};

interface LocalProgress { answers: Answers; language: Language; startedAt: number; submissionKey: string; editToken?: string; lastFieldId?: string; version: number; hidden?: Record<string, string> }

/** Declared hidden fields present in the page URL; the server trims, caps and filters them again. */
function readHidden(names: string[]): Record<string, string> | undefined {
  if (!names.length || typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const name of names) { const value = params.get(name); if (value?.trim()) out[name] = value.slice(0, 500); }
  return Object.keys(out).length ? out : undefined;
}
interface Receipt { receiptCode: string; endingId: string | null; editToken?: string; submittedAt: number; answers: Answers; language: Language; quizScore?: number | null; quizMaxScore?: number | null }

/** The respondent experience for one form; also served at custom links (chaos.fail/<username>/<slug>). */
export function RespondToForm({ shareId, inline = false, studyProgress = false, onComplete }: { shareId: string; inline?: boolean; studyProgress?: boolean; onComplete?: () => void }) {
  return (
    <Suspense fallback={<RespondLoading />}>
      <RespondPage key={shareId} shareId={shareId} inline={inline} studyProgress={studyProgress} onComplete={onComplete} />
    </Suspense>
  );
}

/** A loading screen in the form's own theme, when the server already knows it. */
export function RespondLoading() {
  return <Shell embed={false}><FormLoading /></Shell>;
}

function RespondPage({ shareId, inline = false, studyProgress = false, onComplete }: { shareId: string; inline?: boolean; studyProgress?: boolean; onComplete?: () => void }) {
  const search = useSearchParams();
  const embed = inline || search.get("embed") === "1";
  const resumeToken = inline ? null : search.get("resume");
  const editToken = inline ? null : search.get("edit");
  // After a correct code the server hands back a short-lived pass; the code itself is never sent again.
  const grantKey = `chaos-access-${shareId}`;
  const [accessCode, setAccessCode] = useState<string | undefined>(() => {
    try { return typeof window === "undefined" ? undefined : sessionStorage.getItem(grantKey) ?? undefined; } catch { return undefined; }
  });
  const unlock = useMutation(api.respond.unlockForm);
  const [codeError, setCodeError] = useState<"wrong" | "locked" | null>(null);
  const tryCode = async (code: string) => {
    try {
      const result = await unlock({ shareId, code });
      if (!result.ok) { setCodeError("wrong"); return; }
      setCodeError(null);
      setAccessCode(result.grant);
      try { sessionStorage.setItem(grantKey, result.grant); } catch { /* private mode: the pass lives in memory only */ }
    } catch {
      setCodeError("locked");
    }
  };
  const form = useQuery(api.respond.getPublicForm, { shareId, accessCode, editToken: editToken ?? undefined });
  const editing = useQuery(api.respond.getSubmissionForEdit, form?.state === "open" && editToken ? { shareId, editToken } : "skip");
  const resumed = useQuery(api.respond.getResumeDraft, form?.state === "open" && resumeToken ? { shareId, token: resumeToken } : "skip");

  if (form === undefined || (form.state === "open" && ((editToken && editing === undefined) || (resumeToken && resumed === undefined)))) {
    return <Shell embed={embed}><FormLoading /></Shell>;
  }
  const lang: Language = form.state !== "unavailable" ? (form.defaultLanguage as Language) : "en";
  // Gated and closed screens already wear the form's own theme.
  const gateDef: FormDefinition | undefined = form.state !== "unavailable" ? { ...emptyDefinition(form.title), theme: form.theme as FormDefinition["theme"] } : undefined;
  const t = text[lang];
  if (form.state === "unavailable") return <Shell embed={embed}><Message title={t.unavailable} /></Shell>;
  const plain = form.hideBranding;
  if (form.state === "restricted") {
    return (
      <Shell embed={embed} def={gateDef} plain={plain}>
        <Message title={form.title} body={[form.reason === "unverified" ? t.unverified : t.restricted, form.email ? t.signedInAs(form.email) : ""].filter(Boolean).join(" ")} lang={lang}>
          <SignOutButton><button className="form-btn form-btn-ghost">{t.otherAccount}</button></SignOutButton>
        </Message>
      </Shell>
    );
  }
  if (form.state === "not_open") {
    const opensAt = form.opensAt!;
    return (
      <Shell embed={embed} def={gateDef} plain={plain}>
        <ReloadAt at={opensAt} />
        <Message title={form.title} body={t.notOpenYet(formatScheduleTime(opensAt, form.timezone ?? undefined, lang))} lang={lang} />
      </Shell>
    );
  }
  if (form.state === "closed" || form.state === "full") {
    const closedAt = form.state === "closed" && form.reason === "scheduled" && form.closesAt !== null ? t.closedOn(formatScheduleTime(form.closesAt, form.timezone ?? undefined, lang)) : "";
    const body = [form.message || (form.state === "full" ? t.full : t.closed), closedAt].filter(Boolean).join(" ");
    return <Shell embed={embed} def={gateDef} plain={plain}><Message title={form.title} body={body} lang={lang} /></Shell>;
  }
  if (form.state === "sign_in") {
    return (
      <Shell embed={embed} def={gateDef} plain={plain}>
        <Message title={form.title} body={t.signInHelp} lang={lang}>
          <SignInButton mode="modal"><button className="form-btn">{t.signIn}</button></SignInButton>
        </Message>
      </Shell>
    );
  }
  if (form.state === "code") {
    return <Shell embed={embed} def={gateDef} plain={plain}><CodeGate title={form.title} lang={lang} error={codeError ?? (form.invalidCode ? "wrong" : null)} onSubmit={(code) => void tryCode(code)} /></Shell>;
  }
  if (editToken && editing === null) return <Shell embed={embed} def={gateDef} plain={plain}><Message title={form.title} body="This edit link is no longer valid." /></Shell>;
  if (resumeToken && resumed === null) return <Shell embed={embed} def={gateDef} plain={plain}><Message title={form.title} body="This resume link is no longer valid." /></Shell>;
  return (
    <Respondent
      key={JSON.stringify([shareId, form.version, editToken, resumeToken])}
      form={form}
      shareId={shareId}
      embed={embed}
      accessCode={accessCode}
      resumeToken={resumeToken}
      resumed={resumed ?? null}
      editToken={editToken}
      editing={editing ?? null}
      studyProgress={studyProgress}
      onComplete={onComplete}
    />
  );
}

/** Reloads the page when the opening time arrives, so a waiting respondent lands on the form. */
function ReloadAt({ at }: { at: number }) {
  useEffect(() => {
    const delay = at - Date.now() + 1000;
    if (delay <= 0 || delay > 2_147_000_000) return;
    const id = setTimeout(() => window.location.reload(), delay);
    return () => clearTimeout(id);
  }, [at]);
  return null;
}

type OpenForm = Extract<FunctionReturnType<typeof api.respond.getPublicForm>, { state: "open" }>;

function Respondent({ form, shareId, embed, accessCode, resumeToken, resumed, editToken, editing, studyProgress, onComplete }: {
  form: OpenForm; shareId: string; embed: boolean; accessCode?: string; resumeToken: string | null;
  resumed: { answers: Answers; language: Language; version: number } | null;
  editToken: string | null; editing: { answers: Answers; language: Language; definition: FormDefinition; receiptCode: string } | null;
  studyProgress: boolean; onComplete?: () => void;
}) {
  const def = (editing?.definition ?? form.definition) as FormDefinition;
  const storageKey = `chaos-form:${shareId}:v${form.version}`;
  const receiptKey = `chaos-receipt:${shareId}`;
  const submit = useMutation(api.respond.submitResponse);
  const update = useMutation(api.respond.updateSubmission);
  const saveResume = useMutation(api.respond.saveResumeDraft);
  const generateUploadUrl = useMutation(api.respond.generateUploadUrl);

  const initialLanguage = (): Language => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl === "ar" || fromUrl === "en") if (def.languages.includes(fromUrl)) return fromUrl;
    const browser = navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
    return def.languages.includes(browser) ? browser : def.defaultLanguage;
  };

  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [restored, setRestored] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Never trust a receipt restored from shared-device storage as account evidence.
  const [studyResponseId, setStudyResponseId] = useState<Id<"formResponses"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, UploadedFile>>({});
  const [resumeLink, setResumeLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const partialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const responseEditToken = useRef<string | undefined>(undefined);

  useEffect(() => () => {
    if (partialTimer.current) clearTimeout(partialTimer.current);
  }, []);

  // Load local progress, a resume link or an edit session.
  useEffect(() => {
    const language = initialLanguage();
    let local: LocalProgress | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) local = JSON.parse(raw);
      const savedReceipt = window.localStorage.getItem(receiptKey);
      if (savedReceipt && !editing && !resumeToken) {
        const r = JSON.parse(savedReceipt) as Receipt;
        if (r?.receiptCode) setReceipt(r);
      }
    } catch { setStorageOk(false); }
    if (editing) {
      local = { answers: editing.answers, language: editing.language, startedAt: Date.now(), submissionKey: "edit", version: form.version };
    } else if (resumed) {
      local = { answers: resumed.answers, language: resumed.language, startedAt: local?.startedAt ?? Date.now(), submissionKey: local?.submissionKey ?? randomHex(16), version: form.version };
      setRestored(true);
    } else if (local && Object.keys(local.answers ?? {}).length) {
      setRestored(true);
    }
    // Link values win over stored ones, so reopening a tagged link keeps its latest source.
    const fromLink = readHidden(form.hiddenFields ?? []);
    const base = local ?? { answers: {}, language, startedAt: Date.now(), submissionKey: randomHex(16), version: form.version };
    setProgress(fromLink ? { ...base, hidden: { ...base.hidden, ...fromLink } } : base);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per version
  }, []);

  const persist = useCallback((next: LocalProgress) => {
    if (editing) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setStorageOk(false); }
  }, [editing, storageKey]);

  const language = progress?.language ?? def.defaultLanguage;
  const t = text[language];

  const savePartial = useCallback((next: LocalProgress) => {
    if (!form.collectPartial || editing) return;
    if (partialTimer.current) clearTimeout(partialTimer.current);
    partialTimer.current = setTimeout(() => {
      submit({ shareId, submissionKey: next.submissionKey, answers: next.answers, language: next.language, final: false, startedAt: next.startedAt, accessCode, lastFieldId: next.lastFieldId, hidden: next.hidden })
        .catch(() => { /* partial saves are best effort; local copy remains */ });
    }, 3000);
  }, [form.collectPartial, editing, submit, shareId, accessCode]);

  const onAnswer = (fieldId: string, value: AnswerValue | undefined) => {
    setServerErrors((prev) => { const { [fieldId]: _, ...rest } = prev; return rest; });
    setProgress((prev) => {
      if (!prev) return prev;
      const answers = { ...prev.answers };
      if (value === undefined) delete answers[fieldId];
      else answers[fieldId] = value;
      const next = { ...prev, answers, lastFieldId: fieldId };
      persist(next);
      savePartial(next);
      return next;
    });
  };

  const setLanguage = (l: Language) => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, language: l };
      persist(next);
      return next;
    });
  };

  const uploadFile = async (field: FormField, file: File): Promise<UploadedFile> => {
    if (file.size > 10 * 1024 * 1024) throw new Error(language === "ar" ? "الحد الأقصى لحجم الملف 10 ميغابايت." : "Files can be at most 10 MB.");
    try {
      const url = await generateUploadUrl({ shareId, fieldId: field.id, accessCode });
      const res = await fetch(`${url}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Upload failed. Try again.");
      const info: UploadedFile = { uploadId: body.uploadId, name: body.name, size: body.size };
      setFiles((prev) => ({ ...prev, [info.uploadId]: info }));
      return info;
    } catch (err) {
      throw new Error(parseError(err, "Upload failed. Try again.").message);
    }
  };

  const handleSubmit = async () => {
    if (!progress || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (editing && editToken) {
        const result = await update({ shareId, editToken, answers: progress.answers, language: progress.language, accessCode });
        posthog.capture("form_response_updated", { language: progress.language, form_type: def.quiz?.enabled ? "quiz" : "form" });
        setReceipt({ receiptCode: result.receiptCode, endingId: result.endingId, editToken, submittedAt: Date.now(), answers: progress.answers, language: progress.language, quizScore: result.quizScore, quizMaxScore: result.quizMaxScore });
        return;
      }
      const token = form.allowEditAfterSubmit ? responseEditToken.current ?? progress.editToken ?? randomHex(24) : undefined;
      responseEditToken.current = token;
      if (token && !progress.editToken) persist({ ...progress, editToken: token });
      if (partialTimer.current) clearTimeout(partialTimer.current);
      const result = await submit({
        shareId, submissionKey: progress.submissionKey, answers: progress.answers, language: progress.language, final: true,
        startedAt: progress.startedAt, accessCode, editToken: token, resumeToken: resumeToken ?? undefined, lastFieldId: progress.lastFieldId,
        honeypot: honeypot || undefined, hidden: progress.hidden,
      });
      const r: Receipt = { receiptCode: result.receiptCode, endingId: result.endingId, editToken: token, submittedAt: Date.now(), answers: progress.answers, language: progress.language, quizScore: result.quizScore, quizMaxScore: result.quizMaxScore };
      if (result.status === "completed") onComplete?.();
      setStudyResponseId(result.status === "completed" ? result.responseId : null);
      posthog.capture("form_response_submitted", { language: progress.language, form_type: def.quiz?.enabled ? "quiz" : "form" });
      setReceipt(r);
      try {
        window.localStorage.removeItem(storageKey);
        window.localStorage.setItem(receiptKey, JSON.stringify(r));
      } catch { /* storage unavailable */ }
    } catch (err) {
      const { code, message } = parseError(err);
      if (code === "EMAIL_NOT_ALLOWED" || code === "EMAIL_UNVERIFIED") {
        setError(code === "EMAIL_UNVERIFIED" ? t.unverified : t.restricted);
      } else if (code === "VALIDATION_FAILED") {
        try { setServerErrors(JSON.parse(message)); } catch { setError(message); }
      } else if (code === "NETWORK" || code === "ERROR") {
        // The submission key makes retrying safe: a response is never recorded twice.
        setError(language === "ar" ? "تعذّر الإرسال. إجاباتك محفوظة؛ حاول مرة أخرى." : "We could not send your answers. They are kept here; try again.");
      } else setError(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const createResumeLink = async () => {
    if (!progress) return;
    const token = randomHex(24);
    try {
      await saveResume({ shareId, token, answers: progress.answers, language: progress.language, accessCode });
      setResumeLink(`${window.location.origin}/f/${shareId}?resume=${token}`);
    } catch (err) {
      setError(parseError(err).message);
    }
  };

  const startOver = () => {
    if (partialTimer.current) clearTimeout(partialTimer.current);
    responseEditToken.current = undefined;
    setResumeLink("");
    setCopied(false);
    const fresh = { answers: {}, language, startedAt: Date.now(), submissionKey: randomHex(16), version: form.version, hidden: progress?.hidden };
    setProgress(fresh);
    setReceipt(null);
    setStudyResponseId(null);
    setRestored(false);
    try { window.localStorage.removeItem(storageKey); window.localStorage.removeItem(receiptKey); } catch { /* ignore */ }
  };

  const [now] = useState(() => Date.now());
  const notOpen = form.opensAt !== null && now < form.opensAt;
  const ending = useMemo(() => (receipt ? (def.endings.find((e) => e.id === receipt.endingId) ?? selectEnding(def, receipt.answers)) : null), [receipt, def]);


  if (!ready || !progress) return <Shell embed={embed} def={def} plain={form.hideBranding}><FormLoading /></Shell>;

  const languageSwitch = def.languages.length > 1 && (
    <div className="form-lang" role="group" aria-label="Language">
      {def.languages.map((l) => (
        <button key={l} type="button" onClick={() => setLanguage(l)} aria-pressed={language === l} lang={l}>
          {languageNames[l]}
        </button>
      ))}
    </div>
  );
  const dir = isRtl(language) ? "rtl" : "ltr";
  const score = def.quiz?.enabled && receipt && receipt.quizScore !== undefined && receipt.quizScore !== null
    ? { value: receipt.quizScore, max: receipt.quizMaxScore ?? 0 } : null;

  return (
    <Shell embed={embed} def={def} plain={form.hideBranding} languageSwitch={languageSwitch} immersive={receipt ? def.presentation === "conversational" || def.presentation === "swipe" : !(form.alreadyResponded && !editing) && !notOpen}>
      {receipt ? (
        <EndingView ending={ending} def={def} language={receipt.language} answers={receipt.answers} score={score}>
          {studyProgress && form.signedIn && form.responseIdentityLinked && def.quiz?.enabled && studyResponseId && (
            <StudyProgressOptIn key={studyResponseId} responseId={studyResponseId} language={receipt.language} />
          )}
          {form.showReceipt && receipt.editToken && form.allowEditAfterSubmit && (
            <div className="form-receipt" dir={isRtl(receipt.language) ? "rtl" : "ltr"}>
              <p className="text-xs form-muted">{text[receipt.language].editLink}</p>
              <CopyField value={`${typeof window !== "undefined" ? window.location.origin : ""}/f/${shareId}?edit=${receipt.editToken}`} label={text[receipt.language].copy} copiedLabel={text[receipt.language].copied} />
            </div>
          )}
          <div className="form-ending-actions">
            {form.showReceipt && (
              <button type="button" className="form-btn form-btn-ghost form-btn-sm" onClick={() => downloadReceipt(form.title, receipt)} title={`${text[receipt.language].receipt} ${receipt.receiptCode}`}>
                <Download size={14} /> {text[receipt.language].download} <span className="font-mono form-muted" dir="ltr">{receipt.receiptCode}</span>
              </button>
            )}
            {!editing && !form.alreadyResponded && (
              <button type="button" onClick={startOver} className="form-btn form-btn-ghost form-btn-sm"><RotateCcw size={14} /> {text[receipt.language].startOver}</button>
            )}
          </div>
        </EndingView>
      ) : form.alreadyResponded && !editing ? (
        <Message title={localizedMeta(def, language).title} body={t.already} lang={language} />
      ) : notOpen ? (
        <Message title={localizedMeta(def, language).title} body={t.notOpenYet(formatScheduleTime(form.opensAt!, form.timezone ?? undefined, language))} lang={language} />
      ) : (
        <>
          {(editing || restored) && (
            <div className="form-toast" dir={dir} role="status">
              <span>{editing ? t.editing : t.restored}</span>
              {!editing && <button type="button" onClick={startOver}>{t.startOver}</button>}
            </div>
          )}
          <FormRenderer
            definition={def}
            language={language}
            answers={progress.answers}
            onAnswer={onAnswer}
            serverErrors={serverErrors}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitLabel={editing ? t.update : undefined}
            uploadFile={uploadFile}
            files={files}
            resuming={restored}
            skipCover={!!editing}
            onProgress={(id) => setProgress((p) => (p ? { ...p, lastFieldId: id } : p))}
            footer={
              <div className="space-y-3 text-xs form-muted" dir={dir}>
                {/* Honeypot: invisible to people, tempting to bots. Flagged, never discarded. */}
                <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
                  <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
                </div>
                {error && (
                  <div role="alert" className="form-alert">
                    <span>{error}</span>
                    <button type="button" className="form-btn form-btn-ghost form-btn-sm" onClick={handleSubmit}>{t.retry}</button>
                  </div>
                )}
                {form.closesAt !== null && <p>{t.closes(formatScheduleTime(form.closesAt, form.timezone ?? undefined, language))} {t.inFlight}</p>}
                {!editing && storageOk && <p>{t.savedHere}</p>}
                {form.collectPartial && !editing && <p>{t.partial}</p>}
                {form.allowResumeLink && !editing && (
                  resumeLink ? (
                    <div className="space-y-1">
                      <p>{t.resumeHelp}</p>
                      <CopyField value={resumeLink} label={t.copy} copiedLabel={t.copied} copied={copied} onCopied={() => setCopied(true)} />
                    </div>
                  ) : (
                    <button type="button" onClick={createResumeLink} className="underline underline-offset-2">{t.resume}</button>
                  )
                )}
                {!embed && <p><Link href="/privacy" className="underline underline-offset-2">Privacy</Link> · <Link href="/terms" className="underline underline-offset-2">Terms</Link></p>}
              </div>
            }
          />
        </>
      )}
    </Shell>
  );
}

function downloadReceipt(title: string, r: Receipt) {
  const body = `${title}\nReceipt: ${r.receiptCode}\nSubmitted: ${new Date(r.submittedAt).toISOString()}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${r.receiptCode}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyField({ value, label, copiedLabel, copied: copiedProp, onCopied }: { value: string; label: string; copiedLabel: string; copied?: boolean; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 items-center" dir="ltr">
      <input readOnly value={value} className="form-input text-xs flex-1 !py-2" onFocus={(e) => e.target.select()} aria-label={label} />
      <button type="button" className="form-btn form-btn-ghost form-btn-sm" onClick={() => { void copyText(value).then((ok) => { if (!ok) return; setCopied(true); onCopied?.(); }); }}>
        <Copy size={14} /> {copied || copiedProp ? copiedLabel : label}
      </button>
    </div>
  );
}

/** Screens shown before a form's definition is available (closed, gated, loading) use the default Chaos theme. */
const fallbackDefinition = emptyDefinition("");

function SoundToggle({ def }: { def: FormDefinition }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(sfx.isEnabled());
    sync();
    window.addEventListener("chaos-sfx-change", sync);
    return () => window.removeEventListener("chaos-sfx-change", sync);
  }, []);
  if (themeSound(def) === "off") return null;
  return (
    <button type="button" className="form-chrome-btn" aria-pressed={on} aria-label={on ? "Mute sounds" : "Turn sounds on"} title={on ? "Mute sounds" : "Turn sounds on"}
      onClick={() => { const next = !sfx.isEnabled(); sfx.setEnabled(next); setOn(next); if (next) sfx.play("toggle", themeSound(def)); }}>
      {on ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  );
}

/** Quiet, in the form's own colours; only appears if loading is slow, and offers a retry if it stalls. */
function FormLoading() {
  const [phase, setPhase] = useState<"hidden" | "waiting" | "stalled">("hidden");
  useEffect(() => {
    const show = setTimeout(() => setPhase("waiting"), 400);
    const stall = setTimeout(() => setPhase("stalled"), 8000);
    return () => { clearTimeout(show); clearTimeout(stall); };
  }, []);
  if (phase === "hidden") return null;
  if (phase === "stalled") {
    return (
      <div className="grid justify-items-center gap-4 py-24 text-center" role="alert">
        <p className="form-muted">This is taking longer than expected. Check your connection.</p>
        <button type="button" className="form-btn form-btn-ghost" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  return <div className="grid place-items-center py-24 form-muted" role="status" aria-label="Loading"><span className="form-spinner" /></div>;
}

/** `plain` hides the Chaos brand (Pro, enforced by the server); Privacy and Terms links stay. */
function Shell({ children, embed, def, languageSwitch, immersive, plain }: { children: React.ReactNode; embed: boolean; def?: FormDefinition; languageSwitch?: React.ReactNode; immersive?: boolean; plain?: boolean }) {
  const initialTheme = useInitialTheme();
  const themed = useMemo(() => def ?? (initialTheme ? { ...fallbackDefinition, theme: initialTheme } : fallbackDefinition), [def, initialTheme]);
  const fullBleed = !embed && !!def && !!immersive;
  const shell = useRef<HTMLDivElement>(null);

  // Overscroll and the browser chrome show the root background: paint it with the form's page colour.
  useEffect(() => {
    if (embed) return;
    const root = document.documentElement;
    const sync = () => {
      if (!shell.current) return;
      const color = getComputedStyle(shell.current).backgroundColor;
      root.style.backgroundColor = color;
      document.body.style.backgroundColor = color;
    };
    sync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Colours animate for 0.4s when the mode flips, so sync again once they settle.
    const observer = new MutationObserver(() => { sync(); clearTimeout(timer); timer = setTimeout(sync, 450); });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(timer); root.style.backgroundColor = ""; document.body.style.backgroundColor = ""; };
  }, [themed, embed]);

  // Embedded: size to the content and tell the host page, so its snippet can resize the iframe.
  // Message shape: { type: "chaos:embed:height", height: <CSS pixels> } (see lib/embed.ts).
  useEffect(() => {
    const el = shell.current;
    if (!embed || !el || window.parent === window) return;
    let last = -1;
    const post = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      const message: EmbedHeightMessage = { type: EMBED_HEIGHT_MESSAGE, height };
      window.parent.postMessage(message, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed]);

  return (
    <div ref={shell} className={`form-shell ${embed ? "form-shell--embed" : "min-h-[100dvh]"} ${themeClass(themed)}`} style={themeStyle(themed)}>
      <div className={`form-chrome ${embed ? "form-chrome--embed" : ""}`}>
        {!embed && !plain ? <Link href="/" className="form-chrome-brand form-heading"><Logo size={22} /> chaos</Link> : <span />}
        <div className="flex items-center gap-1.5">
          {languageSwitch}
          <SoundToggle def={themed} />
          {themeFollowsAppearance(themed.theme) && <ThemeToggle className="form-chrome-btn" />}
        </div>
      </div>
      <main className={fullBleed ? "w-full" : `mx-auto w-full max-w-2xl px-5 ${embed ? "pt-16 pb-8" : "pt-24 pb-16"}`}>{children}</main>
    </div>
  );
}

function Message({ title, body, lang = "en", children }: { title: string; body?: string; lang?: Language; children?: React.ReactNode }) {
  return (
    <div className="form-message form-stagger" dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
      <h1 className="form-page-title form-heading" style={{ ["--i" as string]: 0 }}>{title}</h1>
      {body && <p className="form-muted whitespace-pre-line text-lg" style={{ ["--i" as string]: 1 }}>{body}</p>}
      {children && <div style={{ ["--i" as string]: 2 }}>{children}</div>}
    </div>
  );
}

function CodeGate({ title, lang, error, onSubmit }: { title: string; lang: Language; error: "wrong" | "locked" | null; onSubmit: (code: string) => void }) {
  const invalid = error !== null;
  const [code, setCode] = useState("");
  const t = text[lang];
  return (
    <form className="form-message form-stagger" dir={isRtl(lang) ? "rtl" : "ltr"} onSubmit={(e) => { e.preventDefault(); if (code.trim()) onSubmit(code.trim()); }}>
      <h1 className="form-page-title form-heading" style={{ ["--i" as string]: 0 }}>{title}</h1>
      <label className="block space-y-2" style={{ ["--i" as string]: 1 }}>
        <span className="form-q-label">{t.code}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} className="form-input" autoComplete="off" autoFocus aria-invalid={invalid} aria-describedby={invalid ? "code-error" : undefined} />
      </label>
      {invalid && <p id="code-error" role="alert" className="form-error-text">{error === "locked" ? t.codeLocked : t.codeWrong}</p>}
      <div style={{ ["--i" as string]: 2 }}><button className="form-btn">{t.continue} <span aria-hidden="true" className="form-btn-arrow">{isRtl(lang) ? "←" : "→"}</span></button></div>
      <p className="sr-only">{formUi[lang].required}</p>
    </form>
  );
}
