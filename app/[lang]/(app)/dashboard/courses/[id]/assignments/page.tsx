"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const copy = {
  en: { title: "Assignments & gradebook", intro: "Assign published lectures or sealed exams. Grades follow exam release rules.",
    back: "Back to course", new: "New assignment", name: "Assignment title", instructions: "Instructions",
    outcome: "Learning outcome (optional)", type: "Resource type", resource: "Published resource",
    lesson: "Lecture", exam: "Exam", opens: "Opens", due: "Deadline",
    add: "Create draft", publish: "Publish", unpublish: "Withhold assignment", archive: "Archive",
    gradebook: "Gradebook", none: "No assignments yet.", students: "Approved students",
    completed: "Completed", missed: "Missed", student: "Student", status: "Status",
    score: "Score", release: "Student result", visible: "Released", private: "Private",
    saved: "Assignment updated.", failed: "Could not save assignment.", empty: "No eligible published resources.",
    draft: "Draft", active: "Published", notAssigned: "Not assigned",
    noRoster: "No approved students in this assignment.", notice: "Scores shown here are doctor-only until explicitly released through the exam result policy." },
  ar: { title: "التكليفات ودفتر الدرجات", intro: "كلّف الطلاب بمحاضرات منشورة أو امتحانات معتمدة. لا تُعرض الدرجات للطلاب قبل السماح بنشرها.",
    back: "العودة للدورة", new: "تكليف جديد", name: "عنوان التكليف", instructions: "التعليمات",
    outcome: "نواتج التعلّم (اختياري)", type: "نوع المحتوى", resource: "المحتوى المنشور",
    lesson: "محاضرة", exam: "امتحان", opens: "يُفتح", due: "آخر موعد",
    add: "إنشاء مسودة", publish: "نشر", unpublish: "حجب التكليف", archive: "أرشفة",
    gradebook: "دفتر الدرجات", none: "لا توجد تكليفات بعد.", students: "الطلاب المعتمدون",
    completed: "مكتمل", missed: "فات الموعد", student: "الطالب", status: "الحالة",
    score: "الدرجة", release: "إعلان النتيجة", visible: "معلنة", private: "خاصة",
    saved: "تم تحديث التكليف.", failed: "تعذر حفظ التكليف.", empty: "لا توجد محاضرات أو امتحانات جاهزة للنشر.",
    draft: "مسودة", active: "منشور", notAssigned: "غير مكلّف",
    noRoster: "لا يوجد طلاب معتمدون لهذا التكليف.", notice: "الدرجات هنا خاصة بالدكتور إلى أن تُنشر رسمياً وفق سياسة الامتحان." },
} as const;

function localInput(ms: number) {
  const date = new Date(ms);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(ms - offset).toISOString().slice(0, 16);
}
export default function AssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), courseId = id as Id<"learnCollections">;
  const { locale } = useLocale(), ar = locale === "ar", t = copy[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const assignments = useQuery(api.courseAssignments.teacherAssignments, isAuthenticated ? { courseId } : "skip");
  const resources = useQuery(api.courseAssignments.resources, isAuthenticated ? { courseId } : "skip");
  const create = useMutation(api.courseAssignments.create);
  const revise = useMutation(api.courseAssignments.revise);
  const [kind, setKind] = useState<"lesson" | "exam">("lesson");
  const [resourceId, setResourceId] = useState("");
  const [title, setTitle] = useState(""), [instructions, setInstructions] = useState("");
  const [outcome, setOutcome] = useState("");
  const [opens, setOpens] = useState(() => localInput(Date.now()));
  const [due, setDue] = useState(() => localInput(Date.now() + 7 * 86400000));
  const [selected, setSelected] = useState<Id<"courseAssignments"> | null>(null);
  const [busy, setBusy] = useState(false);
  const gradebook = useQuery(api.courseAssignments.teacherGradebook,
    isAuthenticated && selected ? { assignmentId: selected } : "skip");
  const choices = kind === "lesson" ? resources?.lessons ?? [] : resources?.exams ?? [];
  const createOne = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !resourceId) return;
    setBusy(true);
    try {
      const created = await create({ courseId, kind, title, instructions, outcome,
        opensAt: new Date(opens).getTime(), dueAt: new Date(due).getTime(),
        ...(kind === "lesson" ? { lessonId: resourceId as Id<"lessons"> } :
          { snapshotId: resourceId as Id<"examSnapshots"> }) });
      setSelected(created); setTitle(""); setInstructions(""); setOutcome("");
      toast.success(t.saved);
    } catch (err) { toast.error(err, { fallback: t.failed }); }
    finally { setBusy(false); }
  };
  const updateOne = async (row: NonNullable<typeof assignments>[number], update: "publish" | "archive") => {
    if (busy) return;
    setBusy(true);
    try {
      await revise({ assignmentId: row._id, expectedRevision: row.revision,
        title: row.title, instructions: row.instructions, outcome: row.outcome,
        opensAt: row.opensAt, dueAt: row.dueAt,
        published: update === "publish" ? !row.published : false,
        archived: update === "archive" });
      toast.success(t.saved);
    } catch (err) { toast.error(err, { fallback: t.failed }); }
    finally { setBusy(false); }
  };
  if (isLoading || (isAuthenticated && (!assignments || !resources)))
    return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page">{t.title}</main>;
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link className="ws-btn ws-btn--ghost ws-btn--sm w-fit" href={"/dashboard/courses/" + id}>{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.intro}</p></header>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.new}</h2>
      <form onSubmit={e => void createOne(e)} className="grid gap-3">
        <label className="grid gap-1">{t.name}<input className="kb-input" value={title} required maxLength={180} onChange={e => setTitle(e.target.value)} /></label>
        <label className="grid gap-1">{t.instructions}<textarea className="kb-input" rows={2} maxLength={2000} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
        <label className="grid gap-1">{t.outcome}<input className="kb-input" maxLength={80} value={outcome} onChange={e => setOutcome(e.target.value)} /></label>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1">{t.type}
            <select className="kb-input" value={kind} onChange={e => { setKind(e.target.value as "exam" | "lesson"); setResourceId(""); }}>
              <option value="lesson">{t.lesson}</option><option value="exam">{t.exam}</option>
            </select></label>
          <label className="grid gap-1 flex-1">{t.resource}
            <select className="kb-input" value={resourceId} required onChange={e => setResourceId(e.target.value)}>
              <option value="">{t.empty}</option>{choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1">{t.opens}<input className="kb-input" required type="datetime-local" value={opens} onChange={e => setOpens(e.target.value)} /></label>
          <label className="grid gap-1">{t.due}<input className="kb-input" required type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
        </div>
        <button className="ws-btn ws-btn--primary w-fit" type="submit" disabled={busy || !choices.length}>{t.add}</button>
      </form>
    </section>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.gradebook}</h2>
      {!assignments?.length && <p className="cb-note">{t.none}</p>}
      {assignments?.filter(a => !a.archived).map(a => <div className="flex flex-wrap items-center gap-2" key={a._id}>
        <button type="button" className="ws-btn ws-btn--ghost" aria-pressed={selected === a._id} onClick={() => setSelected(a._id)}>
          <span dir="auto">{a.title}</span> · {a.published ? t.active : t.draft}
        </button>
        <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
          onClick={() => void updateOne(a, "publish")}>{a.published ? t.unpublish : t.publish}</button>
        <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
          onClick={() => void updateOne(a, "archive")}>{t.archive}</button>
      </div>)}
      {selected && gradebook && <>
        <h3 className="font-semibold" dir="auto">{gradebook.title}</h3>
        <p className="cb-note">{t.students}: {gradebook.count} · {t.completed}: {gradebook.completed} · {t.missed}: {gradebook.missed}</p>
        <p className="cb-note">{t.notice}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th scope="col" className="p-2 text-start">{t.student}</th><th scope="col" className="p-2 text-start">{t.status}</th><th scope="col" className="p-2 text-start">{t.score}</th><th scope="col" className="p-2 text-start">{t.release}</th></tr></thead>
          <tbody>{gradebook.rows.map(r => <tr key={r.studentId}>
            <td className="p-2" dir="auto">{r.studentId}</td>
            <td className="p-2">{r.assigned ? r.state.replaceAll("_", " ") : t.notAssigned}</td>
            <td className="p-2">{r.percentBasisPoints === null ? "—" : (r.percentBasisPoints / 100).toFixed(2) + "%"}</td>
            <td className="p-2">{r.releasedToStudent ? t.visible : t.private}</td>
          </tr>)}</tbody>
        </table></div>
        {!gradebook.rows.length && <p className="cb-note">{t.noRoster}</p>}
      </>}
    </section>
  </main>;
}
