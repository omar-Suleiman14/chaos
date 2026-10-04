"use client";

import Link from "next/link";
import { Select } from "@/components/workspace/Select";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Globe, Lock, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CoursePortability from "@/components/courses/CoursePortability";
import CourseDetailsEditor from "@/components/courses/CourseDetailsEditor";
import CourseModulesEditor from "@/components/courses/CourseModulesEditor";
import CourseStudents from "@/components/courses/CourseStudents";
import { contentDirection } from "@/lib/learn/direction";
import { localeDir } from "@/lib/locale";
import { useCopy, useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { WsDialog } from "@/components/workspace/primitives";
import { LessonCover, PageIconControls, type PageLook } from "@/components/learn/editor/PageHeader";
import "@/components/learn/learn.css";
import "@/components/courses/courses.css";

const copy = {
  en: {
    back: "Courses", loading: "Loading course…", missing: "This course doesn't exist or isn't yours.", draft: "Draft", live: "Published", changes: "Unpublished changes",
    titlePh: "Course title", descPh: "What will people learn? One or two sentences.", lessons: "Lessons", add: "Add a lesson", empty: "No lessons yet. Add the first one.",
    up: "Move up", down: "Move down", remove: "Remove from course", unpublishedLesson: "Not published yet", changedLesson: "Edited since publishing", livelesson: "Published",
    blocks: (n: number) => `${n} ${n === 1 ? "block" : "blocks"}`,
    language: "Course language", languageHelp: "Sets reading direction. New lessons inherit this language.", settings: "Details", tags: "Topics", tagsHelp: "Comma separated, up to 12.",
    publish: "Publish", update: "Publish changes", view: "View course", unpublish: "Unpublish", archive: "Archive",
    publishTitle: "Publish this course", who: "Who can take it", public: "Public", publicHelp: "Anyone can find and take it, free. Recommended.",
    private: "Private", privateHelp: "Only you and people you share lessons with. Part of Chaos Business.", business: "Business only",
    publishNote: "This publishes the course and all its lessons together, with the same visibility. Learners start the course to unlock its lessons.", confirm: "Publish", cancel: "Cancel", publishing: "Publishing…",
    problems: "Fix these lessons first:", saved: "Saved", failed: "Couldn't save. Try again.",
  },
  ar: {
    back: "الدورات", loading: "جارٍ تحميل الدورة…", missing: "هذه الدورة غير موجودة أو ليست لك.", draft: "مسودة", live: "منشورة", changes: "تغييرات غير منشورة",
    titlePh: "عنوان الدورة", descPh: "ماذا سيتعلم الناس؟ جملة أو جملتان.", lessons: "الدروس", add: "أضف درسًا", empty: "لا دروس بعد. أضف أول درس.",
    up: "انقل لأعلى", down: "انقل لأسفل", remove: "احذف من الدورة", unpublishedLesson: "لم يُنشر بعد", changedLesson: "عُدّل بعد النشر", livelesson: "منشور",
    blocks: (n: number) => `${n} ${n === 1 ? "كتلة" : "كتل"}`,
    language: "لغة الدورة", languageHelp: "تحدد اتجاه القراءة. ترث الدروس الجديدة هذه اللغة.", settings: "التفاصيل", tags: "المواضيع", tagsHelp: "مفصولة بفواصل، حتى 12.",
    publish: "انشر", update: "انشر التغييرات", view: "اعرض الدورة", unpublish: "ألغِ النشر", archive: "أرشف",
    publishTitle: "انشر هذه الدورة", who: "من يمكنه أخذها", public: "عامة", publicHelp: "يمكن لأي أحد إيجادها وأخذها مجانًا. موصى به.",
    private: "خاصة", privateHelp: "أنت ومن تشاركهم الدروس فقط. جزء من Chaos للأعمال.", business: "للأعمال فقط",
    publishNote: "ينشر هذا الدورة وكل دروسها معًا وبنفس الظهور. يبدأ المتعلمون الدورة لفتح دروسها.", confirm: "انشر", cancel: "إلغاء", publishing: "جارٍ النشر…",
    problems: "أصلح هذه الدروس أولًا:", saved: "حُفظ", failed: "تعذر الحفظ. حاول مجددًا.",
  },
};

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^.*?(BUSINESS_REQUIRED|VALIDATION_FAILED|EMPTY|MODERATED|NOT_FOUND|ASSESSMENT_UNPUBLISHED): /, "") : String(err));

export default function CourseBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = id as Id<"learnCollections">;
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const course = useQuery(api.courses.get, { courseId });
  const update = useMutation(api.courses.update), setOutline = useMutation(api.courses.setOutline), addLesson = useMutation(api.courses.addLesson);
  const publish = useMutation(api.courses.publish), unpublish = useMutation(api.courses.unpublish), setArchived = useMutation(api.courses.setArchived);
  const [title, setTitle] = useState(""), [desc, setDesc] = useState(""), [tags, setTags] = useState("");
  // Cover and icon show the change at once; the server copy catches up.
  const [look, setLook] = useState<PageLook | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false), [visibility, setVisibility] = useState<"public" | "private">("public");
  const [problems, setProblems] = useState<{ lessonId: string; title: string; message: string }[]>([]);

  useEffect(() => {
    if (course && loadedId !== course.id) {
      setLoadedId(course.id); setTitle(course.title); setDesc(course.description); setLook(null); setTags(course.tags.join(", "));
      setVisibility(course.visibility === "public" ? "public" : "private");
    }
  }, [course, loadedId]);

  if (course === undefined) return <PageSkeleton label={t.loading} />;
  if (course === null) return <p className="ws-empty">{t.missing}</p>;

  const run = async (work: () => Promise<unknown>) => { setError(""); setBusy(true); try { await work(); } catch (err) { setError(message(err)); } finally { setBusy(false); } };
  const save = (patch: Parameters<typeof update>[0]) => void run(() => update(patch));
  const ids = course.lessons.map((l) => l.id);
  const move = (i: number, d: -1 | 1) => { const next = [...ids]; [next[i], next[i + d]] = [next[i + d], next[i]]; void run(() => setOutline({ courseId, lessonIds: next })); };
  const page: PageLook = look ?? { coverUrl: course.coverUrl, coverY: course.coverY, icon: course.icon };
  const saveLook = (patch: Partial<PageLook>) => {
    setLook({ ...page, ...patch });
    save({ courseId, ...("coverUrl" in patch ? { coverUrl: patch.coverUrl ?? null } : {}), ...("coverY" in patch ? { coverY: patch.coverY ?? null } : {}), ...("icon" in patch ? { icon: patch.icon ?? null } : {}) });
  };
  const dirty = !course.published || course.lessons.some((l) => l.changed);

  return (
    <div className="cb cb-page" dir={localeDir(locale)}>
      <div className="cb-top">
        <Link href="/dashboard?tab=courses" className="ws-btn ws-btn--ghost ws-btn--sm"><ArrowLeft size={16} className="cb-arrow" aria-hidden /> {t.back}</Link>
        <span className="cb-status" data-live={course.published}>{course.published ? t.live : t.draft}</span>
        {course.published && dirty && <span className="cb-note">{t.changes}</span>}
        <span className="cb-top__spacer" />
        {course.published && <Link className="ws-btn ws-btn--ghost ws-btn--sm" href={`/learn/courses/${course.id}`} target="_blank"><ExternalLink size={15} aria-hidden /> {t.view}</Link>}
        <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !course.lessons.length} onClick={() => { setProblems([]); setPublishing(true); }}>{course.published ? t.update : t.publish}</button>
      </div>
      {error && <p role="alert" className="ws-error">{error}</p>}

      <LessonCover meta={page} editable onChange={saveLook} />
      <section className="cb-hero">
        <PageIconControls meta={page} editable onChange={saveLook} />
        <div className="cb-hero__body">
          <input dir={contentDirection(course.language)} lang={course.language} className="cb-title" aria-label={t.titlePh} placeholder={t.titlePh} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== course.title && save({ courseId, title })} />
          <textarea dir={contentDirection(course.language)} lang={course.language} className="cb-desc" aria-label={t.descPh} placeholder={t.descPh} rows={2} value={desc} maxLength={4000} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== course.description && save({ courseId, description: desc })} />
        </div>
      </section>

      <section className="cb-section" aria-labelledby="cb-lessons">
        <h2 id="cb-lessons">{t.lessons}</h2>
        {course.lessons.length === 0 ? <p className="cb-note mb-3">{t.empty}</p> : (
          <ol className="cb-lessons mb-3">
            {course.lessons.map((l, i) => (
              <li key={l.id} className="cb-lesson">
                <span className="cb-lesson__no">{i + 1}</span>
                <div className="min-w-0">
                  <Link dir="auto" className="cb-lesson__title truncate" href={`/dashboard/learn/lessons/${l.id}?course=${course.id}`}>{l.title}</Link>
                  <span className="cb-lesson__meta">{!l.published ? t.unpublishedLesson : l.changed ? t.changedLesson : t.livelesson} · {t.blocks(l.blocks)}</span>
                </div>
                <div className="cb-lesson__actions">
                  <button type="button" className="ws-icon-button" aria-label={t.up} title={t.up} disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} aria-hidden /></button>
                  <button type="button" className="ws-icon-button" aria-label={t.down} title={t.down} disabled={busy || i === ids.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} aria-hidden /></button>
                  <button type="button" className="ws-icon-button" aria-label={t.remove} title={t.remove} disabled={busy} onClick={() => void run(() => setOutline({ courseId, lessonIds: ids.filter((x) => x !== l.id) }))}><Trash2 size={16} aria-hidden /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="cb-add w-full" disabled={busy} onClick={() => void run(async () => { const lessonId = await addLesson({ courseId }); router.push(`/dashboard/learn/lessons/${lessonId}?course=${courseId}`); })}><Plus size={18} aria-hidden /> {t.add}</button>
      </section>

      <CourseStudents courseId={courseId} />
      <CoursePortability courseId={courseId} />
      <CourseDetailsEditor courseId={courseId} details={course.details} />
      <CourseModulesEditor courseId={courseId} modules={course.modules ?? []} lessons={course.lessons} />

      <section className="cb-section grid gap-4" aria-labelledby="cb-settings">
        <h2 id="cb-settings">{t.settings}</h2>
        <div className="cb-row"><span id="cb-language-label" className="font-semibold">{t.language}</span><Select labelledBy="cb-language-label" value={course.language} disabled={busy} onChange={language => save({ courseId, language })} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, ...(["en", "ar"].includes(course.language) ? [] : [{ value: course.language, label: course.language }])]} /><span className="cb-note">{t.languageHelp}</span></div>
        <div className="cb-row"><label htmlFor="cb-tags">{t.tags}</label><input id="cb-tags" dir="auto" className="kb-input" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => save({ courseId, tags: tags.split(",") })} /><span className="cb-note">{t.tagsHelp}</span></div>
        <div className="flex gap-2 flex-wrap">
          {course.published && <button type="button" className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(() => unpublish({ courseId }))}>{t.unpublish}</button>}
          <button type="button" className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(async () => { await setArchived({ courseId, archived: true }); router.push("/dashboard?tab=courses"); })}>{t.archive}</button>
        </div>
      </section>

      {publishing && <WsDialog onClose={() => setPublishing(false)} title={t.publishTitle}>
        <div className="grid gap-4">
          <fieldset className="cb-vis"><legend className="text-sm font-semibold mb-1">{t.who}</legend>
            <label><input type="radio" name="vis" checked={visibility === "public"} onChange={() => setVisibility("public")} /><span><Globe size={14} aria-hidden /> <strong>{t.public}</strong><span className="block cb-note">{t.publicHelp}</span></span></label>
            <label data-disabled={!course.canPrivate}><input type="radio" name="vis" disabled={!course.canPrivate} checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><Lock size={14} aria-hidden /> <strong>{t.private}</strong>{!course.canPrivate && <span className="cb-status ms-2">{t.business}</span>}<span className="block cb-note">{t.privateHelp}</span></span></label>
          </fieldset>
          <p className="cb-note">{t.publishNote}</p>
          {problems.length > 0 && <div className="cb-problems" role="alert"><strong>{t.problems}</strong><ul className="list-disc ps-5 mt-1">{problems.map((p) => <li key={p.lessonId}><Link href={`/dashboard/learn/lessons/${p.lessonId}?course=${course.id}`} className="underline">{p.title}</Link>: {p.message}</li>)}</ul></div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setPublishing(false)}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--primary" disabled={busy} onClick={() => void run(async () => { const r = await publish({ courseId, visibility }); if (r.ok) setPublishing(false); else setProblems(r.problems); })}>{busy ? t.publishing : t.confirm}</button>
          </div>
        </div>
      </WsDialog>}
    </div>
  );
}
