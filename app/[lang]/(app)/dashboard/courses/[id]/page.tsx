"use client";

import Link from "next/link";
import { Select } from "@/components/workspace/Select";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, Lock, Send } from "lucide-react";
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
    titlePh: "Course title", descPh: "What will people learn? One or two sentences.",
    language: "Course language", languageHelp: "Sets reading direction. New lessons inherit this language.", settings: "Settings", tags: "Topics", tagsHelp: "Comma separated, up to 12.",
    publish: "Publish course", update: "Publish course changes", view: "View course", unpublish: "Unpublish", archive: "Archive",
    publishTitle: "Publish this course", who: "Who can take it", public: "Public", publicHelp: "Anyone can find and take it, free. Recommended.",
    private: "Private", privateHelp: "Only you and people you share lessons with. Part of Chaos Business.", business: "Business only",
    publishNote: "Publishing the course also publishes any of its lessons that have unpublished changes, with the visibility you pick here. To publish just one lesson, use Publish inside that lesson.", confirm: "Publish", cancel: "Cancel", publishing: "Publishing…",
    problems: "Fix these lessons first:", saved: "Saved", failed: "Couldn't save. Try again.",
  },
  ar: {
    back: "الدورات", loading: "جارٍ تحميل الدورة…", missing: "هذه الدورة غير موجودة أو ليست لك.", draft: "مسودة", live: "منشورة", changes: "تغييرات غير منشورة",
    titlePh: "عنوان الدورة", descPh: "ماذا سيتعلم الناس؟ جملة أو جملتان.",
    language: "لغة الدورة", languageHelp: "تحدد اتجاه القراءة. ترث الدروس الجديدة هذه اللغة.", settings: "الإعدادات", tags: "المواضيع", tagsHelp: "مفصولة بفواصل، حتى 12.",
    publish: "انشر الدورة", update: "انشر تغييرات الدورة", view: "اعرض الدورة", unpublish: "ألغِ النشر", archive: "أرشف",
    publishTitle: "انشر هذه الدورة", who: "من يمكنه أخذها", public: "عامة", publicHelp: "يمكن لأي أحد إيجادها وأخذها مجانًا. موصى به.",
    private: "خاصة", privateHelp: "أنت ومن تشاركهم الدروس فقط. جزء من Chaos للأعمال.", business: "للأعمال فقط",
    publishNote: "نشر الدورة ينشر أيضًا أي درس فيها به تغييرات غير منشورة، بالظهور الذي تختاره هنا. لنشر درس واحد فقط، استخدم «انشر» داخل ذلك الدرس.", confirm: "انشر", cancel: "إلغاء", publishing: "جارٍ النشر…",
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
  const update = useMutation(api.courses.update);
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
        {course.isOwner && <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !course.lessons.length} onClick={() => { setProblems([]); setPublishing(true); }}><Send size={15} aria-hidden />{course.published ? t.update : t.publish}</button>}
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

      <CourseModulesEditor courseId={courseId} modules={course.modules ?? []} lessons={course.lessons} onError={setError} />

      {course.isOwner && <CourseStudents courseId={courseId} />}
      <CourseDetailsEditor courseId={courseId} details={course.details} />

      <section className="cb-section grid gap-4" aria-labelledby="cb-settings">
        <h2 id="cb-settings">{t.settings}</h2>
        <div className="cb-row"><span id="cb-language-label" className="font-semibold">{t.language}</span><Select labelledBy="cb-language-label" value={course.language} disabled={busy} onChange={language => save({ courseId, language })} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, ...(["en", "ar"].includes(course.language) ? [] : [{ value: course.language, label: course.language }])]} /><span className="cb-note">{t.languageHelp}</span></div>
        <div className="cb-row"><label htmlFor="cb-tags">{t.tags}</label><input id="cb-tags" dir="auto" className="kb-input" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => save({ courseId, tags: tags.split(",") })} /><span className="cb-note">{t.tagsHelp}</span></div>
        {course.isOwner && <CoursePortability courseId={courseId} />}
        {course.isOwner && <div className="flex gap-2 flex-wrap">
          {course.published && <button type="button" className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(() => unpublish({ courseId }))}>{t.unpublish}</button>}
          <button type="button" className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(async () => { await setArchived({ courseId, archived: true }); router.push("/dashboard?tab=courses"); })}>{t.archive}</button>
        </div>}
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
