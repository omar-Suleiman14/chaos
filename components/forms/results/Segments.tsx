"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormDefinition } from "@/convex/formLogic";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import QueryErrorBoundary from "../QueryErrorBoundary";

const copy = {
  en: { title: "Segments", version: "Published version", loading: "Loading analysis…", unavailable: "This published version is unavailable.", unpublished: "Publish a form to analyze a version.", segment: "Segment by", compare: "Compare with", language: "Language", status: "Completion status", boundaries: "Numeric cutoffs (comma separated)", values: "Values (one per line)", booleans: "Enter true or false.", apply: "Compare segments", invalid: "Check the cutoffs or values. Use distinct values and increasing finite cutoffs.", matrix: "Response cross-tab", count: "Responses", rate: "Within segment", suppressed: "Results are withheld because a group is too small. No counts or totals are shown.", sample: "Uses up to 500 newest non-spam response records, with only the selected version shown. Counts represent responses, not unique people.", limited: "More responses exist outside this analysis window.", minimum: "Minimum group size", empty: "No matching responses.", funnel: "Question funnel", inferred: "Progress is inferred from saved answers and the last saved question. It does not measure screen views.", field: "Question", eligible: "Eligible", hidden: "Hidden by logic", answered: "Answered", skipped: "Completed without answer", stopped: "Stopped after", reached: "Reached, unanswered (inferred)", notReached: "Not reached (inferred)", unknown: "Unknown progress", completed: "Completed", partial: "Partial", missing: "Missing", not_applicable: "Not applicable", invalidBucket: "Invalid value", bin: "Range", parameter: "URL parameter" },
  ar: { title: "الشرائح ومسار الإجابة", version: "النسخة المنشورة", loading: "جارٍ تحميل التحليل…", unavailable: "هذه النسخة المنشورة غير متاحة.", unpublished: "انشر نموذجًا لتحليل نسخة منه.", segment: "التقسيم حسب", compare: "المقارنة مع", language: "اللغة", status: "حالة الإكمال", boundaries: "حدود رقمية (مفصولة بفواصل)", values: "القيم (قيمة في كل سطر)", booleans: "أدخل true أو false.", apply: "مقارنة الشرائح", invalid: "تحقق من الحدود أو القيم. استخدم قيمًا مختلفة وحدودًا رقمية متزايدة ومحدودة.", matrix: "جدول تقاطع الردود", count: "الردود", rate: "داخل الشريحة", suppressed: "حُجبت النتائج لأن إحدى المجموعات صغيرة جدًا. لا تظهر أعداد أو إجماليات.", sample: "يستخدم التحليل أحدث 500 رد غير مزعج كحد أقصى، ويعرض النسخة المختارة فقط. الأعداد تمثل الردود وليس الأشخاص الفريدين.", limited: "توجد ردود أخرى خارج نطاق التحليل.", minimum: "الحد الأدنى لحجم المجموعة", empty: "لا توجد ردود مطابقة.", funnel: "مسار الأسئلة", inferred: "يُستنتج التقدم من الإجابات المحفوظة وآخر سؤال محفوظ. لا يقيس مشاهدات الشاشة.", field: "السؤال", eligible: "مؤهل", hidden: "مخفي بالمنطق", answered: "أُجيب عنه", skipped: "إكمال دون إجابة", stopped: "توقف بعده", reached: "وُصل إليه دون إجابة (مستنتج)", notReached: "لم يُوصل إليه (مستنتج)", unknown: "تقدم غير معروف", completed: "مكتمل", partial: "جزئي", missing: "مفقود", not_applicable: "غير منطبق", invalidBucket: "قيمة غير صالحة", bin: "النطاق", parameter: "معامل الرابط" },
};
type Dimension = FunctionArgs<typeof api.formSegmentAnalysis.crossTab>["segment"];
type Parameter = { name: string; type: "string" | "number" | "boolean" };
type Props = { formId: Id<"forms">; versions: { version: number }[]; publishedVersion: number | null; parameters: Parameter[] };
type Draft = { key: string; input: string };

function dimension(draft: Draft, parameters: Parameter[]): Dimension {
  const [kind, ...parts] = draft.key.split(":");
  const id = parts.join(":");
  if (kind === "language" || kind === "status") return { kind };
  if (kind === "choice") return { kind, fieldId: id };
  if (kind === "number") {
    const boundaries = draft.input.split(",").map(value => value.trim());
    const numbers = boundaries.map(Number);
    if (!boundaries.length || boundaries.length > 10 || boundaries.some(value => !value) || numbers.some((value, index) => !Number.isFinite(value) || index > 0 && value <= numbers[index - 1])) throw new Error("Invalid boundaries");
    return { kind, fieldId: id, boundaries: numbers };
  }
  const parameter = parameters.find(p => p.name === id);
  if (!parameter) throw new Error("Unknown parameter");
  const lines = draft.input.split("\n").map(value => value.trim()).filter(Boolean);
  const values = lines.map(value => {
    if (parameter.type === "number") { const n = Number(value); if (!Number.isFinite(n)) throw new Error("Invalid number"); return n; }
    if (parameter.type === "boolean") { if (!["true", "false"].includes(value)) throw new Error("Invalid boolean"); return value === "true"; }
    if (value.length > 500) throw new Error("Long value");
    return value;
  });
  if (!values.length || values.length > 20 || new Set(values.map(value => JSON.stringify(value))).size !== values.length) throw new Error("Invalid values");
  return { kind: "hidden_parameter", name: id, values };
}

export default function Segments(props: Props) {
  const t = useCopy(copy);
  const [selected, setSelected] = useState<number | null>(null);
  const version = selected ?? props.publishedVersion ?? props.versions[0]?.version;
  if (!version) return <p className="ws-empty">{t.unpublished}</p>;
  return <section className="grid gap-6"><label className="grid gap-1 max-w-xs">{t.version}<select className="kb-input" value={version} onChange={e => setSelected(Number(e.target.value))}>{props.versions.map(row => <option key={row.version} value={row.version}>{row.version}</option>)}</select></label><QueryErrorBoundary key={version}><VersionSegments formId={props.formId} version={version} parameters={props.parameters} /></QueryErrorBoundary></section>;
}

function DimensionInput({ label, value, onChange, definition, parameters }: { label: string; value: Draft; onChange: (draft: Draft) => void; definition: FormDefinition; parameters: Parameter[] }) {
  const t = useCopy(copy);
  const options = [{ key: "language", label: t.language }, { key: "status", label: t.status }, ...definition.fields.flatMap(field => ["choice", "dropdown"].includes(field.type) && field.options?.length && field.options.length <= 20 ? [{ key: `choice:${field.id}`, label: field.label || field.id }] : ["number", "scale", "rating"].includes(field.type) ? [{ key: `number:${field.id}`, label: field.label || field.id }] : []), ...parameters.map(p => ({ key: `hidden_parameter:${p.name}`, label: `${t.parameter}: ${p.name}` }))];
  return <div className="grid gap-3"><label className="grid gap-1">{label}<select className="kb-input" value={value.key} onChange={e => onChange({ key: e.target.value, input: "" })}>{options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>{value.key.startsWith("number:") && <label className="grid gap-1">{t.boundaries}<input className="kb-input" value={value.input} onChange={e => onChange({ ...value, input: e.target.value })} required /></label>}{value.key.startsWith("hidden_parameter:") && <><label className="grid gap-1">{t.values}<textarea className="kb-input" rows={3} maxLength={10020} value={value.input} onChange={e => onChange({ ...value, input: e.target.value })} required /></label>{parameters.find(p => value.key === `hidden_parameter:${p.name}`)?.type === "boolean" && <span className="ws-muted">{t.booleans}</span>}</>}</div>;
}

function VersionSegments({ formId, version, parameters }: { formId: Id<"forms">; version: number; parameters: Parameter[] }) {
  const t = useCopy(copy), { locale } = useLocale();
  const snapshot = useQuery(api.forms.getVersion, { formId, version });
  const [segment, setSegment] = useState<Draft>({ key: "language", input: "" }), [compare, setCompare] = useState<Draft>({ key: "status", input: "" });
  const [request, setRequest] = useState<{ segment: Dimension; compare: Dimension }>({ segment: { kind: "language" }, compare: { kind: "status" } });
  const matrix = useQuery(api.formSegmentAnalysis.crossTab, { formId, version, ...request });
  const [error, setError] = useState("");
  if (snapshot === undefined) return <p role="status">{t.loading}</p>;
  if (!snapshot || matrix === null) return <p className="ws-empty">{t.unavailable}</p>;
  const def = snapshot.definition;
  const bucketLabel = (value: string, d: Dimension) => {
    if (value === "missing") return t.missing;
    if (value === "not_applicable") return t.not_applicable;
    if (value === "invalid") return t.invalidBucket;
    if (d.kind === "choice") return def.fields.find(field => field.id === d.fieldId)?.options?.find(option => option.id === value)?.label ?? value;
    if (d.kind === "hidden_parameter") { try { return String(JSON.parse(value)); } catch { return value; } }
    if (d.kind === "number") { const index = Number(value.slice(4)), lower = d.boundaries[index - 1], upper = d.boundaries[index]; return lower === undefined ? `< ${upper}` : upper === undefined ? `≥ ${lower}` : `${lower} ≤ ${t.bin} < ${upper}`; }
    if (d.kind === "status") return value === "completed" ? t.completed : t.partial;
    return value === "ar" ? "العربية" : "English";
  };
  return <>
    <p className="ws-muted">{t.sample}</p>{matrix?.evidence.windowLimited && <p role="status">{t.limited}</p>}
    <form className="kb-card-bordered grid gap-4 p-5" onSubmit={e => { e.preventDefault(); try { setRequest({ segment: dimension(segment, parameters), compare: dimension(compare, parameters) }); setError(""); } catch { setError(t.invalid); } }}>
      <h2 className="text-lg font-semibold">{t.matrix}</h2><div className="grid gap-4 sm:grid-cols-2"><DimensionInput label={t.segment} value={segment} onChange={setSegment} definition={def} parameters={parameters} /><DimensionInput label={t.compare} value={compare} onChange={setCompare} definition={def} parameters={parameters} /></div>
      {error && <p role="alert">{error}</p>}<button className="ws-btn w-fit">{t.apply}</button>
    </form>
    {matrix === undefined ? <p role="status">{t.loading}</p> : matrix.suppressed ? <p role="status">{t.suppressed} ({t.minimum}: {matrix.evidence.minimumCell})</p> : !matrix.cells.length ? <p>{t.empty}</p> : <div className="overflow-x-auto"><table className="w-full text-start"><caption className="text-start font-semibold py-2">{t.matrix}</caption><thead><tr>{[t.segment, t.compare, t.count, t.rate].map(label => <th className="text-start p-2" scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{matrix.cells.map(cell => <tr key={JSON.stringify([cell.segment, cell.comparison])}><th scope="row" className="text-start p-2">{bucketLabel(cell.segment, request.segment)}</th><td className="p-2">{bucketLabel(cell.comparison, request.compare)}</td><td className="p-2">{formatNumber(locale, cell.count)}</td><td className="p-2">{formatNumber(locale, Math.round(cell.withinSegmentRate * 100))}%</td></tr>)}</tbody></table></div>}
  </>;
}
