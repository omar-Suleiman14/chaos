"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { WsDialog } from "@/components/workspace/primitives";
import { buildHandoffPrompt, handoffName, handoffUrl, HANDOFF_MAX_SELECTION, type HandoffAction, type HandoffTarget } from "@/lib/learn/handoff";
import { useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    title: (name: string) => `Ask ${name}`, titleAny: "Ask an assistant",
    lead: "Chaos sends nothing by itself. Check exactly what will be shared, then open the assistant.",
    selection: "Selected text", question: "Your question (optional)", questionPh: "e.g. Why does portal pressure rise in cirrhosis?",
    include: "Also include", section: (s: string) => `Section heading: “${s}”`, context: "The paragraphs around it", sources: (s: string) => `Source references: ${s}`,
    link: "Link to this public lesson", imageNote: "Image description", imageHelp: "Images can’t travel in a link. Chaos shares the description; attach the image yourself if you need it to see it.",
    action: "What to ask", actions: { explain: "Explain", simplify: "Simplify", example: "Example", quiz: "Quiz me", ask: "Just ask" } as Record<HandoffAction, string>,
    preview: "Exactly what will be shared", chars: (n: number) => `${n} characters`,
    open: (name: string) => `Open ${name}`, copy: "Copy text", copied: "Copied",
    longNote: "This is too long to pre-fill. Chaos copies it and opens an empty chat: paste it there.",
    prefillNote: (name: string) => `${name} opens in a new tab with this text filled in. You can still edit it before sending.`,
    clipboardFailed: "Copy failed. Select the preview text and copy it yourself.",
    trimmed: (n: number) => `Only the first ${n} characters of the selection are included.`,
  },
  ar: {
    title: (name: string) => `اسأل ${name}`, titleAny: "اسأل مساعدًا",
    lead: "لا يرسل Chaos شيئًا من تلقاء نفسه. راجع ما ستشاركه بالضبط، ثم افتح المساعد.",
    selection: "النص المحدد", question: "سؤالك (اختياري)", questionPh: "مثلًا: لماذا يرتفع ضغط الوريد البابي في التليّف؟",
    include: "أضف أيضًا", section: (s: string) => `عنوان القسم: «${s}»`, context: "الفقرات المحيطة به", sources: (s: string) => `مراجع المصدر: ${s}`,
    link: "رابط هذا الدرس العام", imageNote: "وصف الصورة", imageHelp: "لا يمكن إرسال الصور عبر الرابط. يشارك Chaos الوصف؛ أرفق الصورة بنفسك إن احتاج المساعد إلى رؤيتها.",
    action: "ماذا تطلب", actions: { explain: "اشرح", simplify: "بسّط", example: "مثال", quiz: "اختبرني", ask: "سؤال فقط" } as Record<HandoffAction, string>,
    preview: "ما سيُشارَك بالضبط", chars: (n: number) => `${n} حرفًا`,
    open: (name: string) => `افتح ${name}`, copy: "انسخ النص", copied: "تم النسخ",
    longNote: "النص أطول من أن يُملأ تلقائيًا. سينسخه Chaos ويفتح محادثة فارغة: الصقه هناك.",
    prefillNote: (name: string) => `سيُفتح ${name} في علامة تبويب جديدة وفيه هذا النص. يمكنك تعديله قبل الإرسال.`,
    clipboardFailed: "تعذّر النسخ. حدّد نص المعاينة وانسخه بنفسك.",
    trimmed: (n: number) => `يُضمَّن أول ${n} حرف فقط من التحديد.`,
  },
};

export interface HandoffContext {
  lessonTitle: string;
  selection: string;
  section?: string;
  context?: string;
  sources?: string[];
  publicUrl?: string;
  imageAlt?: string;
  action?: HandoffAction;
  target?: HandoffTarget;
}

export default function HandoffDialog({ input, onClose }: { input: HandoffContext; onClose: () => void }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [selection, setSelection] = useState(input.selection);
  const [question, setQuestion] = useState("");
  const [action, setAction] = useState<HandoffAction>(input.action ?? "explain");
  const [withSection, setWithSection] = useState(!!input.section);
  const [withContext, setWithContext] = useState(false);
  const [withSources, setWithSources] = useState(!!input.sources?.length);
  const [withLink, setWithLink] = useState(false);
  const [imageNote, setImageNote] = useState(input.imageAlt ?? "");
  const [status, setStatus] = useState<"" | "copied" | "failed">("");

  const prompt = useMemo(() => buildHandoffPrompt({
    action, language: locale, lessonTitle: input.lessonTitle, selection, question,
    section: withSection ? input.section : undefined, context: withContext ? input.context : undefined,
    sources: withSources ? input.sources : undefined, url: withLink ? input.publicUrl : undefined,
    imageNote: input.imageAlt !== undefined ? imageNote : undefined,
  }), [action, locale, input, selection, question, withSection, withContext, withSources, withLink, imageNote]);

  const copyText = async () => {
    try { await navigator.clipboard.writeText(prompt); setStatus("copied"); return true; } catch { setStatus("failed"); return false; }
  };
  const open = async (target: HandoffTarget) => {
    const { url, prefilled } = handoffUrl(target, prompt);
    if (!prefilled) await copyText();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const fits = handoffUrl("chatgpt", prompt).prefilled;
  const check = (checked: boolean, set: (v: boolean) => void, label: string) => (
    <label className="lx-panel__row" style={{ justifyContent: "flex-start", fontWeight: 400 }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} /> <span>{label}</span>
    </label>
  );

  return (
    <WsDialog title={input.target ? t.title(handoffName[input.target]) : t.titleAny} description={t.lead} onClose={onClose} wide>
      <div className="lx-form">
        <div className="lx-field">
          <span>{t.action}</span>
          <div className="lx-chips" role="radiogroup" aria-label={t.action} onKeyDown={e => {
            const choices = Object.keys(t.actions) as HandoffAction[];
            const index = choices.indexOf(action);
            const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
            let next = index;
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = (index + ((e.key === "ArrowRight") !== rtl ? 1 : -1) + choices.length) % choices.length;
            else if (e.key === "ArrowDown") next = (index + 1) % choices.length;
            else if (e.key === "ArrowUp") next = (index + choices.length - 1) % choices.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = choices.length - 1;
            else return;
            e.preventDefault(); setAction(choices[next]);
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
          }}>
            {(Object.keys(t.actions) as HandoffAction[]).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={action === a} tabIndex={action === a ? 0 : -1} className="lx-chip" onClick={() => setAction(a)}>{t.actions[a]}</button>
            ))}
          </div>
        </div>
        <label className="lx-field">{t.question}<input className="lx-input" value={question} placeholder={t.questionPh} onChange={(e) => setQuestion(e.target.value)} maxLength={500} /></label>
        {input.imageAlt !== undefined ? (
          <label className="lx-field">{t.imageNote}<textarea className="lx-textarea" value={imageNote} onChange={(e) => setImageNote(e.target.value)} rows={2} /><small>{t.imageHelp}</small></label>
        ) : (
          <label className="lx-field">{t.selection}
            <textarea className="lx-textarea" value={selection} onChange={(e) => setSelection(e.target.value)} rows={4} />
            {selection.length > HANDOFF_MAX_SELECTION && <small>{t.trimmed(HANDOFF_MAX_SELECTION)}</small>}
          </label>
        )}
        <fieldset className="lx-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 6 }}>{t.include}</legend>
          {input.section && check(withSection, setWithSection, t.section(input.section))}
          {input.context && check(withContext, setWithContext, t.context)}
          {!!input.sources?.length && check(withSources, setWithSources, t.sources(input.sources.join("; ")))}
          {input.publicUrl && check(withLink, setWithLink, t.link)}
        </fieldset>
        <div className="lx-field">
          <span>{t.preview} <span className="lx-muted" style={{ fontWeight: 400 }}>· {t.chars(prompt.length)}</span></span>
          <pre className="lx-quote" style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "inherit" }} tabIndex={0}>{prompt}</pre>
        </div>
        <p className="lx-notice" data-tone={fits ? "info" : "warn"}><ShieldCheck size={16} aria-hidden /><span>{fits ? t.prefillNote(handoffName[input.target ?? "chatgpt"]) : t.longNote}</span></p>
        {status === "failed" && <p className="lx-error" role="alert">{t.clipboardFailed}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ws-btn ws-btn--ghost" onClick={() => void copyText()}>{status === "copied" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{status === "copied" ? t.copied : t.copy}</button>
          {(input.target ? [input.target] : (["chatgpt", "claude"] as HandoffTarget[])).map((target, i, all) => (
            <button key={target} type="button" className={`ws-btn ${i === all.length - 1 ? "ws-btn--primary" : ""}`} onClick={() => void open(target)}><ExternalLink size={16} aria-hidden />{t.open(handoffName[target])}</button>
          ))}
        </div>
      </div>
    </WsDialog>
  );
}
