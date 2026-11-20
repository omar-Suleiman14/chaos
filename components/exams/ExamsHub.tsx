"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BarChart3, ClipboardCheck, FileCheck2, PenLine, Search, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ExamSettings } from "@/convex/examSettingsModel";
import { WsDialog, WsSwitch } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { useConfirmedQuery } from "@/lib/confirmedQuery";
import { useCopy, useLocale } from "@/lib/i18n";
import { hostHref } from "@/lib/hosts";
import { toast } from "@/lib/toast";
import { timeAgo } from "@/lib/timeAgo";
import "@/components/live/games.css";
import "./exams.css";

const copy = {
  en: {
    title: "Exams", lead: "Turn a published quiz into a timed, secure course exam. Students take it from their course with a timer, question navigator and autosave.",
    defaults: "Default exam settings", defaultsHelp: "Used for every exam you make from a quiz. You can change each exam's settings later.",
    duration: "Time limit", minutes: (n: number) => `${n} minutes`, attempts: "Attempts", attemptsN: (n: number) => n === 1 ? "1 attempt" : `${n} attempts`,
    pass: "Passing score", visibility: "Show results", immediate: "Right after grading", manual: "When I release them",
    timeout: "When time runs out", autoSubmit: "Submit saved answers", expire: "Mark attempt expired",
    monitoring: "Browser monitoring", monitorOff: "Off", monitorRecord: "Record events", monitorWarn: "Record and warn", monitorReview: "Flag for review",
    requireAll: "Require every answer", requireAllHelp: "Students must answer all questions before submitting.",
    early: "Allow early submission", earlyHelp: "Students may submit before the timer ends.",
    answers: "Show correct answers", answersHelp: "After results are released.",
    explanations: "Show explanations", explanationsHelp: "After results are released.",
    fromQuiz: "Make an exam from a quiz", fromQuizHelp: "Only published quizzes with choice questions and marked answers can become exams. The exam keeps its own copy, so later quiz edits don't change it.",
    find: "Find a quiz…", makeExam: "Make exam", noQuizzes: "No published quizzes yet. Publish a quiz first.",
    yours: "Your exams", yoursHelp: "Exams across all your courses. Open one to change questions or settings, assign it, and open entry.",
    noExams: "No exams yet. Make one from a quiz above, or from a course's Exams page.",
    loading: "Loading…", open: "Open", results: "Results", grading: "Grading", showMore: "Show more",
    stage: { draft: "Draft", sealed: "Questions locked", ready: "Ready to assign", assigned: "Assigned", open: "Open to students" },
    outdated: "Edited since locked", questions: (n: number) => n === 1 ? "1 question" : `${n} questions`,
    dialogTitle: "Make an exam", dialogHelp: "The quiz's questions are copied into a course question bank. Exams belong to a course so only its students can take them.",
    examTitle: "Exam title", course: "Course", newCourse: "New course for this exam", newCourseTitle: "Course name",
    readiness: (u: number, total: number) => u === total ? `All ${total} questions can be used.` : `${u} of ${total} questions can be used. Others (written, image or branching questions, or without a marked answer) are skipped.`,
    mixed: "Questions have different point values; each will be worth 1 point. You can change points in the exam builder.",
    none: "This quiz has no choice questions with marked answers.",
    lock: "Lock questions and apply default settings", lockHelp: "Makes the exam ready to assign right away.",
    create: "Create exam", creating: "Creating…", cancel: "Cancel", created: "Exam created",
    skippedNote: (n: number) => `${n} question${n === 1 ? " was" : "s were"} skipped.`,
  },
  ar: {
    title: "الامتحانات", lead: "حوّل اختبارًا منشورًا إلى امتحان دورة بوقت محدد. يؤديه الطلاب من دورتهم مع مؤقت وتنقل بين الأسئلة وحفظ تلقائي.",
    defaults: "إعدادات الامتحان الافتراضية", defaultsHelp: "تُطبق على كل امتحان تنشئه من اختبار. يمكنك تعديل إعدادات كل امتحان لاحقًا.",
    duration: "المدة", minutes: (n: number) => `${n} دقيقة`, attempts: "المحاولات", attemptsN: (n: number) => n === 1 ? "محاولة واحدة" : `${n} محاولات`,
    pass: "درجة النجاح", visibility: "إظهار النتائج", immediate: "بعد التصحيح مباشرة", manual: "عندما أعلنها",
    timeout: "عند انتهاء الوقت", autoSubmit: "تسليم الإجابات المحفوظة", expire: "اعتبار المحاولة منتهية",
    monitoring: "مراقبة المتصفح", monitorOff: "مغلقة", monitorRecord: "تسجيل الأحداث", monitorWarn: "تسجيل وتنبيه", monitorReview: "إحالة للمراجعة",
    requireAll: "اشترط الإجابة عن كل الأسئلة", requireAllHelp: "يجب أن يجيب الطلاب عن كل الأسئلة قبل التسليم.",
    early: "اسمح بالتسليم المبكر", earlyHelp: "يمكن للطلاب التسليم قبل انتهاء الوقت.",
    answers: "إظهار الإجابات الصحيحة", answersHelp: "بعد إعلان النتائج.",
    explanations: "إظهار الشرح", explanationsHelp: "بعد إعلان النتائج.",
    fromQuiz: "أنشئ امتحانًا من اختبار", fromQuizHelp: "يمكن تحويل الاختبارات المنشورة ذات أسئلة الاختيار والإجابات المحددة فقط. يحتفظ الامتحان بنسخته الخاصة فلا تغيّره تعديلات الاختبار اللاحقة.",
    find: "ابحث عن اختبار…", makeExam: "أنشئ امتحانًا", noQuizzes: "لا توجد اختبارات منشورة بعد. انشر اختبارًا أولًا.",
    yours: "امتحاناتك", yoursHelp: "امتحانات كل دوراتك. افتح امتحانًا لتعديل أسئلته أو إعداداته وتكليفه وفتح الدخول.",
    noExams: "لا امتحانات بعد. أنشئ امتحانًا من اختبار بالأعلى أو من صفحة امتحانات الدورة.",
    loading: "جارٍ التحميل…", open: "فتح", results: "النتائج", grading: "التصحيح", showMore: "عرض المزيد",
    stage: { draft: "مسودة", sealed: "الأسئلة مثبتة", ready: "جاهز للتكليف", assigned: "مُكلَّف", open: "متاح للطلاب" },
    outdated: "عُدّل بعد التثبيت", questions: (n: number) => `${n} سؤال`,
    dialogTitle: "أنشئ امتحانًا", dialogHelp: "تُنسخ أسئلة الاختبار إلى بنك أسئلة الدورة. الامتحان يتبع دورة حتى يؤديه طلابها فقط.",
    examTitle: "عنوان الامتحان", course: "الدورة", newCourse: "دورة جديدة لهذا الامتحان", newCourseTitle: "اسم الدورة",
    readiness: (u: number, total: number) => u === total ? `يمكن استخدام الأسئلة الـ${total} كلها.` : `يمكن استخدام ${u} من ${total} سؤالًا. ستُتخطى الأسئلة الأخرى (المكتوبة أو ذات الصور أو المشروطة أو بلا إجابة محددة).`,
    mixed: "للأسئلة درجات مختلفة؛ سيكون كل سؤال بدرجة واحدة. يمكنك تعديل الدرجات من منشئ الامتحان.",
    none: "لا يحتوي هذا الاختبار على أسئلة اختيار بإجابات محددة.",
    lock: "ثبّت الأسئلة وطبّق الإعدادات الافتراضية", lockHelp: "يجعل الامتحان جاهزًا للتكليف فورًا.",
    create: "أنشئ الامتحان", creating: "جارٍ الإنشاء…", cancel: "إلغاء", created: "تم إنشاء الامتحان",
    skippedNote: (n: number) => `تم تخطي ${n} سؤال.`,
  },
};

const DEFAULTS_KEY = "chaos-exam-defaults";
const baseDefaults: ExamSettings = {
  mode: "anytime", durationMinutes: 30, maxAttempts: 1, requireAllAnswers: false, allowEarlySubmission: true,
  timeoutAction: "auto_submit", passingPercent: 50, resultVisibility: "immediate",
  showCorrectAnswers: true, showExplanations: true, integrityMode: "off",
};
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];
const PASSING = [0, 40, 50, 60, 70, 75, 80, 90, 100];

function loadDefaults(): ExamSettings {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (raw) return { ...baseDefaults, ...(JSON.parse(raw) as Partial<ExamSettings>), mode: "anytime", opensAt: undefined, closesAt: undefined };
  } catch { /* storage unavailable */ }
  return baseDefaults;
}

type Quiz = { _id: Id<"forms">; title: string };

/** Exams: default settings, quizzes that can become exams, and every exam across courses. Shown as the Library's Exams tab. */
export default function ExamsHub({ embedded = false }: { embedded?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const forms = useConfirmedQuery(api.forms.listMyForms).data;
  const exams = useQuery(api.examFromQuiz.listMine);
  const [defaults, setDefaults] = useState<ExamSettings>(baseDefaults);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState({ quizzes: 8, exams: 12 });
  const [making, setMaking] = useState<Quiz | null>(null);
  useEffect(() => { setDefaults(loadDefaults()); }, []);
  const update = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => setDefaults(previous => {
    const next = { ...previous, [key]: value };
    try { window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  const quizzes = useMemo(() => {
    if (!forms) return [];
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return forms.owned.filter(f => f.quizMode && f.publishedVersion !== undefined && f.status !== "archived" &&
      words.every(word => f.title.toLocaleLowerCase().includes(word)));
  }, [forms, search]);

  const durationOptions = [...new Set([...DURATIONS, defaults.durationMinutes])].sort((a, b) => a - b)
    .map(n => ({ value: String(n), label: t.minutes(n) }));

  return <div className="games-hub exams-hub">
    {!embedded && <header className="ws-page-header games-header">
      <div><h1 className="ws-page-title">{t.title}</h1><p className="games-help">{t.lead}</p></div>
    </header>}
    {embedded && <p className="games-help exams-lead">{t.lead}</p>}

    <section className="games-session" aria-labelledby="exams-defaults-title">
      <h2 id="exams-defaults-title">{t.defaults}</h2><p className="games-help">{t.defaultsHelp}</p>
      <div className="exams-settings">
        <div className="games-time"><span>{t.duration}</span><Select label={t.duration} value={String(defaults.durationMinutes)} onChange={v => update("durationMinutes", Number(v))} options={durationOptions} /></div>
        <div className="games-time"><span>{t.attempts}</span><Select label={t.attempts} value={String(defaults.maxAttempts)} onChange={v => update("maxAttempts", Number(v))} options={[1, 2, 3].map(n => ({ value: String(n), label: t.attemptsN(n) }))} /></div>
        <div className="games-time"><span>{t.pass}</span><Select label={t.pass} value={String(defaults.passingPercent)} onChange={v => update("passingPercent", Number(v))} options={[...new Set([...PASSING, defaults.passingPercent])].sort((a, b) => a - b).map(n => ({ value: String(n), label: `${n}%` }))} /></div>
        <div className="games-time"><span>{t.visibility}</span><Select label={t.visibility} value={defaults.resultVisibility === "after_close" ? "manual" : defaults.resultVisibility} onChange={v => update("resultVisibility", v as ExamSettings["resultVisibility"])} options={[{ value: "immediate", label: t.immediate }, { value: "manual", label: t.manual }]} /></div>
        <div className="games-time"><span>{t.timeout}</span><Select label={t.timeout} value={defaults.timeoutAction} onChange={v => update("timeoutAction", v as ExamSettings["timeoutAction"])} options={[{ value: "auto_submit", label: t.autoSubmit }, { value: "expire", label: t.expire }]} /></div>
        <div className="games-time"><span>{t.monitoring}</span><Select label={t.monitoring} value={defaults.integrityMode ?? "off"} onChange={v => update("integrityMode", v as NonNullable<ExamSettings["integrityMode"]>)} options={[{ value: "off", label: t.monitorOff }, { value: "record", label: t.monitorRecord }, { value: "warn", label: t.monitorWarn }, { value: "review", label: t.monitorReview }]} /></div>
      </div>
      <div className="exams-switches">
        <div><WsSwitch label={t.early} checked={defaults.allowEarlySubmission} onChange={v => update("allowEarlySubmission", v)} /><p className="games-help">{t.earlyHelp}</p></div>
        <div><WsSwitch label={t.requireAll} checked={defaults.requireAllAnswers} onChange={v => update("requireAllAnswers", v)} /><p className="games-help">{t.requireAllHelp}</p></div>
        <div><WsSwitch label={t.answers} checked={defaults.showCorrectAnswers} onChange={v => update("showCorrectAnswers", v)} /><p className="games-help">{t.answersHelp}</p></div>
        <div><WsSwitch label={t.explanations} checked={defaults.showExplanations} onChange={v => update("showExplanations", v)} /><p className="games-help">{t.explanationsHelp}</p></div>
      </div>
    </section>

    <section className="games-library" aria-labelledby="exams-mine-title">
      <details className="games-toggle" open>
        <summary><h2 id="exams-mine-title">{t.yours}</h2><span>{exams?.length ?? ""}</span></summary>
        <p className="games-help">{t.yoursHelp}</p>
        {exams === undefined ? <output className="games-help">{t.loading}</output> : !exams.length ? <p className="games-empty">{t.noExams}</p> :
          <div className="games-quiz-list">
            {exams.slice(0, shown.exams).map(exam => {
              const base = `/dashboard/courses/${exam.courseId}/exams`;
              return <article key={exam.draftId}>
                <div className="games-quiz-list__title">
                  <Link href={hostHref(`${base}?draft=${exam.draftId}`)}><h3 dir="auto">{exam.title}</h3></Link>
                  <p className="exams-meta">
                    <span className="exams-stage" data-stage={exam.stage}>{t.stage[exam.stage]}</span>
                    <span dir="auto">{exam.courseTitle}</span>
                    <span>{t.questions(exam.stage === "draft" ? exam.selectedCount : exam.questionCount)}{exam.stage === "draft" && exam.selectedCount !== exam.targetCount ? ` / ${exam.targetCount}` : ""}</span>
                    {exam.durationMinutes !== null && <span>{t.minutes(exam.durationMinutes)}</span>}
                    {exam.stage !== "draft" && !exam.sealedIsCurrent && <span className="exams-warn">{t.outdated}</span>}
                    <span>{timeAgo(locale, exam.updatedAt)}</span>
                  </p>
                </div>
                <div className="games-quiz-list__actions">
                  {exam.stage !== "draft" && <Link className="ws-btn" href={hostHref(`${base}/results?draft=${exam.draftId}`)}><BarChart3 size={15} aria-hidden="true" />{t.results}</Link>}
                  {exam.stage !== "draft" && <Link className="ws-btn" href={hostHref(`${base}/grading?draft=${exam.draftId}`)}><PenLine size={15} aria-hidden="true" />{t.grading}</Link>}
                  <Link className="ws-btn ws-btn--primary" href={hostHref(`${base}?draft=${exam.draftId}`)}>{t.open}<ArrowRight size={15} aria-hidden="true" className="rtl:rotate-180" /></Link>
                </div>
              </article>;
            })}
            {exams.length > shown.exams && <button type="button" className="ws-btn" onClick={() => setShown(s => ({ ...s, exams: s.exams + 12 }))}>{t.showMore} ({exams.length - shown.exams})</button>}
          </div>}
      </details>
    </section>

    <section className="games-library" aria-labelledby="exams-quiz-title">
      <details className="games-toggle" open>
        <summary><h2 id="exams-quiz-title">{t.fromQuiz}</h2><span>{forms ? quizzes.length : ""}</span></summary>
        <p className="games-help">{t.fromQuizHelp}</p>
        <label className="ws-search exams-search"><Search size={16} aria-hidden /><input type="search" value={search} aria-label={t.find} placeholder={t.find} onChange={e => { setSearch(e.target.value); setShown(s => ({ ...s, quizzes: 8 })); }} /></label>
        {forms === undefined ? <output className="games-help">{t.loading}</output> : !quizzes.length ? <p className="games-empty">{t.noQuizzes}</p> :
          <div className="games-quiz-list">
            {quizzes.slice(0, shown.quizzes).map(quiz => <article key={quiz._id}>
              <div className="games-quiz-list__title"><Link href={hostHref(`/dashboard/forms/${quiz._id}`)}><h3 dir="auto">{quiz.title}</h3></Link></div>
              <div className="games-quiz-list__actions">
                <button type="button" className="ws-btn ws-btn--primary" onClick={() => setMaking({ _id: quiz._id, title: quiz.title })}><ClipboardCheck size={16} aria-hidden="true" />{t.makeExam}</button>
              </div>
            </article>)}
            {quizzes.length > shown.quizzes && <button type="button" className="ws-btn" onClick={() => setShown(s => ({ ...s, quizzes: s.quizzes + 12 }))}>{t.showMore} ({quizzes.length - shown.quizzes})</button>}
          </div>}
      </details>
    </section>

    {making && <MakeExamDialog quiz={making} defaults={defaults} onClose={() => setMaking(null)} />}
  </div>;
}

/** Choose a course and title, then create a ready exam from a published quiz. */
function MakeExamDialog({ quiz, defaults, courseId: fixedCourse, onClose }: {
  quiz: Quiz; defaults?: ExamSettings; courseId?: Id<"learnCollections">; onClose: () => void;
}) {
  const t = useCopy(copy);
  const router = useRouter();
  const courses = useQuery(api.courses.listMine);
  const readiness = useQuery(api.examFromQuiz.quizReadiness, { formId: quiz._id });
  const createFromQuiz = useMutation(api.examFromQuiz.createFromQuiz);
  const activeCourses = (courses ?? []).filter(c => !c.archived);
  const [course, setCourse] = useState<string>(fixedCourse ?? "");
  const [title, setTitle] = useState(quiz.title);
  const [courseTitle, setCourseTitle] = useState(quiz.title);
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!course && courses) setCourse(activeCourses[0]?.id ?? "new");
  }, [course, courses, activeCourses]);
  const settings = defaults ?? (typeof window === "undefined" ? baseDefaults : loadDefaults());

  const submit = async () => {
    if (busy || !course) return;
    setBusy(true);
    try {
      const result = await createFromQuiz({
        sourceFormId: quiz._id, title: title.trim() || quiz.title, seal: lock,
        ...(course === "new" ? { newCourseTitle: courseTitle.trim() || quiz.title } : { courseId: course as Id<"learnCollections"> }),
        ...(lock ? { settings: { ...settings, mode: "anytime" as const, opensAt: undefined, closesAt: undefined,
          resultVisibility: settings.resultVisibility === "after_close" ? "manual" as const : settings.resultVisibility } } : {}),
      });
      toast.success(result.skipped ? `${t.created}. ${t.skippedNote(result.skipped)}` : t.created);
      onClose();
      router.push(hostHref(`/dashboard/courses/${result.courseId}/exams?draft=${result.draftId}`));
    } catch (error) { toast.error(error, { fallback: "Could not create the exam." }); }
    finally { setBusy(false); }
  };

  return <WsDialog title={t.dialogTitle} description={t.dialogHelp} onClose={onClose}>
    <form className="exams-dialog" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <output className="exams-readiness">
        {readiness === undefined ? t.loading : !readiness || readiness.usable === 0 ? t.none : <>
          <FileCheck2 size={16} aria-hidden="true" />{t.readiness(readiness.usable, readiness.total)}
          {readiness.mixedPoints && <span className="block mt-1">{t.mixed}</span>}
        </>}
      </output>
      <label className="exams-field">{t.examTitle}<input className="kb-input" dir="auto" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      {!fixedCourse && <div className="exams-field"><span>{t.course}</span>
        <Select label={t.course} value={course} onChange={setCourse} disabled={courses === undefined}
          options={[...activeCourses.map(c => ({ value: c.id as string, label: c.title })), { value: "new", label: t.newCourse }]} />
      </div>}
      {course === "new" && <label className="exams-field">{t.newCourseTitle}<input className="kb-input" dir="auto" maxLength={200} value={courseTitle} onChange={e => setCourseTitle(e.target.value)} /></label>}
      <div><WsSwitch label={t.lock} checked={lock} onChange={setLock} /><p className="games-help">{t.lockHelp}</p></div>
      <div className="exams-dialog__actions">
        <button type="button" className="ws-btn" onClick={onClose}>{t.cancel}</button>
        <button type="submit" className="ws-btn ws-btn--primary" disabled={busy || !course || !readiness?.usable}><Sparkles size={16} aria-hidden="true" />{busy ? t.creating : t.create}</button>
      </div>
    </form>
  </WsDialog>;
}
