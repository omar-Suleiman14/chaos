"use client";

import { useMemo, useState } from "react";
import { Globe, Link2, Lock, Search, SearchX } from "lucide-react";
import { WsDialog } from "@/components/workspace/primitives";
import { diffDocuments } from "@/lib/learn/doc";
import { hasUnpublishedChanges, useLearnCapabilities } from "@/lib/learn/data";
import type { IndexingChoice, Lesson, Visibility } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    first: "Publish lesson", changes: "Publish changes", lead: "Readers see the published version. Your draft stays private until you publish it again.",
    who: "Who can read it", vis: {
      private: ["Only me", "Keep it in your library. Good for personal notes."],
      unlisted: ["Anyone with the link", "Not listed in Explore or search results."],
      public: ["Public", "Listed in Explore and Learn search, and anyone can save or copy it with credit."],
    } as Record<Visibility, [string, string]>,
    search: "Search engines", idx: {
      index: ["Allow Google and others to show it", "Only public lessons in good standing can be indexed."],
      noindex: ["Keep it out of search engines", "People can still find it inside Chaos if it is public."],
    } as Record<IndexingChoice, [string, string]>,
    indexOnlyPublic: "Search engines only see public lessons.",
    note: "What changed (optional)", notePh: "e.g. Added Child-Pugh table, fixed ascites section", noteHelp: "Shown in version history.",
    summary: (a: number, c: number, r: number) => `${a} added · ${c} changed · ${r} removed since the published version`,
    noChanges: "No changes since the last publish.", titleNeeded: "Add a title before publishing.",
    device: "Until the Learn service is connected, published lessons are readable in this browser only.",
    cancel: "Cancel", publish: "Publish", publishChanges: "Publish changes",
    rights: "Only publish material you have the right to share. Credit sources in the Sources panel.",
  },
  ar: {
    first: "انشر الدرس", changes: "انشر التعديلات", lead: "يرى القرّاء النسخة المنشورة. تبقى مسودتك خاصة حتى تنشرها مجددًا.",
    who: "من يستطيع قراءته", vis: {
      private: ["أنا فقط", "يبقى في مكتبتك. مناسب للملاحظات الشخصية."],
      unlisted: ["كل من لديه الرابط", "لا يظهر في الاستكشاف أو نتائج البحث."],
      public: ["عام", "يظهر في الاستكشاف وبحث Learn، ويمكن لأي أحد حفظه أو نسخه مع نسبته إليك."],
    } as Record<Visibility, [string, string]>,
    search: "محركات البحث", idx: {
      index: ["اسمح لـ Google وغيره بعرضه", "لا تُفهرس إلا الدروس العامة غير المقيّدة."],
      noindex: ["أبقه خارج محركات البحث", "يظل بالإمكان إيجاده داخل Chaos إن كان عامًا."],
    } as Record<IndexingChoice, [string, string]>,
    indexOnlyPublic: "لا ترى محركات البحث إلا الدروس العامة.",
    note: "ما الذي تغيّر (اختياري)", notePh: "مثل: أضفت جدول Child-Pugh وصححت قسم الاستسقاء", noteHelp: "يظهر في سجل الإصدارات.",
    summary: (a: number, c: number, r: number) => `${a} مضاف · ${c} معدّل · ${r} محذوف منذ النسخة المنشورة`,
    noChanges: "لا تعديلات منذ آخر نشر.", titleNeeded: "أضف عنوانًا قبل النشر.",
    device: "إلى أن تُربط خدمة Learn، تُقرأ الدروس المنشورة في هذا المتصفح فقط.",
    cancel: "إلغاء", publish: "انشر", publishChanges: "انشر التعديلات",
    rights: "لا تنشر إلا ما يحق لك مشاركته. انسب المصادر في لوحة المصادر.",
  },
};

const visIcon = { private: Lock, unlisted: Link2, public: Globe } as const;

export default function PublishDialog({ lesson, onClose, onPublish }: {
  lesson: Lesson; onClose: () => void; onPublish: (input: { visibility: Visibility; indexing: IndexingChoice; note: string }) => void;
}) {
  const t = useCopy(copy);
  const caps = useLearnCapabilities();
  const [visibility, setVisibility] = useState<Visibility>(lesson.published ? lesson.visibility : "public");
  const [indexing, setIndexing] = useState<IndexingChoice>(lesson.draft.meta.indexing);
  const [note, setNote] = useState("");
  const changes = useMemo(() => lesson.published ? diffDocuments(lesson.published.content, lesson.draft.content) : [], [lesson]);
  const count = (k: string) => changes.filter((c) => c.kind === k).length;
  const first = !lesson.published;
  const noTitle = !lesson.draft.meta.title.trim();

  const option = <V extends string>(name: string, value: V, current: V, set: (v: V) => void, [label, help]: [string, string], Icon: typeof Globe, disabled = false) => (
    <label key={value} className="lx-panel" style={{ display: "flex", gap: 10, padding: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, borderColor: current === value ? "var(--primary)" : undefined }}>
      <input type="radio" name={name} checked={current === value} disabled={disabled} onChange={() => set(value)} />
      <Icon size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
      <span style={{ display: "grid", gap: 2 }}><strong style={{ fontSize: 14 }}>{label}</strong><span className="lx-muted">{help}</span></span>
    </label>
  );

  return (
    <WsDialog title={first ? t.first : t.changes} description={t.lead} onClose={onClose}>
      <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (!noTitle) onPublish({ visibility, indexing: visibility === "public" ? indexing : "noindex", note }); }}>
        {!first && <p className="lx-muted">{hasUnpublishedChanges(lesson) ? t.summary(count("added"), count("changed"), count("removed")) : t.noChanges}</p>}
        <fieldset className="lx-field" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend style={{ marginBottom: 6 }}>{t.who}</legend>
          {(["private", "unlisted", "public"] as const).map((v) => option("visibility", v, visibility, setVisibility, t.vis[v], visIcon[v]))}
        </fieldset>
        <fieldset className="lx-field" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend style={{ marginBottom: 6 }}>{t.search}</legend>
          {option("indexing", "index", indexing, setIndexing, t.idx.index, Search, visibility !== "public")}
          {option("indexing", "noindex", indexing, setIndexing, t.idx.noindex, SearchX, visibility !== "public")}
          {visibility !== "public" && <small>{t.indexOnlyPublic}</small>}
        </fieldset>
        <label className="lx-field">{t.note}<input className="lx-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} maxLength={200} /><small>{t.noteHelp}</small></label>
        {visibility !== "private" && <p className="lx-muted">{t.rights}</p>}
        {!caps.sharedPublishing && visibility !== "private" && <p className="lx-notice" data-tone="warn">{t.device}</p>}
        {noTitle && <p className="lx-error" role="alert">{t.titleNeeded}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="ws-btn ws-btn--primary" disabled={noTitle}>{first ? t.publish : t.publishChanges}</button>
        </div>
      </form>
    </WsDialog>
  );
}
