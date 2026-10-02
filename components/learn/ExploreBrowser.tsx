"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Compass, Search, X } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { courseCopy, coverStyle } from "@/components/courses/shared";
import "@/components/courses/courses.css";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { isListed, useCurriculumNodes, usePublicLessons } from "@/lib/learn/data";
import type { SearchFilters } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    title: "Chaos Learn", lead: "Explore free public courses and community lessons without signing in. Check sources for anything you rely on.",
    search: "Search courses and lessons", searchPh: "Search by topic, title, module, author…", clear: "Clear filters",
    show: "Show", kinds: { all: "All", courses: "Courses", lessons: "Lessons" }, course: "Course",
    count: (c: number, l: number) => [c ? `${c} ${c === 1 ? "course" : "courses"}` : "", l ? `${l} ${l === 1 ? "lesson" : "lessons"}` : ""].filter(Boolean).join(" · "),
    university: "University", module: "Module", version: "Syllabus", creator: "Author", language: "Language", topic: "Topic", sort: "Sort", any: "Any",
    sorts: { relevant: "Most relevant", recent: "Newest", helpful: "Most helpful" }, langs: { en: "English", ar: "العربية" } as Record<string, string>,
    empty: "Nothing matches", emptyBody: "Try fewer filters or other words.",
    none: "Nothing published yet", noneBody: "Public courses and lessons appear here once authors publish them.",
    resultsTitle: "Courses and lessons", collections: "Collections", lessonsIn: (n: number) => `${n} items`, loading: "Loading…", current: "current", old: "older",
  },
  ar: {
    title: "Chaos Learn", lead: "استكشف دورات عامة مجانية ودروس المجتمع دون تسجيل الدخول. تحقّق من المصادر فيما تعتمد عليه.",
    search: "ابحث في الدورات والدروس", searchPh: "ابحث بالموضوع أو العنوان أو الوحدة أو الكاتب…", clear: "امسح عوامل التصفية",
    show: "اعرض", kinds: { all: "الكل", courses: "الدورات", lessons: "الدروس" }, course: "دورة",
    count: (c: number, l: number) => [c ? `${c} ${c === 1 ? "دورة" : "دورات"}` : "", l ? `${l} درس` : ""].filter(Boolean).join(" · "),
    university: "الجامعة", module: "الوحدة", version: "المنهج", creator: "الكاتب", language: "اللغة", topic: "الموضوع", sort: "الترتيب", any: "الكل",
    sorts: { relevant: "الأكثر صلة", recent: "الأحدث", helpful: "الأكثر فائدة" }, langs: { en: "English", ar: "العربية" } as Record<string, string>,
    empty: "لا شيء مطابق", emptyBody: "جرّب عوامل تصفية أقل أو كلمات أخرى.",
    none: "لم يُنشر شيء بعد", noneBody: "تظهر الدورات والدروس العامة هنا عندما ينشرها كتّابها.",
    resultsTitle: "الدورات والدروس", collections: "المجموعات", lessonsIn: (n: number) => `${n} عنصر`, loading: "جارٍ التحميل…", current: "الحالي", old: "أقدم",
  },
};

const KEYS = ["q", "topic", "universityId", "moduleId", "versionId", "creatorId", "language", "sort"] as const;
type Kind = "all" | "courses" | "lessons";

function Explore() {
  const t = useCopy(copy);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined]).filter(([, v]) => v)) as SearchFilters, [params]);
  const set = (patch: Partial<Record<(typeof KEYS)[number] | "kind", string | undefined>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const c = useCopy(courseCopy);
  const kindParam = params.get("kind");
  const kind: Kind = kindParam === "courses" || kindParam === "lessons" ? kindParam : "all";
  const results = usePublicLessons(filters);
  const courses = useQuery(api.courses.listPublic, { limit: 60 });
  const everything = usePublicLessons({});
  const nodes = useCurriculumNodes();
  const currentVersions = useMemo(() => new Set((nodes ?? []).filter((n) => n.kind === "version" && n.current).map((n) => n.id)), [nodes]);

  if (!results || !everything || !nodes || courses === undefined) return <PageSkeleton label={t.loading} />;

  const universities = nodes.filter((n) => n.kind === "university");
  const modules = nodes.filter((n) => n.kind === "module");
  const versions = nodes.filter((n) => n.kind === "version");
  const tags = [...new Set(everything.flatMap((l) => (l.published ?? l.draft).meta.tags))].slice(0, 30);
  const creators = [...new Map(everything.map((l) => [l.ownerId, l.ownerName])).entries()];
  const active = KEYS.some((k) => k !== "sort" && filters[k]);
  // Courses match the search words and language; lesson-only filters (module, author, topic…) leave them out.
  const lessonOnly = !!(filters.topic || filters.universityId || filters.moduleId || filters.versionId || filters.creatorId);
  const words = (filters.q ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matchingCourses = kind === "lessons" || lessonOnly ? [] : courses.filter((course) => {
    if (filters.language && course.language !== filters.language) return false;
    const text = `${course.title} ${course.description} ${course.tags.join(" ")}`.toLocaleLowerCase();
    return words.every((w) => text.includes(w));
  });
  const listedLessons = kind === "courses" ? [] : results.filter(isListed);
  const nothingPublished = everything.length === 0 && courses.length === 0;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="lx-page">
      <header className="lx-hero"><div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div></header>
      <search id="lesson-search" className="lx-form" aria-label={t.search}>
        <div className="lx-toolbar">
          <label className="ws-search" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} aria-hidden />
            <input type="search" value={filters.q ?? ""} placeholder={t.searchPh} aria-label={t.search} onChange={(e) => set({ q: e.target.value.trim() || undefined })} />
          </label>
          <Select label={t.show} value={kind} onChange={(v) => set({ kind: v === "all" ? undefined : v })} options={(["all", "courses", "lessons"] as const).map((k) => ({ value: k, label: t.kinds[k] }))} />
          <Select label={t.sort} value={filters.sort ?? (filters.q ? "relevant" : "recent")} onChange={(v) => set({ sort: v === "relevant" ? undefined : v })} options={(["relevant", "recent", "helpful"] as const).map((s) => ({ value: s, label: t.sorts[s] }))} />
        </div>
        <div className="lx-form__row">
          {universities.length > 0 && <Select label={t.university} value={filters.universityId ?? ""} onChange={(v) => set({ universityId: v || undefined })} options={[{ value: "", label: `${t.university}: ${t.any}` }, ...universities.map((u) => ({ value: u.id, label: u.name }))]} />}
          {versions.length > 0 && <Select label={t.version} value={filters.versionId ?? ""} onChange={(v) => set({ versionId: v || undefined })} options={[{ value: "", label: `${t.version}: ${t.any}` }, ...versions.map((v) => ({ value: v.id, label: `${byId.get(v.parentId ?? "")?.name ?? ""} ${v.name}`, description: v.current ? t.current : t.old }))]} />}
          {modules.length > 0 && <Select label={t.module} value={filters.moduleId ?? ""} onChange={(v) => set({ moduleId: v || undefined })} options={[{ value: "", label: `${t.module}: ${t.any}` }, ...modules.map((m) => ({ value: m.id, label: m.code ? `${m.name} · ${m.code}` : m.name }))]} />}
          {creators.length > 1 && <Select label={t.creator} value={filters.creatorId ?? ""} onChange={(v) => set({ creatorId: v || undefined })} options={[{ value: "", label: `${t.creator}: ${t.any}` }, ...creators.map(([id, name]) => ({ value: id, label: name }))]} />}
          <Select label={t.language} value={filters.language ?? ""} onChange={(v) => set({ language: v || undefined })} options={[{ value: "", label: `${t.language}: ${t.any}` }, { value: "en", label: t.langs.en }, { value: "ar", label: t.langs.ar }]} />
        </div>
        {tags.length > 0 && (
          <div className="lx-chips" role="group" aria-label={t.topic}>
            {tags.map((tag) => <button key={tag} type="button" className="lx-chip" aria-pressed={filters.topic === tag} onClick={() => set({ topic: filters.topic === tag ? undefined : tag })}>#{tag}</button>)}
          </div>
        )}
        {active && <button type="button" className="lx-link" style={{ justifySelf: "start" }} onClick={() => router.replace(pathname)}><X size={13} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.clear}</button>}
      </search>

      <section id="course-directory" className="lx-section" aria-live="polite" aria-labelledby="explore-results">
        <h2 id="explore-results" className="sr-only">{t.resultsTitle}</h2>
        {nothingPublished ? <EmptyState icon={Compass} title={t.none} body={t.noneBody} />
          : matchingCourses.length + listedLessons.length === 0 ? <EmptyState icon={Search} title={t.empty} body={t.emptyBody} />
          : (
            <>
              <p className="lx-muted">{t.count(matchingCourses.length, listedLessons.length)}</p>
              {/* One list: courses first (they lead somewhere bigger), then lessons. */}
              <div className="lx-grid">
                {matchingCourses.map((course) => (
                  <Link key={course.id} href={`/learn/courses/${course.id}`} className="cx-card">
                    <div className="cx-cover" style={coverStyle(course.id, course.coverUrl)}><span className="cx-cover__badge">{t.course}</span></div>
                    <div className="cx-body"><span className="cx-title">{course.title}</span>{course.description && <span className="cx-meta line-clamp-2">{course.description}</span>}<span className="cx-meta">{c.lessons(course.lessons)}</span></div>
                  </Link>
                ))}
                {listedLessons.map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} currentVersionIds={currentVersions} />)}
              </div>
            </>
          )}
      </section>

    </div>
  );
}

export default function ExploreBrowser() {
  return <Suspense fallback={<PageSkeleton label="Loading lessons…" />}><Explore /></Suspense>;
}
