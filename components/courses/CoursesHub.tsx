"use client";

import { filterLearningRows, LearningLibraryActions, LearningLibraryTable, type LearningLibraryProps } from "@/components/library/LearningLibrary";
import { toast } from "@/lib/toast";
import { timeAgo } from "@/lib/timeAgo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { useConfirmedQuery } from "@/lib/confirmedQuery";
import { CacheState } from "@/components/workspace/CacheState";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { courseCopy, coverStyle } from "./shared";
import "./courses.css";
import { hrefIntentHandlers } from "@/lib/convexCache";

/** Your courses: create, open and browse. Shown as the Library's Courses tab. */
export default function CoursesHub({
  embedded = false,
  view = "gallery",
  ...filters
}: LearningLibraryProps) {
  const t = useCopy(courseCopy);
  const { locale } = useLocale();
  const router = useRouter();
  const coursesQuery = useConfirmedQuery(api.courses.listMine);
  const courses = coursesQuery.data;
  const create = useMutation(api.courses.create);
  const setArchived = useMutation(api.courses.setArchived);
  const [busy, setBusy] = useState(false);
  const ar = locale === "ar";
  const newCourse = async () => {
    setBusy(true);
    try {
      const id = await create({ language: locale });
      router.push(`/dashboard/courses/${id}`);
    } catch (err) {
      toast.error(err, { fallback: t.failed });
      setBusy(false);
    }
  };
  // An empty cached list proves nothing; wait for Convex rather than offer "create your first course".
  if (courses === undefined || (!coursesQuery.confirmed && !courses.length)) return <PageSkeleton label={t.loading} />;
  const shown = filterLearningRows(courses.filter(c => !c.archived).map(c => ({ ...c, count: c.lessons, href: `/dashboard/courses/${c.id}` })), filters);
  const filtered = !!filters.search || !!filters.statuses?.length;
  const archive = async (course: typeof shown[number]) => {
    if (busy) return;
    setBusy(true);
    try {
      await setArchived({ courseId: course.id, archived: true });
      toast(ar ? "تمت أرشفة الدورة" : "Course archived", { description: course.title, undo: () => {
        setBusy(true);
        void toast.promise(setArchived({ courseId: course.id, archived: false }), { loading: ar ? "جارٍ الاستعادة…" : "Restoring…", success: ar ? "استُعيدت الدورة" : "Course restored" }).catch(() => {}).finally(() => setBusy(false));
      } });
    } catch (err) { toast.error(err); }
    finally { setBusy(false); }
  };
  const rowActions = (course: typeof shown[number]) => <LearningLibraryActions row={course} disabled={busy}
    previewHref={course.published ? `/learn/courses/${course.id}` : undefined} onArchive={() => void archive(course)} />;
  return (
    <CacheState confirmed={coursesQuery.confirmed}>
      {!embedded && <header className="ws-page-header">
        {embedded ? (
          <p className="ws-page-subtitle">{t.subtitle}</p>
        ) : (
          <div>
            <h1 className="ws-page-title">{t.title}</h1>
            <p className="ws-page-subtitle">{t.subtitle}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Link className="ws-btn ws-btn--ghost" href="/learn">
            {t.explore}
          </Link>
          {/* In the Library, its New menu is the only place to create; this page keeps its own button when used alone. */}
          {!embedded && (
            <button
              type="button"
              className="ws-btn ws-btn--primary"
              onClick={() => void newCourse()}
              disabled={busy}
            >
              <Plus size={16} aria-hidden /> {busy ? t.creating : t.new}
            </button>
          )}
        </div>
      </header>}
      {embedded && shown.length === 0 && (
        <div className="ws-empty ws-page">
          <span className="ws-empty__art">
            <Plus size={24} />
          </span>
          <h2 className="text-xl font-semibold">
            {filtered ? locale === "ar" ? "لا نتائج" : "Nothing matches" : locale === "ar" ? "أنشئ دورتك الأولى" : "Create your first course"}
          </h2>
          <p className="text-muted-foreground max-w-sm">
            {filtered ? locale === "ar" ? "جرّب اسماً آخر أو امسح البحث والتصفية." : "Try another name, or clear the search and filter." : locale === "ar"
              ? "ابدأ بدورة جديدة وأضف دروسك بالترتيب."
              : "Start a new course and add your lessons in order."}
          </p>
          <button
            type="button"
            className="ws-btn ws-btn--primary mt-3"
            disabled={busy}
            onClick={() => void newCourse()}
          >
            <Plus size={16} aria-hidden />
            {busy ? t.creating : t.new}
          </button>
        </div>
      )}
      {(shown.length > 0 || !embedded) && (view === "list" ? <LearningLibraryTable rows={shown} renderActions={rowActions} countLabel={locale === "ar" ? "الدروس" : "Lessons"} {...filters} /> : <div className="cx-grid">
        {!embedded && (
          <button
            type="button"
            className="cx-new"
            onClick={() => void newCourse()}
            disabled={busy}
          >
            <Plus size={24} aria-hidden />
            <span>{t.new}</span>
          </button>
        )}
        {shown.map((c) => (
          <article key={c.id} className="cx-card relative">
            <Link href={`/dashboard/courses/${c.id}`} className="contents" {...hrefIntentHandlers(`/dashboard/courses/${c.id}`)}>
            <div className="cx-cover" style={coverStyle(c.id, c.coverUrl)}>
              <span className="cx-cover__badge">
                {!c.published
                  ? t.draft
                  : c.visibility === "public"
                    ? t.live
                    : t.privateLive}
              </span>
            </div>
            <div className="cx-body">
              <span className="cx-title" dir="auto">{c.title}</span>
              <span className="cx-meta">{t.lessons(c.lessons)} · {timeAgo(locale, c.updatedAt)}</span>
            </div>
            </Link>
            <div className="absolute top-2 end-2 rounded-md bg-white/90 text-[#37352f]" onClick={event => event.stopPropagation()}>{rowActions(c)}</div>
          </article>
        ))}
      </div>)}
    </CacheState>
  );
}
