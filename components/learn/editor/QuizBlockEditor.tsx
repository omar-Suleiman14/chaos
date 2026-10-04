"use client";

import { useId, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { localeDir } from "@/lib/locale";
import { errorMessage } from "@/lib/errors";
import Link from "@/components/site/SiteLink";

type Kind = "form" | "quiz";
const copy = {
  en: { kind: "Quiz type", form: "Quiz form", classic: "Classic quiz", attach: "Attach existing quiz", choose: "Choose a quiz", selected: "Selected quiz", draft: "Draft", loading: "Loading quizzes…", more: "Load more", empty: "No quizzes on this page.", create: "Create new quiz", title: "Quiz title", save: "Create quiz draft", cancel: "Cancel", edit: "Edit questions and publish", note: "Publish the quiz from its editor when it is ready. Lesson publication stays separate." },
  ar: { kind: "نوع الاختبار", form: "اختبار بنموذج", classic: "اختبار كلاسيكي", attach: "أرفق اختبارًا موجودًا", choose: "اختر اختبارًا", selected: "الاختبار المحدد", draft: "مسودة", loading: "جارٍ تحميل الاختبارات…", more: "حمّل المزيد", empty: "لا اختبارات في هذه الصفحة.", create: "أنشئ اختبارًا", title: "عنوان الاختبار", save: "أنشئ مسودة اختبار", cancel: "إلغاء", edit: "عدّل الأسئلة وانشر", note: "انشر الاختبار من محرره عندما يكون جاهزًا. يبقى نشر الدرس مستقلًا." },
};
export default function QuizBlockEditor({ kind, assetId, onSelect }: { kind: Kind; assetId: string; onSelect: (asset: { kind: Kind; id: string }) => void }) {
  const t = useCopy(copy), { locale } = useLocale(), uid = useId();
  const page = usePaginatedQuery(api.learnLibrary.quizChoices, { kind }, { initialNumItems: 20 });
  const create = useMutation(api.forms.createForm);
  const [creating, setCreating] = useState(false), [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selected = page.results.find(q => q.id === assetId);
  return <div className="lx-form lx-quiz-editor" dir={localeDir(locale)} onKeyDown={e => e.stopPropagation()}>
    {error && <p role="alert" className="lx-error">{error}</p>}
    <label htmlFor={`${uid}-kind`}>{t.kind}</label>
    <select id={`${uid}-kind`} value={kind} disabled={busy} onChange={e => onSelect({ kind: e.target.value as Kind, id: "" })}><option value="form">{t.form}</option><option value="quiz">{t.classic}</option></select>
    <label htmlFor={`${uid}-asset`}>{t.attach}</label>
    <select id={`${uid}-asset`} value={assetId} disabled={busy} onChange={e => onSelect({ kind, id: e.target.value })}>
      <option value="">{t.choose}</option>
      {assetId && !selected && <option value={assetId}>{t.selected}</option>}
      {page.results.map(q => <option key={q.id} value={q.id}>{q.title}{q.published ? "" : ` · ${t.draft}`}</option>)}
    </select>
    {page.status === "LoadingFirstPage" && <p role="status">{t.loading}</p>}
    {page.status === "Exhausted" && !page.results.length && <p className="lx-muted">{t.empty}</p>}
    {(page.status === "CanLoadMore" || page.status === "LoadingMore") && <button type="button" className="ws-btn ws-btn--sm" disabled={busy || page.status === "LoadingMore"} onClick={() => page.loadMore(20)}>{t.more}</button>}
    {assetId && <Link className="lx-link" href={kind === "form" ? `/dashboard/forms/${encodeURIComponent(assetId)}` : `/dashboard/editor?id=${encodeURIComponent(assetId)}`}>{t.edit}</Link>}
    <p className="lx-help">{t.note}</p>
    {!creating ? <button type="button" className="ws-btn ws-btn--sm" disabled={busy} onClick={() => setCreating(true)}>{t.create}</button> : <>
      <label htmlFor={`${uid}-title`}>{t.title}</label><input dir="auto" id={`${uid}-title`} maxLength={200} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} />
      <div className="lx-actions"><button type="button" className="ws-btn ws-btn--primary" disabled={busy || !title.trim()} onClick={async () => {
        setBusy(true); setError("");
        try { const id = await create({ title: title.trim(), quizMode: true }); onSelect({ kind: "form", id }); setCreating(false); setTitle(""); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
      }}>{t.save}</button><button type="button" className="lx-link" disabled={busy} onClick={() => setCreating(false)}>{t.cancel}</button></div>
    </>}
  </div>;
}
