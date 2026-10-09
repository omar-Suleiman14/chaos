"use client";

import { FocusTextarea, FocusInput } from "@/components/InitialFocus";

import { useState } from "react";

import { WsDialog } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import type { LessonSource } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";
import { parseCitationLocator } from "@/lib/learn/mediaClient";
import { formatLocator } from "@/lib/learn/chaosDocument";
import { errorMessage } from "@/lib/errors";

const copy = {
  en: {
    image: "Image details", imageLead: "Describe the image for people who can’t see it, and credit where it came from.",
    alt: "Alt text", altHelp: "What the image shows, as you’d say it aloud. Leave empty only if it is purely decorative.", altPh: "e.g. Diagram of the portal venous system showing collateral pathways",
    caption: "Caption", captionHelp: "Shown under the image for everyone.", kind: "Presentation", kinds: { photo: "Photo or illustration", diagram: "Diagram (white background, zoomable)" },
    credit: "Credit / source", creditPh: "e.g. Netter’s Atlas, plate 292", creditUrl: "Credit link (optional)", badLink: "Use a full https:// link.",
    save: "Save", cancel: "Cancel",
    cite: "Cite a source", citeLead: "Points this sentence to its source. Readers see a small label and can open the source.",
    source: "Source", locator: "Where in the source", locatorPh: "page 23, slide 4, 12:30, or a section name", noSources: "Add the source first in the Sources panel.", manage: "Open Sources", insert: "Insert citation", update: "Update citation",
  },
  ar: {
    image: "تفاصيل الصورة", imageLead: "صف الصورة لمن لا يستطيع رؤيتها، وانسبها إلى مصدرها.",
    alt: "النص البديل", altHelp: "ما تُظهره الصورة كما لو كنت تقوله بصوت عالٍ. اتركه فارغًا فقط إن كانت زخرفية.", altPh: "مثل: رسم لجهاز الوريد البابي يُظهر المسارات الجانبية",
    caption: "التعليق", captionHelp: "يظهر تحت الصورة للجميع.", kind: "طريقة العرض", kinds: { photo: "صورة أو رسم", diagram: "رسم توضيحي (خلفية بيضاء، قابل للتكبير)" },
    credit: "المصدر", creditPh: "مثل: أطلس Netter، اللوحة 292", creditUrl: "رابط المصدر (اختياري)", badLink: "استخدم رابطًا كاملًا يبدأ بـ https://.",
    save: "احفظ", cancel: "إلغاء",
    cite: "استشهد بمصدر", citeLead: "يربط هذه الجملة بمصدرها. يرى القرّاء تسمية صغيرة ويمكنهم فتح المصدر.",
    source: "المصدر", locator: "الموضع في المصدر", locatorPh: "صفحة 23، شريحة 4، 12:30، أو اسم قسم", noSources: "أضف المصدر أولًا في لوحة المصادر.", manage: "افتح المصادر", insert: "أدرج الاستشهاد", update: "حدّث الاستشهاد",
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
        <label className="lx-field">{t.alt}<FocusTextarea focusOnMount className="lx-textarea" rows={3} value={value.alt} placeholder={t.altPh} onChange={(e) => setValue({ ...value, alt: e.target.value })} /><small>{t.altHelp}</small></label>
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
  sources: LessonSource[]; initial?: { sourceId: string; locator: string }; onDone: (value: { sourceId: string; locator: string }) => void | Promise<unknown>; onManageSources: () => void; onClose: () => void;
}) {
  const t = useCopy(copy);
  const [sourceId, setSourceId] = useState(initial?.sourceId || sources[0]?.id || "");
  const [locator, setLocator] = useState(initial?.locator ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <WsDialog title={t.cite} description={t.citeLead} onClose={onClose}>
      {!sources.length ? (
        <div className="lx-form"><p className="lx-muted">{t.noSources}</p><div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="ws-btn ws-btn--primary" onClick={() => { onClose(); onManageSources(); }}>{t.manage}</button></div></div>
      ) : (
        <form className="lx-form" onSubmit={async (e) => { e.preventDefault(); if (!sourceId || busy) return; setBusy(true); setError(""); try { await onDone({ sourceId, locator: formatLocator(parseCitationLocator(locator)) }); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>
          <label className="lx-field">{t.source}<Select label={t.source} value={sourceId} onChange={setSourceId} options={sources.map((s) => ({ value: s.id, label: s.shortLabel ? `${s.shortLabel} — ${s.title}` : s.title }))} /></label>
          { }
          <label className="lx-field">{t.locator}<FocusInput focusOnMount className="lx-input" value={locator} placeholder={t.locatorPh} maxLength={300} required disabled={busy} onChange={(e) => setLocator(e.target.value)} /><small>Saved against this stable block. Exact inline citation positions are not supported.</small></label>
          {error && <p className="lx-error" role="alert">{error}</p>}
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="ws-btn ws-btn--primary" disabled={!sourceId || busy}>{initial ? t.update : t.insert}</button>
          </div>
        </form>
      )}
    </WsDialog>
  );
}

