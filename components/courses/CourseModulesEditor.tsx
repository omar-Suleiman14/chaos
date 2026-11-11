"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FolderPlus, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import QuizBlockEditor from "@/components/learn/editor/QuizBlockEditor";
import { CourseNotionImport } from "@/components/connections/NotionImport";
import FallbackBoundary from "@/components/FallbackBoundary";
import { hrefIntentHandlers } from "@/lib/convexCache";
import { hostHref } from "@/lib/hosts";
type Asset = { kind: "form" | "quiz"; id: string };
export type CourseModule = { id: string; title: string; lessonIds: Id<"lessons">[]; assessments: Asset[]; collapsedByDefault?: boolean; sections?: { id: string; title: string; lessonIds: Id<"lessons">[]; collapsedByDefault?: boolean }[] };
type Lesson = { id: Id<"lessons">; title: string; published: boolean; changed: boolean; blocks: number };

const copy = {
  en: {
    lessons: "Lessons", add: "Add a lesson", empty: "No lessons yet. Add the first one.", addModule: "Group into modules", newModule: "Add module",
    moduleN: (n: number) => `Module ${n}`, moduleTitle: "Module title", ungrouped: "Not in a module", moveTo: "Module",
    up: "Move up", down: "Move down", remove: "Remove from course", removeModule: "Remove module (keeps its lessons)",
    unpublished: "Not published yet", changed: "Edited since publishing", live: "Published", blocks: (n: number) => `${n} ${n === 1 ? "block" : "blocks"}`,
    assessment: (n: number) => `Module quiz ${n}`, removeAssessment: "Remove", addAssessment: "Add a module quiz or form",
    newSection: "Add subsection", section: "Subsection", sectionN: (n: number) => `Section ${n}`, noSection: "No subsection", startCollapsed: "Start collapsed", removeSection: "Remove subsection (keeps lessons)",
  },
  ar: {
    lessons: "الدروس", add: "أضف درسًا", empty: "لا دروس بعد. أضف أول درس.", addModule: "قسّمها إلى وحدات", newModule: "أضف وحدة",
    moduleN: (n: number) => `الوحدة ${n}`, moduleTitle: "عنوان الوحدة", ungrouped: "خارج الوحدات", moveTo: "الوحدة",
    up: "انقل لأعلى", down: "انقل لأسفل", remove: "احذف من الدورة", removeModule: "احذف الوحدة (مع إبقاء دروسها)",
    unpublished: "لم يُنشر بعد", changed: "عُدّل بعد النشر", live: "منشور", blocks: (n: number) => `${n} ${n === 1 ? "كتلة" : "كتل"}`,
    assessment: (n: number) => `اختبار الوحدة ${n}`, removeAssessment: "احذف", addAssessment: "أضف اختبارًا أو نموذجًا للوحدة",
    newSection: "أضف قسمًا فرعيًا", section: "القسم الفرعي", sectionN: (n: number) => `القسم ${n}`, noSection: "بلا قسم فرعي", startCollapsed: "مغلق افتراضيًا", removeSection: "احذف القسم الفرعي (مع إبقاء الدروس)",
  },
};

/** One outline for the course: lessons in order, optionally grouped into modules. */
export default function CourseModulesEditor({ courseId, modules, lessons }: { courseId: Id<"learnCollections">; modules: CourseModule[]; lessons: Lesson[] }) {
  const t = useCopy(copy), router = useRouter();
  const saveModules = useMutation(api.courses.setModules), setOutline = useMutation(api.courses.setOutline), addLesson = useMutation(api.courses.addLesson);
  const [draft, setDraft] = useState(modules), [busy, setBusy] = useState(false);
  useEffect(() => setDraft(modules), [modules]);
  // Outline changes show at once; a failed save puts the server's order back and says why.
  const run = async (work: () => Promise<unknown>) => { setBusy(true); try { await work(); } catch (err) { setDraft(modules); toast.error(err); } finally { setBusy(false); } };
  const commit = (next: CourseModule[]) => { setDraft(next); return run(() => saveModules({ courseId, modules: next })); };

  const ids = lessons.map((l) => l.id);
  const moduleOf = (id: Id<"lessons">) => draft.find((m) => m.lessonIds.includes(id))?.id ?? "";
  // Learners see module lessons in module order, then ungrouped ones; the course order follows the same sequence.
  const groupOf = (moduleId: string) => moduleId ? (draft.find((m) => m.id === moduleId)?.lessonIds ?? []).filter((id) => ids.includes(id)) : ids.filter((id) => !moduleOf(id));
  const move = (id: Id<"lessons">, d: -1 | 1) => {
    const moduleId = moduleOf(id);
    const module = draft.find(m => m.id === moduleId);
    const section = module?.sections?.find(section => section.lessonIds.includes(id));
    const sectioned = new Set((module?.sections ?? []).flatMap(s => s.lessonIds));
    const group = section
      ? section.lessonIds.filter(item => ids.includes(item))
      : module ? module.lessonIds.filter(item => ids.includes(item) && !sectioned.has(item)) : groupOf("");
    const reordered = [...group], i = reordered.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= reordered.length) return;
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    // Reorder only the selected subsection's slots. Other subsections keep their order.
    const nextModules = draft.map(m => {
      if (m.id !== moduleId) return m;
      let index = 0;
      const slots = new Set(group);
      return {
        ...m,
        lessonIds: m.lessonIds.map(item => slots.has(item) ? reordered[index++] : item),
        sections: m.sections?.map(s => s.id === section?.id ? { ...s, lessonIds: reordered } : s),
      };
    });
    const ungrouped = moduleId ? groupOf("") : reordered;
    const nextIds = [...nextModules.flatMap(m => m.lessonIds.filter(id => ids.includes(id))), ...ungrouped];
    setDraft(nextModules);
    void run(async () => { if (moduleId) await saveModules({ courseId, modules: nextModules }); await setOutline({ courseId, lessonIds: nextIds }); });
  };
  const assign = (id: Id<"lessons">, moduleId: string) => commit(draft.map((m) => ({ ...m, lessonIds: [...m.lessonIds.filter((x) => x !== id), ...(m.id === moduleId ? [id] : [])], sections: m.sections?.map((section) => ({ ...section, lessonIds: section.lessonIds.filter((x) => x !== id) })) })));
  const add = (moduleId?: string) => run(async () => {
    const lessonId = await addLesson({ courseId });
    if (moduleId) await saveModules({ courseId, modules: draft.map((m) => m.id === moduleId ? { ...m, lessonIds: [...m.lessonIds, lessonId] } : m) });
    router.push(`/dashboard/learn/lessons/${lessonId}?course=${courseId}`);
  });
  const newModule = () => commit([...draft, { id: crypto.randomUUID(), title: t.moduleN(draft.length + 1), lessonIds: draft.length ? [] : ids, assessments: [], collapsedByDefault: false, sections: [] }]);
  const assignSection = (lessonId: Id<"lessons">, sectionId: string) => commit(draft.map((m) => ({ ...m, sections: m.sections?.map((section) => ({ ...section, lessonIds: [...section.lessonIds.filter(id => id !== lessonId), ...(m.lessonIds.includes(lessonId) && section.id === sectionId ? [lessonId] : [])] })) })));
  const swapModules = (i: number, j: number) => { const next = [...draft]; [next[i], next[j]] = [next[j], next[i]]; void commit(next); };

  // Numbers restart in every module (Anatomy 1–3, Physiology 1–2), as readers see them in CourseOutline.
  const row = (l: Lesson, n: number, group: Lesson[]) => (
    <li key={l.id} className="cb-lesson">
      <span className="cb-lesson__no">{n}</span>
      <div className="min-w-0">
        <Link dir="auto" className="cb-lesson__title truncate" href={hostHref(`/dashboard/learn/lessons/${l.id}?course=${courseId}`)} {...hrefIntentHandlers(`/dashboard/learn/lessons/${l.id}`)}>{l.title}</Link>
        <span className="cb-lesson__meta">{!l.published ? t.unpublished : l.changed ? t.changed : t.live} · {t.blocks(l.blocks)}</span>
      </div>
      <div className="cb-lesson__actions">
        {draft.find(m => m.id === moduleOf(l.id))?.sections?.length ? <Select label={t.section} disabled={busy} value={draft.find(m => m.id === moduleOf(l.id))?.sections?.find(section => section.lessonIds.includes(l.id))?.id ?? ""} onChange={next => void assignSection(l.id, next)} options={[...(draft.find(m => m.id === moduleOf(l.id))?.sections ?? []).map(section => ({ value: section.id, label: section.title })), { value: "", label: t.noSection }]} /> : null}
        {draft.length > 0 && <Select label={t.moveTo} disabled={busy} value={moduleOf(l.id)} onChange={(next) => void assign(l.id, next)} options={[...draft.map((m) => ({ value: m.id, label: m.title })), { value: "", label: t.ungrouped }]} />}
        <button type="button" className="ws-icon-button" aria-label={t.up} title={t.up} disabled={busy || group[0] === l} onClick={() => move(l.id, -1)}><ArrowUp size={16} aria-hidden /></button>
        <button type="button" className="ws-icon-button" aria-label={t.down} title={t.down} disabled={busy || group[group.length - 1] === l} onClick={() => move(l.id, 1)}><ArrowDown size={16} aria-hidden /></button>
        <button type="button" className="ws-icon-button" aria-label={t.remove} title={t.remove} disabled={busy} onClick={() => void run(() => setOutline({ courseId, lessonIds: ids.filter((x) => x !== l.id) }))}><Trash2 size={16} aria-hidden /></button>
      </div>
    </li>
  );
  const list = (group: Lesson[], order = group) => group.length > 0 && <ol className="cb-lessons mb-1">{group.map((l, i) => row(l, order.indexOf(l) + 1 || i + 1, group))}</ol>;
  const addButton = (moduleId?: string) => <>
    <button type="button" className="cb-add w-full" disabled={busy} onClick={() => void add(moduleId)}><Plus size={18} aria-hidden /> {t.add}</button>
    <FallbackBoundary fallback={null}><CourseNotionImport courseId={courseId} moduleId={moduleId} disabled={busy} /></FallbackBoundary>
  </>;

  const ungrouped = lessons.filter((l) => !moduleOf(l.id));
  return (
    <section className="cb-section" aria-labelledby="cb-lessons">
      <div className="cb-outline__head">
        <h2 id="cb-lessons">{t.lessons}</h2>
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={busy || draft.length >= 30} onClick={() => void newModule()}><FolderPlus size={15} aria-hidden /> {draft.length ? t.newModule : t.addModule}</button>
      </div>
      {lessons.length === 0 && !draft.length && <p className="cb-note mb-3">{t.empty}</p>}
      {draft.map((module, index) => {
        const group = module.lessonIds.map((id) => lessons.find((l) => l.id === id)).filter((l): l is Lesson => !!l);
        return (
          <div className="cb-module" key={module.id}>
            <div className="cb-module__head">
              <input dir="auto" aria-label={t.moduleTitle} maxLength={200} className="cb-module__title" value={module.title} disabled={busy}
                onChange={(e) => setDraft((rows) => rows.map((m) => m.id === module.id ? { ...m, title: e.target.value } : m))} onBlur={() => void commit(draft)} />
              <label className="cb-collapse-default"><input type="checkbox" checked={!!module.collapsedByDefault} disabled={busy} onChange={e => void commit(draft.map(m => m.id === module.id ? { ...m, collapsedByDefault: e.target.checked } : m))} />{t.startCollapsed}</label>
              <div className="cb-lesson__actions">
                <button type="button" className="ws-icon-button" aria-label={t.up} title={t.up} disabled={busy || index === 0} onClick={() => swapModules(index, index - 1)}><ArrowUp size={16} aria-hidden /></button>
                <button type="button" className="ws-icon-button" aria-label={t.down} title={t.down} disabled={busy || index === draft.length - 1} onClick={() => swapModules(index, index + 1)}><ArrowDown size={16} aria-hidden /></button>
                <button type="button" className="ws-icon-button" aria-label={t.removeModule} title={t.removeModule} disabled={busy} onClick={() => void commit(draft.filter((m) => m.id !== module.id))}><Trash2 size={16} aria-hidden /></button>
              </div>
            </div>
            <div className="cb-subsections">
              {(module.sections ?? []).map(section => {
                const sectionLessons = section.lessonIds.map(id => group.find(l => l.id === id)).filter((l): l is Lesson => !!l);
                return <section key={section.id} className="cb-subsection">
                  <div className="cb-module__head">
                    <input dir="auto" aria-label={t.section} className="cb-module__title" maxLength={200} value={section.title} disabled={busy}
                      onChange={e => setDraft(rows => rows.map(m => m.id === module.id ? { ...m, sections: m.sections?.map(s => s.id === section.id ? { ...s, title: e.target.value } : s) } : m))}
                      onBlur={() => void commit(draft)} />
                    <label className="cb-collapse-default"><input type="checkbox" checked={!!section.collapsedByDefault} disabled={busy} onChange={e => void commit(draft.map(m => m.id === module.id ? { ...m, sections: m.sections?.map(s => s.id === section.id ? { ...s, collapsedByDefault: e.target.checked } : s) } : m))} />{t.startCollapsed}</label>
                    <button type="button" className="ws-icon-button" disabled={busy} title={t.removeSection} aria-label={t.removeSection} onClick={() => void commit(draft.map(m => m.id === module.id ? { ...m, sections: m.sections?.filter(s => s.id !== section.id) } : m))}><Trash2 size={15} aria-hidden /></button>
                  </div>
                  {list(sectionLessons, group)}
                </section>;
              })}
              {list(group.filter(l => !(module.sections ?? []).some(s => s.lessonIds.includes(l.id))), group)}
              <button type="button" className="cb-add" disabled={busy || (module.sections?.length ?? 0) >= 30} onClick={() => void commit(draft.map(m => m.id === module.id ? { ...m, sections: [...(m.sections ?? []), { id: crypto.randomUUID(), title: t.sectionN((m.sections?.length ?? 0) + 1), lessonIds: [], collapsedByDefault: true }] } : m))}><Plus size={16} aria-hidden />{t.newSection}</button>
            </div>
            {addButton(module.id)}
            {module.assessments.map((asset, i) => <div className="lx-actions" key={`${asset.kind}:${asset.id}`}><Link className="lx-link" href={`/dashboard/forms/${asset.id}`}>{t.assessment(i + 1)}</Link><button type="button" className="lx-link" disabled={busy} onClick={() => void commit(draft.map((m) => m.id === module.id ? { ...m, assessments: m.assessments.filter((a) => a.id !== asset.id || a.kind !== asset.kind) } : m))}>{t.removeAssessment}</button></div>)}
            <details className="cb-module__quiz"><summary>{t.addAssessment}</summary><AssessmentPicker disabled={busy} onAdd={(asset) => { if (!module.assessments.some((a) => a.kind === asset.kind && a.id === asset.id)) void commit(draft.map((m) => m.id === module.id ? { ...m, assessments: [...m.assessments, asset] } : m)); }} /></details>
          </div>
        );
      })}
      {draft.length > 0 && ungrouped.length > 0 && <h3 className="cb-module__ungrouped">{t.ungrouped}</h3>}
      {list(ungrouped)}
      {!draft.length && addButton()}
    </section>
  );
}
function AssessmentPicker({ onAdd, disabled }: { onAdd: (asset: Asset) => void; disabled: boolean }) {
  return <fieldset disabled={disabled}><QuizBlockEditor assetId="" onSelect={asset => { if (asset.id) onAdd(asset); }} /></fieldset>;
}
