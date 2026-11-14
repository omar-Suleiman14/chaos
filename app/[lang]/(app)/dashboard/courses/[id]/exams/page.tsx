"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

type Kind = "course" | "module" | "lecture" | "topic";
type Allocation = { id: string; kind: Kind; key: string; count: number; points: number };
type Selection = { questionId: Id<"questionBankItems">; allocationId: string };

const labels = {
  en: {
    back: "Back to course", title: "Exam builder", desc: "Compose a private exam draft from questions tagged to this course. Students cannot see drafts.",
    new: "New exam draft", creating: "Creating…", empty: "No exam drafts yet. Create a draft to plan its syllabus.",
    loading: "Loading exam builder…", denied: "Course not found or you do not own it.", draftTitle: "Exam title",
    target: "Total questions", allocation: "Syllabus allocation", allocations: "Question distribution", add: "Add syllabus allocation",
    type: "Source", scope: "Lecture, module or topic", count: "Questions", points: "Points per question",
    course: "Entire course", module: "Module", lecture: "Lecture", topic: "Topic", save: "Save syllabus",
    saving: "Saving…", saved: "Syllabus saved", newPlan: "Syllabus changes clear previous question selections.",
    selected: "Selected", available: "Available", needed: "Requested", preview: "Coverage preview", planRemaining: "Unallocated questions",
    feasible: "Enough distinct questions are available for this distribution.",
    shortage: "Some allocations overlap or are short of distinct questions. Add questions or adjust counts.",
    choose: "Choose questions", review: "Selected questions", noQuestions: "No ready questions tagged to this syllabus area.",
    chooseHelp: "Select questions manually or fill all allocations automatically. Answer keys remain private.",
    addQuestion: "Add", removeQuestion: "Remove", elsewhere: "Used in another allocation",
    auto: "Auto-fill distinct questions", rebuild: "Rebuild question selection", confirmRebuild: "Auto-fill will replace your current selection. Continue?",
    autoDone: "Questions selected", completed: "ready", notSaved: "Save syllabus changes before choosing questions.",
    invalid: "No longer eligible", deleted: "Delete draft", deletedConfirm: "Delete this exam draft permanently?",
    done: "This is a private planning draft only. Publishing, assignment, exam snapshots and grading will arrive in later PRs.",
    noCandidates: "No candidate questions on this page.", previous: "Previous", next: "Next", of: "of",
    failed: "Could not save. Try again.", questionKind: "Question type", status: "Draft · not published",
  },
  ar: {
    back: "العودة للدورة", title: "منشئ الامتحانات", desc: "جهّز مسودة امتحان خاصة من أسئلة هذه الدورة. لا يمكن للطلاب رؤية المسودات.",
    new: "مسودة امتحان جديدة", creating: "جارٍ الإنشاء…", empty: "لا توجد مسودات. أنشئ مسودة لتحديد أجزاء المنهج.",
    loading: "جارٍ تحميل منشئ الامتحانات…", denied: "الدورة غير موجودة أو ليست ملكك.", draftTitle: "عنوان الامتحان",
    target: "إجمالي الأسئلة", allocation: "توزيع المنهج", allocations: "توزيع الأسئلة", add: "أضف جزءًا من المنهج",
    type: "النوع", scope: "المحاضرة أو الوحدة أو الموضوع", count: "الأسئلة", points: "درجة كل سؤال",
    course: "الدورة كلها", module: "وحدة", lecture: "محاضرة", topic: "موضوع", save: "احفظ المنهج",
    saving: "جارٍ الحفظ…", saved: "تم حفظ المنهج", newPlan: "تغيير توزيع المنهج يمسح الأسئلة المختارة سابقًا.",
    selected: "المختارة", available: "المتاحة", needed: "المطلوبة", preview: "معاينة التغطية", planRemaining: "أسئلة لم توزع",
    feasible: "توجد أسئلة مختلفة كافية لهذا التوزيع.",
    shortage: "بعض التوزيعات تتداخل أو تنقصها أسئلة مختلفة. أضف أسئلة أو عدل التوزيع.",
    choose: "اختر الأسئلة", review: "الأسئلة المختارة", noQuestions: "لا توجد أسئلة جاهزة مرتبطة بهذا الجزء.",
    chooseHelp: "اختر يدويًا أو املأ التوزيع تلقائيًا. الإجابات الصحيحة تظل خاصة.",
    addQuestion: "أضف", removeQuestion: "احذف", elsewhere: "مستخدم في جزء آخر",
    auto: "اختيار أسئلة مختلفة تلقائيًا", rebuild: "إعادة اختيار الأسئلة", confirmRebuild: "سيتم استبدال الاختيار الحالي. متابعة؟",
    autoDone: "تم اختيار الأسئلة", completed: "جاهز", notSaved: "احفظ تغييرات المنهج قبل اختيار الأسئلة.",
    invalid: "لم يعد مطابقًا", deleted: "احذف المسودة", deletedConfirm: "حذف مسودة الامتحان نهائيًا؟",
    done: "هذه مسودة تخطيط خاصة فقط. النشر والتكليف والنسخ الثابتة والتصحيح ستأتي في طلبات لاحقة.",
    noCandidates: "لا توجد أسئلة في هذه الصفحة.", previous: "السابق", next: "التالي", of: "من",
    failed: "تعذر الحفظ. حاول مرة أخرى.", questionKind: "نوع السؤال", status: "مسودة · غير منشورة",
  },
} as const;

export default function CourseExamBuilder({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { id } = use(params);
  const { draft: requestedDraft } = use(searchParams);
  const courseId = id as Id<"learnCollections">;
  const draftId = requestedDraft ? requestedDraft as Id<"examBuilderDrafts"> : null;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = labels[ar ? "ar" : "en"];
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();

  const course = useQuery(api.courses.get, isAuthenticated ? { courseId } : "skip");
  const draftList = useQuery(api.examBuilder.listDrafts, isAuthenticated && !draftId ? { courseId } : "skip");
  const draft = useQuery(api.examBuilder.getDraft, isAuthenticated && draftId ? { draftId } : "skip");
  const preview = useQuery(api.examBuilder.preview, isAuthenticated && draftId ? { draftId } : "skip");

  const create = useMutation(api.examBuilder.createDraft);
  const save = useMutation(api.examBuilder.savePlan);
  const autoFill = useMutation(api.examBuilder.autoFill);
  const setSelections = useMutation(api.examBuilder.setSelections);
  const remove = useMutation(api.examBuilder.removeDraft);

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(10);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (draft && loadedRevision !== draft.revision) {
      setName(draft.title);
      setTarget(draft.targetCount);
      setAllocations(draft.allocations);
      setLoadedRevision(draft.revision);
    }
  }, [draft, loadedRevision]);
  useEffect(() => {
    if (draft && (!focus || !draft.allocations.some(a => a.id === focus))) {
      setFocus(draft.allocations[0]?.id ?? null);
      setOffset(0);
    }
  }, [draft, focus]);

  const dirty = !!draft && (draft.title !== name || draft.targetCount !== target ||
    JSON.stringify(draft.allocations) !== JSON.stringify(allocations));
  const candidates = useQuery(api.examBuilder.candidates,
    isAuthenticated && draftId && focus && !dirty
      ? { draftId, allocationId: focus, offset } : "skip");
  const planSum = allocations.reduce((n, a) => n + a.count, 0);
  const selected = (draft?.selections ?? []) as Selection[];
  const selectedCounts = new Map(allocations.map(a =>
    [a.id, selected.filter(s => s.allocationId === a.id).length]));

  const execute = async (fn: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (success) toast.success(success); }
    catch (error) { toast.error(error, { fallback: t.failed }); }
    finally { setBusy(false); }
  };
  const makeDraft = () => void execute(async () => {
    const newId = await create({ courseId });
    router.push("/dashboard/courses/" + id + "/exams?draft=" + newId);
  });
  const savePlan = () => {
    if (!draftId || !draft) return;
    void execute(() => save({
      draftId, expectedRevision: draft.revision, title: name,
      targetCount: target, allocations,
    }), t.saved);
  };
  const modifyAllocation = (rowId: string, patch: Partial<Allocation>) =>
    setAllocations(old => old.map(a => a.id === rowId ? { ...a, ...patch } : a));

  const firstKey = (kind: Kind) =>
    kind === "module" ? preview?.modules[0]?.id ?? "" :
    kind === "lecture" ? preview?.lectures[0]?.id ?? "" :
    kind === "topic" ? preview?.topics[0] ?? "" : "";

  const addAllocation = () => {
    if (allocations.length >= 30) return;
    const possibilities: { kind: Kind; key: string }[] = [
      ...(preview?.lectures ?? []).map(x => ({ kind: "lecture" as const, key: x.id })),
      ...(preview?.modules ?? []).map(x => ({ kind: "module" as const, key: x.id })),
      ...(preview?.topics ?? []).map(key => ({ kind: "topic" as const, key })),
      { kind: "course", key: "" },
    ];
    const next = possibilities.find(x => !allocations.some(a => a.kind === x.kind && a.key === x.key));
    if (!next) { toast.error(ar ? "لا توجد أجزاء إضافية متاحة" : "No more unique syllabus areas"); return; }
    setAllocations(old => [...old, { id: crypto.randomUUID(), ...next, count: 1, points: 1 }]);
  };
  const setKind = (rowId: string, kind: Kind) =>
    modifyAllocation(rowId, { kind, key: firstKey(kind) });
  const flipSelection = (questionId: Id<"questionBankItems">) => {
    if (!draft || !draftId || !focus || dirty) return;
    const exists = selected.some(s => s.questionId === questionId && s.allocationId === focus);
    const next = exists ? selected.filter(s => s.questionId !== questionId) :
      [...selected, { questionId, allocationId: focus }];
    void execute(() => setSelections({ draftId, expectedRevision: draft.revision, selections: next }));
  };
  const fill = () => {
    if (!draftId || !draft || dirty) return;
    if (selected.length && !window.confirm(t.confirmRebuild)) return;
    void execute(() => autoFill({ draftId, expectedRevision: draft.revision }), t.autoDone);
  };
  const deleteDraft = () => {
    if (!draft || !draftId || !window.confirm(t.deletedConfirm)) return;
    void execute(async () => {
      await remove({ draftId, expectedRevision: draft.revision });
      router.push("/dashboard/courses/" + id + "/exams");
    });
  };

  if (!isAuthenticated || course === undefined || (draftId ? draft === undefined : draftList === undefined))
    return <PageSkeleton label={t.loading} />;
  if (!course || !course.isOwner) return <div className="ws-empty">{t.denied}</div>;

  return <main className="cb cb-page mx-auto max-w-5xl space-y-5" dir={ar ? "rtl" : "ltr"}>
    <header className="flex flex-wrap items-center gap-3">
      <Link href={"/dashboard/courses/" + id} className="ws-btn ws-btn--ghost ws-btn--sm">
        <ArrowLeft size={16} aria-hidden /> {t.back}
      </Link>
      <span className="cb-status">{t.status}</span>
    </header>
    <Link href={"/dashboard/courses/" + id + "/questions"} className="ws-btn ws-btn--ghost ws-btn--sm">
      <Plus size={16} aria-hidden />{ar ? "تأليف أسئلة وحالات إكلينيكية" : "Author questions & clinical cases"}
    </Link>
    <div className="space-y-2">
      <h1 className="ws-page-title">{t.title}</h1>
      <p className="ws-page-subtitle">{t.desc}</p>
    </div>
    {!draftId ? <>
      <button className="ws-btn ws-btn--primary" type="button" disabled={busy} onClick={makeDraft}>
        <Plus size={16} aria-hidden /> {busy ? t.creating : t.new}
      </button>
      {!draftList?.length && <section className="cb-section"><p className="cb-note">{t.empty}</p></section>}
      {!!draftList?.length && <section className="cb-section grid gap-3">
        {draftList.map(d => <Link key={d._id} href={"/dashboard/courses/" + id + "/exams?draft=" + d._id}
          className="rounded-xl border border-border p-4 hover:bg-muted/50">
          <strong dir="auto">{d.title}</strong>
          <span className="block text-sm text-muted-foreground">{d.selections.length} / {d.targetCount} {t.selected.toLowerCase()}</span>
        </Link>)}
      </section>}
    </> : !draft ? <section className="cb-section"><p>{t.denied}</p></section> : <>
      <section className="cb-section grid gap-4" aria-labelledby="exam-config-title">
        <h2 id="exam-config-title">{t.allocations}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">{t.draftTitle}
            <input className="kb-input" dir="auto" maxLength={200} value={name}
              onChange={e => setName(e.target.value)} />
          </label>
          <label className="grid gap-1">{t.target}
            <input className="kb-input" type="number" min={1} max={100} step={1} value={target}
              onChange={e => setTarget(Number(e.target.value))} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{t.newPlan}</p>
        <div className="space-y-4">
          {allocations.map((a, i) => {
            const data = preview?.rows.find(x => x.allocationId === a.id);
            const options = a.kind === "module" ? preview?.modules :
              a.kind === "lecture" ? preview?.lectures :
              a.kind === "topic" ? preview?.topics.map(x => ({ id: x, title: x })) : [];
            return <fieldset key={a.id} className="rounded-xl border border-border p-3 grid gap-3">
              <legend className="px-1 text-sm font-semibold">{t.allocation} {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_90px_90px_auto] items-end">
                <label className="grid gap-1 text-sm">{t.type}
                  <select className="kb-input" value={a.kind}
                    onChange={e => setKind(a.id, e.target.value as Kind)}>
                    {(["course", "module", "lecture", "topic"] as const).map(k =>
                      <option key={k} value={k}>{t[k]}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">{t.scope}
                  {a.kind === "course"
                    ? <span className="kb-input">{t.course}</span>
                    : a.kind === "topic" && !options?.length
                      ? <input className="kb-input" value={a.key} maxLength={100}
                          onChange={e => modifyAllocation(a.id, { key: e.target.value })} />
                      : <select className="kb-input" value={a.key}
                          onChange={e => modifyAllocation(a.id, { key: e.target.value })}>
                          {(options ?? []).map(o => <option value={o.id} key={o.id}>{o.title}</option>)}
                        </select>}
                </label>
                <label className="grid gap-1 text-sm">{t.count}
                  <input className="kb-input" type="number" min={1} max={100} step={1}
                    value={a.count} onChange={e => modifyAllocation(a.id, { count: Number(e.target.value) })} />
                </label>
                <label className="grid gap-1 text-sm">{t.points}
                  <input className="kb-input" type="number" min={0.01} max={100} step={0.01}
                    value={a.points} onChange={e => modifyAllocation(a.id, { points: Number(e.target.value) })} />
                </label>
                <button className="ws-btn ws-btn--ghost ws-btn--sm" type="button" aria-label={t.deleted}
                  disabled={allocations.length === 1} onClick={() => setAllocations(old => old.filter(x => x.id !== a.id))}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t.available}: {dirty ? "—" : data?.available ?? "—"} · {t.needed}: {a.count} · {t.selected}: {dirty ? "—" : selectedCounts.get(a.id) ?? 0}
              </p>
            </fieldset>;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="ws-btn ws-btn--ghost" onClick={addAllocation}
            disabled={allocations.length >= 30}>
            <Plus size={16} aria-hidden /> {t.add}
          </button>
          <span className="text-sm text-muted-foreground">{planSum} / {target} · {t.planRemaining}: {target - planSum}</span>
          <button type="button" className="ws-btn ws-btn--primary ms-auto" disabled={!dirty || busy}
            onClick={savePlan}><Save size={16} aria-hidden /> {busy ? t.saving : t.save}</button>
        </div>
      </section>

      <section className="cb-section grid gap-4" aria-labelledby="exam-coverage-title">
        <h2 id="exam-coverage-title">{t.preview}</h2>
        {preview ? <>
          <p className="text-sm text-muted-foreground">
            {preview.readyQuestions} {t.available} · {preview.plannedCount} / {draft.targetCount} {t.needed}
          </p>
          <output className="text-sm">
            {dirty ? t.notSaved : preview.feasible ? t.feasible : t.shortage}
          </output>
        </> : <p className="cb-note">{t.loading}</p>}
      </section>

      <section className="cb-section grid gap-4" aria-labelledby="exam-questions-title">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div><h2 id="exam-questions-title">{t.choose}</h2><p className="cb-note">{t.chooseHelp}</p></div>
          <button type="button" className="ws-btn ws-btn--primary" disabled={busy || dirty || !preview?.feasible ||
            preview.plannedCount !== draft.targetCount} onClick={fill}>
            <RotateCcw size={16} aria-hidden /> {selected.length ? t.rebuild : t.auto}
          </button>
        </div>
        {dirty ? <p className="cb-note">{t.notSaved}</p> : <>
          <fieldset className="flex flex-wrap gap-2" aria-label={t.allocation}>
            {draft.allocations.map((a, i) => <button key={a.id} type="button"
              className={"ws-btn ws-btn--sm " + (focus === a.id ? "ws-btn--primary" : "ws-btn--ghost")}
              onClick={() => { setFocus(a.id); setOffset(0); }}>
              {i + 1}. {a.kind === "course" ? t.course :
                a.kind === "module" ? preview?.modules.find(x => x.id === a.key)?.title ?? a.key :
                a.kind === "lecture" ? preview?.lectures.find(x => x.id === a.key)?.title ?? a.key : a.key}
              {" (" + (selectedCounts.get(a.id) ?? 0) + "/" + a.count + ")"}
            </button>)}
          </fieldset>
          {candidates === undefined ? <p className="cb-note">{t.loading}</p> : <>
            {!candidates.questions.length && <p className="cb-note">{t.noQuestions}</p>}
            <div className="grid gap-2">
              {candidates.questions.map(q => {
                const taken = q.selected && !q.selectedHere;
                return <article key={q.questionId} className="rounded-xl border border-border p-3 flex gap-3 items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium whitespace-pre-wrap" dir="auto">{q.prompt}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.questionKind}: {q.kind} · {q.points} {t.points.toLowerCase()}</p>
                  </div>
                  <button className={"ws-btn ws-btn--sm " + (q.selectedHere ? "ws-btn--ghost" : "ws-btn--primary")}
                    type="button" disabled={busy || taken} onClick={() => flipSelection(q.questionId)}>
                    {q.selectedHere ? t.removeQuestion : taken ? t.elsewhere : t.addQuestion}
                  </button>
                </article>;
              })}
            </div>
            <div className="flex items-center gap-3">
              <button className="ws-btn ws-btn--ghost ws-btn--sm" type="button" disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 30))}><ChevronLeft size={15} aria-hidden /> {t.previous}</button>
              <span className="text-sm text-muted-foreground">{candidates.total ? offset + 1 : 0}–{Math.min(offset + 30, candidates.total)} {t.of} {candidates.total}</span>
              <button className="ws-btn ws-btn--ghost ws-btn--sm" type="button" disabled={candidates.nextOffset === null}
                onClick={() => setOffset(candidates.nextOffset ?? offset)}>{t.next} <ChevronRight size={15} aria-hidden /></button>
            </div>
          </>}
        </>}
      </section>

      <section className="cb-section grid gap-3" aria-labelledby="exam-review-title">
        <h2 id="exam-review-title">{t.review} ({preview?.selected.length ?? 0} / {draft.targetCount})</h2>
        {!preview?.selected.length && <p className="cb-note">{t.noCandidates}</p>}
        {preview?.selected.map((s, i) => <article className="border-b border-border pb-3 last:border-0"
          key={s.questionId}>
          <div className="flex gap-2 items-start">
            <span className="text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap" dir="auto">{s.prompt}</p>
              <p className="text-xs text-muted-foreground">
                {s.kind} · {s.points} {t.points.toLowerCase()} · {s.valid ? t.completed : t.invalid}
              </p>
            </div>
            {s.valid && <Check size={16} className="text-emerald-600" aria-label={t.completed} />}
          </div>
        </article>)}
        <p className="cb-note">{t.done}</p>
      </section>
      <div className="flex justify-end">
        <button type="button" className="ws-btn ws-btn--ghost" disabled={busy}
          onClick={deleteDraft}><Trash2 size={16} aria-hidden /> {t.deleted}</button>
      </div>
    </>}
  </main>;
}
