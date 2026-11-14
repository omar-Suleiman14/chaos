"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UsersRound, UserCheck, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ExamAudience } from "@/convex/examAudienceModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const copy = {
  en: {
    title: "Assign to course students",
    help: "Only approved students in this course can receive the exam. Course groups never grant course admission.",
    all: "All approved course students", students: "Specific approved students", groups: "Selected course groups",
    noStudents: "No approved course students yet. Approve students from the course roster.",
    noGroups: "No groups yet. Create groups from the course roster.",
    assign: "Assign exam", update: "Update assignment", unassign: "Remove assignment",
    assigned: "Assigned · visible in eligible students' Due Exams",
    notAssigned: "Not assigned", pending: "Saving…",
    prepare: "Seal the exam, save settings and mark it ready before assigning.",
    entry: "Students can see due-exam details, but cannot start attempts until the secure exam player and timing enforcement are delivered.",
    saved: "Assignment saved", removed: "Assignment removed",
    failed: "Could not save assignment.",
  },
  ar: {
    title: "تكليف طلاب الدورة بالامتحان",
    help: "الامتحان لطلاب هذه الدورة الموافق عليهم فقط. المجموعات لا تمنح صلاحية دخول الدورة.",
    all: "كل طلاب الدورة الموافق عليهم", students: "طلاب محددون تمت الموافقة عليهم", groups: "مجموعات مختارة من الدورة",
    noStudents: "لا يوجد طلاب معتمدون. وافق على طلبات الانضمام من قائمة طلاب الدورة.",
    noGroups: "لا توجد مجموعات. أنشئ مجموعات من قائمة طلاب الدورة.",
    assign: "تكليف الطلاب", update: "تحديث التكليف", unassign: "إلغاء التكليف",
    assigned: "مكلف · يظهر في الامتحانات المستحقة للمؤهلين",
    notAssigned: "لم يُكلّف الطلاب", pending: "جارٍ الحفظ…",
    prepare: "ثبّت الامتحان واحفظ الإعدادات وحدد جاهزيته قبل تكليف الطلاب.",
    entry: "يرى الطلاب بيانات الامتحان فقط؛ بدء المحاولات مقفل حتى اكتمال واجهة الامتحان الآمنة وتطبيق التوقيت.",
    saved: "تم حفظ التكليف", removed: "تم إلغاء التكليف",
    failed: "تعذر حفظ التكليف.",
  },
} as const;

export function ExamAudienceSetup({
  draftId, courseId,
}: { draftId: Id<"examBuilderDrafts">; courseId: Id<"learnCollections"> }) {
  const { locale } = useLocale();
  const t = copy[locale === "ar" ? "ar" : "en"];
  const info = useQuery(api.examAudience.getForDraft, { draftId });
  const roster = useQuery(api.courseCohorts.roster, { courseId });
  const setAssignment = useMutation(api.examAudience.setForDraft);
  const [audience, setAudience] = useState<ExamAudience>({ mode: "all", studentIds: [], groupIds: [] });
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (info && loadedRevision !== info.revision) {
      setAudience(info.audience);
      setLoadedRevision(info.revision);
    }
  }, [info, loadedRevision]);

  const changeMode = (mode: ExamAudience["mode"]) =>
    setAudience({ mode, studentIds: [], groupIds: [] });
  const toggleStudent = (studentId: string) => setAudience(old => ({
    ...old, studentIds: old.studentIds.includes(studentId)
      ? old.studentIds.filter(id => id !== studentId) : [...old.studentIds, studentId],
  }));
  const toggleGroup = (groupId: Id<"courseGroups">) => setAudience(old => ({
    ...old, groupIds: old.groupIds.includes(groupId)
      ? old.groupIds.filter(id => id !== groupId) : [...old.groupIds, groupId],
  }));
  const save = async (assigned: boolean) => {
    if (!info || busy) return;
    setBusy(true);
    try {
      await setAssignment({ draftId, expectedRevision: info.revision, audience, assigned });
      toast.success(assigned ? t.saved : t.removed);
    } catch (error) { toast.error(error, { fallback: t.failed }); }
    finally { setBusy(false); }
  };

  const approved = roster?.students.filter(s => s.status === "approved") ?? [];
  const canAssign = !!info?.prepared && (audience.mode === "all" ||
    audience.mode === "students" && audience.studentIds.length > 0 ||
    audience.mode === "groups" && audience.groupIds.length > 0);

  return <section className="cb-section grid gap-4" aria-labelledby="exam-audience-title">
    <div className="space-y-1">
      <h2 id="exam-audience-title" className="flex items-center gap-2">
        <UsersRound size={18} aria-hidden />{t.title}
      </h2>
      <p className="cb-note">{t.help}</p>
    </div>
    <fieldset className="grid gap-3" disabled={!info?.prepared || busy}>
      <legend className="sr-only">{t.title}</legend>
      {(["all", "students", "groups"] as const).map(mode =>
        <label key={mode} className="flex items-center gap-2 text-sm">
          <input type="radio" name="exam-audience" checked={audience.mode === mode}
            onChange={() => changeMode(mode)} />
          <span>{t[mode]}</span>
        </label>)}
      {audience.mode === "students" && <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">
        {!approved.length && <p className="cb-note">{t.noStudents}</p>}
        {approved.map(student =>
          <label key={student.studentId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={audience.studentIds.includes(student.studentId)}
              onChange={() => toggleStudent(student.studentId)} />
            <UserCheck size={14} aria-hidden />
            <span dir="auto">{student.name}{student.username ? " · @" + student.username : ""}</span>
          </label>)}
      </div>}
      {audience.mode === "groups" && <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">
        {!roster?.groups.length && <p className="cb-note">{t.noGroups}</p>}
        {roster?.groups.map(group =>
          <label key={group.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={audience.groupIds.includes(group.id)}
              onChange={() => toggleGroup(group.id)} />
            <span dir="auto">{group.name} ({group.studentIds.length})</span>
          </label>)}
      </div>}
    </fieldset>
    {!info?.prepared && <p className="cb-note">{t.prepare}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !canAssign}
        onClick={() => void save(true)}>
        <ShieldCheck size={16} aria-hidden />{busy ? t.pending : info?.assigned ? t.update : t.assign}
      </button>
      {info?.assigned && <button type="button" className="ws-btn ws-btn--ghost" disabled={busy}
        onClick={() => void save(false)}>{t.unassign}</button>}
      <span className="text-sm text-muted-foreground">
        {info?.assigned ? t.assigned : t.notAssigned}
      </span>
    </div>
    <p className="cb-note">{t.entry}</p>
  </section>;
}
