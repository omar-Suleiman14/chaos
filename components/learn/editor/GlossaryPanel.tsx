"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { Pencil, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { GlossaryEntry } from "@/lib/learn/glossary";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    lead: "Words readers can tap for a definition and its meaning in Arabic. Assistants connected to Chaos add these for you; changes show to readers right away.",
    term: "Word or phrase", definition: "Definition", translation: "Arabic translation", explanation: "Meaning in Arabic", aliases: "Other forms (comma-separated)",
    add: "Add word", save: "Save word", cancel: "Cancel", edit: (term: string) => `Edit ${term}`, remove: (term: string) => `Remove ${term}`, loading: "Loading glossary…", empty: "No words yet.",
  },
  ar: {
    lead: "كلمات يضغط عليها القرّاء ليروا تعريفها ومعناها بالعربية. يضيفها المساعدون المتصلون بـ Chaos تلقائيًا، وتظهر التغييرات للقرّاء فورًا.",
    term: "الكلمة أو العبارة", definition: "التعريف", translation: "الترجمة العربية", explanation: "المعنى بالعربية", aliases: "صيغ أخرى (مفصولة بفواصل)",
    add: "أضف كلمة", save: "احفظ الكلمة", cancel: "إلغاء", edit: (term: string) => `عدّل ${term}`, remove: (term: string) => `احذف ${term}`, loading: "جارٍ تحميل المسرد…", empty: "لا كلمات بعد.",
  },
};
type Draft = { term: string; definition: string; translation: string; explanation: string; aliases: string };
const blank: Draft = { term: "", definition: "", translation: "", explanation: "", aliases: "" };

export default function GlossaryPanel({ lessonId }: { lessonId: string }) {
  const t = useCopy(copy);
  const entries = useQuery(api.lessonGlossary.get, { lessonId });
  const save = useMutation(api.lessonGlossary.save);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const write = async (next: GlossaryEntry[]) => {
    setBusy(true); setError("");
    try { await save({ lessonId: lessonId as Id<"lessons">, entries: next }); setDraft(null); setEditing(null); }
    catch (err) { setError(err instanceof Error ? err.message.replace(/^.*VALIDATION_FAILED: /, "") : "Could not save the glossary."); }
    finally { setBusy(false); }
  };
  const submit = () => {
    if (!draft || !entries) return;
    const prior = entries.find(e => e.term === editing);
    const entry: GlossaryEntry = { ...prior, term: draft.term, definition: draft.definition, translation: draft.translation || undefined, explanation: draft.explanation || undefined, aliases: draft.aliases.split(",").map(a => a.trim()).filter(Boolean), language: prior?.language ?? "ar" };
    void write([...entries.filter(e => e.term !== editing && e.term.toLocaleLowerCase() !== draft.term.trim().toLocaleLowerCase()), entry]);
  };
  const field = (name: keyof Draft, label: string, multiline = false, rtl = false) => (
    <label className="lx-field"><span>{label}</span>
      {multiline
        ? <textarea className="lx-input" rows={2} dir={rtl ? "rtl" : "auto"} value={draft![name]} disabled={busy} onChange={e => setDraft(d => d && { ...d, [name]: e.target.value })} />
        : <input className="lx-input" dir={rtl ? "rtl" : "auto"} value={draft![name]} disabled={busy} onChange={e => setDraft(d => d && { ...d, [name]: e.target.value })} />}
    </label>
  );
  return (
    <div className="lx-form">
      <p className="lx-help" style={{ fontSize: 13 }}>{t.lead}</p>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {entries === undefined ? <p className="lx-muted" role="status">{t.loading}</p> : !entries.length && !draft && <p className="lx-muted">{t.empty}</p>}
      {entries?.map(e => (
        <div key={e.term} className="lx-panel" style={{ gap: 4, padding: 10 }}>
          <div className="lx-panel__row">
            <span style={{ minWidth: 0 }}><strong dir="auto">{e.term}</strong>{e.translation && <span className="lx-muted" dir="rtl"> · {e.translation}</span>}</span>
            <span style={{ display: "flex" }}>
              <button type="button" className="ws-icon-button" disabled={busy} aria-label={t.edit(e.term)} onClick={() => { setEditing(e.term); setDraft({ term: e.term, definition: e.definition, translation: e.translation ?? "", explanation: e.explanation ?? "", aliases: (e.aliases ?? []).join(", ") }); }}><Pencil size={13} /></button>
              <button type="button" className="ws-icon-button" disabled={busy} aria-label={t.remove(e.term)} onClick={() => void write(entries.filter(x => x.term !== e.term))}><X size={13} /></button>
            </span>
          </div>
          <small className="lx-muted" dir="auto">{e.definition}</small>
        </div>
      ))}
      {draft ? (
        <form className="lx-panel" style={{ gap: 8, padding: 10 }} onSubmit={e => { e.preventDefault(); submit(); }}>
          {field("term", t.term)}
          {field("definition", t.definition, true)}
          {field("translation", t.translation, false, true)}
          {field("explanation", t.explanation, true, true)}
          {field("aliases", t.aliases)}
          <div className="lx-panel__row">
            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" disabled={busy} onClick={() => { setDraft(null); setEditing(null); }}>{t.cancel}</button>
            <button type="submit" className="ws-btn ws-btn--sm ws-btn--primary" disabled={busy || !draft.term.trim() || !draft.definition.trim()}>{t.save}</button>
          </div>
        </form>
      ) : entries && <button type="button" className="ws-btn ws-btn--sm" onClick={() => { setEditing(null); setDraft(blank); }}><Plus size={14} aria-hidden />{t.add}</button>}
    </div>
  );
}
