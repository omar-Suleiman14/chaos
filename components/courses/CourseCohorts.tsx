"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const labels = {
  en: {
    title: "Groups & roster", invite: "Invite by @username", send: "Send invitation",
    pending: "Pending invitations", cancel: "Cancel", groups: "Course groups",
    groupName: "Group name", create: "Create group", choose: "Select a group",
    rename: "Rename", save: "Save name", delete: "Delete group",
    roster: "Approved and former students", selected: (n: number) => `${n} selected`,
    add: "Add to group", subtract: "Remove from group", suspend: "Suspend",
    remove: "Remove from course", readmit: "Readmit", empty: "No reviewed students yet.",
    approved: "Approved", suspended: "Suspended", removed: "Removed",
    rejected: "Rejected", withdrawn: "Withdrawn",
    busy: "Saving…", success: "Roster updated", truncated: "Showing the first 200 students per status.",
    note: "Group membership does not grant course access. Suspended students keep their group assignments; removed students lose them.",
  },
  ar: {
    title: "المجموعات وقائمة الطلاب", invite: "دعوة باسم المستخدم @", send: "إرسال دعوة",
    pending: "الدعوات المعلقة", cancel: "إلغاء", groups: "مجموعات الدورة",
    groupName: "اسم المجموعة", create: "إنشاء مجموعة", choose: "اختر مجموعة",
    rename: "تعديل الاسم", save: "حفظ الاسم", delete: "حذف المجموعة",
    roster: "الطلاب الموافق عليهم والسابقون", selected: (n: number) => `المحددون: ${n}`,
    add: "إضافة للمجموعة", subtract: "إزالة من المجموعة", suspend: "إيقاف مؤقت",
    remove: "إزالة من الدورة", readmit: "إعادة القبول", empty: "لا يوجد طلاب تمت مراجعتهم بعد.",
    approved: "مقبول", suspended: "موقوف", removed: "تمت إزالته",
    rejected: "مرفوض", withdrawn: "مسحوب",
    busy: "جارٍ الحفظ…", success: "تم تحديث القائمة", truncated: "يُعرض أول 200 طالب لكل حالة.",
    note: "المجموعات لا تمنح حق دخول الدورة. الإيقاف المؤقت يحفظ المجموعات، والإزالة تحذف العضويات.",
  },
};

export default function CourseCohorts({ courseId }: { courseId: Id<"learnCollections"> }) {
  const { locale } = useLocale();
  const t = labels[locale === "ar" ? "ar" : "en"];
  const data = useQuery(api.courseCohorts.roster, { courseId });
  const createGroup = useMutation(api.courseCohorts.createGroup);
  const renameGroup = useMutation(api.courseCohorts.renameGroup);
  const deleteGroup = useMutation(api.courseCohorts.deleteGroup);
  const changeMembers = useMutation(api.courseCohorts.changeGroupMembers);
  const manage = useMutation(api.courseCohorts.manageStudents);
  const invite = useMutation(api.courseCohorts.inviteStudent);
  const cancel = useMutation(api.courseCohorts.cancelInvitation);
  const [groupName, setGroupName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [handle, setHandle] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const group = data?.groups.find(g => g.id === selectedGroup);

  async function run(task: () => Promise<unknown>, after?: () => void) {
    if (working) return;
    setWorking(true);
    try {
      await task();
      after?.();
      toast(t.success);
    } catch (error) { toast.error(error); }
    finally { setWorking(false); }
  }

  const toggle = (id: string) => setSelected(old =>
    old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const bulk = (action: "suspend" | "remove" | "readmit") =>
    run(() => manage({ courseId, studentIds: selected, action }), () => setSelected([]));
  const membership = (action: "add" | "remove") =>
    run(() => changeMembers({ groupId: selectedGroup as Id<"courseGroups">, studentIds: selected, action }),
      () => setSelected([]));

  return <section className="grid gap-4 rounded-xl border border-border p-4" aria-label={t.title}>
    <h3 className="ws-question__title">{t.title}</h3>
    <p className="cb-note">{t.note}</p>
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor="cohort-invite">{t.invite}</label>
      <div className="flex flex-wrap gap-2">
        <input id="cohort-invite" className="ws-input min-w-0 flex-1" dir="ltr"
          value={handle} onChange={e => setHandle(e.target.value)} placeholder="@username" />
        <button className="ws-btn ws-btn--primary ws-btn--sm" type="button" disabled={working || !handle.trim()}
          onClick={() => void run(() => invite({ courseId, username: handle }), () => setHandle(""))}>{t.send}</button>
      </div>
      {!!data?.invitations.length && <ul className="grid gap-1">
        <li className="text-sm font-medium">{t.pending}</li>
        {data.invitations.map(i => <li key={i.studentId} className="flex items-center justify-between gap-2 text-sm">
          <span dir="auto">{i.name} {i.username ? `(@${i.username})` : ""}</span>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
            onClick={() => void run(() => cancel({ courseId, studentId: i.studentId }))}>{t.cancel}</button>
        </li>)}
      </ul>}
    </div>
    <div className="grid gap-2">
      <h4 className="font-medium">{t.groups}</h4>
      <div className="flex flex-wrap gap-2">
        <input aria-label={t.groupName} className="ws-input min-w-0 flex-1" value={groupName}
          onChange={e => setGroupName(e.target.value)} maxLength={60} placeholder={t.groupName} />
        <button type="button" className="ws-btn ws-btn--primary ws-btn--sm"
          disabled={working || groupName.trim().length < 2}
          onClick={() => void run(() => createGroup({ courseId, name: groupName }), () => setGroupName(""))}>{t.create}</button>
      </div>
      <select aria-label={t.choose} className="ws-input" value={selectedGroup}
        onChange={e => { setSelectedGroup(e.target.value); setRenameValue(""); }}>
        <option value="">{t.choose}</option>
        {data?.groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.studentIds.length})</option>)}
      </select>
      {group && <div className="flex flex-wrap gap-2">
        <input className="ws-input min-w-0 flex-1" aria-label={t.rename} value={renameValue}
          onChange={e => setRenameValue(e.target.value)} placeholder={group.name} maxLength={60} />
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working || renameValue.trim().length < 2}
          onClick={() => void run(() => renameGroup({ groupId: group.id, name: renameValue }), () => setRenameValue(""))}>{t.save}</button>
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
          onClick={() => void run(() => deleteGroup({ groupId: group.id }), () => setSelectedGroup(""))}>{t.delete}</button>
      </div>}
    </div>
    <div className="grid gap-2">
      <h4 className="font-medium">{t.roster}</h4>
      {!data ? <output className="ws-skeleton" style={{ minHeight: 48 }} aria-label={t.busy} />
        : data.students.length === 0 ? <p className="cb-note">{t.empty}</p>
        : <ul className="grid max-h-72 gap-1 overflow-y-auto">
            {data.students.map(s => <li key={s.studentId}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <input type="checkbox" checked={selected.includes(s.studentId)} onChange={() => toggle(s.studentId)} />
                <span className="min-w-0 flex-1" dir="auto">{s.name} {s.username ? `(@${s.username})` : ""}</span>
                <span className="text-muted-foreground">{t[s.status]}</span>
                {group?.studentIds.includes(s.studentId) ? <span title={group.name}>●</span> : null}
              </label>
            </li>)}
          </ul>}
      {!!selected.length && <div className="grid gap-2">
        <p className="text-sm">{t.selected(selected.length)}</p>
        <div className="flex flex-wrap gap-2">
          {group && <>
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
              onClick={() => void membership("add")}>{t.add}</button>
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
              onClick={() => void membership("remove")}>{t.subtract}</button>
          </>}
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
            onClick={() => void bulk("suspend")}>{t.suspend}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
            onClick={() => void bulk("remove")}>{t.remove}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={working}
            onClick={() => void bulk("readmit")}>{t.readmit}</button>
        </div>
      </div>}
      {data?.truncated && <p className="cb-note">{t.truncated}</p>}
    </div>
  </section>;
}
