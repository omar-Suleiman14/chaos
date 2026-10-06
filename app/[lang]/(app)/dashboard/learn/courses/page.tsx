"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BookmarkMinus, GraduationCap, Search } from "lucide-react";
import { EmptyState } from "@/components/learn/ui";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useCurriculumNodes, useLearnActions, useMyCourses, usePublicLessons } from "@/lib/learn/data";
import { ancestors } from "@/lib/learn/search";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import { useConfirmed } from "@/lib/confirmedQuery";

const copy = {
  en: {
    title: "My courses", lead: "The modules you are studying, each tied to one syllabus version.", browse: "Browse courses",
    empty: "No courses yet", emptyBody: "Browse from your university to a module and add it here.", open: "Open", remove: "Remove",
    older: "Older syllabus", lessons: (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`, loading: "Loading courses…", missing: "This module is no longer in the directory.",
  },
  ar: {
    title: "مقرراتي", lead: "الوحدات التي تدرسها، وكل منها مرتبطة بإصدار منهج واحد.", browse: "تصفح المقررات",
    empty: "لا مقررات بعد", emptyBody: "تصفح من جامعتك إلى الوحدة وأضفها هنا.", open: "افتح", remove: "أزل",
    older: "منهج أقدم", lessons: (n: number) => `${n} درس`, loading: "جارٍ تحميل المقررات…", missing: "لم تعد هذه الوحدة في الدليل.",
  },
};

export default function MyCoursesPage() {
  const t = useCopy(copy);
  const courses = useMyCourses();
  const nodes = useCurriculumNodes();
  const lessons = useConfirmed("learn.publicLessons", usePublicLessons({})).data;
  const actions = useLearnActions();
  const [error, setError] = useState("");
  const byId = useMemo(() => Object.fromEntries((nodes ?? []).map((n) => [n.id, n])), [nodes]);
  if (!courses || !nodes || !lessons) return <PageSkeleton label={t.loading} />;
  const sorted = [...courses].sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
        <div className="lx-actions"><Link href="/dashboard/learn/courses/browse" className="ws-btn ws-btn--primary"><Search size={16} aria-hidden />{t.browse}</Link></div>
      </header>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {!sorted.length ? <EmptyState level={2} icon={GraduationCap} title={t.empty} body={t.emptyBody}><Link href="/dashboard/learn/courses/browse" className="ws-btn">{t.browse}</Link></EmptyState> : (
        <div className="lx-list">
          {sorted.map((c) => {
            const mod = byId[c.moduleId];
            const version = byId[c.versionId];
            const trail = mod ? ancestors(byId, mod.id).reverse() : [];
            const older = version && !version.current && Object.values(byId).some((n) => n.kind === "version" && n.parentId === version.parentId && n.current);
            const count = lessons.filter((l) => (l.published ?? l.draft).meta.curricula.some((r) => r.moduleId === c.moduleId)).length;
            return (
              <div key={c.moduleId} className="lx-row">
                <span className="lx-row__icon" data-kind="lesson" aria-hidden><GraduationCap size={16} /></span>
                <div className="lx-row__main">
                  <span className="lx-row__title">{mod ? `${mod.name}${mod.code ? ` · ${mod.code}` : ""}` : t.missing}</span>
                  <span className="lx-row__sub">{trail.slice(0, -1).map((n) => n.name).join(" › ")} · {t.lessons(count)}</span>
                </div>
                {older && <span className="lx-badge" data-tone="amber"><AlertTriangle size={12} aria-hidden />{t.older}</span>}
                {mod && <Link className="ws-btn ws-btn--sm" href={`/dashboard/learn/courses/browse?node=${mod.id}`} onClick={() => actions.openCourse(c.moduleId)}>{t.open}<ArrowRight size={14} aria-hidden className="lx-flip" /></Link>}
                <button type="button" className="ws-icon-button" aria-label={`${t.remove}: ${mod?.name ?? ""}`} onClick={async () => { setError(""); try { await actions.unfollowCourse(c.moduleId); } catch (err) { setError(errorMessage(err)); } }}><BookmarkMinus size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
