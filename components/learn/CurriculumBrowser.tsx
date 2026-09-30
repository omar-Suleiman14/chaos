"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookmarkMinus, BookmarkPlus, Building2, CalendarRange, ChevronRight, GraduationCap, History, Layers3, Library, Plus, School } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { isListed, useCurriculumNodes, useLearnActions, useLearnCapabilities, useLearnViewer, useMyCourses, useMyLessons, useProgress, usePublicLessons } from "@/lib/learn/data";
import { ancestors } from "@/lib/learn/search";
import { CURRICULUM_LEVELS, type CurriculumKind, type CurriculumNode } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    levels: { university: "Universities", program: "Programs", version: "Syllabus versions", year: "Years", semester: "Semesters", module: "Modules" } as Record<CurriculumKind, string>,
    one: { university: "University", program: "Program", version: "Syllabus version", year: "Year", semester: "Semester", module: "Module" } as Record<CurriculumKind, string>,
    placeholder: { university: "e.g. Cairo University", program: "e.g. Medicine (MBBCh)", version: "e.g. 2026", year: "e.g. Year 4", semester: "e.g. Semester 1", module: "e.g. GIT" } as Record<CurriculumKind, string>,
    all: "All universities", add: (k: string) => `Add ${k.toLowerCase()}`, save: "Add", cancel: "Cancel", code: "Code (optional)",
    current: "Current syllabus", older: "Older syllabus", makeCurrent: "Mark as current", versionsLead: "Syllabi change over time. Pick the one you are studying so old and new material don’t mix.",
    olderWarning: (v: string) => `You are viewing the ${v} syllabus, which is not the current one.`, switchTo: (v: string) => `Switch to ${v}`,
    follow: "Add to My courses", following: "In My courses", unfollow: "Remove from My courses",
    lessons: "Lessons for this module", noLessons: "No lessons are mapped to this module yet.", yourDrafts: "Your lessons mapped here",
    empty: (k: string) => `No ${k.toLowerCase()} yet.`, localDir: "The shared course directory isn’t connected yet. Add your own university, program and modules to organise your study; they stay on this device.",
    count: (n: number) => `${n} lessons`,
  },
  ar: {
    levels: { university: "الجامعات", program: "البرامج", version: "إصدارات المنهج", year: "السنوات", semester: "الفصول", module: "الوحدات" } as Record<CurriculumKind, string>,
    one: { university: "جامعة", program: "برنامج", version: "إصدار منهج", year: "سنة", semester: "فصل", module: "وحدة" } as Record<CurriculumKind, string>,
    placeholder: { university: "مثل: جامعة القاهرة", program: "مثل: الطب", version: "مثل: 2026", year: "مثل: السنة الرابعة", semester: "مثل: الفصل الأول", module: "مثل: الجهاز الهضمي" } as Record<CurriculumKind, string>,
    all: "كل الجامعات", add: (k: string) => `أضف ${k}`, save: "أضف", cancel: "إلغاء", code: "الرمز (اختياري)",
    current: "المنهج الحالي", older: "منهج أقدم", makeCurrent: "اجعله الحالي", versionsLead: "تتغير المناهج مع الوقت. اختر الذي تدرسه حتى لا تختلط المواد القديمة والجديدة.",
    olderWarning: (v: string) => `أنت تتصفح منهج ${v}، وهو ليس المنهج الحالي.`, switchTo: (v: string) => `انتقل إلى ${v}`,
    follow: "أضف إلى مقرراتي", following: "في مقرراتي", unfollow: "أزل من مقرراتي",
    lessons: "دروس هذه الوحدة", noLessons: "لا دروس مرتبطة بهذه الوحدة بعد.", yourDrafts: "دروسك المرتبطة هنا",
    empty: (k: string) => `لا ${k} بعد.`, localDir: "دليل المقررات المشترك غير متصل بعد. أضف جامعتك وبرنامجك ووحداتك لتنظيم مذاكرتك؛ تبقى على هذا الجهاز.",
    count: (n: number) => `${n} درس`,
  },
};

const icons: Record<CurriculumKind, typeof School> = { university: Building2, program: School, version: History, year: CalendarRange, semester: Layers3, module: GraduationCap };
const childKind = (kind?: CurriculumKind): CurriculumKind | undefined => kind ? CURRICULUM_LEVELS[CURRICULUM_LEVELS.indexOf(kind) + 1] : "university";

export function Breadcrumbs({ trail, rootLabel }: { trail: CurriculumNode[]; rootLabel: string }) {
  return (
    <nav className="lx-crumbs" aria-label="Breadcrumb">
      <Link href="/dashboard/learn/courses/browse">{rootLabel}</Link>
      {trail.map((n, i) => (
        <span key={n.id} style={{ display: "contents" }}>
          <ChevronRight size={13} aria-hidden className="lx-flip" />
          {i === trail.length - 1 ? <span aria-current="page">{n.name}</span> : <Link href={`/dashboard/learn/courses/browse?node=${n.id}`}>{n.name}</Link>}
        </span>
      ))}
    </nav>
  );
}

export default function CurriculumBrowser({ nodeId }: { nodeId?: string }) {
  const t = useCopy(copy);
  const nodes = useCurriculumNodes();
  const caps = useLearnCapabilities();
  const viewer = useLearnViewer();
  const actions = useLearnActions();
  const courses = useMyCourses() ?? [];
  const progress = useProgress() ?? {};
  const mine = useMyLessons() ?? [];
  const publicLessons = usePublicLessons(nodeId ? { moduleId: nodeId } : {});
  const allPublic = usePublicLessons({});
  const [adding, setAdding] = useState<{ name: string; code: string } | null>(null);
  const [error, setError] = useState("");
  const byId = useMemo(() => Object.fromEntries((nodes ?? []).map((n) => [n.id, n])), [nodes]);
  if (!nodes) return null;

  const node = nodeId ? byId[nodeId] : undefined;
  const trail = node ? ancestors(byId, node.id).reverse() : [];
  const kind = childKind(node?.kind);
  const children = nodes.filter((n) => (node ? n.parentId === node.id : n.kind === "university"));
  const version = trail.find((n) => n.kind === "version");
  const siblingsOfVersion = version ? nodes.filter((n) => n.kind === "version" && n.parentId === version.parentId) : [];
  const currentVersion = siblingsOfVersion.find((v) => v.current);
  const onOldVersion = version && currentVersion && currentVersion.id !== version.id;
  const canBuild = !caps.curriculumDirectory && !!viewer?.signedIn;

  // The same module in another syllabus version: matched by name, since versions are separate trees.
  const equivalentIn = (target: CurriculumNode) => {
    if (!node || !version) return target.id;
    const path = trail.slice(trail.indexOf(version) + 1).map((n) => n.name);
    let at: CurriculumNode | undefined = target;
    for (const name of path) { at = nodes.find((n) => n.parentId === at?.id && n.name === name); if (!at) return target.id; }
    return at.id;
  };

  const add = () => {
    if (!adding?.name.trim() || !kind) return;
    try {
      actions.addCurriculumNode({ kind, name: adding.name, parentId: node?.id, code: adding.code.trim() || undefined, current: kind === "version" && !children.some((c) => c.current) ? true : undefined, order: children.length });
      setAdding(null); setError("");
    } catch (err) { setError(errorMessage(err)); }
  };

  const followed = node?.kind === "module" && courses.some((c) => c.moduleId === node.id);
  const moduleLessons = node?.kind === "module" ? (publicLessons ?? []).filter(isListed) : [];
  const myMapped = node?.kind === "module" ? mine.filter((l) => l.draft.meta.curricula.some((c) => c.moduleId === node.id)) : [];

  return (
    <div className="lx-page">
      <Breadcrumbs trail={trail} rootLabel={t.all} />
      {node && (
        <header className="lx-hero">
          <div>
            <h1 className="ws-page-title">{node.name}{node.code ? <span className="lx-muted" style={{ fontSize: 16, fontWeight: 500 }}> · {node.code}</span> : null}</h1>
            <p className="lx-muted">{t.one[node.kind]}{version ? ` · ${version.name}` : ""}</p>
          </div>
          {node.kind === "module" && version && viewer?.signedIn && (
            <div className="lx-actions">
              <button type="button" className={`ws-btn ${followed ? "" : "ws-btn--primary"}`} aria-pressed={followed} onClick={() => (followed ? actions.unfollowCourse(node.id) : actions.followCourse(node.id, version.id))}>
                {followed ? <BookmarkMinus size={16} aria-hidden /> : <BookmarkPlus size={16} aria-hidden />}{followed ? t.unfollow : t.follow}
              </button>
            </div>
          )}
        </header>
      )}

      {siblingsOfVersion.length > 1 && version && (
        <div className="lx-version-switch" role="group" aria-label={t.levels.version}>
          <History size={15} aria-hidden />
          {siblingsOfVersion.map((v) => (
            <Link key={v.id} className="lx-chip" aria-current={v.id === version.id ? "true" : undefined} data-on={v.id === version.id} href={`/dashboard/learn/courses/browse?node=${node?.id === version.id ? v.id : equivalentIn(v)}`}>
              {v.name}{v.current ? ` · ${t.current}` : ""}
            </Link>
          ))}
        </div>
      )}
      {onOldVersion && <p className="lx-notice" data-tone="warn" role="status">{t.olderWarning(version.name)} <Link className="lx-link" href={`/dashboard/learn/courses/browse?node=${equivalentIn(currentVersion)}`}>{t.switchTo(currentVersion.name)}</Link></p>}
      {node?.kind === "program" && <p className="lx-help">{t.versionsLead}</p>}

      {canBuild && !node && <p className="lx-notice" data-tone="info">{t.localDir}</p>}

      {kind && (
        <section className="lx-section" aria-labelledby="level-title">
          <header><h2 id="level-title">{t.levels[kind]}</h2>{canBuild && !adding && <button type="button" className="ws-btn ws-btn--sm" onClick={() => setAdding({ name: "", code: "" })}><Plus size={14} aria-hidden />{t.add(t.one[kind])}</button>}</header>
          {adding && (
            <form className="lx-toolbar" onSubmit={(e) => { e.preventDefault(); add(); }}>
              { }
              <input autoFocus className="lx-input" value={adding.name} placeholder={t.placeholder[kind]} aria-label={t.one[kind]} maxLength={160} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
              {kind === "module" && <input className="lx-input" style={{ maxWidth: 160 }} value={adding.code} placeholder={t.code} aria-label={t.code} maxLength={24} onChange={(e) => setAdding({ ...adding, code: e.target.value })} />}
              <button type="submit" className="ws-btn ws-btn--primary" disabled={!adding.name.trim()}>{t.save}</button>
              <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setAdding(null)}>{t.cancel}</button>
            </form>
          )}
          {error && <p className="lx-error" role="alert">{error}</p>}
          {children.length ? (
            <div className="lx-level-grid">
              {children.map((c) => {
                const Icon = icons[c.kind];
                const lessonCount = c.kind === "module" ? (allPublic ?? []).filter((l) => (l.published ?? l.draft).meta.curricula.some((r) => r.moduleId === c.id)).length : 0;
                return (
                  <div key={c.id} style={{ display: "grid", gap: 4 }}>
                    <Link className="lx-node" href={`/dashboard/learn/courses/browse?node=${c.id}`}>
                      <Icon size={18} aria-hidden />
                      <span>{c.name}{c.code ? ` · ${c.code}` : ""}{c.kind === "version" && <small>{c.current ? t.current : t.older}</small>}{c.kind === "module" && lessonCount > 0 && <small>{t.count(lessonCount)}</small>}</span>
                      <ChevronRight size={15} aria-hidden className="lx-flip" style={{ marginInlineStart: "auto" }} />
                    </Link>
                    {c.kind === "version" && !c.current && canBuild && <button type="button" className="lx-link" style={{ justifySelf: "start" }} onClick={() => actions.setCurrentVersion(c.id)}>{t.makeCurrent}</button>}
                  </div>
                );
              })}
            </div>
          ) : !adding && <EmptyState icon={Library} title={t.empty(t.levels[kind])} />}
        </section>
      )}

      {node?.kind === "module" && (
        <>
          <section className="lx-section" aria-labelledby="module-lessons">
            <header><h2 id="module-lessons">{t.lessons}</h2></header>
            {moduleLessons.length ? <div className="lx-grid">{moduleLessons.map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} progress={progress[l.id]} currentVersionIds={new Set(currentVersion ? [currentVersion.id] : [])} />)}</div> : <p className="lx-muted">{t.noLessons}</p>}
          </section>
          {myMapped.length > 0 && (
            <section className="lx-section" aria-labelledby="module-mine">
              <header><h2 id="module-mine">{t.yourDrafts}</h2></header>
              <div className="lx-grid">{myMapped.map((l) => <LessonCard key={l.id} lesson={l} href={`/dashboard/learn/lessons/${l.id}`} showStatus />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
