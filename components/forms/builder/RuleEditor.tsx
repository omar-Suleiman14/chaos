"use client";

import { Plus, X } from "lucide-react";
import { isAnswerable, numericTypes, SCORE_FIELD } from "@/convex/formLogic";
import type { Condition, ConditionOp, FormDefinition, FormField, Rule } from "@/convex/formLogic";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { Select } from "@/components/workspace/Select";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    needQuestion: "Add a question before this one to use branching.", always: "Always shown.", match: "Match", all: "all conditions", any: "any condition",
    question: "Question", missing: "Missing question", score: "Calculated score", condition: "Condition", answer: "Answer", chooseOption: "Choose an option",
    value: "Value", removeCondition: "Remove condition", addCondition: "Add condition",
  },
  ar: {
    needQuestion: "أضف سؤالًا قبل هذا السؤال لتستخدم التفرّع.", always: "يظهر دائمًا.", match: "المطابقة", all: "كل الشروط", any: "أي شرط",
    question: "السؤال", missing: "سؤال مفقود", score: "الدرجة المحسوبة", condition: "الشرط", answer: "الإجابة", chooseOption: "اختر خيارًا",
    value: "القيمة", removeCondition: "احذف الشرط", addCondition: "أضف شرطًا",
  },
};

/** Operators that make sense for each kind of source question. */
function opsFor(source: FormField | "score" | undefined): ConditionOp[] {
  if (source === "score") return ["gte", "gt", "lte", "lt", "equals", "not_equals"];
  if (!source) return ["answered"];
  if (source.type === "multi_choice") return ["includes", "not_includes", "answered", "not_answered"];
  if (source.type === "choice" || source.type === "dropdown") return ["equals", "not_equals", "answered", "not_answered"];
  if (numericTypes.includes(source.type)) return ["equals", "not_equals", "gt", "gte", "lt", "lte", "answered", "not_answered"];
  return ["answered", "not_answered", "equals", "not_equals"];
}

export default function RuleEditor({ def, rule, before, onChange, allowScore, label }: {
  def: FormDefinition;
  rule: Rule | undefined;
  /** Only questions before this index can be referenced. */
  before: number;
  onChange: (rule: Rule | undefined) => void;
  allowScore?: boolean;
  label: string;
}) {
  const t = useCopy(copy);
  const labels = useBuilderLabels();
  const sources = def.fields.slice(0, before).filter((f) => isAnswerable(f) && f.type !== "matrix" && f.type !== "file");
  const hasScores = def.fields.some((f) => f.options?.some((o) => o.score !== undefined));
  const conditions = rule?.conditions ?? [];

  const update = (index: number, patch: Partial<Condition>) => {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ match: rule?.match ?? "all", conditions: next });
  };
  const add = () => {
    const first = sources[sources.length - 1];
    const condition: Condition = first
      ? { fieldId: first.id, op: opsFor(first)[0], value: first.options?.[0]?.id }
      : { fieldId: SCORE_FIELD, op: "gte", value: 1 };
    onChange({ match: rule?.match ?? "all", conditions: [...conditions, condition] });
  };
  const remove = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    onChange(next.length ? { match: rule?.match ?? "all", conditions: next } : undefined);
  };

  if (!sources.length && !(allowScore && hasScores)) {
    return <p className="text-xs text-muted-foreground">{t.needQuestion}</p>;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="chaos-heading text-[10px] text-muted-foreground mb-1">{label}</legend>
      {conditions.length === 0 && <p className="text-xs text-muted-foreground">{t.always}</p>}
      {conditions.length > 1 && (
        <label className="text-xs flex items-center gap-2">
          {t.match}
          <Select size="sm" value={rule?.match ?? "all"} onChange={(match) => onChange({ match, conditions })}
            options={[{ value: "all", label: t.all }, { value: "any", label: t.any }]} />
        </label>
      )}
      {conditions.map((c, i) => {
        const source = c.fieldId === SCORE_FIELD ? "score" : sources.find((f) => f.id === c.fieldId);
        const ops = opsFor(source);
        const needsValue = c.op !== "answered" && c.op !== "not_answered";
        return (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <Select size="sm" label={t.question} value={c.fieldId} className="max-w-[16rem]"
              onChange={(value) => {
                const next = value === SCORE_FIELD ? "score" : sources.find((f) => f.id === value);
                const op = opsFor(next)[0];
                update(i, { fieldId: value, op, value: next && next !== "score" ? next.options?.[0]?.id : 1 });
              }}
              options={[
                ...(!source ? [{ value: c.fieldId, label: t.missing }] : []),
                ...sources.map((f) => ({ value: f.id, label: f.label || f.id })),
                ...(allowScore && hasScores ? [{ value: SCORE_FIELD, label: t.score }] : []),
              ]} />
            <Select size="sm" label={t.condition} value={c.op} onChange={(op: ConditionOp) => update(i, { op })}
              options={ops.map((op) => ({ value: op, label: labels.op(op) }))} />
            {needsValue && (source && source !== "score" && source.options ? (
              <Select size="sm" label={t.answer} value={String(c.value ?? "")} onChange={(value) => update(i, { value })} className="max-w-[14rem]"
                placeholder={t.chooseOption}
                options={source.options.map((o) => ({ value: o.id, label: o.label }))} />
            ) : (
              <input aria-label={t.value} value={c.value ?? ""} className="kb-input py-1 text-xs w-28"
                type={source === "score" || (source && numericTypes.includes(source.type)) ? "number" : "text"}
                onChange={(e) => update(i, { value: source === "score" || (source && numericTypes.includes(source.type)) ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value })} />
            ))}
            <button type="button" onClick={() => remove(i)} aria-label={t.removeCondition} className="p-1 text-muted-foreground hover:text-destructive"><X size={14} /></button>
          </div>
        );
      })}
      <button type="button" onClick={add} className="text-xs underline flex items-center gap-1"><Plus size={12} /> {t.addCondition}</button>
    </fieldset>
  );
}
