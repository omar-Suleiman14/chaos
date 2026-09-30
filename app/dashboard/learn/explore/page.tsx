"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { Compass, FolderOpen, Search, X } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { isListed, useCurriculumNodes, useProgress, usePublicCollections, usePublicLessons } from "@/lib/learn/data";
import type { SearchFilters } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    title: "Explore", lead: "Public lessons from the Chaos community. Check sources for anything you rely on.",
    search: "Search lessons", searchPh: "Search by topic, module, author…", clear: "Clear filters",
    university: "University", module: "Module", version: "Syllabus", creator: "Author", language: "Language", topic: "Topic", sort: "Sort", any: "Any",
    sorts: { relevant: "Most relevant", recent: "Newest", helpful: "Most helpful" }, langs: { en: "English", ar: "العربية" } as Record<string, string>,
    results: (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`, empty: "No lessons match", emptyBody: "Try fewer filters or other words.",
    none: "Nothing published yet", noneBody: "Public lessons appear here once authors publish them.",
    collections: "Collections", lessonsIn: (n: number) => `${n} items`, loading: "Loading lessons…", current: "current", old: "older",
  },
  ar: {
    title: "استكشف", lead: "دروس عامة من مجتمع Chaos. تحقّق من المصادر فيما تعتمد عليه.",
    search: "ابحث في الدروس", searchPh: "ابحث بالموضوع أو الوحدة أو الكاتب…", clear: "امسح عوامل التصفية",
    university: "الجامعة", module: "الوحدة", version: "المنهج", creator: "الكاتب", language: "اللغة", topic: "الموضوع", sort: "الترتيب", any: "الكل",
    sorts: { relevant: "الأكثر صلة", recent: "الأحدث", helpful: "الأكثر فائدة" }, langs: { en: "English", ar: "العربية" } as Record<string, string>,
    results: (n: number) => `${n} درس`, empty: "لا دروس مطابقة", emptyBody: "جرّب عوامل تصفية أقل أو كلمات أخرى.",
    none: "لم يُنشر شيء بعد", noneBody: "تظهر الدروس العامة هنا عندما ينشرها كتّابها.",
    collections: "المجموعات", lessonsIn: (n: number) => `${n} عنصر`, loading: "جارٍ تحميل الدروس…", current: "الحالي", old: "أقدم",
  },
};

const KEYS = ["q", "topic", "universityId", "moduleId", "versionId", "creatorId", "language", "sort"] as const;

function Explore() {
  const t = useCopy(copy);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined]).filter(([, v]) => v)) as SearchFilters, [params]);
  const set = (patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const results = usePublicLessons(filters);
  const everything = usePublicLessons({});
  const nodes = useCurriculumNodes();
  const progress = useProgress();
  const collections = usePublicCollections();
  const currentVersions = useMemo(() => new Set((nodes ?? []).filter((n) => n.kind === "version" && n.current).map((n) => n.id)), [nodes]);

  if (!results || !everything || !nodes || !progress) return <PageSkeleton label={t.loading} />;

  const universities = nodes.filter((n) => n.kind === "university");
  const modules = nodes.filter((n) => n.kind === "module");
  const versions = nodes.filter((n) => n.kind === "version");
  const tags = [...new Set(everything.flatMap((l) => (l.published ?? l.draft).meta.tags))].slice(0, 30);
  const creators = [...new Map(everything.map((l) => [l.ownerId, l.ownerName])).entries()];
  const active = KEYS.some((k) => k !== "sort" && filters[k]);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="lx-page">
      <header className="lx-hero"><div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div></header>
      <search className="lx-form" aria-label={t.search}>
        <div className="lx-toolbar">
          <label className="ws-search" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} aria-hidden />
            <input type="search" defaultValue={filters.q ?? ""} placeholder={t.searchPh} aria-label={t.search} onChange={(e) => set({ q: e.target.value.trim() || undefined })} />
          </label>
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

      <section className="lx-section" aria-live="polite">
        {everything.length === 0 ? <EmptyState icon={Compass} title={t.none} body={t.noneBody} />
          : results.length === 0 ? <EmptyState icon={Search} title={t.empty} body={t.emptyBody} />
          : (
            <>
              <p className="lx-muted">{t.results(results.length)}</p>
              <div className="lx-grid">{results.filter(isListed).map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} progress={progress[l.id]} currentVersionIds={currentVersions} />)}</div>
            </>
          )}
      </section>

      {!active && collections && collections.length > 0 && (
        <section className="lx-section" aria-labelledby="explore-collections">
          <header><h2 id="explore-collections">{t.collections}</h2></header>
          <div className="lx-grid">
            {collections.map((c) => (
              <article key={c.id} className="lx-card">
                <span className="lx-card__meta"><FolderOpen size={13} aria-hidden />{t.collections}</span>
                <h3><Link className="lx-card__link" href={`/learn/collections/${c.id}`}>{c.name}</Link></h3>
                {c.collection?.description && <p>{c.collection.description}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return <Suspense fallback={null}><Explore /></Suspense>;
}
