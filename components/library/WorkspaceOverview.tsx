"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMyLessons } from "@/lib/learn/data";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
export default function WorkspaceOverview({ search, lessonsOnly = false }: { search: string; lessonsOnly?: boolean }) {
 const { locale } = useLocale(), ar = locale === "ar", lessons = useMyLessons(), forms = useQuery(api.forms.listMyForms), quizzes = useQuery(api.quizFunctions.getMyQuizzes), courses = useQuery(api.courses.listMine, {});
 const [filter, setFilter] = useState("recent");
 const rows = [
 ...(lessons ?? []).map(l => ({ id: l.id, title: l.draft.meta.title, kind: ar ? "درس" : "Lesson", href: `/dashboard/learn/lessons/${l.id}`, published: !!l.published, attention: !!l.published && l.draft.updatedAt > (l.publishedDraftAt ?? 0), at: l.draft.updatedAt })),
 ...(lessonsOnly ? [] : (forms ?? []).filter(f => f.status !== "archived").map(f => ({ id: f._id, title: f.title, kind: f.quizMode ? (ar ? "اختبار" : "Quiz") : (ar ? "نموذج" : "Form"), href: `/dashboard/forms/${f._id}`, published: f.status === "live", attention: f.approvalPending || f.hasUnpublishedChanges, at: f.updatedAt }))),
 ...(lessonsOnly ? [] : (quizzes ?? []).map(q => ({ id: q._id, title: q.title, kind: ar ? "اختبار" : "Quiz", href: `/dashboard/editor?id=${q._id}`, published: q.isPublished, attention: false, at: q._creationTime }))),
 ...(lessonsOnly ? [] : (courses ?? []).filter(c => !c.archived).map(c => ({ id: c.id, title: c.title, kind: ar ? "دورة" : "Course", href: `/dashboard/courses/${c.id}`, published: c.published, attention: false, at: c.updatedAt }))),
 ].filter(r => r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (filter === "recent" || filter === "draft" && !r.published || filter === "published" && r.published || filter === "attention" && r.attention)).sort((a,b) => b.at-a.at);
 return <section className="lx-section"><div className="lx-actions">{[["recent", ar ? "حديث" : "Recent"], ["draft", ar ? "المسودات" : "Drafts"], ["published", ar ? "منشور" : "Published"], ["attention", ar ? "يحتاج اهتمامًا" : "Needs attention"]].map(([id,label]) => <button type="button" className="ws-btn ws-btn--sm" aria-pressed={filter===id} key={id} onClick={() => setFilter(id)}>{label}</button>)}<Link className="ws-btn ws-btn--sm" href="/dashboard/learn/library">{ar ? "المجلدات" : "Folders"}</Link></div>{!lessons || !forms || !quizzes || !courses ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading workspace…"}</p> : rows.length ? <div className="lx-list">{rows.map(r => <Link className="lx-row" key={r.id} href={r.href}><span className="lx-row__main"><strong dir="auto">{r.title || (ar ? "بلا عنوان" : "Untitled")}</strong><small>{r.kind} · {r.published ? (ar ? "منشور" : "Published") : (ar ? "مسودة" : "Draft")}</small></span></Link>)}</div> : <p className="lx-muted">{ar ? "لا توجد نتائج." : "No matching content."}</p>}</section>;
}
