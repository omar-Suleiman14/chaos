"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import { resolveModuleLessons, type GroupSelection } from "./groupSelection";
import { toggleRefs } from "./learnShare";

const PAGE = { numItems: 25, cursor: null };

/** Group choices resolve to reviewed lesson grants, not future-member subscriptions. */
export default function GroupLessonPicker({ kind, value, onChange, allowed }: { kind: "collections" | "curricula"; value: string[]; onChange: (refs: string[]) => void; allowed: boolean }) {
  const client = useConvex();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [institution, setInstitution] = useState<Id<"curriculumInstitutions">>();
  const [program, setProgram] = useState<Id<"curriculumPrograms">>();
  const [version, setVersion] = useState<Id<"curriculumVersions">>();
  const [node, setNode] = useState<Id<"curriculumNodes">>();
  const [cursor, setCursor] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<GroupSelection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const opts = (key: string) => ({ ...PAGE, cursor: cursor[key] ?? null });
  const institutions = useQuery(api.curricula.listInstitutions, kind === "curricula" ? { paginationOpts: opts("institution") } : "skip");
  const programs = useQuery(api.curricula.listPrograms, kind === "curricula" && institution ? { institutionId: institution, paginationOpts: opts("program") } : "skip");
  const versions = useQuery(api.curricula.listVersions, kind === "curricula" && program ? { programId: program, paginationOpts: opts("version") } : "skip");
  const nodes = useQuery(api.curricula.listNodes, kind === "curricula" && version ? { versionId: version, paginationOpts: opts("node") } : "skip");
  function invalidate() { generation.current++; setResult(undefined); setError(""); setBusy(false); }
  async function resolve() {
    const request = ++generation.current;
    setBusy(true); setError(""); setResult(undefined);
    try {
      const resolved = await resolveModuleLessons(client, node!, version!, nodes?.page.find(row => row._id === node)?.name ?? "");
      if (generation.current === request) setResult(resolved);
    } catch (cause) { if (generation.current === request) setError(errorMessage(cause)); }
    finally { if (generation.current === request) setBusy(false); }
  }
  function next(key: string, page: { isDone: boolean; continueCursor: string } | undefined) {
    return page && !page.isDone && <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => { invalidate(); setCursor({ ...cursor, [key]: page.continueCursor }); if (key === "institution") { setInstitution(undefined); setProgram(undefined); setVersion(undefined); setNode(undefined); } else if (key === "program") { setProgram(undefined); setVersion(undefined); setNode(undefined); } else if (key === "version") { setVersion(undefined); setNode(undefined); } else setNode(undefined); }}>{ar ? "المزيد" : "More choices"}</button>;
  }
  if (kind === "collections") return <div role="note" className="space-y-2 text-sm text-muted-foreground"><p>{ar ? "مشاركة محتوى المجموعات غير متاحة لهذا الاتصال بعد. اختر الدروس التي تملكها من تبويب الدروس." : "Collection content sharing is not available for connections yet. Select lessons you own in the Lessons tab."}</p><button type="button" className="ws-btn ws-btn--sm" disabled>{ar ? "مشاركة المجموعة غير متاحة" : "Collection sharing unavailable"}</button></div>;
  return <div className="space-y-3">
    <p role="note" className="text-xs text-muted-foreground">{ar ? "اختر دروسك الحالية ثم احفظ الوصول. لا تُضاف الدروس المستقبلية أو المصادر أو دروس الآخرين تلقائياً." : "Choose current lessons you own, then save access. Future members, sources and other creators' lessons are not added."}</p>
    <div className="space-y-2">
      <label className="block text-sm">{ar ? "المؤسسة" : "Institution"}<ChaosSelect className="kb-input mt-1" value={institution ?? ""} disabled={busy} onChange={event => { invalidate(); setInstitution(event.target.value as Id<"curriculumInstitutions"> || undefined); setProgram(undefined); setVersion(undefined); setNode(undefined); setCursor({ institution: cursor.institution ?? null }); }}><option value="">{ar ? "اختر المؤسسة" : "Choose institution"}</option>{institutions?.page.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</ChaosSelect></label>{next("institution", institutions)}
      <label className="block text-sm">{ar ? "البرنامج" : "Program"}<ChaosSelect className="kb-input mt-1" value={program ?? ""} disabled={busy || !institution} onChange={event => { invalidate(); setProgram(event.target.value as Id<"curriculumPrograms"> || undefined); setVersion(undefined); setNode(undefined); setCursor({ ...cursor, version: null, node: null }); }}><option value="">{ar ? "اختر البرنامج" : "Choose program"}</option>{programs?.page.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</ChaosSelect></label>{next("program", programs)}
      <label className="block text-sm">{ar ? "نسخة المنهج" : "Curriculum version"}<ChaosSelect className="kb-input mt-1" value={version ?? ""} disabled={busy || !program} onChange={event => { invalidate(); setVersion(event.target.value as Id<"curriculumVersions"> || undefined); setNode(undefined); setCursor({ ...cursor, node: null }); }}><option value="">{ar ? "اختر النسخة" : "Choose version"}</option>{versions?.page.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</ChaosSelect></label>{next("version", versions)}
      <label className="block text-sm">{ar ? "الوحدة أو المادة" : "Module or subject"}<ChaosSelect className="kb-input mt-1" value={node ?? ""} disabled={busy || !version} onChange={event => { invalidate(); setNode(event.target.value as Id<"curriculumNodes"> || undefined); }}><option value="">{ar ? "اختر الوحدة" : "Choose module"}</option>{nodes?.page.filter(row => row.kind === "module" || row.kind === "subject").map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</ChaosSelect></label>{next("node", nodes)}
    </div>
    <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={!allowed || busy || !node} onClick={() => void resolve()}>{busy ? (ar ? "جارٍ التحميل..." : "Loading lessons...") : (ar ? "راجع الدروس" : "Review lessons")}</button>
    {result && <div className="space-y-2" role="status"><p className="text-sm font-medium">{result.title}</p><ul className="max-h-48 overflow-y-auto text-sm">{result.lessons.map(lesson => <li key={lesson.ref}>{lesson.title}</li>)}</ul><p className="text-xs text-muted-foreground">{ar ? `${result.lessons.length} درس قابل للاختيار؛ ${result.excluded} عنصر غير مشمول.` : `${result.lessons.length} selectable lessons; ${result.excluded} items excluded.`}</p><button type="button" className="ws-btn ws-btn--sm" disabled={!allowed || !result.lessons.length || toggleRefs(value, result.lessons.map(lesson => lesson.ref), true).length > 500} onClick={() => onChange(toggleRefs(value, result.lessons.map(lesson => lesson.ref), true))}>{ar ? "اختر هذه الدروس" : "Select these lessons"}</button><p className="text-xs text-muted-foreground">{ar ? "يمكنك إلغاء اختيار أي درس في تبويب الدروس. احفظ لتطبيق الصلاحيات." : "Uncheck individual lessons in the Lessons tab. Save to apply permissions."}</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
