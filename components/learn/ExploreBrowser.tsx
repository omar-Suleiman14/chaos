"use client";
import Link from "@/components/site/SiteLink";
import { Suspense, useState, useEffect } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, GraduationCap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useLearnViewer } from "@/lib/learn/data";
import { useLocale } from "@/lib/i18n";
import { coverStyle, courseCopy } from "@/components/courses/shared";
import { CourseOrLessonIcon } from "./icons";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { Select } from "@/components/workspace/Select";
import "@/components/courses/courses.css";
function Explore() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const params = useSearchParams();
  const router = useRouter();
  const viewer = useLearnViewer();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(search);
  const [language, setLanguage] = useState(params.get("language") ?? "");
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const sort = query ? "relevant" : "recent";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = useMutation(api.courses.create);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (language) next.set("language", language);
    if (topic) next.set("topic", topic);
    next.set("sort", sort);
    window.history.replaceState(
      null,
      "",
      location.pathname + "?" + next.toString(),
    );
  }, [query, language, topic, sort]);
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseDirectory.browse,
    {
      text: query || undefined,
      language: language || undefined,
      topic: topic || undefined,
      sort,
    },
    { initialNumItems: 24 },
  );
  const [settledResults, setSettledResults] = useState<typeof results>([]);
  useEffect(() => {
    if (status !== "LoadingFirstPage") {
      setSettledResults((previous) =>
        JSON.stringify(previous) === JSON.stringify(results)
          ? previous
          : results,
      );
    }
  }, [results, status]);
  const visibleResults =
    status === "LoadingFirstPage" ? settledResults : results;
  const tags = [...new Set(visibleResults.flatMap((c) => c.tags))].slice(0, 30);
  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div>
          <h1 className="ws-page-title">Chaos Learn</h1>
          <p className="lx-help">
            {ar
              ? "دورات مجانية تضم الدروس والتدريب في مكان واحد. ابدأ دون تسجيل الدخول."
              : "Free courses, with lessons and practice in one place. Start without signing in."}
          </p>
        </div>
        {viewer?.signedIn && (
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const id = await create({ language: locale });
                router.push("/dashboard/courses/" + id);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus size={16} />
            {ar ? "إنشاء دورة" : "Create course"}
          </button>
        )}
        <Link href="/card" className="ws-btn ws-btn--ghost">{ar ? "تعرّف على المؤلفين" : "Discover authors"}</Link>
      </header>
      {error && (
        <p role="alert" className="lx-error">
          {error}
        </p>
      )}
      <search
        className="lx-form"
        aria-label={ar ? "البحث عن الدورات" : "Search courses"}
      >
        <div className="lx-toolbar">
          <label className="ws-search" style={{ flex: 1, minWidth: 200 }}>
            <Search size={16} />
            <input
              type="search"
              value={search}
              maxLength={200}
              placeholder={
                ar
                  ? "ابحث بالموضوع أو الدورة أو المؤلف…"
                  : "Search topics, courses or authors…"
              }
              aria-label={ar ? "البحث عن الدورات" : "Search courses"}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </label>
          <Select
            label={ar ? "اللغة" : "Language"}
            value={language}
            onChange={setLanguage}
            options={[
              { value: "", label: ar ? "أي لغة" : "Any language" },
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
          <Select
            label={ar ? "الترتيب" : "Sort"}
            value={sort}
            onChange={() => {}}
            options={
              query
                ? [
                    {
                      value: "relevant",
                      label: ar ? "الأكثر صلة" : "Most relevant",
                    },
                  ]
                : [{ value: "recent", label: ar ? "الأحدث" : "Newest" }]
            }
          />
        </div>
        {tags.length > 0 && (
          <div className="lx-chips">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="lx-chip"
                aria-pressed={topic === tag}
                onClick={() => setTopic(topic === tag ? "" : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        {(query || topic || language) && (
          <button
            type="button"
            className="lx-link"
            onClick={() => {
              setSearch("");
              setTopic("");
              setLanguage("");
            }}
          >
            {" "}
            {ar ? "مسح الفلاتر" : "Clear filters"}
          </button>
        )}
      </search>
      <section
        className="lx-section"
        aria-label={ar ? "الدورات" : "Courses"}
        aria-busy={status === "LoadingFirstPage"}
      >
        <div
          className="lx-muted"
          role="status"
          aria-live="polite"
          style={{ minHeight: 24 }}
        >
          {status === "LoadingFirstPage"
            ? ar
              ? "جارٍ البحث…"
              : "Finding courses…"
            : ""}
        </div>
        <>
          {!results.length && status === "Exhausted" && (
            <div className="lx-empty">
              <GraduationCap size={26} />
              <h2>{ar ? "لا توجد دورات مطابقة" : "No matching courses"}</h2>
              <p>
                {ar
                  ? "جرّب بحثًا آخر أو امسح الفلاتر."
                  : "Try another search or clear your filters."}
              </p>
            </div>
          )}
          <div className="lx-grid">
            {visibleResults.map((course) => (
              <Link
                key={course.id}
                href={"/learn/courses/" + course.id}
                className="cx-card"
              >
                <div
                  className="cx-cover"
                  style={coverStyle(course.id, course.coverUrl)}
                >
                  <span className="cx-cover__badge">
                    {ar ? "دورة" : "Course"}
                  </span>
                  {course.icon && (
                    <span className="cx-card__icon">
                      <CourseOrLessonIcon icon={course.icon} size={24} />
                    </span>
                  )}
                </div>
                <div className="cx-body">
                  <span className="cx-title">{course.title}</span>
                  <span className="cx-meta line-clamp-2">
                    {course.description}
                  </span>
                  <span className="cx-meta">
                    {courseCopy[locale].lessons(course.lessons)} ·{" "}
                    {course.ownerName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <button
              type="button"
              className="ws-btn"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(24)}
            >
              {ar ? "عرض المزيد" : "Load more courses"}
            </button>
          )}
        </>
      </section>
    </div>
  );
}
export default function ExploreBrowser() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading courses…" />}>
      <Explore />
    </Suspense>
  );
}
