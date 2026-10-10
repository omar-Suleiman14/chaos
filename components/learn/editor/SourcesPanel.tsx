"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import MagneticFileDropZone from "@/components/workspace/MagneticFileDropZone";
import { citations } from "@/lib/learn/doc";
import { SOURCE_FILE_ACCEPT, type NativeSource, type NativeCitation } from "@/lib/learn/mediaClient";
import { formatLocator } from "@/lib/learn/chaosDocument";
import type { SourceKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";
import { sourceIcon, useBlockCopy } from "./blocks";

const copy = {
  en: {
    lead: "The original material: lecture PDFs, slides, books, videos and links. Readers see it apart from your writing, with its owner and licence.",
    add: "Add source", edit: "Edit", remove: "Remove", save: "Save source", cancel: "Cancel", empty: "No sources yet.",
    kind: "Type", title: "Title", titlePh: "e.g. GIT Lecture 8: Portal hypertension", link: "Link", linkPh: "https://…", file: "Or upload a file", fileHelp: "PDF, PowerPoint, plain text or PNG/JPEG/WebP up to 25 MiB.",
    fileKept: (name: string) => `File: ${name}`, author: "Author", owner: "Copyright holder", ownerHelp: "Who owns it, if not the author (a university, publisher).",
    year: "Year", license: "Licence or permission", licensePh: "e.g. shared by the lecturer for students", short: "Short label for citations", shortPh: "e.g. Lecture 8",
    note: "Note for readers", required: "Add a title.", badLink: "Use a full http(s) link.", uploadFailed: "The file could not be stored.", tooLarge: "Files can be at most 25 MiB.",
    cited: (n: number) => `Cited ${n} ${n === 1 ? "time" : "times"} in this lesson. Detaching removes its source cards and block citations from this draft. Published versions and the original source are preserved.`,
    confirmRemove: "Remove", uploading: "Storing…",
  },
  ar: {
    lead: "المادة الأصلية: ملفات PDF للمحاضرات والشرائح والكتب والفيديو والروابط. يراها القرّاء منفصلة عن كتابتك مع مالكها وترخيصها.",
    add: "أضف مصدرًا", edit: "تعديل", remove: "إزالة", save: "احفظ المصدر", cancel: "إلغاء", empty: "لا مصادر بعد.",
    kind: "النوع", title: "العنوان", titlePh: "مثل: محاضرة الجهاز الهضمي 8: ارتفاع ضغط الوريد البابي", link: "الرابط", linkPh: "https://…", file: "أو ارفع ملفًا", fileHelp: "PDF أو شرائح حتى 20 ميغابايت.",
    fileKept: (name: string) => `الملف: ${name}`, author: "المؤلف", owner: "صاحب الحقوق", ownerHelp: "من يملكها إن لم يكن المؤلف (جامعة، ناشر).",
    year: "السنة", license: "الترخيص أو الإذن", licensePh: "مثل: شاركها المحاضر للطلاب", short: "تسمية قصيرة للاستشهاد", shortPh: "مثل: المحاضرة 8",
    note: "ملاحظة للقرّاء", required: "أضف عنوانًا.", badLink: "استخدم رابط http(s) كاملًا.", uploadFailed: "تعذّر حفظ الملف.", tooLarge: "الحد الأقصى لحجم الملف 20 ميغابايت.",
    cited: (n: number) => `مُستشهد به ${n} مرة في هذا الدرس. ستظهر تلك الاستشهادات كمفقودة إن أزلته.`,
    confirmRemove: "أزل", uploading: "جارٍ الحفظ…",
  },
};

const KINDS: SourceKind[] = ["pdf", "slides", "video", "link", "reference"];
const blank = (): NativeSource => ({ id: "", kind: "pdf", nativeKind: "pdf", title: "", origin: "", metadataVisibility: "private", contentVisibility: "private" });

export default function SourcesPanel({ sources, content, onSave, onRemove, onOpen, blockCitations = [], onEditCitation, disabled = false }: {
  sources: NativeSource[]; content: unknown; onSave: (source: NativeSource, file?: File) => Promise<unknown>;
  onRemove: (sourceId: string) => Promise<unknown>; onOpen: (source: NativeSource) => Promise<unknown>;
  blockCitations?: { blockId: string; citation: NativeCitation }[]; onEditCitation?: (blockId: string, citation: NativeCitation) => void; disabled?: boolean;
}) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const [editing, setEditing] = useState<NativeSource | null>(null);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const cited = citations(content);

  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const save = () => perform(async () => {
    if (!editing) return;
    if (!editing.title.trim()) { setError(t.required); return; }
    await onSave(editing, file);
    setEditing(null);
    setFile(undefined);
    setError("");
  });
  const remove = (id: string) => perform(async () => { await onRemove(id); setConfirm(null); });
  const field = (key: keyof NativeSource, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => (
    <label className="lx-field">{label}
      <input className="lx-input" disabled={busy || disabled} value={(editing?.[key] as string) ?? ""} onChange={(e) => setEditing((s) => s && { ...s, [key]: e.target.value })} {...props} />
      {help && <small>{help}</small>}
    </label>
  );

  return (
    <div className="lx-form">
      <p className="lx-help" style={{ fontSize: 13 }}>{t.lead}</p>
      {!sources.length && !editing && <p className="lx-muted">{t.empty}</p>}
      <div className="lx-list">
        {sources.map((s) => {
          const Icon = sourceIcon[s.kind];
          const uses = cited.filter((c) => c.sourceId === s.id).length + blockCitations.filter(c => c.citation.sourceId === s.id).length;
          return (
            <div key={s.id} className="lx-row" style={{ padding: "8px 2px" }}>
              <span className="lx-row__icon" aria-hidden><Icon size={15} /></span>
              <span className="lx-row__main"><span className="lx-row__title">{s.title}</span><span className="lx-row__sub">{[bt.kinds[s.kind], s.origin, s.metadataVisibility, s.contentVisibility].filter(Boolean).join(" · ")}</span></span>
              {confirm === s.id ? (
                <span className="lx-actions" style={{ gap: 4 }}>
                  <button type="button" className="ws-btn ws-btn--sm ws-btn--danger" disabled={busy || disabled} onClick={() => void remove(s.id)}>{t.confirmRemove}</button>
                  <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setConfirm(null)}>{t.cancel}</button>
                </span>
              ) : (
                <>
                  {s.fileId && <button type="button" className="lx-link" disabled={busy || disabled} onClick={() => void perform(() => onOpen(s))}>Open file</button>}
                  <button type="button" className="ws-icon-button" disabled={busy || disabled} aria-label={`${t.edit}: ${s.title}`} onClick={() => { setEditing(s); setFile(undefined); setError(""); }}><PenLine size={14} /></button>
                  <button type="button" className="ws-icon-button" disabled={busy || disabled} aria-label={`${t.remove}: ${s.title}`} onClick={() => setConfirm(s.id)}><Trash2 size={14} /></button>
                </>
              )}
              {confirm === s.id && <small className="lx-muted" style={{ width: "100%" }}>{t.cited(uses)}</small>}
            </div>
          );
        })}
      </div>
      {editing ? (
        <div className="lx-panel">
          <label className="lx-field">{t.kind}<Select label={t.kind} disabled={!!editing.id || busy || disabled} value={editing.kind} onChange={(v) => { setEditing({ ...editing, kind: v as SourceKind, nativeKind: v === "link" ? "url" : v as NativeSource["nativeKind"] }); setFile(undefined); }} options={KINDS.map((k) => ({ value: k, label: bt.kinds[k] }))} /></label>
          {field("title", t.title, { placeholder: t.titlePh, maxLength: 200, required: true })}
          {field("origin", "Original material / origin", { maxLength: 500, required: true, disabled: !!editing.id || busy || disabled })}
          {field("url", t.link, { placeholder: t.linkPh, type: "url", inputMode: "url" })}
          {!editing.id && (editing.kind === "pdf" || editing.kind === "slides" || editing.kind === "reference") && (
            <div className="lx-field"><span>{t.file}</span>
              <MagneticFileDropZone accept={SOURCE_FILE_ACCEPT} maxBytes={25 * 1024 * 1024}
                disabled={busy || disabled} compact label={t.file} selectedName={editing.fileName}
                onReject={reason => setError(reason === "size" ? t.tooLarge : t.uploadFailed)}
                onFile={chosen => {
                  setFile(chosen); setError("");
                  setEditing(s => s && { ...s, fileName: chosen.name, title: s.title || chosen.name.replace(/\\.[^.]+$/, ""), origin: s.origin || chosen.name });
                }} />
              <small>{busy ? t.uploading : editing.fileName ? t.fileKept(editing.fileName) : t.fileHelp}</small>
            </div>
          )}
          {field("author", t.author, { maxLength: 160 })}
          {field("license", t.license, { placeholder: t.licensePh, maxLength: 160 })}
          <label className="lx-field"><span><input type="checkbox" disabled={busy || disabled || editing.metadataVisibility === "restricted"} checked={editing.metadataVisibility === "public"} onChange={e => setEditing({ ...editing, metadataVisibility: e.target.checked ? "public" : "private" })} /> Share source title and attribution with readers</span></label>
          <label className="lx-field"><span><input type="checkbox" disabled={busy || disabled || editing.contentVisibility === "restricted"} checked={editing.contentVisibility === "public"} onChange={e => setEditing({ ...editing, contentVisibility: e.target.checked ? "public" : "private" })} /> Allow anyone to open this source file</span><small>Files start private. Embedded images need public file access before publication. Restricted grants stay unchanged.</small></label>
          {editing.id && <small className="lx-help">Metadata and access changes apply wherever this source is used. Removing it here detaches it from this draft; it does not delete the original file or published versions.</small>}
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => { setEditing(null); setFile(undefined); setError(""); }}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--primary" onClick={() => void save()} disabled={busy || disabled}>{busy ? t.uploading : t.save}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ws-btn" disabled={busy || disabled} onClick={() => { setEditing(blank()); setFile(undefined); }}><Plus size={15} aria-hidden />{t.add}</button>
      )}
      {blockCitations.map(({ blockId, citation }, index) => <div className="lx-panel__row" key={blockId + ":" + index}><span className="lx-muted">{sources.find(s => s.id === citation.sourceId)?.title ?? "Unavailable source"} · {formatLocator(citation.locator)} · {blockId}</span><button type="button" className="lx-link" disabled={busy || disabled} onClick={() => onEditCitation?.(blockId, citation)}>{t.edit}</button></div>)}
      {error && <p className="lx-error" role="alert">{error}</p>}
    </div>
  );
}
