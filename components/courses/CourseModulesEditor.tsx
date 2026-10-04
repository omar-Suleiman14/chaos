"use client";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import QuizBlockEditor from "@/components/learn/editor/QuizBlockEditor";
import Link from "@/components/site/SiteLink";
type Asset = { kind: "form" | "quiz"; id: string };
export type CourseModule = { id: string; title: string; lessonIds: Id<"lessons">[]; assessments: Asset[] };
export default function CourseModulesEditor({ courseId, modules, lessons }: { courseId: Id<"learnCollections">; modules: CourseModule[]; lessons: { id: Id<"lessons">; title: string }[] }) {
  const { locale } = useLocale(), ar = locale === "ar", save = useMutation(api.courses.setModules);
  const [draft, setDraft] = useState(modules), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => setDraft(modules), [modules]);
  const commit = async (next: CourseModule[]) => { setDraft(next); setBusy(true); setError(""); try { await save({ courseId, modules: next }); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } };
  return <section className="cb-section cb-modules" aria-label={ar ? "الوحدات" : "Modules"}>
    <div className="lx-panel__row"><h2>{ar ? "الوحدات" : "Modules"}</h2><button type="button" className="ws-btn ws-btn--sm" disabled={busy || draft.length >= 30} onClick={() => void commit([...draft, { id: crypto.randomUUID(), title: ar ? `الوحدة ${draft.length + 1}` : `Module ${draft.length + 1}`, lessonIds: [], assessments: [] }])}>{ar ? "أضف وحدة" : "Add module"}</button></div>
    {error && <p role="alert" className="ws-error">{error}</p>}
    {draft.map((module, index) => <div className="lx-panel" key={module.id}>
      <label>{ar ? "عنوان الوحدة" : "Module title"}<input dir="auto" maxLength={200} className="kb-input" value={module.title} disabled={busy} onChange={e => setDraft(rows => rows.map(m => m.id === module.id ? { ...m, title: e.target.value } : m))} onBlur={() => void commit(draft)} /></label>
      <div className="lx-actions"><button type="button" className="ws-btn ws-btn--sm" disabled={busy || index === 0} onClick={() => { const next = [...draft]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void commit(next); }}>{ar ? "لأعلى" : "Move up"}</button><button type="button" className="ws-btn ws-btn--sm" disabled={busy || index === draft.length - 1} onClick={() => { const next = [...draft]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void commit(next); }}>{ar ? "لأسفل" : "Move down"}</button><button type="button" className="lx-link" disabled={busy} onClick={() => void commit(draft.filter(m => m.id !== module.id))}>{ar ? "احذف الوحدة (مع إبقاء الدروس)" : "Remove module (keep lessons)"}</button></div>
      <ul>{module.lessonIds.map(id => <li key={id} dir="auto">{lessons.find(l => l.id === id)?.title}</li>)}</ul>
      {module.assessments.map((asset, i) => <div className="lx-actions" key={`${asset.kind}:${asset.id}`}><Link className="lx-link" href={asset.kind === "form" ? `/dashboard/forms/${asset.id}` : `/dashboard/editor?id=${asset.id}`}>{ar ? `عدّل اختبار الوحدة ${i + 1}` : `Edit module assessment ${i + 1}`}</Link><button type="button" className="lx-link" disabled={busy} onClick={() => void commit(draft.map(m => m.id === module.id ? { ...m, assessments: m.assessments.filter(a => a.id !== asset.id || a.kind !== asset.kind) } : m))}>{ar ? "احذف الاختبار من الوحدة" : "Remove assessment"}</button></div>)}
      <details><summary>{ar ? "أضف اختبارًا للوحدة" : "Add module assessment"}</summary><AssessmentPicker disabled={busy} onAdd={asset => { if (!module.assessments.some(a => a.kind === asset.kind && a.id === asset.id)) void commit(draft.map(m => m.id === module.id ? { ...m, assessments: [...m.assessments, asset] } : m)); }} /></details>
    </div>)}
    {draft.length > 0 && <div className="cb-module-assignments">{lessons.map(lesson => <label key={lesson.id}><span dir="auto">{lesson.title}</span><select className="kb-input" disabled={busy} value={draft.find(m => m.lessonIds.includes(lesson.id))?.id ?? ""} onChange={e => void commit(draft.map(m => ({ ...m, lessonIds: [...m.lessonIds.filter(id => id !== lesson.id), ...(m.id === e.target.value ? [lesson.id] : [])] })))}><option value="">{ar ? "خارج الوحدات" : "Outside modules"}</option>{draft.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>)}</div>}
  </section>;
}
function AssessmentPicker({ onAdd, disabled }: { onAdd: (asset: Asset) => void; disabled: boolean }) {
  const [kind, setKind] = useState<Asset["kind"]>("form");
  return <fieldset disabled={disabled}><QuizBlockEditor kind={kind} assetId="" onSelect={asset => { setKind(asset.kind); if (asset.id) onAdd(asset); }} /></fieldset>;
}
