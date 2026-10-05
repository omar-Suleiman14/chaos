"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, BookOpen, Highlighter, Lock, NotebookPen, X } from "lucide-react";
import { WsTabs } from "@/components/workspace/primitives";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { EmptyState } from "@/components/learn/ui";
import { useAllHighlights, useLearnActions, useLearnCapabilities, useLessonTitles, useNotes, useSaved } from "@/lib/learn/data";
import { excerpt } from "@/lib/learn/doc";
import { useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

const copy = {
  en: {
    title: "Saved", lead: "Lessons, single parts, highlights and notes you kept. Only you can see them.",
    tabs: { lessons: "Lessons", parts: "Parts", highlights: "Highlights", notes: "Notes" },
    private: "Private to you. Nothing here is published or shown to authors.", device: "Kept on this device until your account sync is connected.",
    remove: "Remove", removed: "Removed", open: "Open in lesson",
    empty: { lessons: "No saved lessons", parts: "No saved parts", highlights: "No highlights", notes: "No notes" },
    emptyBody: { lessons: "Use Save on any lesson to keep it here.", parts: "Select text or use a block’s menu and choose Save this part.", highlights: "Select text in a lesson and pick a colour.", notes: "Use a block’s menu, or select text and choose Note." },
    loading: "Loading saved items…", from: (title: string) => `From “${title}”`, untitled: "Untitled lesson",
  },
  ar: {
    title: "المحفوظات", lead: "دروس وأجزاء وتظليلات وملاحظات احتفظت بها. لا يراها غيرك.",
    tabs: { lessons: "الدروس", parts: "الأجزاء", highlights: "التظليلات", notes: "الملاحظات" },
    private: "خاصة بك. لا يُنشر شيء هنا ولا يظهر للكتّاب.", device: "محفوظة على هذا الجهاز إلى أن تُفعّل مزامنة حسابك.",
    remove: "إزالة", removed: "أُزيل", open: "افتح في الدرس",
    empty: { lessons: "لا دروس محفوظة", parts: "لا أجزاء محفوظة", highlights: "لا تظليلات", notes: "لا ملاحظات" },
    emptyBody: { lessons: "استخدم «احفظ» في أي درس لتحتفظ به هنا.", parts: "حدّد نصًا أو استخدم قائمة الكتلة واختر «احفظ هذا الجزء».", highlights: "حدّد نصًا في درس واختر لونًا.", notes: "استخدم قائمة الكتلة، أو حدّد نصًا واختر «ملاحظة»." },
    loading: "جارٍ تحميل المحفوظات…", from: (title: string) => `من «${title}»`, untitled: "درس بلا عنوان",
  },
};

type Tab = "lessons" | "parts" | "highlights" | "notes";

export default function SavedPage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const caps = useLearnCapabilities();
  const saved = useSaved();
  const notes = useNotes();
  const actions = useLearnActions();
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<Tab>("lessons");
  const highlights = useAllHighlights() ?? [];
  const titles = useLessonTitles();
  const titleOf = (id: string) => titles?.(id) || t.untitled;

  if (!saved || !notes) return <PageSkeleton label={t.loading} />;
  const lessons = saved.filter((s) => s.kind === "lesson");
  const parts = saved.filter((s) => s.kind === "block");
  const counts = { lessons: lessons.length, parts: parts.length, highlights: highlights.length, notes: notes.length };
  const icons = { lessons: BookOpen, parts: Bookmark, highlights: Highlighter, notes: NotebookPen };
  const removeRow = (label: string, onRemove: () => unknown | Promise<unknown>) => (
    <button type="button" className="ws-icon-button" aria-label={`${t.remove}: ${label}`} disabled={pending} onClick={async () => { setPending(true); try { await onRemove(); toast.success(t.removed); } catch (err) { toast.error(err); } finally { setPending(false); } }}><X size={15} /></button>
  );

  const list = tab === "lessons" ? lessons.map((s) => (
    <div key={s.id} className="lx-row">
      <span className="lx-row__icon" data-kind="lesson" aria-hidden><BookOpen size={16} /></span>
      <Link className="lx-row__main" href={`/learn/${s.lessonId}`} style={{ color: "inherit", textDecoration: "none" }}><span className="lx-row__title">{s.lessonTitle || titleOf(s.lessonId)}</span><span className="lx-row__sub">{timeAgo(locale, s.createdAt)}</span></Link>
      {removeRow(s.lessonTitle, () => actions.removeSave(s.id))}
    </div>
  )) : tab === "parts" ? parts.map((s) => (
    <div key={s.id} className="lx-row" style={{ alignItems: "flex-start" }}>
      <span className="lx-row__icon" aria-hidden><Bookmark size={16} /></span>
      <div className="lx-row__main">
        <span className="lx-quote">{s.excerpt || "—"}</span>
        <Link className="lx-link" href={`/learn/${s.lessonId}#${s.blockId}`}>{t.from(s.lessonTitle || t.untitled)} · {t.open}</Link>
      </div>
      {removeRow(s.excerpt ?? "", () => actions.removeSave(s.id))}
    </div>
  )) : tab === "highlights" ? highlights.map((h) => (
    <div key={h.id} className="lx-row" style={{ alignItems: "flex-start" }}>
      <span className="lx-row__icon" aria-hidden><Highlighter size={16} /></span>
      <div className="lx-row__main">
        <span><mark className="lx-hl" data-color={h.color}>{excerpt(h.quote, 300)}</mark></span>
        <Link className="lx-link" href={`/learn/${h.lessonId}#${h.blockId}`}>{t.from(titleOf(h.lessonId))} · {t.open}</Link>
      </div>
      {removeRow(h.quote.slice(0, 30), () => actions.removeHighlight(h.id))}
    </div>
  )) : notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((n) => (
    <div key={n.id} className="lx-row" style={{ alignItems: "flex-start" }}>
      <span className="lx-row__icon" aria-hidden><NotebookPen size={16} /></span>
      <div className="lx-row__main">
        <span style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{excerpt(n.body, 400)}</span>
        <Link className="lx-link" href={`/learn/${n.lessonId}#${n.blockId}`}>{t.from(titleOf(n.lessonId))} · {t.open}</Link>
      </div>
      {removeRow(n.body.slice(0, 30), () => actions.deleteNote(n.id))}
    </div>
  ));

  return (
    <div className="lx-page lx-page--narrow">
      <header className="lx-hero"><div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div></header>
      <p className="lx-notice"><Lock size={15} aria-hidden /><span>{t.private}{caps.deviceSync ? "" : ` ${t.device}`}</span></p>
      <WsTabs tabs={["lessons", "parts", "highlights", "notes"] as const} value={tab} onChange={setTab} label={t.title} icons={icons}
        labels={{ lessons: `${t.tabs.lessons} (${counts.lessons})`, parts: `${t.tabs.parts} (${counts.parts})`, highlights: `${t.tabs.highlights} (${counts.highlights})`, notes: `${t.tabs.notes} (${counts.notes})` }} />
      {list.length ? <div className="lx-list">{list}</div> : <EmptyState level={2} icon={icons[tab]} title={t.empty[tab]} body={t.emptyBody[tab]} />}
    </div>
  );
}
