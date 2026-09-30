"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { WsDialog } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import type { AiAction, LessonSource } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    image: "Image details", imageLead: "Describe the image for people who can’t see it, and credit where it came from.",
    alt: "Alt text", altHelp: "What the image shows, as you’d say it aloud. Leave empty only if it is purely decorative.", altPh: "e.g. Diagram of the portal venous system showing collateral pathways",
    caption: "Caption", captionHelp: "Shown under the image for everyone.", kind: "Presentation", kinds: { photo: "Photo or illustration", diagram: "Diagram (white background, zoomable)" },
    credit: "Credit / source", creditPh: "e.g. Netter’s Atlas, plate 292", creditUrl: "Credit link (optional)", badLink: "Use a full https:// link.",
    save: "Save", cancel: "Cancel",
    cite: "Cite a source", citeLead: "Points this sentence to its source. Readers see a small label and can open the source.",
    source: "Source", locator: "Where in the source", locatorPh: "page 23, slide 4, 12:30, or a section name", noSources: "Add the source first in the Sources panel.", manage: "Open Sources", insert: "Insert citation", update: "Update citation",
    assist: (a: string) => a, assistLead: "A suggestion based on your selection. Nothing changes unless you choose to use it.",
    original: "Your text", suggestion: "Suggestion", replace: "Replace selection", insertBelow: "Insert below", discard: "Discard",
    actions: { explain: "Explain", simplify: "Simplify", expand: "Expand", rewrite: "Rewrite", organize: "Organize", example: "Example", quiz: "Quiz" } as Record<AiAction, string>,
  },
  ar: {
    image: "تفاصيل الصورة", imageLead: "صف الصورة لمن لا يستطيع رؤيتها، وانسبها إلى مصدرها.",
    alt: "النص البديل", altHelp: "ما تُظهره الصورة كما لو كنت تقوله بصوت عالٍ. اتركه فارغًا فقط إن كانت زخرفية.", altPh: "مثل: رسم لجهاز الوريد البابي يُظهر المسارات الجانبية",
    caption: "التعليق", captionHelp: "يظهر تحت الصورة للجميع.", kind: "طريقة العرض", kinds: { photo: "صورة أو رسم", diagram: "رسم توضيحي (خلفية بيضاء، قابل للتكبير)" },
    credit: "المصدر", creditPh: "مثل: أطلس Netter، اللوحة 292", creditUrl: "رابط المصدر (اختياري)", badLink: "استخدم رابطًا كاملًا يبدأ بـ https://.",
    save: "احفظ", cancel: "إلغاء",
    cite: "استشهد بمصدر", citeLead: "يربط هذه الجملة بمصدرها. يرى القرّاء تسمية صغيرة ويمكنهم فتح المصدر.",
    source: "المصدر", locator: "الموضع في المصدر", locatorPh: "صفحة 23، شريحة 4، 12:30، أو اسم قسم", noSources: "أضف المصدر أولًا في لوحة المصادر.", manage: "افتح المصادر", insert: "أدرج الاستشهاد", update: "حدّث الاستشهاد",
    assist: (a: string) => a, assistLead: "اقتراح مبني على تحديدك. لا يتغير شيء إلا إن اخترت استخدامه.",
    original: "نصك", suggestion: "الاقتراح", replace: "استبدل التحديد", insertBelow: "أدرج أسفله", discard: "تجاهل",
    actions: { explain: "اشرح", simplify: "بسّط", expand: "وسّع", rewrite: "أعد الصياغة", organize: "نظّم", example: "مثال", quiz: "اختبار" } as Record<AiAction, string>,
  },
};

export interface ImageDetails { alt: string; caption: string; credit: string; creditUrl: string; figureKind: "photo" | "diagram" }

export function ImageDetailsDialog({ initial, onSave, onClose }: { initial: ImageDetails; onSave: (value: ImageDetails) => void; onClose: () => void }) {
  const t = useCopy(copy);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  return (
    <WsDialog title={t.image} description={t.imageLead} onClose={onClose}>
      <form className="lx-form" onSubmit={(e) => {
        e.preventDefault();
        if (value.creditUrl) { try { if (new URL(value.creditUrl).protocol !== "https:") throw new Error(); } catch { setError(t.badLink); return; } }
        onSave({ ...value, alt: value.alt.trim().slice(0, 500), caption: value.caption.slice(0, 500), credit: value.credit.trim().slice(0, 200) });
      }}>
        { }
        <label className="lx-field">{t.alt}<textarea autoFocus className="lx-textarea" rows={3} value={value.alt} placeholder={t.altPh} onChange={(e) => setValue({ ...value, alt: e.target.value })} /><small>{t.altHelp}</small></label>
        <label className="lx-field">{t.caption}<input className="lx-input" value={value.caption} onChange={(e) => setValue({ ...value, caption: e.target.value })} /><small>{t.captionHelp}</small></label>
        <label className="lx-field">{t.kind}<Select label={t.kind} value={value.figureKind} onChange={(v) => setValue({ ...value, figureKind: v as "photo" | "diagram" })} options={(["photo", "diagram"] as const).map((k) => ({ value: k, label: t.kinds[k] }))} /></label>
        <div className="lx-form__row">
          <label className="lx-field">{t.credit}<input className="lx-input" value={value.credit} placeholder={t.creditPh} onChange={(e) => setValue({ ...value, credit: e.target.value })} /></label>
          <label className="lx-field">{t.creditUrl}<input className="lx-input" type="url" value={value.creditUrl} placeholder="https://…" onChange={(e) => { setValue({ ...value, creditUrl: e.target.value }); setError(""); }} aria-invalid={!!error} /></label>
        </div>
        {error && <p className="lx-error" role="alert">{error}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="ws-btn ws-btn--primary">{t.save}</button>
        </div>
      </form>
    </WsDialog>
  );
}

export function CitationDialog({ sources, initial, onDone, onManageSources, onClose }: {
  sources: LessonSource[]; initial?: { sourceId: string; locator: string }; onDone: (value: { sourceId: string; locator: string }) => void; onManageSources: () => void; onClose: () => void;
}) {
  const t = useCopy(copy);
  const [sourceId, setSourceId] = useState(initial?.sourceId || sources[0]?.id || "");
  const [locator, setLocator] = useState(initial?.locator ?? "");
  return (
    <WsDialog title={t.cite} description={t.citeLead} onClose={onClose}>
      {!sources.length ? (
        <div className="lx-form"><p className="lx-muted">{t.noSources}</p><div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="ws-btn ws-btn--primary" onClick={() => { onClose(); onManageSources(); }}>{t.manage}</button></div></div>
      ) : (
        <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (sourceId) onDone({ sourceId, locator: locator.trim().slice(0, 80) }); }}>
          <label className="lx-field">{t.source}<Select label={t.source} value={sourceId} onChange={setSourceId} options={sources.map((s) => ({ value: s.id, label: s.shortLabel ? `${s.shortLabel} — ${s.title}` : s.title }))} /></label>
          { }
          <label className="lx-field">{t.locator}<input autoFocus className="lx-input" value={locator} placeholder={t.locatorPh} onChange={(e) => setLocator(e.target.value)} /></label>
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="ws-btn ws-btn--primary" disabled={!sourceId}>{initial ? t.update : t.insert}</button>
          </div>
        </form>
      )}
    </WsDialog>
  );
}

export function AssistDialog({ action, original, suggestion, busy, error, onReplace, onInsert, onClose }: {
  action: AiAction; original: string; suggestion?: string; busy: boolean; error?: string; onReplace: (text: string) => void; onInsert: (text: string) => void; onClose: () => void;
}) {
  const t = useCopy(copy);
  const [text, setText] = useState(suggestion ?? "");
  const [seen, setSeen] = useState(suggestion);
  if (suggestion !== seen) { setSeen(suggestion); setText(suggestion ?? ""); }
  return (
    <WsDialog title={t.actions[action]} description={t.assistLead} onClose={onClose} wide>
      <div className="lx-form">
        <div className="lx-field"><span>{t.original}</span><div className="lx-quote" style={{ maxHeight: 140, overflow: "auto" }}>{original}</div></div>
        <label className="lx-field"><span><Sparkles size={13} aria-hidden /> {t.suggestion}</span>
          {busy ? <div className="ws-skeleton ws-skeleton--panel" style={{ height: 120 }} aria-busy="true" /> : <textarea className="lx-textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} />}
        </label>
        {error && <p className="lx-error" role="alert">{error}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.discard}</button>
          <button type="button" className="ws-btn" disabled={busy || !text.trim()} onClick={() => onInsert(text)}>{t.insertBelow}</button>
          <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !text.trim()} onClick={() => onReplace(text)}><Check size={15} aria-hidden />{t.replace}</button>
        </div>
      </div>
    </WsDialog>
  );
}
