"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const labels = {
  en: { title: "Student Results", lead: "Review grades and control manual publication.",
    back: "Exam builder", noExam: "Select a sealed exam from the exam builder.",
    signIn: "Sign in with your teacher account.", publish: "Publish final results",
    withhold: "Withhold results", visible: "Final results are published.",
    private: "Results are withheld.", automatic: "This exam uses automatic result visibility.",
    note: "Essays stay private until human grading is final. Answer keys are never included.",
    failed: "Could not change publication. Reload and try again.",
    success: "Result publication updated.", student: "Student", status: "Status", grade: "Grade",
    pending: "Not final", empty: "No attempts recorded.", more: "Showing first 100 attempts.",
    grading: "Grading", withheld: "Withheld", released: "Visible to student",
    submitted: "Submitted", expired: "Expired", void: "Voided", in_progress: "In progress" },
  ar: { title: "نتائج الطلاب", lead: "راجع الدرجات وتحكم في النشر اليدوي.",
    back: "منشئ الامتحانات", noExam: "اختر امتحاناً معتمداً من منشئ الامتحانات.",
    signIn: "سجّل الدخول بحساب الدكتور.", publish: "نشر النتائج النهائية",
    withhold: "حجب النتائج", visible: "النتائج النهائية منشورة.",
    private: "النتائج محجوبة.", automatic: "يستخدم الامتحان سياسة نشر آلية.",
    note: "تظل الإجابات المقالية خاصة حتى إتمام التصحيح البشري، ولا تُعرض نماذج الإجابة.",
    failed: "تعذر تغيير النشر. حدّث الصفحة وحاول مرة أخرى.",
    success: "تم تحديث حالة النشر.", student: "الطالب", status: "الحالة", grade: "الدرجة",
    pending: "لم تكتمل", empty: "لا توجد محاولات مسجلة.", more: "تُعرض أول ١٠٠ محاولة.",
    grading: "جارٍ التصحيح", withheld: "محجوبة", released: "متاحة للطالب",
    submitted: "تم التسليم", expired: "انتهى", void: "ملغاة", in_progress: "جارٍ الحل" },
} as const;

export default function TeacherResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const draft = useSearchParams().get("draft");
  const draftId = draft ? draft as Id<"examBuilderDrafts"> : null;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = labels[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const data = useQuery(api.examResults.teacherResults,
    isAuthenticated && draftId ? { draftId } : "skip");
  const setPublication = useMutation(api.examResults.setPublication);
  const [busy, setBusy] = useState(false);
  const update = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      await setPublication({ snapshotId: data.snapshotId,
        expectedRevision: data.publication.revision, released: !data.publication.released });
      toast.success(t.success);
    } catch (e) { toast.error(e, { fallback: t.failed }); }
    finally { setBusy(false); }
  };
  if (isLoading || (isAuthenticated && draftId && data === undefined)) return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page"><p>{t.signIn}</p></main>;
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link href={"/dashboard/courses/" + id + "/exams" + (draft ? "?draft=" + draft : "")}
      className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></header>
    {!draftId || !data ? <section className="cb-section"><p>{t.noExam}</p></section> : <>
      <section className="cb-section grid gap-3">
        <h2 className="text-lg font-semibold" dir="auto">{data.title}</h2>
        {data.visibility === "manual" ? <>
          <p className="cb-note">{data.publication.released ? t.visible : t.private}</p>
          <button type="button" disabled={busy} className="ws-btn ws-btn--primary w-fit" onClick={() => void update()}>
            {data.publication.released ? t.withhold : t.publish}
          </button>
        </> : <p className="cb-note">{t.automatic}</p>}
        <p className="cb-note">{t.note}</p>
      </section>
      {!data.entries.length ? <section className="cb-section"><p>{t.empty}</p></section> :
        <section className="cb-section overflow-x-auto">
          <table className="w-full text-sm"><thead><tr>
            <th className="p-2 text-start">{t.student}</th><th className="p-2 text-start">{t.status}</th>
            <th className="p-2 text-start">{t.grade}</th>
          </tr></thead><tbody>
          {data.entries.map(r => <tr key={r.attemptId} className="border-t border-border">
            <td className="p-2 break-all">{r.studentId}</td>
            <td className="p-2">{t[r.studentStatus]}</td>
            <td className="p-2">{r.percentBasisPoints === null ? t.pending :
              (r.percentBasisPoints / 100).toFixed(2) + "%"}</td>
          </tr>)}</tbody></table>
        </section>}
      {data.hasMore && <p className="cb-note">{t.more}</p>}
    </>}
  </main>;
}
