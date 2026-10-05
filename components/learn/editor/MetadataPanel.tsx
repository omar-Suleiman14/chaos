"use client";

import { useStableQueries } from "@/lib/stableQueries";
import { toast } from "@/lib/toast";
import { useMemo, useState } from "react";
import { GraduationCap, Tags, X } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import { usePaginatedQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { asBlocks, blockText, walk } from "@/lib/learn/doc";
import type { LessonMeta } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    details: "Details", appearance: "Attribution", tags: "Tags", tagsHelp: "Press Enter to add. Up to 12.", tagPh: "e.g. hepatology", removeTag: (t: string) => `Remove tag ${t}`,
    language: "Lesson language", languageHelp: "Sets reading direction and search language.", langs: { en: "English", ar: "العربية (Arabic)", other: "Other" },
    author: "Author name shown", authorHelp: "Leave empty to use your account name.", license: "Licence", licenses: { "": "Not specified", "CC BY 4.0": "CC BY 4.0 (others can reuse with credit)", "CC BY-SA 4.0": "CC BY-SA 4.0", "CC BY-NC 4.0": "CC BY-NC 4.0 (no commercial use)", "All rights reserved": "All rights reserved" } as Record<string, string>,
    curricula: "Courses this lesson applies to", curriculaHelp: "A lesson can apply to several courses without belonging to any one of them.",
    pickModule: "Add a course module", noCurricula: "No courses in the directory yet. Add them under Learn → My courses.", remove: "Remove",
    otherLang: "Language code (e.g. fr)",
  },
  ar: {
    details: "التفاصيل", appearance: "نسبة المحتوى", tags: "الوسوم", tagsHelp: "اضغط Enter للإضافة. حتى 12 وسمًا.", tagPh: "مثل: أمراض الكبد", removeTag: (t: string) => `أزل الوسم ${t}`,
    language: "لغة الدرس", languageHelp: "تحدد اتجاه القراءة ولغة البحث.", langs: { en: "English (الإنجليزية)", ar: "العربية", other: "لغة أخرى" },
    author: "اسم الكاتب الظاهر", authorHelp: "اتركه فارغًا لاستخدام اسم حسابك.", license: "الترخيص", licenses: { "": "غير محدد", "CC BY 4.0": "CC BY 4.0 (يمكن إعادة الاستخدام مع النسبة)", "CC BY-SA 4.0": "CC BY-SA 4.0", "CC BY-NC 4.0": "CC BY-NC 4.0 (دون استخدام تجاري)", "All rights reserved": "جميع الحقوق محفوظة" } as Record<string, string>,
    curricula: "المقررات التي ينطبق عليها الدرس", curriculaHelp: "يمكن أن ينطبق الدرس على عدة مقررات دون أن ينتمي إلى أحدها.",
    pickModule: "أضف وحدة مقرر", noCurricula: "لا مقررات في الدليل بعد. أضفها من Learn ← مقرراتي.", remove: "إزالة",
    otherLang: "رمز اللغة (مثل fr)",
  },
};

export function MetadataPanel({ meta, onChange, lessonId, content, isOwner = false, beforeMapping, disabled = false }: { meta: LessonMeta; onChange: (patch: Partial<LessonMeta>) => void; lessonId?: string; content?: unknown; isOwner?: boolean; beforeMapping?: () => Promise<unknown>; disabled?: boolean }) {
  const t = useCopy(copy);
  const [tag, setTag] = useState("");
  const langChoice = meta.language === "en" || meta.language === "ar" ? meta.language : "other";


  return (
    <fieldset className="lx-form" disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label className="lx-field">{t.language}
        <Select label={t.language} value={langChoice} onChange={(v) => onChange({ language: v === "other" ? "" : v })} options={(["en", "ar", "other"] as const).map((v) => ({ value: v, label: t.langs[v] }))} />
        {langChoice === "other" && <input className="lx-input" value={meta.language} placeholder={t.otherLang} aria-label={t.otherLang} maxLength={12} onChange={(e) => onChange({ language: e.target.value.trim().toLowerCase() })} />}
        <small>{t.languageHelp}</small>
      </label>

      <div className="lx-field">
        <span><Tags size={13} aria-hidden /> {t.tags}</span>
        <div className="lx-chips">
          {meta.tags.map((x) => <span key={x} className="lx-chip" data-on="true">#{x}<button type="button" aria-label={t.removeTag(x)} onClick={() => onChange({ tags: meta.tags.filter((y) => y !== x) })}><X size={12} /></button></span>)}
        </div>
        <input className="lx-input" value={tag} placeholder={t.tagPh} aria-label={t.tags} maxLength={40} disabled={meta.tags.length >= 12}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tag.trim()) { e.preventDefault(); onChange({ tags: [...meta.tags, tag] }); setTag(""); } }} />
        <small>{t.tagsHelp}</small>
      </div>

      <details className="lx-editor-settings-group">
        <summary>{t.curricula}</summary>
        <div className="lx-form">
          {lessonId && isOwner ? <CurriculumAssociations lessonId={lessonId} content={content} beforeMapping={beforeMapping} disabled={disabled} /> : <small>{t.curriculaHelp}</small>}

        </div>
      </details>

      {/* The cover and icon are set on the page itself (PageHeader), like Notion. */}
      <details className="lx-editor-settings-group">
        <summary>{t.appearance}</summary>
        <div className="lx-form">
          <label className="lx-field">{t.author}<input className="lx-input" value={meta.authorDisplay ?? ""} maxLength={120} onChange={(e) => onChange({ authorDisplay: e.target.value || undefined })} /><small>{t.authorHelp}</small></label>

          <label className="lx-field">{t.license}
            <Select label={t.license} value={meta.license ?? ""} onChange={(v) => onChange({ license: v || undefined })} options={Object.entries(t.licenses).map(([value, label]) => ({ value, label }))} />
          </label>
        </div>
      </details>
    </fieldset>
  );
}

function CurriculumAssociations({ lessonId, content, beforeMapping, disabled }: { lessonId: string; content: unknown; beforeMapping?: () => Promise<unknown>; disabled: boolean }) {
  const t = useCopy(copy);
  const client = useConvex();
  const [institutionId, setInstitution] = useState("");
  const [programId, setProgram] = useState("");
  const [versionId, setVersion] = useState("");
  const [nodeId, setNode] = useState("");
  const [coverage, setCoverage] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const institutions = usePaginatedQuery(api.curricula.listInstitutions, {}, { initialNumItems: 20 });
  const programs = usePaginatedQuery(api.curricula.listPrograms, institutionId ? { institutionId: institutionId as Id<"curriculumInstitutions"> } : "skip", { initialNumItems: 20 });
  const versions = usePaginatedQuery(api.curricula.listVersions, programId ? { programId: programId as Id<"curriculumPrograms"> } : "skip", { initialNumItems: 20 });
  const nodes = usePaginatedQuery(api.curricula.listNodes, versionId ? { versionId: versionId as Id<"curriculumVersions"> } : "skip", { initialNumItems: 30 });
  const mappings = usePaginatedQuery(api.curricula.listLessonMappings, { lessonId: lessonId as Id<"lessons"> }, { initialNumItems: 20 });
  const mappingNodes = useStableQueries(Object.fromEntries([...new Set(mappings.results.map(mapping => mapping.versionId))].map(id => [id, { query: api.curricula.listNodes, args: { versionId: id, paginationOpts: { cursor: null, numItems: 100 } } }])));
  const blocks = useMemo(() => [...walk(asBlocks(content))].map(({ block }) => ({ id: block.id, label: blockText(block).slice(0, 90) || block.type })), [content]);
  const path = (id: string) => {
    const chain: string[] = [], seen = new Set<string>();
    let node = nodes.results.find(value => value._id === id);
    while (node && !seen.has(node._id)) { seen.add(node._id); chain.unshift(node.name); node = nodes.results.find(value => value._id === node?.parentId); }
    return chain.join(" › ");
  };
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); 
    try { await beforeMapping?.(); await operation(); } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const more = (page: { status: string; loadMore: (count: number) => void }) => page.status === "CanLoadMore" && <button type="button" className="lx-link" disabled={busy || disabled} onClick={() => page.loadMore(20)}>Load more</button>;
  return <div className="lx-field">
    <span><GraduationCap size={13} aria-hidden /> {t.curricula}</span>
    {mappings.results.map(mapping => {
      const directory = mappingNodes[mapping.versionId];
      const label = directory && !(directory instanceof Error) ? directory.page.find((node: { _id: string; name: string }) => node._id === mapping.nodeId)?.name : undefined;
      return <div className="lx-panel__row lx-badge" data-tone="blue" key={mapping._id} style={{ borderRadius: 8, padding: "6px 8px", whiteSpace: "normal" }}>
        <span>{label ?? mapping.nodeId} · {mapping.blockIds.length} blocks · {mapping.conceptKeys.length} concepts</span>
        <button type="button" className="ws-icon-button" disabled={busy || disabled} aria-label={`${t.remove}: ${label ?? mapping.nodeId}`} onClick={() => void perform(() => client.mutation(api.curricula.removeLessonMapping, { mappingId: mapping._id }))}><X size={12} /></button>
      </div>;
    })}
    {more(mappings)}
    <Select label="Institution" value={institutionId} placeholder="Institution" disabled={busy || disabled} onChange={value => { setInstitution(value); setProgram(""); setVersion(""); setNode(""); }} options={institutions.results.map(value => ({ value: value._id, label: value.name }))} />
    {more(institutions)}
    {institutionId && <><Select label="Program" value={programId} placeholder="Program" disabled={busy || disabled} onChange={value => { setProgram(value); setVersion(""); setNode(""); }} options={programs.results.map(value => ({ value: value._id, label: value.name }))} />{more(programs)}</>}
    {programId && <><Select label="Syllabus version" value={versionId} placeholder="Syllabus version" disabled={busy || disabled} onChange={value => { setVersion(value); setNode(""); }} options={versions.results.map(value => ({ value: value._id, label: value.name }))} />{more(versions)}</>}
    {versionId && <><Select label={t.pickModule} value={nodeId} placeholder={t.pickModule} disabled={busy || disabled} onChange={setNode} options={nodes.results.filter(value => !mappings.results.some(mapping => mapping.nodeId === value._id)).map(value => ({ value: value._id, label: path(value._id) }))} />{more(nodes)}</>}
    {nodeId && <fieldset className="lx-field" style={{ border: 0, margin: 0, padding: 0 }} disabled={busy || disabled}>
      <legend>Blocks covered by this association</legend>
      <small>Choose the exact blocks. Up to 100 per association. Published versions keep their own immutable mapping snapshot.</small>
      <div style={{ maxHeight: 220, overflow: "auto" }}>{blocks.map(block => <label className="lx-panel__row" key={block.id}><input type="checkbox" checked={coverage.includes(block.id)} disabled={!coverage.includes(block.id) && coverage.length >= 100} onChange={e => setCoverage(previous => e.target.checked ? [...previous, block.id] : previous.filter(id => id !== block.id))} /> {block.label}</label>)}</div>
      <button type="button" className="ws-btn ws-btn--sm" disabled={!coverage.length || busy || disabled} onClick={() => void perform(async () => {
        if (coverage.some(id => !blocks.some(block => block.id === id))) throw new Error("A selected block was removed. Review the coverage again.");
        await client.mutation(api.curricula.createLessonMapping, { lessonId: lessonId as Id<"lessons">, versionId: versionId as Id<"curriculumVersions">, nodeId: nodeId as Id<"curriculumNodes">, blockIds: coverage, conceptKeys: [] });
        setCoverage([]); setNode("");
      })}>Save association</button>
    </fieldset>}
    <small>{t.curriculaHelp}</small>
  </div>;
}
