"use client";

import { useState } from "react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import LoadingState from "@/components/LoadingState";
import type { LessonMeta } from "@/lib/learn/types";
import type { LessonDocument } from "@/convex/learnModel";
import ChangePreview from "./ChangePreview";
import { diffDraftBlocks } from "./lessonChanges";

/** Owner/editor read only; no fabricated proposal, acceptance or author attribution. */
function Comparison({ id }: { id: Id<"lessons"> }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const row = useQuery(api.learnFrontend.editableLesson, { id });
  const published = useQuery(api.lessons.getPublished, row?.publishedVersionId ? { lessonId: row._id } : "skip");
  const versions = useQuery(api.lessons.listVersions, row ? { lessonId: row._id, paginationOpts: { numItems: 25, cursor: null } } : "skip");
  const [versionId, setVersionId] = useState("");
  if (row === undefined || (row?.publishedVersionId && published === undefined) || (row && versions === undefined)) return <LoadingState label={ar ? "جارٍ التحميل..." : "Loading comparison..."} />;
  if (!row) return <p className="text-xs text-muted-foreground">{ar ? "هذه المسودة غير متاحة للتعديل." : "This draft is not editable by your account."}</p>;
  const before = versionId ? versions?.page.find(version => version._id === versionId) : published;
  const meta = (value: typeof row.metadata): LessonMeta => ({ ...value, curricula: [], indexing: value.indexing ?? "noindex" });
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{ar ? `مراجعة المسودة ${row.revision}. لا تنسب المقارنة التعديلات إلى تطبيق معين.` : `Draft revision ${row.revision}. This comparison does not attribute edits to a particular app.`}</p>
    <label className="block text-sm">{ar ? "قارن المسودة الحالية مع" : "Compare current draft with"}<select className="kb-input mt-1" value={versionId} onChange={event => setVersionId(event.target.value)}><option value="">{ar ? "النسخة المنشورة الحالية" : "Current published version"}</option>{versions?.page.map(version => <option key={version._id} value={version._id}>{ar ? `نسخة ${version.number}` : `Version ${version.number}`}</option>)}</select></label>
    {versions && !versions.isDone && <p className="text-xs text-muted-foreground">{ar ? "تُعرض أحدث 25 نسخة؛ سجل الدرس الكامل متاح في المحرر." : "Showing the latest 25 versions; the lesson editor has the full history."}</p>}
    {!before && <p className="text-xs text-muted-foreground">{ar ? "لا توجد نسخة منشورة للمقارنة. المحتوى المعروض موجود بالفعل في المسودة." : "No published version to compare. Displayed content is already in the draft."}</p>}
    <ChangePreview mode="comparison" before={before ? meta(before.metadata) : null} after={meta(row.metadata)} changes={diffDraftBlocks(before?.document ?? { schemaVersion: 1, blocks: [] } as LessonDocument, row.draft)} />
  </div>;
}

export default function ConnectedLessonComparison({ lessons }: { lessons: { id: Id<"lessons">; title: string }[] }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const id = lessons.find(lesson => lesson.id === selected)?.id ?? lessons[0]?.id;
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-xs text-muted-foreground">{ar ? "قارن تغييرات المسودة المطبقة بالفعل" : "Compare draft changes already applied"}</summary>
    {open && id && <div className="mt-3 space-y-3"><label className="block text-sm">{ar ? "الدرس" : "Lesson"}<select className="kb-input mt-1" value={id} onChange={event => setSelected(event.target.value)}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label><Comparison key={id} id={id} /></div>}
  </details>;
}
