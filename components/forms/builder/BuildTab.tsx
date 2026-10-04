"use client";

import { useState } from "react";
import {
  AlignLeft, AtSign, Calendar, CheckSquare, ChevronDown, ChevronRight, CircleDot, Clock, FileUp, GitBranch, Globe, Grid3x3, Hash, ListOrdered,
  Minus, Phone, Plus, SlidersHorizontal, SquareChevronDown, Star, Type, Text as TextIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { blankField, isAnswerable } from "@/convex/formLogic";
import type { FieldType, FormDefinition } from "@/convex/formLogic";
import { copyFields, duplicateSection, insertAfter, moveField, removeFields } from "@/lib/formBuilder";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { useCopy } from "@/lib/i18n";
import { pluralForm } from "@/lib/locale";
import FieldEditor from "./FieldEditor";

const copy = {
  en: {
    insertHere: "Add a question here", addQuestion: "Add a question", addQuestionButton: "Add question", addText: "Add text", addSection: "Add section",
    emptyTitle: "Start with your first question", emptyBody: "Type the question, then the answers. You can change its type at any time.",
    intro: "Introduction", introQuiz: "Add an introduction: what the quiz covers, how long it takes…", introForm: "Add an introduction: why you are asking, how long it takes…",
    bulk: "Bulk actions", selected: (n: number) => `${n} selected`, required: "Required", optional: "Optional", duplicate: "Duplicate", moveToEnd: "Move to end", delete: "Delete", clear: "Clear",
    select: (name: string) => `Select ${name}`, textBlock: "Text block", untitled: "Untitled", branching: "Has branching",
    cleared: (n: number) => (n === 1 ? "1 branching condition was removed because it referred to a deleted question." : `${n} branching conditions were removed because they referred to a deleted question.`),
    deleted: (n: number) => (n === 1 ? "Question deleted" : `${n} questions deleted`),
  },
  ar: {
    insertHere: "أضف سؤالًا هنا", addQuestion: "أضف سؤالًا", addQuestionButton: "أضف سؤالًا", addText: "أضف نصًا", addSection: "أضف قسمًا",
    emptyTitle: "ابدأ بسؤالك الأول", emptyBody: "اكتب السؤال ثم الإجابات. يمكنك تغيير نوعه في أي وقت.",
    intro: "المقدمة", introQuiz: "أضف مقدمة: ما يغطيه الاختبار وكم يستغرق…", introForm: "أضف مقدمة: لماذا تسأل وكم يستغرق…",
    bulk: "إجراءات جماعية", selected: (n: number) => `المحدد: ${n}`, required: "مطلوب", optional: "اختياري", duplicate: "تكرار", moveToEnd: "نقل إلى النهاية", delete: "حذف", clear: "إلغاء التحديد",
    select: (name: string) => `تحديد ${name}`, textBlock: "كتلة نص", untitled: "بلا عنوان", branching: "فيه تفرّع",
    cleared: (n: number) => pluralForm("ar", n, { one: "أُزيل شرط تفرّع واحد لأنه يشير إلى سؤال محذوف.", two: "أُزيل شرطا تفرّع لأنهما يشيران إلى سؤال محذوف.", few: `أُزيلت ${n} شروط تفرّع لأنها تشير إلى سؤال محذوف.`, other: `أُزيل ${n} شرط تفرّع لأنها تشير إلى سؤال محذوف.` }),
    deleted: (n: number) => pluralForm("ar", n, { one: "حُذف السؤال", two: "حُذف سؤالان", few: `حُذفت ${n} أسئلة`, other: `حُذف ${n} سؤالًا` }),
  },
};

const fieldIcons: Record<FieldType, LucideIcon> = {
  text: Type, textarea: AlignLeft, email: AtSign, phone: Phone, url: Globe, number: Hash, date: Calendar, time: Clock,
  choice: CircleDot, dropdown: SquareChevronDown, multi_choice: CheckSquare, rating: Star, scale: SlidersHorizontal, ranking: ListOrdered,
  matrix: Grid3x3, file: FileUp, statement: TextIcon, section: Minus,
};

/**
 * One click adds a ready-to-type question, as in Google Forms. It copies the type of the
 * question above (single choice to start); the type can be changed on the question itself.
 */
function nextType(def: FormDefinition, afterIndex: number): FieldType {
  for (let i = Math.min(afterIndex, def.fields.length - 1); i >= 0; i--) if (isAnswerable(def.fields[i])) return def.fields[i].type;
  return "choice";
}

function AddBar({ onAdd }: { onAdd: (type?: FieldType) => void }) {
  const t = useCopy(copy);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.addQuestion}>
      <button type="button" className="ws-btn ws-btn--primary" onClick={() => onAdd()}><Plus size={17} /> {t.addQuestionButton}</button>
      <button type="button" className="ws-btn ws-btn--ghost" onClick={() => onAdd("statement")}><TextIcon size={16} /> {t.addText}</button>
      <button type="button" className="ws-btn ws-btn--ghost" onClick={() => onAdd("section")}><Minus size={16} /> {t.addSection}</button>
    </div>
  );
}

export default function BuildTab({ def, change: rawChange, readOnly, notice, announce }: {
  def: FormDefinition;
  change: (updater: (d: FormDefinition) => FormDefinition, options?: { checkpoint?: boolean }) => void;
  readOnly: boolean;
  notice: (message: string) => void;
  announce?: (text: string) => void;
}) {
  /** Typing merges into one undo step; structural edits are always their own step. */
  const t = useCopy(copy);
  const labels = useBuilderLabels();
  const change = (updater: (d: FormDefinition) => FormDefinition) => rawChange(updater);
  const step = (updater: (d: FormDefinition) => FormDefinition) => rawChange(updater, { checkpoint: true });
  const [expanded, setExpanded] = useState<string | null>(def.fields[0]?.id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const add = (afterIndex: number, type?: FieldType) => {
    const field = blankField(type ?? nextType(def, afterIndex));
    step((d) => insertAfter(d, afterIndex, [field]));
    setExpanded(field.id);
    setFocusId(field.id);
  };
  const remove = (ids: Set<string>) => {
    const count = def.fields.filter((f) => ids.has(f.id)).length;
    step((d) => {
      const result = removeFields(d, ids);
      if (result.clearedConditions) notice(t.cleared(result.clearedConditions));
      return result.def;
    });
    setSelected(new Set());
    announce?.(t.deleted(count));
  };
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="chaos-card p-5">
        <label className="block">
          <span className="sr-only">{t.intro}</span>
          <textarea value={def.description} disabled={readOnly} onChange={(e) => change((d) => ({ ...d, description: e.target.value }))}
            className="w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--outline)]" rows={2} maxLength={5000}
            placeholder={def.quiz?.enabled ? t.introQuiz : t.introForm} />
        </label>
      </div>

      {selected.size > 0 && !readOnly && (
        <div className="sticky top-2 z-10 chaos-card bg-card p-3 flex flex-wrap gap-2 items-center" role="toolbar" aria-label={t.bulk}>
          <span className="chaos-heading text-xs me-2">{t.selected(selected.size)}</span>
          <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => step((d) => ({ ...d, fields: d.fields.map((f) => (selected.has(f.id) && isAnswerable(f) ? { ...f, required: true } : f)) }))}>{t.required}</button>
          <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => step((d) => ({ ...d, fields: d.fields.map((f) => (selected.has(f.id) ? { ...f, required: false } : f)) }))}>{t.optional}</button>
          <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => step((d) => {
            const picked = d.fields.filter((f) => selected.has(f.id));
            const lastIndex = Math.max(...d.fields.map((f, i) => (selected.has(f.id) ? i : -1)));
            return insertAfter(d, lastIndex, copyFields(picked));
          })}>{t.duplicate}</button>
          <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => step((d) => ({ ...d, fields: [...d.fields.filter((f) => !selected.has(f.id)), ...d.fields.filter((f) => selected.has(f.id))] }))}>{t.moveToEnd}</button>
          <button type="button" className="kb-btn kb-btn-danger text-xs" onClick={() => remove(selected)}>{t.delete}</button>
          <button type="button" className="text-xs underline ms-auto" onClick={() => setSelected(new Set())}>{t.clear}</button>
        </div>
      )}

      <ol className="space-y-2">
        {def.fields.map((field, index) => {
          const open = expanded === field.id;
          return (
            <li key={field.id}>
              <div className={`chaos-card bg-card ws-reveal-host ${field.type === "section" ? "border-foreground" : ""}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {!readOnly && (
                    <input type="checkbox" className="ws-reveal w-4 h-4" data-keep={selected.size > 0} checked={selected.has(field.id)} onChange={() => toggle(field.id)} aria-label={t.select(field.label || labels.fieldType(field.type))} />
                  )}
                  <button type="button" onClick={() => setExpanded(open ? null : field.id)} className="flex-1 flex items-center gap-3 text-start min-w-0" aria-expanded={open}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} className="rtl:rotate-180" />}
                    {(() => { const Icon = fieldIcons[field.type]; return <span className="grid place-items-center w-6 h-6 shrink-0 rounded-md bg-[var(--ws-active)] text-[var(--ws-text-soft)]" title={labels.fieldType(field.type)}><Icon size={13} aria-hidden="true" /></span>; })()}
                    <span className="text-[11px] text-muted-foreground w-5 shrink-0 tabular-nums">{index + 1}</span>
                    <span className={`truncate ${field.type === "section" ? "chaos-heading text-sm" : "font-medium"}`}>
                      {field.label || <em className="text-muted-foreground">{field.type === "statement" ? t.textBlock : t.untitled}</em>}
                      {field.required && <span className="text-destructive"> *</span>}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0 ms-auto">{labels.fieldType(field.type)}</span>
                    {field.showIf && <GitBranch size={14} className="text-primary shrink-0" aria-label={t.branching} />}
                  </button>
                </div>
                {open && (
                  <div className="px-4 pb-4">
                    <FieldEditor
                      field={field}
                      index={index}
                      def={def}
                      readOnly={readOnly}
                      onChange={(next) => change((d) => ({ ...d, fields: d.fields.map((f) => (f.id === field.id ? next : f)) }))}
                      onDuplicate={() => step((d) => (field.type === "section" ? duplicateSection(d, field.id) : insertAfter(d, index, copyFields([field]))))}
                      onRemove={() => remove(new Set([field.id]))}
                      onMove={(delta) => step((d) => moveField(d, index, index + delta))}
                      autoFocus={focusId === field.id}
                    />
                  </div>
                )}
              </div>
              {!readOnly && index < def.fields.length - 1 && (
                <button type="button" onClick={() => add(index)} className="w-full text-[13px] text-muted-foreground hover:text-foreground py-1.5 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Plus size={14} /> {t.insertHere}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {!readOnly && (def.fields.length === 0 ? (
        <div className="chaos-card bg-card p-6 space-y-3 text-center grid justify-items-center">
          <p className="text-lg font-semibold">{t.emptyTitle}</p>
          <p className="text-sm text-muted-foreground max-w-sm">{t.emptyBody}</p>
          <AddBar onAdd={(type) => add(def.fields.length - 1, type)} />
        </div>
      ) : <AddBar onAdd={(type) => add(def.fields.length - 1, type)} />)}
    </div>
  );
}
