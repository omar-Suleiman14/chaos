"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import VersionBrowser, { compareItems, ItemSheet, type SheetItem } from "@/components/versions/VersionBrowser";

const copy = {
  en: {
    title: "Version history", draft: "Your draft", version: (n: string) => `Version ${n}`, lessons: (n: string) => `${n} lessons`,
    outcomes: "Outcomes", other: "Other lessons", untitled: "Untitled lesson",
    restore: "Restore to draft", restoreWarning: "The course's title, description, outcomes, modules and lesson order will be replaced by this version. Lessons deleted since are left out. Students keep the live course until you publish.",
    onlyOne: "Nothing published yet. Each time you publish the course, the version appears here.",
  },
  ar: {
    title: "سجل النسخ", draft: "مسودتك", version: (n: string) => `النسخة ${n}`, lessons: (n: string) => `${n} درس`,
    outcomes: "المخرجات", other: "دروس أخرى", untitled: "درس بلا عنوان",
    restore: "استعد إلى المسودة", restoreWarning: "سيُستبدل عنوان الدورة ووصفها ومخرجاتها ووحداتها وترتيب دروسها بهذه النسخة. تُستبعد الدروس المحذوفة منذئذ. يبقى الطلاب على الدورة المنشورة حتى تنشر.",
    onlyOne: "لم يُنشر شيء بعد. تظهر هنا نسخة كلما نشرت الدورة.",
  },
};

export type CourseShape = { title: string; description: string; outcomes: string[]; modules: { id: string; title: string; lessonIds: string[] }[]; lessons: { id: string; title: string }[] };
type Row = { id: string; title: string; level?: "group"; sig: string };

/** A course version as rows: outcomes, then each module with its lessons, then lessons outside modules. */
function rows(c: CourseShape, t: (typeof copy)["en"]): Row[] {
  const out: Row[] = [];
  if (c.outcomes.length) {
    out.push({ id: "outcomes", title: t.outcomes, level: "group", sig: "outcomes" });
    for (const o of c.outcomes) out.push({ id: `o:${o}`, title: o, sig: o });
  }
  const placed = new Set<string>();
  const lessonRow = (id: string, moduleId: string) => {
    const title = c.lessons.find((l) => l.id === id)?.title || t.untitled;
    placed.add(id);
    return { id, title, sig: JSON.stringify([title, moduleId]) };
  };
  for (const m of c.modules) {
    out.push({ id: `m:${m.id}`, title: m.title, level: "group", sig: m.title });
    for (const id of m.lessonIds) if (c.lessons.some((l) => l.id === id)) out.push(lessonRow(id, m.id));
  }
  const rest = c.lessons.filter((l) => !placed.has(l.id));
  if (rest.length && c.modules.length) out.push({ id: "other", title: t.other, level: "group", sig: "other" });
  for (const l of rest) out.push(lessonRow(l.id, ""));
  return out;
}

/** A course's version history in the shared version browser: the draft beside each published version. */
export default function CourseVersionHistory({ courseId, draft, draftAt, isOwner, onClose }: { courseId: Id<"learnCollections">; draft: CourseShape; draftAt: number; isOwner: boolean; onClose: () => void }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const versions = useQuery(api.courses.listVersions, { courseId });
  const restore = useMutation(api.courses.restoreVersion);
  const current = { key: "draft", number: undefined as number | undefined, name: draft.title || t.draft, at: draftAt, detail: t.lessons(fmt(draft.lessons.length)), shape: draft, rows: rows(draft, t) };
  const past = (versions ?? []).map((v) => ({ key: String(v.number), number: v.number as number | undefined, name: t.version(fmt(v.number)), at: v.publishedAt, detail: t.lessons(fmt(v.lessons.length)), shape: v as CourseShape, rows: rows(v, t) }));
  const diffOf = (a: Row[], b: Row[]) => compareItems(a, b, (r) => r.id, (r) => r.sig);
  return (
    <VersionBrowser label={t.title} status={versions === undefined ? "loading" : "ready"} current={current} currentLabel={t.draft} past={past} onlyOne={t.onlyOne} onClose={onClose}
      counts={(a, b) => diffOf(a.rows.filter((r) => !r.level), b.rows.filter((r) => !r.level)).counts}
      sheet={(v, { against, side }) => {
        const diff = against ? (side === "base" ? diffOf(v.rows, against.rows) : diffOf(against.rows, v.rows)) : null;
        const items: SheetItem[] = v.rows.map((r) => ({ id: r.id, title: r.title, level: r.level, change: diff && !r.level ? diff.change(r, side) : undefined }));
        return <ItemSheet meta={<><strong>{v.shape.title}</strong>{v.shape.description ? <><br />{v.shape.description}</> : null}</>} items={items} />;
      }}
      restore={isOwner ? { label: t.restore, warning: t.restoreWarning, run: (v) => (v.number === undefined ? undefined : restore({ courseId, number: v.number })) } : undefined} />
  );
}
