"use client";

import { useState } from "react";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import { citations } from "@/lib/learn/doc";
import { newId } from "@/lib/learn/data";
import { uploadLearnFile as putFile } from "@/lib/learn/data";
import type { LessonSource, SourceKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";
import { sourceIcon, useBlockCopy } from "./blocks";

const copy = {
  en: {
    lead: "The original material: lecture PDFs, slides, books, videos and links. Readers see it apart from your writing, with its owner and licence.",
    add: "Add source", edit: "Edit", remove: "Remove", save: "Save source", cancel: "Cancel", empty: "No sources yet.",
    kind: "Type", title: "Title", titlePh: "e.g. GIT Lecture 8: Portal hypertension", link: "Link", linkPh: "https://…", file: "Or upload a file", fileHelp: "PDF or slides up to 20 MB.",
    fileKept: (name: string) => `File: ${name}`, author: "Author", owner: "Copyright holder", ownerHelp: "Who owns it, if not the author (a university, publisher).",
    year: "Year", license: "Licence or permission", licensePh: "e.g. shared by the lecturer for students", short: "Short label for citations", shortPh: "e.g. Lecture 8",
    note: "Note for readers", required: "Add a title.", badLink: "Use a full http(s) link.", uploadFailed: "The file could not be stored.", tooLarge: "Files can be at most 20 MB.",
    cited: (n: number) => `Cited ${n} ${n === 1 ? "time" : "times"} in this lesson. Removing it leaves those citations marked as missing.`,
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

const KINDS: SourceKind[] = ["pdf", "slides", "book", "article", "video", "link", "reference"];
const blank = (): LessonSource => ({ id: newId("src"), kind: "pdf", title: "" });

export default function SourcesPanel({ sources, content, onChange }: { sources: LessonSource[]; content: unknown; onChange: (sources: LessonSource[]) => void }) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const [editing, setEditing] = useState<LessonSource | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const cited = citations(content);

  const save = () => {
    if (!editing) return;
    if (!editing.title.trim()) { setError(t.required); return; }
    if (editing.url) { try { if (!["http:", "https:"].includes(new URL(editing.url).protocol)) throw new Error(); } catch { setError(t.badLink); return; } }
    const clean = Object.fromEntries(Object.entries(editing).map(([k, v]) => [k, typeof v === "string" ? v.trim().slice(0, 300) || undefined : v])) as unknown as LessonSource;
    onChange(sources.some((s) => s.id === editing.id) ? sources.map((s) => (s.id === editing.id ? clean : s)) : [...sources, clean]);
    setEditing(null);
    setError("");
  };
  const field = (key: keyof LessonSource, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => (
    <label className="lx-field">{label}
      <input className="lx-input" value={(editing?.[key] as string) ?? ""} onChange={(e) => setEditing((s) => s && { ...s, [key]: e.target.value })} {...props} />
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
          const uses = cited.filter((c) => c.sourceId === s.id).length;
          return (
            <div key={s.id} className="lx-row" style={{ padding: "8px 2px" }}>
              <span className="lx-row__icon" aria-hidden><Icon size={15} /></span>
              <span className="lx-row__main"><span className="lx-row__title">{s.title}</span><span className="lx-row__sub">{[bt.kinds[s.kind], s.shortLabel, s.owner].filter(Boolean).join(" · ")}</span></span>
              {confirm === s.id ? (
                <span className="lx-actions" style={{ gap: 4 }}>
                  <button type="button" className="ws-btn ws-btn--sm ws-btn--danger" onClick={() => { onChange(sources.filter((x) => x.id !== s.id)); setConfirm(null); }}>{t.confirmRemove}</button>
                  <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setConfirm(null)}>{t.cancel}</button>
                </span>
              ) : (
                <>
                  <button type="button" className="ws-icon-button" aria-label={`${t.edit}: ${s.title}`} onClick={() => { setEditing(s); setError(""); }}><PenLine size={14} /></button>
                  <button type="button" className="ws-icon-button" aria-label={`${t.remove}: ${s.title}`} onClick={() => (uses ? setConfirm(s.id) : onChange(sources.filter((x) => x.id !== s.id)))}><Trash2 size={14} /></button>
                </>
              )}
              {confirm === s.id && <small className="lx-muted" style={{ width: "100%" }}>{t.cited(uses)}</small>}
            </div>
          );
        })}
      </div>
      {editing ? (
        <div className="lx-panel">
          <label className="lx-field">{t.kind}<Select label={t.kind} value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v as SourceKind })} options={KINDS.map((k) => ({ value: k, label: bt.kinds[k] }))} /></label>
          {field("title", t.title, { placeholder: t.titlePh, maxLength: 300, required: true })}
          {field("shortLabel", t.short, { placeholder: t.shortPh, maxLength: 60 })}
          {field("url", t.link, { placeholder: t.linkPh, type: "url", inputMode: "url" })}
          {(editing.kind === "pdf" || editing.kind === "slides") && (
            <label className="lx-field">{t.file}
              <input type="file" accept="application/pdf,.pdf,.ppt,.pptx,.key,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true); setError("");
                  try { const fileId = await putFile(file); setEditing((s) => s && { ...s, fileId, fileName: file.name, title: s.title || file.name.replace(/\.[^.]+$/, "") }); }
                  catch (err) { setError(err instanceof Error && err.message === "FILE_TOO_LARGE" ? t.tooLarge : t.uploadFailed); }
                  finally { setBusy(false); }
                }} />
              <small>{busy ? t.uploading : editing.fileName ? t.fileKept(editing.fileName) : t.fileHelp}</small>
            </label>
          )}
          <div className="lx-form__row">{field("author", t.author, { maxLength: 160 })}{field("year", t.year, { maxLength: 12, inputMode: "numeric" })}</div>
          {field("owner", t.owner, { maxLength: 160 }, t.ownerHelp)}
          {field("license", t.license, { placeholder: t.licensePh, maxLength: 160 })}
          {field("note", t.note, { maxLength: 300 })}
          {error && <p className="lx-error" role="alert">{error}</p>}
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => { setEditing(null); setError(""); }}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--primary" onClick={save} disabled={busy}>{t.save}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ws-btn" onClick={() => setEditing(blank())}><Plus size={15} aria-hidden />{t.add}</button>
      )}
    </div>
  );
}
